// End-to-end tests against the live testnet deployment (Weeks 1–2).
// Spends ~0.06 USDC of the agent's daily cap and some testnet XLM per run.
//   node --env-file-if-exists=.env.local --test --test-concurrency=1 scripts/testnet/e2e.test.ts
import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { after, before, describe, test } from "node:test";
import { addr, readContract, GuardrailErrors } from "../../sdk/src/index.ts";
import { rpc } from "@stellar/stellar-sdk";
import { decodePaymentResponseHeader, wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { AGENT_RULE_ID, NETWORK, SMART_ACCOUNT, USDC_SAC, USDC_UNIT, address, demoAgent, ed25519Signer, keypair, ownerAccount, usdc } from "./lib.ts";

const owner = ownerAccount();
const agent = demoAgent();
const agentFees = keypair("gc-agent");
const MERCHANT = address("gc-merchant");
const STRANGER = address("gc-stranger");
const CAP = 10n * USDC_UNIT;
const SMALL = usdc("0.01");

const balance = () => readContract<bigint>(NETWORK, { contract: USDC_SAC, method: "balance", args: [addr(SMART_ACCOUNT)] });
const pay = (to: string, amount: bigint, recordRejection = false) =>
  agent.pay({ token: USDC_SAC, to, amount, feeSource: agentFees, recordRejection: recordRejection ? { referenceRecipient: MERCHANT } : undefined });

async function onChainStatus(hash: string) {
  return (await new rpc.Server(NETWORK.rpcUrl).getTransaction(hash)).status;
}

// Leave the deployment as the demo expects it, whatever happened.
after(async () => {
  const status = await owner.getAgentStatus(AGENT_RULE_ID);
  if (status.frozen) await owner.unfreezeAgent(AGENT_RULE_ID, ed25519Signer("gc-agent"));
  if (status.recipients.length !== 1 || status.recipients[0] !== MERCHANT) await owner.setAllowlist(AGENT_RULE_ID, [MERCHANT]);
  if (status.dailyCap !== CAP) await owner.setDailyCap(AGENT_RULE_ID, CAP);
});

describe("agent payments (direct)", () => {
  test("allowlisted payment within the cap settles and is counted", async () => {
    const [before, statusBefore] = await Promise.all([balance(), owner.getAgentStatus(AGENT_RULE_ID)]);
    assert.ok(statusBefore.remaining >= SMALL, "daily cap exhausted; rerun after the window rolls");
    const result = await pay(MERCHANT, SMALL);
    assert.equal(result.status, "SUCCESS");
    assert.equal(await balance(), before - SMALL);
    const statusAfter = await owner.getAgentStatus(AGENT_RULE_ID);
    assert.equal(statusAfter.spentInWindow, statusBefore.spentInWindow + SMALL);
  });

  test("non-allowlisted recipient is rejected", async () => {
    const result = await pay(STRANGER, SMALL);
    assert.equal(result.status, "SIMULATION_FAILED");
    assert.equal(result.errorCode, GuardrailErrors.RecipientNotAllowed);
  });

  test("payment above the remaining cap is rejected", async () => {
    const { remaining } = await owner.getAgentStatus(AGENT_RULE_ID);
    const result = await pay(MERCHANT, remaining + 1n);
    assert.equal(result.status, "SIMULATION_FAILED");
    assert.equal(result.errorCode, GuardrailErrors.SpendingLimitExceeded);
  });

  test("rejections can be recorded on-chain as failed transactions", async () => {
    const stranger = await pay(STRANGER, SMALL, true);
    assert.equal(stranger.status, "FAILED");
    assert.equal(stranger.errorCode, GuardrailErrors.RecipientNotAllowed);
    assert.equal(await onChainStatus(stranger.hash), "FAILED");

    const overCap = await pay(MERCHANT, CAP + 1n, true);
    assert.equal(overCap.status, "FAILED");
    assert.equal(overCap.errorCode, GuardrailErrors.SpendingLimitExceeded);
  });
});

describe("owner configuration", () => {
  test("allowlist update takes effect and can be reverted", async () => {
    await owner.setAllowlist(AGENT_RULE_ID, [MERCHANT, STRANGER]);
    assert.deepEqual((await owner.getAgentStatus(AGENT_RULE_ID)).recipients, [MERCHANT, STRANGER]);
    assert.equal((await pay(STRANGER, SMALL)).status, "SUCCESS");

    await owner.setAllowlist(AGENT_RULE_ID, [MERCHANT]);
    assert.equal((await pay(STRANGER, SMALL)).errorCode, GuardrailErrors.RecipientNotAllowed);
  });

  test("daily cap update takes effect and can be reverted", async () => {
    const { spentInWindow } = await owner.getAgentStatus(AGENT_RULE_ID);
    const tightCap = spentInWindow + SMALL;
    await owner.setDailyCap(AGENT_RULE_ID, tightCap);
    assert.equal((await owner.getAgentStatus(AGENT_RULE_ID)).dailyCap, tightCap);
    assert.equal((await pay(MERCHANT, SMALL + 1n)).errorCode, GuardrailErrors.SpendingLimitExceeded);

    await owner.setDailyCap(AGENT_RULE_ID, CAP);
    assert.equal((await owner.getAgentStatus(AGENT_RULE_ID)).dailyCap, CAP);
  });

  test("freeze blocks the agent; unfreeze restores it with the spend history intact", async () => {
    const before = await owner.getAgentStatus(AGENT_RULE_ID);
    await owner.freezeAgent(AGENT_RULE_ID);
    const frozen = await owner.getAgentStatus(AGENT_RULE_ID);
    assert.equal(frozen.frozen, true);
    assert.equal(frozen.spentInWindow, before.spentInWindow);

    const blocked = await pay(MERCHANT, SMALL);
    assert.equal(blocked.errorCode, GuardrailErrors.UnauthorizedSigner);
    await assert.rejects(owner.freezeAgent(AGENT_RULE_ID), /already frozen/);

    await owner.unfreezeAgent(AGENT_RULE_ID, ed25519Signer("gc-agent"));
    const unfrozen = await owner.getAgentStatus(AGENT_RULE_ID);
    assert.equal(unfrozen.frozen, false);
    assert.equal(unfrozen.spentInWindow, before.spentInWindow);
    assert.equal((await pay(MERCHANT, SMALL)).status, "SUCCESS");
  });
});

function startServer(port: number, env: Record<string, string>): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["x402-demo/server.ts"], {
      env: { ...process.env, PORT: String(port), REPORT_PRICE: "$0.01", ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr!.on("data", (d) => (stderr += d));
    child.stdout!.on("data", (d) => String(d).includes("Paid API on") && resolve(child));
    child.on("exit", (code) => reject(new Error(`server exited (${code}): ${stderr}`)));
  });
}

function x402Fetch(skipLocalPolicyCheck = false) {
  return wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [{ network: "stellar:testnet", client: agent.x402Scheme({ skipLocalPolicyCheck }) }],
    spendControls: false,
  });
}

const rejectionReason = (res: Response) => {
  const header = res.headers.get("PAYMENT-REQUIRED");
  return header ? JSON.parse(Buffer.from(header, "base64").toString()).error : undefined;
};

describe("x402 via the self-hosted facilitator", () => {
  const port = 4031;
  const url = (path: string) => `http://localhost:${port}${path}`;
  let server: ChildProcess;
  before(async () => (server = await startServer(port, { FACILITATOR: "self-hosted" })));
  after(() => server?.kill());

  test("unpaid request gets 402", async () => {
    assert.equal((await fetch(url("/api/report"))).status, 402);
  });

  test("within-policy payment settles on-chain and returns the resource", async () => {
    const res = await x402Fetch()(url("/api/report"));
    assert.equal(res.status, 200);
    const settlement = decodePaymentResponseHeader(res.headers.get("PAYMENT-RESPONSE")!);
    assert.equal(settlement.success, true);
    assert.equal(await onChainStatus(settlement.transaction), "SUCCESS");
    assert.deepEqual(await res.json(), { report: "market", tier: "standard" });
  });

  test("over-cap and non-allowlisted payments are refused by the agent", async () => {
    await assert.rejects(x402Fetch()(url("/api/premium-report")), /#3221/);
    await assert.rejects(x402Fetch()(url("/api/partner-report")), /#3303/);
  });

  test("the facilitator rejects policy violations even if the agent skips its check", async () => {
    for (const path of ["/api/premium-report", "/api/partner-report"]) {
      const res = await x402Fetch(true)(url(path));
      assert.equal(res.status, 402);
      assert.equal(rejectionReason(res), "invalid_exact_stellar_payload_simulation_failed");
    }
  });

  test("a frozen agent cannot pay via x402", async () => {
    await owner.freezeAgent(AGENT_RULE_ID);
    try {
      await assert.rejects(x402Fetch()(url("/api/report")), /#3016/);
    } finally {
      await owner.unfreezeAgent(AGENT_RULE_ID, ed25519Signer("gc-agent"));
    }
  });
});

describe("x402 via OZ Channels", { skip: !process.env.OZ_API_KEY && "OZ_API_KEY not set" }, () => {
  const port = 4032;
  let server: ChildProcess;
  before(async () => (server = await startServer(port, { FACILITATOR: "oz-channels" })));
  after(() => server?.kill());

  // Known upstream issue: x402-foundation/x402#3764, OpenZeppelin/relayer-plugin-x402-facilitator#53.
  // When this starts failing, OZ Channels accepts smart-account payers: switch the demo back.
  test("rejects a within-policy smart-account payment (event check)", async () => {
    const res = await x402Fetch()(`http://localhost:${port}/api/report`);
    assert.equal(res.status, 402);
    assert.equal(rejectionReason(res), "invalid_exact_stellar_payload_event_not_transfer");
  });
});
