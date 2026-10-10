// Shared helpers for the Week 1 testnet spike. Testnet only.
import { execFileSync } from "node:child_process";
import {
  Account,
  Address,
  Keypair,
  Operation,
  SorobanDataBuilder,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  xdr,
} from "@stellar/stellar-sdk";
import { Ed25519Signer, computeEntryAuthDigest, signerToScVal } from "smart-account-kit";

export const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";
export const RPC_URL = "https://soroban-testnet.stellar.org";
export const server = new rpc.Server(RPC_URL);

// smart-account-kit testnet deployment (protocol 27, OZ stellar-contracts@1e513890)
export const ED25519_VERIFIER = "CAAVTMCBXEIBPR64EAASKFXERVPYFZA2JYP5A3BG6PESWEFUJX5IHKN4";
export const SPENDING_LIMIT_POLICY = "CABXBYJNZ7IUW4G3D6BND5YCAQF3ASSDMDAOKQQ63UYFSO7WUU2TIP5G";
export const USDC_SAC = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";

// Deployed during the spike
export const ALLOWLIST_POLICY = "CBJTSJ7M6BUIKZNNHLOPDNID6RBASIJRAM3AHDYPHIN56HKO5QX6HOQU";
export const SMART_ACCOUNT = "CDQSAMY2O6SCFRXA5SSZHAFT7SAZ7DYHLZVKCHH646KTEDFMBEWO4SFX";
export const OWNER_RULE_ID = 0;
export const AGENT_RULE_ID = 1;

/** Loads a Stellar CLI identity's keypair. The secret never leaves this process. */
export function keypair(identity: string): Keypair {
  const secret = execFileSync("stellar", ["keys", "show", identity], { encoding: "utf8" }).trim();
  return Keypair.fromSecret(secret);
}

export function ed25519Signer(identity: string): Ed25519Signer {
  return new Ed25519Signer(keypair(identity), ED25519_VERIFIER);
}

export const addr = (a: string) => nativeToScVal(Address.fromString(a), { type: "address" });
export const u32 = (n: number) => xdr.ScVal.scvU32(n);
export const i128 = (n: bigint) => nativeToScVal(n, { type: "i128" });
export const sym = (s: string) => xdr.ScVal.scvSymbol(s);

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
 * Signs every auth entry that belongs to the smart account with one Ed25519
 * signer, producing the OZ AuthPayload { signers, context_rule_ids }.
 */
export function signSmartAccountEntries(
  entries: xdr.SorobanAuthorizationEntry[],
  signer: Ed25519Signer,
  contextRuleIds: number[],
  expiration: number,
): xdr.SorobanAuthorizationEntry[] {
  return entries.map((entry) => {
    const creds = entry.credentials();
    if (creds.switch().name === "sorobanCredentialsSourceAccount") return entry;
    const ac = addressCredentials(entry);
    if (Address.fromScAddress(ac.address()).toString() !== SMART_ACCOUNT) return entry;

    const { authDigest } = computeEntryAuthDigest(NETWORK_PASSPHRASE, entry, expiration, contextRuleIds);
    const signature = Buffer.from(signer.signAuthDigest(authDigest) as Buffer);
    ac.signature(
      struct({
        context_rule_ids: xdr.ScVal.scvVec(contextRuleIds.map(u32)),
        signers: sortedMap([[signerToScVal(signer.signer), xdr.ScVal.scvBytes(signature)]]),
      }),
    );
    return entry;
  });
}

export type InvokeResult = { hash: string; status: string; error?: string };

/**
 * Invokes a contract function whose auth comes from the smart account.
 * `feeSource` pays fees and sequence; `signer` signs the smart-account auth.
 *
 * If the enforcing simulation fails and `forceWithReferenceArgs` is given, the
 * transaction is submitted anyway so the policy rejection is recorded on-chain.
 * Its footprint is the union of this call's recording footprint and the
 * enforcing footprint of a reference call (same method, args that pass policy),
 * which covers the policy and verifier contracts that recording mode skips.
 */
export async function invokeAsSmartAccount(opts: {
  feeSource: Keypair;
  contract: string;
  method: string;
  args: xdr.ScVal[];
  signer: Ed25519Signer;
  contextRuleIds: number[];
  forceWithReferenceArgs?: xdr.ScVal[];
}): Promise<InvokeResult> {
  const source = await server.getAccount(opts.feeSource.publicKey());
  // A fresh Account per build: TransactionBuilder increments the sequence it is given.
  const build = (args: xdr.ScVal[], auth: xdr.SorobanAuthorizationEntry[] = []) =>
    new TransactionBuilder(new Account(source.accountId(), source.sequenceNumber()), { fee: "10000000", networkPassphrase: NETWORK_PASSPHRASE })
      .addOperation(
        Operation.invokeContractFunction({
          contract: opts.contract,
          function: opts.method,
          args,
          auth,
        }),
      )
      .setTimeout(120)
      .build();

  // 1. Recording-mode simulation discovers the auth entries (no __check_auth).
  // 2. Enforcing simulation with signed entries runs __check_auth and the policies.
  const simulateSigned = async (args: xdr.ScVal[]) => {
    const recording = await server.simulateTransaction(build(args));
    if (!rpc.Api.isSimulationSuccess(recording)) {
      throw new Error(`Recording simulation failed: ${(recording as rpc.Api.SimulateTransactionErrorResponse).error}`);
    }
    const signed = signSmartAccountEntries(
      recording.result!.auth,
      opts.signer,
      opts.contextRuleIds,
      recording.latestLedger + 60,
    );
    const unsigned = build(args, signed);
    const enforcing = await server.simulateTransaction(unsigned);
    return { recording, unsigned, enforcing };
  };

  const { recording, unsigned, enforcing } = await simulateSigned(opts.args);
  let tx;
  if (rpc.Api.isSimulationSuccess(enforcing)) {
    tx = rpc.assembleTransaction(unsigned, enforcing).build();
  } else {
    const error = (enforcing as rpc.Api.SimulateTransactionErrorResponse).error;
    if (!opts.forceWithReferenceArgs) return { hash: "", status: "SIMULATION_FAILED", error };

    const reference = await simulateSigned(opts.forceWithReferenceArgs);
    if (!rpc.Api.isSimulationSuccess(reference.enforcing)) {
      throw new Error("Reference call did not pass simulation");
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
    console.log(`Simulation rejected the call (${error.split("\n")[0]}); submitting anyway.`);
  }
  tx.sign(opts.feeSource);
  return submit(tx);
}

export async function submit(tx: ReturnType<TransactionBuilder["build"]>): Promise<InvokeResult> {
  const sent = await server.sendTransaction(tx);
  if (sent.status === "ERROR") {
    return { hash: sent.hash, status: "SEND_ERROR", error: sent.errorResult?.toXDR("base64") };
  }
  const final = await server.pollTransaction(sent.hash, { attempts: 30 });
  return { hash: sent.hash, status: final.status };
}

export const explorerTx = (hash: string) => `https://stellar.expert/explorer/testnet/tx/${hash}`;
