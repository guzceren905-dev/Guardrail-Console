// The agent pays USDC from the smart account, signed by the agent's Ed25519 key
// under the agent context rule.
//   node scripts/testnet/agent-pay.ts <recipient-identity> <usdc-amount> [--force]
// --force submits even when simulation rejects it, to record the rejection on-chain.
import { AGENT_RULE_ID, SMART_ACCOUNT, USDC_SAC, addr, ed25519Signer, explorerTx, i128, invokeAsSmartAccount, keypair } from "./lib.ts";

const [recipientIdentity, amountArg] = process.argv.slice(2);
const force = process.argv.includes("--force");
if (!recipientIdentity || !amountArg) {
  console.error("usage: agent-pay.ts <recipient-identity> <usdc-amount> [--force]");
  process.exit(1);
}

const units = BigInt(Math.round(Number(amountArg) * 1e7));
const recipient = keypair(recipientIdentity).publicKey();
const allowlisted = keypair("gc-merchant").publicKey();

const result = await invokeAsSmartAccount({
  feeSource: keypair("gc-agent"),
  contract: USDC_SAC,
  method: "transfer",
  args: [addr(SMART_ACCOUNT), addr(recipient), i128(units)],
  signer: ed25519Signer("gc-agent"),
  contextRuleIds: [AGENT_RULE_ID],
  forceWithReferenceArgs: force ? [addr(SMART_ACCOUNT), addr(allowlisted), i128(1n)] : undefined,
});

console.log(`${amountArg} USDC -> ${recipientIdentity}: ${result.status}`);
if (result.error) console.log(result.error.split("\n").find((l) => l.includes("Error(Contract")) ?? result.error.split("\n")[0]);
if (result.hash) console.log(explorerTx(result.hash));
