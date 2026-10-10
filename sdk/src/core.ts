// Smart-account auth signing, simulation and submission.
import {
  Account,
  Address,
  type Keypair,
  Operation,
  SorobanDataBuilder,
  type Transaction,
  TransactionBuilder,
  rpc,
  xdr,
} from "@stellar/stellar-sdk";
import { type Ed25519Signer, computeEntryAuthDigest, signerToScVal } from "smart-account-kit";
import { type Invocation, type Network, contractErrorCode, contractErrorCodeFromEvents, sym, u32 } from "./read.ts";

export * from "./read.ts";



/** A contracttype struct: a map with symbol keys in sorted order. */
export function struct(fields: Record<string, xdr.ScVal>): xdr.ScVal {
  return xdr.ScVal.scvMap(
    Object.keys(fields)
      .sort()
      .map((k) => new xdr.ScMapEntry({ key: sym(k), val: fields[k] })),
  );
}

/** A map whose entries are sorted by key XDR, as the host requires. */
export function sortedMap(entries: [xdr.ScVal, xdr.ScVal][]): xdr.ScVal {
  return xdr.ScVal.scvMap(
    entries
      .map(([key, val]) => new xdr.ScMapEntry({ key, val }))
      .sort((a, b) => Buffer.compare(a.key().toXDR(), b.key().toXDR())),
  );
}

function addressCredentials(entry: xdr.SorobanAuthorizationEntry): xdr.SorobanAddressCredentials {
  const creds = entry.credentials();
  switch (creds.switch().name) {
    case "sorobanCredentialsAddress":
      return creds.address();
    case "sorobanCredentialsAddressV2":
      return creds.addressV2();
    default:
      throw new Error(`Unsupported credentials: ${creds.switch().name}`);
  }
}

/**
 * Signs every auth entry that belongs to `smartAccount` with one Ed25519
 * signer, producing the OZ AuthPayload { signers, context_rule_ids }.
 */
export function signSmartAccountEntries(opts: {
  entries: xdr.SorobanAuthorizationEntry[];
  smartAccount: string;
  signer: Ed25519Signer;
  contextRuleIds: number[];
  expirationLedger: number;
  networkPassphrase: string;
}): xdr.SorobanAuthorizationEntry[] {
  return opts.entries.map((entry) => {
    if (entry.credentials().switch().name === "sorobanCredentialsSourceAccount") return entry;
    const credentials = addressCredentials(entry);
    if (Address.fromScAddress(credentials.address()).toString() !== opts.smartAccount) return entry;

    const { authDigest } = computeEntryAuthDigest(opts.networkPassphrase, entry, opts.expirationLedger, opts.contextRuleIds);
    const signature = Buffer.from(opts.signer.signAuthDigest(authDigest) as Buffer);
    credentials.signature(
      struct({
        context_rule_ids: xdr.ScVal.scvVec(opts.contextRuleIds.map(u32)),
        signers: sortedMap([[signerToScVal(opts.signer.signer), xdr.ScVal.scvBytes(signature)]]),
      }),
    );
    return entry;
  });
}

export type SmartAccountAuth = {
  smartAccount: string;
  signer: Ed25519Signer;
  contextRuleIds: number[];
};

/**
 * Builds a single invokeContractFunction transaction whose auth comes from the
 * smart account, signs the smart-account auth entries, and re-simulates.
 *   1. Recording-mode simulation discovers the auth entries (no __check_auth).
 *   2. Enforcing simulation with signed entries runs __check_auth and the policies.
 */
export async function simulateSignedInvocation(opts: Invocation & SmartAccountAuth & {
  network: Network;
  source: Account;
  expirationLedger?: number;
  /** Inclusion fee in stroops; the resource fee is added on assembly. */
  baseFee?: string;
}) {
  const server = new rpc.Server(opts.network.rpcUrl);
  // A fresh Account per build: TransactionBuilder increments the sequence it is given.
  const build = (auth: xdr.SorobanAuthorizationEntry[] = []) =>
    new TransactionBuilder(new Account(opts.source.accountId(), opts.source.sequenceNumber()), {
      fee: opts.baseFee ?? "10000000",
      networkPassphrase: opts.network.networkPassphrase,
    })
      .addOperation(Operation.invokeContractFunction({ contract: opts.contract, function: opts.method, args: opts.args, auth }))
      .setTimeout(120)
      .build();

  const recording = await server.simulateTransaction(build());
  if (!rpc.Api.isSimulationSuccess(recording)) {
    throw new Error(`Recording simulation failed: ${(recording as rpc.Api.SimulateTransactionErrorResponse).error}`);
  }
  const signed = signSmartAccountEntries({
    entries: recording.result!.auth,
    smartAccount: opts.smartAccount,
    signer: opts.signer,
    contextRuleIds: opts.contextRuleIds,
    expirationLedger: opts.expirationLedger ?? recording.latestLedger + 60,
    networkPassphrase: opts.network.networkPassphrase,
  });
  const unsigned = build(signed);
  const enforcing = await server.simulateTransaction(unsigned);
  return { recording, unsigned, enforcing };
}

export type InvokeResult = {
  hash: string;
  status: "SUCCESS" | "FAILED" | "SIMULATION_FAILED" | "SEND_ERROR" | "NOT_FOUND";
  /** Last contract error code (e.g. 3221) when the call was rejected. */
  errorCode?: number;
  error?: string;
  returnValue?: xdr.ScVal;
};



/**
 * Invokes a contract function whose auth comes from the smart account.
 * `feeSource` pays fees and sequence.
 *
 * If the enforcing simulation fails and `forceWithReferenceArgs` is given, the
 * transaction is submitted anyway so the rejection is recorded on-chain. Its
 * footprint is the union of this call's recording footprint and the enforcing
 * footprint of a reference call (same method, args that pass the policies),
 * which covers the policy and verifier contracts that recording mode skips.
 */
export async function invokeAsSmartAccount(opts: Invocation & SmartAccountAuth & {
  network: Network;
  feeSource: Keypair;
  forceWithReferenceArgs?: xdr.ScVal[];
}): Promise<InvokeResult> {
  const server = new rpc.Server(opts.network.rpcUrl);
  const source = await server.getAccount(opts.feeSource.publicKey());
  const simulateSigned = (args: xdr.ScVal[]) =>
    simulateSignedInvocation({ ...opts, source: new Account(source.accountId(), source.sequenceNumber()), args });

  const { recording, unsigned, enforcing } = await simulateSigned(opts.args);
  let tx: Transaction;
  if (rpc.Api.isSimulationSuccess(enforcing)) {
    tx = rpc.assembleTransaction(unsigned, enforcing).build();
  } else {
    const error = (enforcing as rpc.Api.SimulateTransactionErrorResponse).error;
    if (!opts.forceWithReferenceArgs) {
      return { hash: "", status: "SIMULATION_FAILED", errorCode: contractErrorCode(error), error };
    }
    const reference = await simulateSigned(opts.forceWithReferenceArgs);
    if (!rpc.Api.isSimulationSuccess(reference.enforcing)) {
      throw new Error("Reference call did not pass simulation (is the agent frozen?)");
    }
    const refData = reference.enforcing.transactionData.build();
    const ownData = recording.transactionData.build();
    const union = (a: xdr.LedgerKey[], b: xdr.LedgerKey[]) => {
      const seen = new Map(a.map((k) => [k.toXDR("base64"), k]));
      for (const k of b) seen.set(k.toXDR("base64"), k);
      return [...seen.values()];
    };
    const readWrite = union(refData.resources().footprint().readWrite(), ownData.resources().footprint().readWrite());
    const rwKeys = new Set(readWrite.map((k) => k.toXDR("base64")));
    const readOnly = union(refData.resources().footprint().readOnly(), ownData.resources().footprint().readOnly())
      .filter((k) => !rwKeys.has(k.toXDR("base64")));
    const res = refData.resources();
    const data = new SorobanDataBuilder()
      .setFootprint(readOnly, readWrite)
      .setResources(res.instructions() * 2, res.diskReadBytes() * 2, res.writeBytes() * 2)
      .setResourceFee(BigInt(refData.resourceFee().toString()) * 3n)
      .build();
    tx = TransactionBuilder.cloneFrom(unsigned, { fee: "10000000", sorobanData: data }).build();
  }
  tx.sign(opts.feeSource);
  return submit(server, tx);
}

export async function submit(server: rpc.Server, tx: Transaction): Promise<InvokeResult> {
  const sent = await server.sendTransaction(tx);
  if (sent.status === "ERROR") {
    return { hash: sent.hash, status: "SEND_ERROR", error: sent.errorResult?.toXDR("base64") };
  }
  const final = await server.pollTransaction(sent.hash, { attempts: 30 });
  if (final.status === "SUCCESS") return { hash: sent.hash, status: "SUCCESS", returnValue: final.returnValue };
  if (final.status === "FAILED") {
    return { hash: sent.hash, status: "FAILED", errorCode: contractErrorCodeFromEvents(final.diagnosticEventsXdr) };
  }
  return { hash: sent.hash, status: "NOT_FOUND" };
}
