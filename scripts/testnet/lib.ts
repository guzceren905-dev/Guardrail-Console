// Demo configuration for the testnet deployment. Testnet only.
// Keys come from Stellar CLI identities (gc-owner, gc-agent, gc-merchant,
// gc-stranger, gc-facilitator) and never leave this process.
import { execFileSync } from "node:child_process";
import { Keypair } from "@stellar/stellar-sdk";
import { Ed25519Signer } from "smart-account-kit";
import { GuardrailAccount, GuardrailAgent, TESTNET } from "../../sdk/src/index.ts";

export const NETWORK = TESTNET;

// smart-account-kit testnet deployment (protocol 27, OZ stellar-contracts@1e513890)
export const ED25519_VERIFIER = "CAAVTMCBXEIBPR64EAASKFXERVPYFZA2JYP5A3BG6PESWEFUJX5IHKN4";
export const SPENDING_LIMIT_POLICY = "CABXBYJNZ7IUW4G3D6BND5YCAQF3ASSDMDAOKQQ63UYFSO7WUU2TIP5G";
export const USDC_SAC = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";

// Deployed during the Week 1 spike
export const ALLOWLIST_POLICY = "CBJTSJ7M6BUIKZNNHLOPDNID6RBASIJRAM3AHDYPHIN56HKO5QX6HOQU";
export const SMART_ACCOUNT = "CDQSAMY2O6SCFRXA5SSZHAFT7SAZ7DYHLZVKCHH646KTEDFMBEWO4SFX";
export const AGENT_RULE_ID = 1;

export const USDC_UNIT = 10_000_000n; // 7 decimals

/** Loads a Stellar CLI identity's keypair. */
export function keypair(identity: string): Keypair {
  return Keypair.fromSecret(execFileSync("stellar", ["keys", "show", identity], { encoding: "utf8" }).trim());
}

/** Public address of a Stellar CLI identity. */
export function address(identity: string): string {
  return execFileSync("stellar", ["keys", "address", identity], { encoding: "utf8" }).trim();
}

export function ed25519Signer(identity: string): Ed25519Signer {
  return new Ed25519Signer(keypair(identity), ED25519_VERIFIER);
}

export function ownerAccount(): GuardrailAccount {
  return new GuardrailAccount({
    network: NETWORK,
    smartAccount: SMART_ACCOUNT,
    policies: { spendingLimit: SPENDING_LIMIT_POLICY, allowlist: ALLOWLIST_POLICY },
    feeSource: keypair("gc-owner"),
    owner: ed25519Signer("gc-owner"),
  });
}

export function demoAgent(): GuardrailAgent {
  return new GuardrailAgent({ network: NETWORK, smartAccount: SMART_ACCOUNT, agent: ed25519Signer("gc-agent"), ruleId: AGENT_RULE_ID });
}

export const usdc = (amount: string | number) => BigInt(Math.round(Number(amount) * 1e7));
export const explorerTx = (hash: string) => `https://stellar.expert/explorer/testnet/tx/${hash}`;
