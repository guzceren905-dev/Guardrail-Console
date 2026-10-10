// Offline unit tests for the SDK.
//   node --test sdk/test/unit.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { Address, Keypair, StrKey, nativeToScVal, scValToNative, xdr } from "@stellar/stellar-sdk";
import { Ed25519Signer, computeEntryAuthDigest } from "smart-account-kit";
import { contractErrorCode, signSmartAccountEntries, sortedMap, spentInWindow, struct, TESTNET } from "../src/index.ts";

const contract = () => StrKey.encodeContract(Keypair.random().rawPublicKey());
const VERIFIER = contract();
const SMART_ACCOUNT = contract();
const USDC = contract();

function authEntry(addressStr: string, v2 = false): xdr.SorobanAuthorizationEntry {
  const credentials = new xdr.SorobanAddressCredentials({
    address: Address.fromString(addressStr).toScAddress(),
    nonce: xdr.Int64.fromString("42"),
    signatureExpirationLedger: 0,
    signature: xdr.ScVal.scvVoid(),
  });
  return new xdr.SorobanAuthorizationEntry({
    credentials: v2
      ? xdr.SorobanCredentials.sorobanCredentialsAddressV2(credentials)
      : xdr.SorobanCredentials.sorobanCredentialsAddress(credentials),
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
        new xdr.InvokeContractArgs({
          contractAddress: Address.fromString(USDC).toScAddress(),
          functionName: "transfer",
          args: [nativeToScVal(Address.fromString(SMART_ACCOUNT)), nativeToScVal(Address.fromString(Keypair.random().publicKey())), nativeToScVal(1n, { type: "i128" })],
        }),
      ),
      subInvocations: [],
    }),
  });
}

for (const v2 of [false, true]) {
  test(`signs smart-account entries with a verifiable AuthPayload (${v2 ? "V2" : "V1"} credentials)`, () => {
    const agentKey = Keypair.random();
    const signer = new Ed25519Signer(agentKey, VERIFIER);
    const entry = authEntry(SMART_ACCOUNT, v2);
    const [signed] = signSmartAccountEntries({
      entries: [entry],
      smartAccount: SMART_ACCOUNT,
      signer,
      contextRuleIds: [1],
      expirationLedger: 1234,
      networkPassphrase: TESTNET.networkPassphrase,
    });

    const creds = v2 ? signed.credentials().addressV2() : signed.credentials().address();
    assert.equal(creds.signatureExpirationLedger(), 1234);
    const payload = scValToNative(creds.signature()) as { context_rule_ids: number[]; signers: Map<unknown, Buffer> | Record<string, Buffer> };
    assert.deepEqual(payload.context_rule_ids, [1]);

    // The signature must verify against the same digest the contract computes.
    const signatureMap = creds.signature().map()!.find((e) => e.key().sym().toString() === "signers")!.val().map()!;
    assert.equal(signatureMap.length, 1);
    const [kind, verifier, publicKey] = signatureMap[0].key().vec()!;
    assert.equal(kind.sym().toString(), "External");
    assert.equal(Address.fromScVal(verifier).toString(), VERIFIER);
    assert.deepEqual(Buffer.from(publicKey.bytes()), agentKey.rawPublicKey());

    const { authDigest } = computeEntryAuthDigest(TESTNET.networkPassphrase, signed, 1234, [1]);
    assert.ok(agentKey.verify(authDigest, Buffer.from(signatureMap[0].val().bytes())));
    // A different rule id produces a different digest, so the signature binds the rule.
    const { authDigest: other } = computeEntryAuthDigest(TESTNET.networkPassphrase, signed, 1234, [0]);
    assert.ok(!agentKey.verify(other, Buffer.from(signatureMap[0].val().bytes())));
  });
}

test("leaves entries of other addresses untouched", () => {
  const signer = new Ed25519Signer(Keypair.random(), VERIFIER);
  const other = authEntry(contract());
  const [result] = signSmartAccountEntries({
    entries: [other],
    smartAccount: SMART_ACCOUNT,
    signer,
    contextRuleIds: [1],
    expirationLedger: 1,
    networkPassphrase: TESTNET.networkPassphrase,
  });
  assert.equal(result.credentials().address().signature().switch().name, "scvVoid");
});

test("struct sorts fields and sortedMap sorts keys by XDR", () => {
  const s = struct({ spending_limit: xdr.ScVal.scvU32(1), period_ledgers: xdr.ScVal.scvU32(2) });
  assert.deepEqual(s.map()!.map((e) => e.key().sym().toString()), ["period_ledgers", "spending_limit"]);

  const a = nativeToScVal(Address.fromString(contract()));
  const b = nativeToScVal(Address.fromString(contract()));
  const keys = sortedMap([[a, xdr.ScVal.scvVoid()], [b, xdr.ScVal.scvVoid()]]).map()!.map((e) => e.key().toXDR("hex"));
  assert.deepEqual(keys, [...keys].sort());
});

test("spentInWindow applies the policy's eviction rule", () => {
  const data = {
    spending_limit: 100n,
    period_ledgers: 10,
    cached_total_spent: 60n,
    spending_history: [
      { amount: 10n, ledger_sequence: 90 }, // evicted at ledger 100 (90 <= 100 - 10)
      { amount: 20n, ledger_sequence: 91 },
      { amount: 30n, ledger_sequence: 100 },
    ],
  };
  assert.equal(spentInWindow(data, 100), 50n);
  assert.equal(spentInWindow(data, 101), 30n);
  assert.equal(spentInWindow(data, 200), 0n);
});

test("contractErrorCode returns the last contract error", () => {
  const error = "HostError: Error(Auth, InvalidAction)\n ... failed account authentication with error, C..., Error(Contract, #3016)\n ... Error(Contract, #3221)";
  assert.equal(contractErrorCode(error), 3221);
  assert.equal(contractErrorCode("HostError: Error(Budget, ExceededLimit)"), undefined);
});
