// Unit tests for the narrowed event check in facilitator.ts.
//   node --test x402-demo/
import assert from "node:assert/strict";
import { test } from "node:test";
import { Address, Keypair, StrKey, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/facilitator";
import "./facilitator.ts"; // installs the narrowed check

const contract = () => StrKey.encodeContract(Keypair.random().rawPublicKey());
const account = () => Keypair.random().publicKey();

const USDC = contract();
const POLICY = contract();
const OTHER_TOKEN = contract();
const PAYER = contract();
const PAY_TO = account();
const AMOUNT = 10_000_000n;

function event(contractId: string, name: string, topics: xdr.ScVal[] = [], data: xdr.ScVal = xdr.ScVal.scvVoid()) {
  return new xdr.DiagnosticEvent({
    inSuccessfulContractCall: true,
    event: new xdr.ContractEvent({
      ext: new xdr.ExtensionPoint(0),
      contractId: Address.fromString(contractId).toBuffer() as unknown as xdr.ContractId,
      type: xdr.ContractEventType.contract(),
      body: new xdr.ContractEventBody(0, new xdr.ContractEventV0({ topics: [xdr.ScVal.scvSymbol(name), ...topics], data })),
    }),
  });
}

const addr = (a: string) => nativeToScVal(Address.fromString(a), { type: "address" });
const transfer = (token: string, from = PAYER, to = PAY_TO, amount = AMOUNT) =>
  event(token, "transfer", [addr(from), addr(to), xdr.ScVal.scvString("USDC:ISSUER")], nativeToScVal(amount, { type: "i128" }));
const policyEvent = () => event(POLICY, "spending_limit_enforced", [addr(PAYER)]);

const scheme = new ExactStellarScheme([createEd25519Signer(Keypair.random().secret(), "stellar:testnet")]);
const validate = (events: xdr.DiagnosticEvent[]) =>
  (scheme as unknown as { validateSimulationEvents: (...a: unknown[]) => { invalidReason?: string } | undefined })
    .validateSimulationEvents(events, PAYER, PAY_TO, AMOUNT, USDC);

test("accepts a single asset transfer", () => {
  assert.equal(validate([transfer(USDC)]), undefined);
});

test("accepts a policy event next to the asset transfer", () => {
  assert.equal(validate([policyEvent(), transfer(USDC)]), undefined);
});

test("rejects a transfer from another token contract", () => {
  assert.equal(validate([policyEvent(), transfer(OTHER_TOKEN), transfer(USDC)])?.invalidReason, "invalid_exact_stellar_payload_event_wrong_asset");
});

for (const name of ["mint", "burn", "clawback"]) {
  test(`rejects a ${name} event from another contract`, () => {
    assert.equal(validate([event(OTHER_TOKEN, name, [addr(PAYER), addr(PAY_TO)]), transfer(USDC)])?.invalidReason, "invalid_exact_stellar_payload_event_not_transfer");
  });
}

test("rejects a non-transfer event from the asset contract", () => {
  assert.equal(validate([event(USDC, "approve", [addr(PAYER), addr(PAY_TO)]), transfer(USDC)])?.invalidReason, "invalid_exact_stellar_payload_event_not_transfer");
});

test("rejects a second asset transfer", () => {
  assert.equal(validate([transfer(USDC), transfer(USDC, PAYER, account())])?.invalidReason, "invalid_exact_stellar_payload_multiple_transfers");
});

test("rejects wrong amount and wrong recipient", () => {
  assert.equal(validate([transfer(USDC, PAYER, PAY_TO, AMOUNT + 1n)])?.invalidReason, "invalid_exact_stellar_payload_event_wrong_amount");
  assert.equal(validate([transfer(USDC, PAYER, account())])?.invalidReason, "invalid_exact_stellar_payload_event_wrong_to");
});

test("rejects when there is no asset transfer", () => {
  assert.equal(validate([policyEvent()])?.invalidReason, "invalid_exact_stellar_payload_no_transfer_events");
});
