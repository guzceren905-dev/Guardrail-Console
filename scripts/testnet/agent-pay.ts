// The agent pays USDC from the smart account.
//   node scripts/testnet/agent-pay.ts <recipient-identity> <usdc-amount> [--force]
// --force submits even when simulation rejects it, to record the rejection on-chain.
import { USDC_SAC, address, demoAgent, explorerTx, keypair, usdc } from "./lib.ts";

const [recipientIdentity, amount] = process.argv.slice(2);
if (!recipientIdentity || !amount) {
  console.error("usage: agent-pay.ts <recipient-identity> <usdc-amount> [--force]");
  process.exit(1);
}

const result = await demoAgent().pay({
  token: USDC_SAC,
  to: address(recipientIdentity),
  amount: usdc(amount),
  feeSource: keypair("gc-agent"),
  recordRejection: process.argv.includes("--force") ? { referenceRecipient: address("gc-merchant") } : undefined,
});

console.log(`${amount} USDC -> ${recipientIdentity}: ${result.status}${result.errorCode ? ` (#${result.errorCode})` : ""}`);
if (result.hash) console.log(explorerTx(result.hash));
