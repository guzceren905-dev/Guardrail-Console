// Guided demo for the walkthrough video (SOW Week 4). Keep the dashboard open
// next to the terminal: https://guardrail-console.vercel.app
//   node --env-file-if-exists=.env.local scripts/testnet/demo.ts [--auto]
// Spends REPORT_PRICE (default $1.00) of the agent's daily cap per run.
// DEMO_NARRATION=<json> switches to narrated mode for the video recorder
// (scripts/demo-video/record.ts): cues are timed to the spoken narration and
// the dashboard is scrolled through the demo browser.
import { appendFileSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { DashboardBrowser } from "../demo-video/browser.ts";
import { type CueId, cues } from "../demo-video/cues.ts";
import { decodePaymentResponseHeader, wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { GuardrailErrors } from "../../sdk/src/index.ts";
import { startPaidApi } from "../../x402-demo/spawn.ts";
import { AGENT_RULE_ID, USDC_SAC, address, demoAgent, ed25519Signer, explorerTx, keypair, ownerAccount } from "./lib.ts";

type Narration = { durations: Record<string, number>; timeline: string; cdpPort: number };
const narration: Narration | undefined = process.env.DEMO_NARRATION ? JSON.parse(readFileSync(process.env.DEMO_NARRATION, "utf8")) : undefined;
const auto = process.argv.includes("--auto") || !!narration;
const DASHBOARD_REFRESH_WAIT_MS = 12_000;
const PORT = 4041;
const DASHBOARD = process.env.DASHBOARD_URL ?? "https://guardrail-console.vercel.app";
const rl = createInterface({ input: process.stdin, output: process.stdout });
const owner = ownerAccount();
const agent = demoAgent();
const reasons: Record<number, string> = {
  [GuardrailErrors.SpendingLimitExceeded]: "over the daily cap",
  [GuardrailErrors.RecipientNotAllowed]: "recipient not on the allowlist",
  [GuardrailErrors.UnauthorizedSigner]: "agent is frozen",
};

let stepNo = 0;
async function step(title: string, narration: string) {
  stepNo++;
  console.log(`\n━━━ ${stepNo}. ${title} ━━━\n${narration}`);
  if (!auto) await rl.question("\n[Enter] to run ");
}

let browser: DashboardBrowser | undefined;

/** Narrated mode: logs the cue time, scrolls the dashboard and waits while the narration plays. */
async function say(id: CueId) {
  if (!narration) return;
  appendFileSync(narration.timeline, JSON.stringify({ id, t: Date.now() }) + "\n");
  browser?.show(cues[id].view);
  await sleep(narration.durations[id] * 1000 + 700);
}

/** Narrated mode: gives the dashboard time to refresh before pointing at it. */
const settle = () => (narration ? sleep(DASHBOARD_REFRESH_WAIT_MS) : Promise.resolve());

const usd = (units: bigint) => `$${(Number(units) / 1e7).toFixed(2)}`;
async function showStatus() {
  const s = await owner.getAgentStatus(AGENT_RULE_ID);
  console.log(`  agent ${s.frozen ? "FROZEN" : "active"} · spent ${usd(s.spentInWindow)} of ${usd(s.dailyCap)} · remaining ${usd(s.remaining)} · allowlist ${s.recipients.length}`);
}

const x402 = (skipLocalPolicyCheck = false) =>
  wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [{ network: "stellar:testnet", client: agent.x402Scheme({ skipLocalPolicyCheck }) }],
    spendControls: false,
  });

async function buy(path: string, skipLocalPolicyCheck = false) {
  try {
    const res = await x402(skipLocalPolicyCheck)(`http://localhost:${PORT}${path}`);
    const settled = res.headers.get("PAYMENT-RESPONSE");
    if (res.ok && settled) {
      console.log(`  ✓ HTTP ${res.status} · paid and settled on-chain: ${explorerTx(decodePaymentResponseHeader(settled).transaction)}`);
    } else {
      const required = res.headers.get("PAYMENT-REQUIRED");
      const reason = required ? JSON.parse(Buffer.from(required, "base64").toString()).error : res.statusText;
      console.log(`  ✗ HTTP ${res.status} · facilitator refused to settle: ${reason}`);
    }
  } catch (error) {
    const code = (error as { cause?: { errorCode?: number } }).cause?.errorCode ?? Number(/#(\d+)/.exec((error as Error).message)?.[1]);
    console.log(`  ✗ agent did not pay: smart account policy rejects it (#${code}, ${reasons[code] ?? "rejected"})`);
  }
}

console.log(`Guardrail Console demo · dashboard: ${DASHBOARD}`);
const server = await startPaidApi(PORT);
if (narration) {
  browser = new DashboardBrowser(narration.cdpPort);
  await browser.connect();
  browser.zoom(0.8);
}
try {
  await step("Starting point", "A smart account holds the agent's USDC. The agent may only pay allowlisted recipients, up to a daily cap. The dashboard is read-only.");
  await showStatus();
  await say("intro");

  await step("Agent buys a report via x402 (within policy)", "The agent calls a paid API. It pays from the smart account, signing as the agent. The policies check the payment on-chain.");
  await say("x402Pay");
  await buy("/api/report");
  await showStatus();
  console.log(`  → Dashboard: new x402 row, spend and remaining budget update within ~10s`);
  await settle();
  await say("x402Paid");

  await step("Agent tries a premium report above the daily cap", "The $15 report costs more than the agent's 10 USDC daily cap.");
  await say("overCap");
  await buy("/api/premium-report");
  console.log("  Even if the agent skips its own check, the facilitator's simulation runs the same on-chain policy:");
  await buy("/api/premium-report", true);
  await say("overCapRefused");

  await step("Over-cap payment submitted to the ledger", "Submitted straight to Stellar, the over-cap payment fails on-chain. The ledger enforces the limit, not the app.");
  await say("onChain");
  const overCap = await agent.pay({ token: USDC_SAC, to: address("gc-merchant"), amount: 15n * 10_000_000n, feeSource: keypair("gc-agent"), recordRejection: { referenceRecipient: address("gc-merchant") } });
  console.log(`  ✗ ${overCap.status} on-chain (#${overCap.errorCode}, ${reasons[overCap.errorCode ?? 0]}): ${explorerTx(overCap.hash)}`);
  console.log("  → Dashboard: 'Blocked · Over daily cap' row; spend unchanged");
  await settle();
  await say("onChainBlocked");

  await step("Payment to a recipient that is not allowlisted", "The partner API's recipient is not on the agent's allowlist.");
  await say("allowlist");
  await buy("/api/partner-report");
  const stranger = await agent.pay({ token: USDC_SAC, to: address("gc-stranger"), amount: 10_000_000n, feeSource: keypair("gc-agent"), recordRejection: { referenceRecipient: address("gc-merchant") } });
  console.log(`  ✗ ${stranger.status} on-chain (#${stranger.errorCode}, ${reasons[stranger.errorCode ?? 0]}): ${explorerTx(stranger.hash)}`);
  await settle();
  await say("allowlistBlocked");

  await step("Owner freezes the agent", "The owner removes the agent's signer. Policies and spend history stay.");
  await say("freeze");
  console.log(`  frozen: ${explorerTx(await owner.freezeAgent(AGENT_RULE_ID))}`);
  await showStatus();
  console.log("  → Dashboard: 'Agent frozen' banner");
  await settle();
  await say("frozen");
  await buy("/api/report");

  await step("Owner unfreezes the agent", "The agent signer is restored on the same rule. The daily spend is not reset.");
  await say("unfreeze");
  console.log(`  unfrozen: ${explorerTx(await owner.unfreezeAgent(AGENT_RULE_ID, ed25519Signer("gc-agent")))}`);
  await showStatus();
  await settle();
  await say("unfrozen");
  await say("outro");
  console.log(`\nDone. Every transaction above is on Stellar Expert and in the dashboard: ${DASHBOARD}`);
} finally {
  // Never leave the demo account frozen.
  if ((await owner.getAgentStatus(AGENT_RULE_ID)).frozen) await owner.unfreezeAgent(AGENT_RULE_ID, ed25519Signer("gc-agent"));
  server.kill();
  browser?.close();
  rl.close();
}
