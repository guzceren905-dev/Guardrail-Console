// x402 "exact" client scheme for Stellar where the payer is an OpenZeppelin
// smart account. It produces the same payload as @x402/stellar's
// ExactStellarScheme client (a transfer transaction with a signed auth entry),
// but signs the auth entry as the smart account (AuthPayload with an Ed25519
// agent signer and context rule ids) instead of as a classic G-account.
import { Account, rpc } from "@stellar/stellar-sdk";
import type { PaymentPayloadResult, PaymentRequirements, SchemeNetworkClient } from "@x402/core/types";
import type { Ed25519Signer } from "smart-account-kit";
import { addr, i128, server, simulateSignedInvocation } from "../scripts/testnet/lib.ts";

// Same placeholder source the stock client uses; the facilitator rebuilds the
// envelope with its own source account and fee.
const NULL_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const LEDGER_SECONDS = 5;

export class SmartAccountExactStellarScheme implements SchemeNetworkClient {
  readonly scheme = "exact";

  private readonly smartAccount: string;
  private readonly signer: Ed25519Signer;
  private readonly contextRuleIds: number[];
  // Demo only: send the payment even when local simulation shows the policy
  // rejects it, to show that the facilitator (and the chain) reject it too.
  private readonly skipLocalPolicyCheck: boolean;

  constructor(smartAccount: string, signer: Ed25519Signer, contextRuleIds: number[], skipLocalPolicyCheck = false) {
    this.smartAccount = smartAccount;
    this.signer = signer;
    this.contextRuleIds = contextRuleIds;
    this.skipLocalPolicyCheck = skipLocalPolicyCheck;
  }

  async createPaymentPayload(x402Version: number, req: PaymentRequirements): Promise<PaymentPayloadResult> {
    if (req.scheme !== "exact") throw new Error(`Unsupported scheme: ${req.scheme}`);
    if (!req.extra?.areFeesSponsored) throw new Error("Exact scheme requires areFeesSponsored to be true");

    const latest = await server.getLatestLedger();
    const expirationLedger = latest.sequence + Math.ceil(req.maxTimeoutSeconds / LEDGER_SECONDS);

    const { enforcing, unsigned } = await simulateSignedInvocation({
      source: new Account(NULL_ACCOUNT, "0"),
      contract: req.asset,
      method: "transfer",
      args: [addr(this.smartAccount), addr(req.payTo), i128(BigInt(req.amount))],
      signer: this.signer,
      contextRuleIds: this.contextRuleIds,
      expirationLedger,
      baseFee: "100",
    });
    if (!rpc.Api.isSimulationSuccess(enforcing)) {
      const error = policyError((enforcing as rpc.Api.SimulateTransactionErrorResponse).error);
      if (!this.skipLocalPolicyCheck) {
        // The smart account's policies rejected the payment before anything was sent.
        throw new Error(`Payment rejected by smart account policy: ${error}`);
      }
      console.warn(`Local simulation rejected the payment (${error}); sending it anyway.`);
      return { x402Version, payload: { transaction: unsigned.toXDR() } };
    }

    return {
      x402Version,
      payload: { transaction: rpc.assembleTransaction(unsigned, enforcing).build().toXDR() },
    };
  }
}

/** Extracts the contract error (e.g. "Error(Contract, #3221)") from a simulation error. */
export function policyError(error: string): string {
  return error.match(/Error\(Contract, #\d+\)/g)?.at(-1) ?? error.split("\n")[0];
}
