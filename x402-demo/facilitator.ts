// Self-hosted x402 facilitator for stellar:testnet, built on @x402/stellar's
// facilitator scheme with two changes needed for OZ smart-account payers:
//
// 1. Fee cap raised to 0.1 XLM. A smart-account payment (check_auth, Ed25519
//    verifier, two policies, spend-history write) costs ~0.03 XLM in resource
//    fees, above the scheme's 0.005 XLM default.
// 2. Event check narrowed. Upstream rejects every simulated contract event that
//    is not the asset's `transfer`, so the `spending_limit_enforced` event that
//    OZ's spending-limit policy always emits blocks every payment. Here, events
//    from contracts other than the asset are allowed unless they look like a
//    balance change (transfer, mint, burn, clawback); asset events still go
//    through the upstream check unchanged. OZ Channels has the same check
//    (OpenZeppelin/relayer-plugin-x402-facilitator, src/stellar/utils.ts).
import { Address, scValToNative, xdr } from "@stellar/stellar-sdk";
import type { FacilitatorClient } from "@x402/core/server";
import { x402Facilitator } from "@x402/core/facilitator";
import { createEd25519Signer, type FacilitatorStellarSigner } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/facilitator";

const BALANCE_CHANGING_EVENTS = new Set(["transfer", "mint", "burn", "clawback"]);
const MAX_TRANSACTION_FEE_STROOPS = 1_000_000;

type ValidateEvents = (
  events: xdr.DiagnosticEvent[],
  from: string,
  to: string,
  amount: bigint,
  asset: string,
) => unknown;

function eventContract(event: xdr.ContractEvent): string | undefined {
  const id = event.contractId();
  return id ? Address.fromScAddress(xdr.ScAddress.scAddressTypeContract(id)).toString() : undefined;
}

function eventName(event: xdr.ContractEvent): string | undefined {
  const first = event.body().v0().topics()[0];
  return first?.switch().name === "scvSymbol" ? String(scValToNative(first)) : undefined;
}

// `validateSimulationEvents` is private in the typings, so it is wrapped on the
// prototype. This keeps every other upstream check (auth entries, simulation,
// amounts, recipient) unchanged.
const proto = ExactStellarScheme.prototype as unknown as { validateSimulationEvents: ValidateEvents };
const upstreamValidate = proto.validateSimulationEvents;
proto.validateSimulationEvents = function (events, from, to, amount, asset) {
  const kept = events.filter((diagnostic) => {
    const event = diagnostic.event();
    if (event.type().name !== "contract" || eventContract(event) === asset) return true;
    // Keep balance-changing events from other contracts so upstream rejects them.
    return BALANCE_CHANGING_EVENTS.has(eventName(event) ?? "");
  });
  return upstreamValidate.call(this, kept, from, to, amount, asset);
};

export function selfHostedFacilitator(network: `${string}:${string}`, feePayerSecret: string): FacilitatorClient {
  const signer: FacilitatorStellarSigner = createEd25519Signer(feePayerSecret, network);
  const scheme = new ExactStellarScheme([signer], { maxTransactionFeeStroops: MAX_TRANSACTION_FEE_STROOPS });
  const facilitator = new x402Facilitator().register(network, scheme);
  return {
    verify: (payload, requirements) => facilitator.verify(payload, requirements),
    settle: (payload, requirements) => facilitator.settle(payload, requirements),
    getSupported: async () => facilitator.getSupported() as Awaited<ReturnType<FacilitatorClient["getSupported"]>>,
  };
}
