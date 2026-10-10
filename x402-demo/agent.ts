// Demo agent: calls the paid API and pays via x402 from the policy-gated smart account.
//   node x402-demo/agent.ts <path> [--skip-local-check]
// --skip-local-check sends the payment even if local simulation shows the
// policy rejects it, so the facilitator's rejection can be observed.
import { decodePaymentResponseHeader, wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { AGENT_RULE_ID, SMART_ACCOUNT, ed25519Signer, explorerTx } from "../scripts/testnet/lib.ts";
import { SmartAccountExactStellarScheme } from "./smart-account-scheme.ts";

const path = process.argv[2];
if (!path) {
  console.error("usage: agent.ts <path> [--skip-local-check]");
  process.exit(1);
}
const baseUrl = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4021}`;
const scheme = new SmartAccountExactStellarScheme(
  SMART_ACCOUNT,
  ed25519Signer("gc-agent"),
  [AGENT_RULE_ID],
  process.argv.includes("--skip-local-check"),
);
const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: "stellar:testnet", client: scheme }],
  // The x402 client's own spend controls are off on purpose: in this demo the
  // limits are enforced on-chain by the smart account's policies.
  spendControls: false,
});

try {
  const res = await fetchWithPayment(`${baseUrl}${path}`);
  console.log(`${path}: HTTP ${res.status}`);
  const required = res.headers.get("PAYMENT-REQUIRED");
  if (res.status === 402 && required) {
    console.log("rejected:", JSON.parse(Buffer.from(required, "base64").toString()).error);
  }
  const header = res.headers.get("PAYMENT-RESPONSE");
  if (header) {
    const settlement = decodePaymentResponseHeader(header);
    console.log("settlement:", settlement.success ? "SUCCESS" : "FAILED", settlement.transaction ? explorerTx(settlement.transaction) : "");
  }
  console.log(await res.text());
} catch (error) {
  console.log(`${path}: payment not sent - ${(error as Error).message}`);
}
