// Adds the agent's USDC context rule: Ed25519 agent signer, OZ spending-limit
// policy (10 USDC per ~24h) and the recipient allowlist (gc-merchant).
// Run once per smart account; the demo account already has rule 1.
import { USDC_SAC, USDC_UNIT, address, ed25519Signer, explorerTx, ownerAccount } from "./lib.ts";

const { ruleId, hash } = await ownerAccount().addAgentRule({
  token: USDC_SAC,
  agent: ed25519Signer("gc-agent"),
  dailyCap: 10n * USDC_UNIT,
  recipients: [address("gc-merchant")],
  name: "agent-usdc",
});
console.log(`agent rule ${ruleId}: ${explorerTx(hash)}`);
