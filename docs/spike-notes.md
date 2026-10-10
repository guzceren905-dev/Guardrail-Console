# Week 1 spike notes

Status: source review done (2026-10-10). On-chain testnet verification not yet run.

Sources reviewed:
- OpenZeppelin/stellar-contracts `v0.7.2` and `main` — `packages/accounts`
- stellar/smart-account-kit `0.8.0` — README, `docs/deployments-protocol-27-2026-07-09.md`
- coinbase/x402 — `@x402/stellar` `2.10.0`, `specs/schemes/exact/scheme_exact_stellar.md`

## 1. Daily USDC cap — available

- OZ ships a `spending_limit` policy with a rolling window in ledgers (`period_ledgers`; ~17,280 ledgers ≈ 24h).
- It only counts SEP-41 `transfer(from, to, amount)` calls; any other function on the rule's context is rejected (`NotAllowed`).
- State is keyed by `(smart_account, context_rule_id)`. Removing and re-creating the rule resets spend history.
- At most 1,000 history entries per window (`MAX_HISTORY_ENTRIES`). More than 1,000 payments in 24h fails with `HistoryCapacityExceeded`. Fine for the demo; document as a limitation.
- Emits `SpendingLimitEnforced { smart_account, context_rule_id, amount, total_spent_in_period }` — a direct data source for the dashboard.
- Testnet deployment (smart-account-kit, protocol 27): spending-limit policy `CABXBYJNZ7IUW4G3D6BND5YCAQF3ASSDMDAOKQQ63UYFSO7WUU2TIP5G`, Ed25519 verifier `CAAVTMCBXEIBPR64EAASKFXERVPYFZA2JYP5A3BG6PESWEFUJX5IHKN4`.

## 2. Recipient allowlist — NOT available as an OZ primitive

- OZ policies on `v0.7.2` and `main`: `simple_threshold`, `weighted_threshold`, `spending_limit`. No recipient allowlist.
- `ContextRuleType` is `Default | CallContract(address) | CreateContract(wasm_hash)`. A rule can scope the agent to the USDC SAC but cannot inspect the `to` argument.
- The fungible-token `Allowlist` extension restricts a token's own transfers; it does not apply to USDC SAC or to smart-account policies.
- No open OZ issue or PR for a smart-account recipient allowlist policy (searched 2026-10-10).
- Conclusion: the SOW requirement "recipient allowlist with no custom authorization logic" cannot be met with OZ primitives alone.
- **Decision (2026-10-10): option A.** A minimal custom policy, `contracts/allowlist-policy`, implements the OZ `Policy` trait, pinned to the OZ commit deployed on testnet (`1e513890`). It is unaudited and needs Chapter Lead approval as a scope deviation. Ten unit tests pass. Release WASM SHA-256: `5d484bd7b8ac885e521d0feae6c09822bb69920e4af80cb464be6ddd07a1cbc6`.

## 3. Owner freeze — available

- Freeze = owner calls `remove_signer(agent_rule_id, agent_signer_id)`. Unfreeze = `add_signer` with the same signer.
- With a policy attached, a rule with no matching signer is still evaluated, but `spending_limit::enforce` panics with `NotAllowed` when there are no authenticated signers. The frozen rule cannot authorize payments.
- The rule id and its spend history are preserved, so unfreezing does not reset the daily cap.
- Alternative: `update_context_rule_valid_until`. It cannot set a past ledger, so it only works for scheduled expiry, not an immediate freeze.

## 4. Smart account as x402 payer — supported by spec, not by the stock client

- The x402 Stellar spec uses auth-entry signing and states it supports C-accounts. The facilitator checks generic address credentials, simulation success, transfer events, and no sub-invocations. No G-account-only check was found.
- The stock `ExactStellarScheme` client builds `transfer(signer.address, payTo, amount)` and calls `AssembledTransaction.signAuthEntries` with a raw `signAuthEntry` callback. That produces a classic signature shape, not the OZ smart-account `AuthPayload` (signers map + context rule ids).
- Plan: write a thin x402 client mechanism that builds the same transaction XDR but signs the auth entry through smart-account-kit (`signAuthEntry` / `multiSigners` with a Delegated or Ed25519 agent signer). This is client-side glue, not authorization logic.
- Must verify on testnet: post-signing simulation runs `__check_auth`, so the spending-limit policy executes during facilitator verification. Also check that the policy's nested `require_auth` does not count as a sub-invocation.
- Fallback (SOW): a delegated/session signer pattern, documented.

## 5. Rejected-transaction evidence

- Both the client and the facilitator re-simulate. An over-cap or frozen payment fails simulation (`invalid_exact_stellar_payload_simulation_failed`) and is never submitted, so no tx hash exists.
- To get a failed tx on Stellar Expert, submit the signed over-policy transaction directly to RPC without the simulation gate. The contract error (`SpendingLimitExceeded`, code 3221) is then recorded on-chain.
- Evidence plan: show both the facilitator rejection (off-chain, via contract simulation) and one direct-submit failed tx (on-chain).

## Decisions needed

1. Chapter Lead approval for the custom allowlist policy (section 2).
2. Acceptance of the custom x402 client mechanism (section 4).
