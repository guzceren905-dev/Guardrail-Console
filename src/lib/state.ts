// Dashboard snapshot: live balance and policy state plus the indexed activity.
import "server-only";
import { addr, readAgentStatus, readContract } from "../../sdk/src/read.ts";
import { config } from "./config";
import { type Activity, indexCursorLedger, indexedActivity, syncIndex } from "./indexer";

export type DashboardState = {
  network: string;
  explorerUrl: string;
  account: string;
  usdc: string;
  policies: { spendingLimit: string; allowlist: string };
  ruleId: number;
  ledger: number;
  indexedThroughLedger?: number;
  fetchedAt: string;
  /** USDC base units as decimal strings. */
  balance: string;
  dailyCap: string;
  spentInWindow: string;
  remaining: string;
  periodLedgers: number;
  frozen: boolean;
  recipients: { address: string; label?: string }[];
  nearCapRatio: number;
  /** Agent payments indexed inside the policy window vs the policy's own total. */
  reconciliation: { indexedSpent: string; matches: boolean };
  activity: (Activity & { label?: string })[];
};

export async function getDashboardState(): Promise<DashboardState> {
  await syncIndex();
  const [balance, status] = await Promise.all([
    readContract<bigint>(config.network, { contract: config.usdc, method: "balance", args: [addr(config.smartAccount)] }),
    readAgentStatus(config.network, config.smartAccount, config.policies, config.agentRuleId),
  ]);

  const activity = indexedActivity();
  const windowStart = status.ledger - status.periodLedgers;
  const indexedSpent = activity
    .filter((a) => a.kind === "payment" && (a.initiator === "agent" || a.initiator === "x402") && a.ledger > windowStart)
    .reduce((sum, a) => sum + BigInt(a.amount), 0n);

  return {
    network: config.networkLabel,
    explorerUrl: config.explorerUrl,
    account: config.smartAccount,
    usdc: config.usdc,
    policies: config.policies,
    ruleId: config.agentRuleId,
    ledger: status.ledger,
    indexedThroughLedger: indexCursorLedger(),
    fetchedAt: new Date().toISOString(),
    balance: balance.toString(),
    dailyCap: status.dailyCap.toString(),
    spentInWindow: status.spentInWindow.toString(),
    remaining: status.remaining.toString(),
    periodLedgers: status.periodLedgers,
    frozen: status.frozen,
    recipients: status.recipients.map((address) => ({ address, label: config.labels[address] })),
    nearCapRatio: config.nearCapRatio,
    reconciliation: { indexedSpent: indexedSpent.toString(), matches: indexedSpent === status.spentInWindow },
    activity: activity.map((a) => ({ ...a, label: config.labels[a.counterparty] })),
  };
}
