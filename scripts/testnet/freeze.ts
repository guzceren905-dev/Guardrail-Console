// Owner freeze override for the demo agent.
//   node scripts/testnet/freeze.ts freeze|unfreeze|status
import { AGENT_RULE_ID, ed25519Signer, explorerTx, ownerAccount } from "./lib.ts";

const action = process.argv[2];
const account = ownerAccount();

if (action === "freeze") {
  console.log(`frozen: ${explorerTx(await account.freezeAgent(AGENT_RULE_ID))}`);
} else if (action === "unfreeze") {
  console.log(`unfrozen: ${explorerTx(await account.unfreezeAgent(AGENT_RULE_ID, ed25519Signer("gc-agent")))}`);
} else if (action === "status") {
  console.log(await account.getAgentStatus(AGENT_RULE_ID));
} else {
  console.error("usage: freeze.ts freeze|unfreeze|status");
  process.exit(1);
}
