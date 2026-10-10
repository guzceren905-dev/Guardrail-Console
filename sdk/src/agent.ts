// Agent-side payments from the policy-gated smart account: direct token
// transfers and an x402 "exact" client scheme for Stellar.
import { Account, type Keypair, rpc } from "@stellar/stellar-sdk";
import type { PaymentPayloadResult, PaymentRequirements, SchemeNetworkClient } from "@x402/core/types";
import type { Ed25519Signer } from "smart-account-kit";
import {
  type InvokeResult,
  NULL_ACCOUNT,
  type Network,
  addr,
  contractErrorCode,
  i128,
  invokeAsSmartAccount,
  simulateSignedInvocation,
} from "./core.ts";

export type AgentConfig = {
  network: Network;
  smartAccount: string;
  /** The agent's Ed25519 signer on its context rule. */
  agent: Ed25519Signer;
  ruleId: number;
};

export class GuardrailAgent {
  readonly config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  /**
   * Transfers `amount` base units of `token` from the smart account to `to`.
   * `feeSource` pays the network fee. With `recordRejection`, a payment the
   * policies reject is still submitted (using a passing reference payment to
   * `recordRejection.referenceRecipient` for the footprint), so the rejection
   * is recorded on-chain as a failed transaction.
   */
  pay(opts: {
    token: string;
    to: string;
    amount: bigint;
    feeSource: Keypair;
    recordRejection?: { referenceRecipient: string };
  }): Promise<InvokeResult> {
    const { smartAccount } = this.config;
    return invokeAsSmartAccount({
      network: this.config.network,
      feeSource: opts.feeSource,
      smartAccount,
      signer: this.config.agent,
      contextRuleIds: [this.config.ruleId],
      contract: opts.token,
      method: "transfer",
      args: [addr(smartAccount), addr(opts.to), i128(opts.amount)],
      forceWithReferenceArgs: opts.recordRejection
        ? [addr(smartAccount), addr(opts.recordRejection.referenceRecipient), i128(1n)]
        : undefined,
    });
  }

  /** x402 client scheme that pays as this agent. */
  x402Scheme(opts: { skipLocalPolicyCheck?: boolean } = {}): SmartAccountExactStellarScheme {
    return new SmartAccountExactStellarScheme(this.config, opts.skipLocalPolicyCheck ?? false);
  }
}

const LEDGER_SECONDS = 5;

/**
 * x402 "exact" client scheme for Stellar where the payer is an OZ smart
 * account. It produces the same payload as @x402/stellar's ExactStellarScheme
 * client (a transfer transaction with a signed auth entry), but signs the auth
 * entry as the smart account (AuthPayload with the agent signer and rule id)
 * instead of as a classic G-account.
 */
export class SmartAccountExactStellarScheme implements SchemeNetworkClient {
  readonly scheme = "exact";
  private readonly config: AgentConfig;
  // Demo only: send the payment even when local simulation shows the policies
  // reject it, to show that the facilitator (and the chain) reject it too.
  private readonly skipLocalPolicyCheck: boolean;

  constructor(config: AgentConfig, skipLocalPolicyCheck = false) {
    this.config = config;
    this.skipLocalPolicyCheck = skipLocalPolicyCheck;
  }

  async createPaymentPayload(x402Version: number, req: PaymentRequirements): Promise<PaymentPayloadResult> {
    if (req.scheme !== "exact") throw new Error(`Unsupported scheme: ${req.scheme}`);
    if (!req.extra?.areFeesSponsored) throw new Error("Exact scheme requires areFeesSponsored to be true");

    const latest = await new rpc.Server(this.config.network.rpcUrl).getLatestLedger();
    const { enforcing, unsigned } = await simulateSignedInvocation({
      network: this.config.network,
      // The facilitator rebuilds the envelope with its own source and fee.
      source: new Account(NULL_ACCOUNT, "0"),
      smartAccount: this.config.smartAccount,
      signer: this.config.agent,
      contextRuleIds: [this.config.ruleId],
      contract: req.asset,
      method: "transfer",
      args: [addr(this.config.smartAccount), addr(req.payTo), i128(BigInt(req.amount))],
      expirationLedger: latest.sequence + Math.ceil(req.maxTimeoutSeconds / LEDGER_SECONDS),
      baseFee: "100",
    });

    if (!rpc.Api.isSimulationSuccess(enforcing)) {
      const error = (enforcing as rpc.Api.SimulateTransactionErrorResponse).error;
      const code = contractErrorCode(error);
      if (!this.skipLocalPolicyCheck) {
        throw Object.assign(new Error(`Payment rejected by smart account policy: ${code ? `#${code}` : error.split("\n")[0]}`), { errorCode: code });
      }
      return { x402Version, payload: { transaction: unsigned.toXDR() } };
    }
    return { x402Version, payload: { transaction: rpc.assembleTransaction(unsigned, enforcing).build().toXDR() } };
  }
}
