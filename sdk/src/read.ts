// Read-only helpers: network config, ScVal encoding, contract reads and the
// agent status derived from the policies. No signing dependencies, so this
// module is safe to use from the read-only dashboard.
import { Account, Address, Operation, TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";

export type Network = { rpcUrl: string; networkPassphrase: string };

export const TESTNET: Network = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
};

/** Placeholder source for read-only simulations and x402 payloads. */
export const NULL_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

/** Approximate ledgers per day (5s ledgers). */
export const DAY_IN_LEDGERS = 17280;

export const addr = (a: string) => nativeToScVal(Address.fromString(a), { type: "address" });
export const u32 = (n: number) => xdr.ScVal.scvU32(n);
export const i128 = (n: bigint) => nativeToScVal(n, { type: "i128" });
export const sym = (s: string) => xdr.ScVal.scvSymbol(s);

/** Extracts the last `Error(Contract, #N)` code from a simulation error string. */
export function contractErrorCode(error: string): number | undefined {
  const matches = [...error.matchAll(/Error\(Contract, #(\d+)\)/g)];
  return matches.length ? Number(matches[matches.length - 1][1]) : undefined;
}

/** Extracts the last contract error code from a transaction's diagnostic events. */
export function contractErrorCodeFromEvents(events: xdr.DiagnosticEvent[] = []): number | undefined {
  const codes: number[] = [];
  const collect = (v: xdr.ScVal) => {
    if (v.switch().name === "scvError" && v.error().switch().name === "sceContract") codes.push(v.error().contractCode());
    if (v.switch().name === "scvVec") (v.vec() ?? []).forEach(collect);
  };
  for (const d of events) {
    const body = d.event().body().v0();
    [...body.topics(), body.data()].forEach(collect);
  }
  return codes.at(-1);
}

export type Invocation = { contract: string; method: string; args: xdr.ScVal[] };

/** Read-only contract call via simulation. Returns the raw ScVal (e.g. to pass back as an argument). */
export async function readContractScVal(network: Network, call: Invocation): Promise<xdr.ScVal> {
  const server = new rpc.Server(network.rpcUrl);
  const tx = new TransactionBuilder(new Account(NULL_ACCOUNT, "0"), { fee: "100", networkPassphrase: network.networkPassphrase })
    .addOperation(Operation.invokeContractFunction({ contract: call.contract, function: call.method, args: call.args }))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim)) {
    const error = (sim as rpc.Api.SimulateTransactionErrorResponse).error;
    throw Object.assign(new Error(`${call.method} failed: ${error.split("\n")[0]}`), { errorCode: contractErrorCode(error) });
  }
  return sim.result!.retval;
}

/** Read-only contract call via simulation. Returns the native JS value. */
export async function readContract<T = unknown>(network: Network, call: Invocation): Promise<T> {
  return scValToNative(await readContractScVal(network, call)) as T;
}

export type PolicyAddresses = {
  /** OZ spending-limit policy contract. */
  spendingLimit: string;
  /** Guardrail recipient allowlist policy contract. */
  allowlist: string;
};

export type ContextRule = {
  id: number;
  name: string;
  context_type: unknown;
  signers: unknown[];
  signer_ids: number[];
  policies: string[];
  policy_ids: number[];
  valid_until?: number;
};

export type SpendingLimitData = {
  spending_limit: bigint;
  period_ledgers: number;
  spending_history: { amount: bigint; ledger_sequence: number }[];
  cached_total_spent: bigint;
};

export type AgentStatus = {
  ruleId: number;
  frozen: boolean;
  dailyCap: bigint;
  periodLedgers: number;
  /** Confirmed spend inside the rolling window at `ledger`. */
  spentInWindow: bigint;
  remaining: bigint;
  recipients: string[];
  ledger: number;
};

/** Spend inside the rolling window, using the policy's eviction rule (seq <= ledger - period is evicted). */
export function spentInWindow(data: SpendingLimitData, ledger: number): bigint {
  const cutoff = ledger - data.period_ledgers;
  return data.spending_history.filter((e) => e.ledger_sequence > cutoff).reduce((sum, e) => sum + BigInt(e.amount), 0n);
}

/** Reads the agent rule, spending-limit data and allowlist and derives the agent's status. */
export async function readAgentStatus(network: Network, smartAccount: string, policies: PolicyAddresses, ruleId: number): Promise<AgentStatus> {
  const args = [u32(ruleId), addr(smartAccount)];
  const [rule, limit, recipients, ledger] = await Promise.all([
    readContract<ContextRule>(network, { contract: smartAccount, method: "get_context_rule", args: [u32(ruleId)] }),
    readContract<SpendingLimitData>(network, { contract: policies.spendingLimit, method: "get_spending_limit_data", args }),
    readContract<string[]>(network, { contract: policies.allowlist, method: "get_recipients", args }),
    new rpc.Server(network.rpcUrl).getLatestLedger(),
  ]);
  const spent = spentInWindow(limit, ledger.sequence);
  const cap = BigInt(limit.spending_limit);
  return {
    ruleId,
    frozen: rule.signer_ids.length === 0,
    dailyCap: cap,
    periodLedgers: limit.period_ledgers,
    spentInWindow: spent,
    remaining: cap > spent ? cap - spent : 0n,
    recipients,
    ledger: ledger.sequence,
  };
}
