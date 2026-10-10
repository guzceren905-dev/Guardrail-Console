// Adds the agent's USDC context rule: Ed25519 agent signer, OZ spending-limit
// policy (daily cap) and the custom recipient allowlist policy. Signed by the owner.
import {
  ALLOWLIST_POLICY,
  OWNER_RULE_ID,
  SMART_ACCOUNT,
  SPENDING_LIMIT_POLICY,
  USDC_SAC,
  addr,
  ed25519Signer,
  explorerTx,
  i128,
  invokeAsSmartAccount,
  keypair,
  sortedMap,
  struct,
  sym,
  u32,
} from "./lib.ts";
import { xdr } from "@stellar/stellar-sdk";
import { signerToScVal } from "smart-account-kit";

const DAILY_CAP = 10_0000000n; // 10 USDC (7 decimals)
const DAY_IN_LEDGERS = 17280;

const owner = keypair("gc-owner");
const agent = ed25519Signer("gc-agent");
const merchant = keypair("gc-merchant").publicKey();

const result = await invokeAsSmartAccount({
  feeSource: owner,
  contract: SMART_ACCOUNT,
  method: "add_context_rule",
  args: [
    xdr.ScVal.scvVec([sym("CallContract"), addr(USDC_SAC)]),
    xdr.ScVal.scvString("agent-usdc"),
    xdr.ScVal.scvVoid(),
    xdr.ScVal.scvVec([signerToScVal(agent.signer)]),
    sortedMap([
      [addr(SPENDING_LIMIT_POLICY), struct({ spending_limit: i128(DAILY_CAP), period_ledgers: u32(DAY_IN_LEDGERS) })],
      [addr(ALLOWLIST_POLICY), struct({ recipients: xdr.ScVal.scvVec([addr(merchant)]) })],
    ]),
  ],
  signer: ed25519Signer("gc-owner"),
  contextRuleIds: [OWNER_RULE_ID],
});

console.log(result.status, result.error ?? "", result.hash ? explorerTx(result.hash) : "");
