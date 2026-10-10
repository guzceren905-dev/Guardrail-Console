// Owner freeze override: removes (freeze) or restores (unfreeze) the agent
// signer on the agent context rule. The rule and its policies stay installed,
// so the spending-limit history is preserved.
//   node scripts/testnet/freeze.ts freeze|unfreeze
import { Account, Operation, TransactionBuilder, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { signerToScVal } from "smart-account-kit";
import { AGENT_RULE_ID, NETWORK_PASSPHRASE, OWNER_RULE_ID, SMART_ACCOUNT, ed25519Signer, explorerTx, invokeAsSmartAccount, keypair, server, u32 } from "./lib.ts";

const action = process.argv[2];
if (action !== "freeze" && action !== "unfreeze") {
  console.error("usage: freeze.ts freeze|unfreeze");
  process.exit(1);
}

const agent = ed25519Signer("gc-agent");
const owner = keypair("gc-owner");

// The agent's signer id changes on every unfreeze, so read it from the rule.
async function agentSignerId(): Promise<number> {
  const source = await server.getAccount(owner.publicKey());
  const tx = new TransactionBuilder(new Account(source.accountId(), source.sequenceNumber()), { fee: "100", networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(Operation.invokeContractFunction({ contract: SMART_ACCOUNT, function: "get_context_rule", args: [u32(AGENT_RULE_ID)] }))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim)) throw new Error("get_context_rule failed");
  const ids: number[] = scValToNative(sim.result!.retval).signer_ids;
  if (ids.length !== 1) throw new Error(`Expected one agent signer, found ${ids.length}`);
  return ids[0];
}

const result = await invokeAsSmartAccount({
  feeSource: owner,
  contract: SMART_ACCOUNT,
  method: action === "freeze" ? "remove_signer" : "add_signer",
  args:
    action === "freeze"
      ? [u32(AGENT_RULE_ID), u32(await agentSignerId())]
      : [u32(AGENT_RULE_ID), signerToScVal(agent.signer) as xdr.ScVal],
  signer: ed25519Signer("gc-owner"),
  contextRuleIds: [OWNER_RULE_ID],
});

console.log(`${action}: ${result.status}`, result.error ?? "", result.hash ? explorerTx(result.hash) : "");
