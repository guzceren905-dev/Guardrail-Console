// Read-only activity index for one smart account, built from Stellar RPC
// events (cursor-paged, de-duplicated by event id) plus failed agent
// transactions from Horizon. State lives in memory for the server process.
import "server-only";
import { Address, FeeBumpTransaction, nativeToScVal, rpc, scValToNative, type Transaction, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
import { contractErrorCodeFromEvents } from "../../sdk/src/read.ts";
import { config } from "./config";

export type Activity = {
  id: string;
  txHash: string;
  ledger: number;
  closedAt: string;
  /** payment: confirmed transfer out; deposit: transfer in; blocked: failed on-chain attempt. */
  kind: "payment" | "deposit" | "blocked";
  /** Who initiated a payment: the agent via x402, the agent directly, or the owner rule. */
  initiator?: "x402" | "agent" | "owner";
  counterparty: string;
  /** USDC base units (7 decimals), as a decimal string. */
  amount: string;
  errorCode?: number;
};

type IndexState = {
  cursor?: string;
  activity: Map<string, Activity>;
  agentTxs: Set<string>;
  txSources: Map<string, string[]>;
  checkedFailed: Set<string>;
  lastHorizonCheck: number;
  lastSync: number;
  syncing?: Promise<void>;
};

const globalIndex = globalThis as typeof globalThis & { __guardrailIndex?: IndexState };
const state: IndexState = (globalIndex.__guardrailIndex ??= {
  activity: new Map(),
  agentTxs: new Set(),
  txSources: new Map(),
  checkedFailed: new Set(),
  lastHorizonCheck: 0,
  lastSync: 0,
});

const server = new rpc.Server(config.network.rpcUrl);
const PAGE = 200;
const MAX_PAGES = 30;
const MIN_SYNC_MS = 4_000;
const HORIZON_EVERY_MS = 20_000;

const b64 = (v: xdr.ScVal) => v.toXDR("base64");
const ACCOUNT = b64(nativeToScVal(Address.fromString(config.smartAccount)));
const TRANSFER = b64(xdr.ScVal.scvSymbol("transfer"));
const ENFORCED = b64(xdr.ScVal.scvSymbol("spending_limit_enforced"));

const filters: rpc.Api.EventFilter[] = [
  { type: "contract", contractIds: [config.usdc], topics: [[TRANSFER, ACCOUNT, "*", "**"], [TRANSFER, "*", ACCOUNT, "**"]] },
  { type: "contract", contractIds: [config.policies.spendingLimit], topics: [[ENFORCED, ACCOUNT]] },
];

/** SAC transfer values are an i128 amount, or a map with `amount` for muxed recipients. */
function transferAmount(value: xdr.ScVal): bigint {
  const native = scValToNative(value) as bigint | { amount: bigint };
  return typeof native === "bigint" ? native : BigInt(native.amount);
}

function cursorLedger(cursor: string): number {
  return Number(BigInt(cursor.split("-")[0]) >> 32n);
}

async function syncEvents() {
  let startLedger: number | undefined;
  if (!state.cursor) {
    const health = await server.getHealth();
    startLedger = Math.max(config.indexStartLedger, health.oldestLedger + 1);
  }
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = state.cursor
      ? await server.getEvents({ cursor: state.cursor, filters, limit: PAGE })
      : await server.getEvents({ startLedger: startLedger!, filters, limit: PAGE });

    for (const e of res.events) {
      if (!e.inSuccessfulContractCall) continue;
      const name = scValToNative(e.topic[0]);
      if (name === "spending_limit_enforced") {
        state.agentTxs.add(e.txHash);
        continue;
      }
      const from = scValToNative(e.topic[1]) as string;
      const to = scValToNative(e.topic[2]) as string;
      const outgoing = from === config.smartAccount;
      state.activity.set(e.id, {
        id: e.id,
        txHash: e.txHash,
        ledger: e.ledger,
        closedAt: e.ledgerClosedAt,
        kind: outgoing ? "payment" : "deposit",
        counterparty: outgoing ? to : from,
        amount: transferAmount(e.value).toString(),
      });
    }
    if (res.cursor) state.cursor = res.cursor;
    const done = res.events.length < PAGE && (!res.cursor || cursorLedger(res.cursor) >= res.latestLedger - 1);
    if (done) break;
  }
}

function sourcesOf(envelopeXdr: xdr.TransactionEnvelope): string[] {
  const tx = TransactionBuilder.fromXDR(envelopeXdr, config.network.networkPassphrase) as Transaction | FeeBumpTransaction;
  return tx instanceof FeeBumpTransaction ? [tx.feeSource, tx.innerTransaction.source] : [tx.source];
}

async function classifyPayments() {
  for (const a of state.activity.values()) {
    if (a.kind !== "payment") continue;
    // Re-evaluated each sync: the policy event may land in a later page than the transfer.
    if (!state.agentTxs.has(a.txHash)) {
      a.initiator = "owner";
      continue;
    }
    if (a.initiator === "x402" || a.initiator === "agent") continue;
    let sources = state.txSources.get(a.txHash);
    if (!sources) {
      const tx = await server.getTransaction(a.txHash);
      if (tx.status === rpc.Api.GetTransactionStatus.NOT_FOUND) continue;
      sources = sourcesOf(tx.envelopeXdr);
      state.txSources.set(a.txHash, sources);
    }
    a.initiator = sources.some((s) => config.facilitators.includes(s)) ? "x402" : "agent";
  }
}

type HorizonTx = { hash: string; successful: boolean; ledger: number; created_at: string };

/** Failed USDC transfers from the smart account, submitted by the agent's fee payers. */
async function syncBlockedAttempts() {
  if (Date.now() - state.lastHorizonCheck < HORIZON_EVERY_MS) return;
  state.lastHorizonCheck = Date.now();
  for (const payer of config.agentFeePayers) {
    const url = `${config.horizonUrl}/accounts/${payer}/transactions?include_failed=true&order=desc&limit=100`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) continue;
    const records = ((await res.json())._embedded?.records ?? []) as HorizonTx[];
    for (const record of records) {
      if (record.successful || state.checkedFailed.has(record.hash)) continue;
      state.checkedFailed.add(record.hash);
      const tx = await server.getTransaction(record.hash);
      if (tx.status !== rpc.Api.GetTransactionStatus.FAILED) continue;
      const parsed = TransactionBuilder.fromXDR(tx.envelopeXdr, config.network.networkPassphrase);
      const inner = parsed instanceof FeeBumpTransaction ? parsed.innerTransaction : parsed;
      const op = inner.operations[0];
      if (op?.type !== "invokeHostFunction" || op.func.switch().name !== "hostFunctionTypeInvokeContract") continue;
      const call = op.func.invokeContract();
      const contract = Address.fromScAddress(call.contractAddress()).toString();
      const args = call.args();
      if (contract !== config.usdc || call.functionName().toString() !== "transfer" || args.length !== 3) continue;
      if (scValToNative(args[0]) !== config.smartAccount) continue;
      state.activity.set(`failed-${record.hash}`, {
        id: `failed-${record.hash}`,
        txHash: record.hash,
        ledger: record.ledger,
        closedAt: record.created_at,
        kind: "blocked",
        initiator: "agent",
        counterparty: scValToNative(args[1]) as string,
        amount: (scValToNative(args[2]) as bigint).toString(),
        errorCode: contractErrorCodeFromEvents(tx.diagnosticEventsXdr),
      });
    }
  }
}

/** Brings the index up to date. Concurrent callers share one sync; syncs are rate-limited. */
export async function syncIndex(): Promise<void> {
  if (state.syncing) return state.syncing;
  if (Date.now() - state.lastSync < MIN_SYNC_MS) return;
  state.syncing = (async () => {
    try {
      await syncEvents();
      await classifyPayments();
      await syncBlockedAttempts();
      state.lastSync = Date.now();
    } finally {
      state.syncing = undefined;
    }
  })();
  return state.syncing;
}

export function indexedActivity(): Activity[] {
  return [...state.activity.values()].sort((a, b) => b.ledger - a.ledger || b.id.localeCompare(a.id));
}

export function indexCursorLedger(): number | undefined {
  return state.cursor ? cursorLedger(state.cursor) : undefined;
}
