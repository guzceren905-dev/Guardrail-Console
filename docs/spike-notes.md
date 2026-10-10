# Week 1 spike notes

Status (2026-10-10): source review done; smart account, cap, allowlist and freeze verified on testnet (section 6). x402 integration is Week 2.

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

- Freeze = owner calls `remove_signer(agent_rule_id, agent_signer_id)`. Unfreeze = `add_signer` with the same signer. The signer gets a new registry id on each unfreeze, so `scripts/testnet/freeze.ts` reads it from the rule.
- On testnet a frozen agent's payment fails in `__check_auth` with `SmartAccountError` `#3016`: the agent key is no longer a signer of the rule. Even an unsigned call would fail in `spending_limit::enforce` (`NotAllowed`) because there are no authenticated signers.
- The rule id and its spend history are preserved, so unfreezing does not reset the daily cap.
- Alternative: `update_context_rule_valid_until`. It cannot set a past ledger, so it only works for scheduled expiry, not an immediate freeze.

## 4. Smart account as x402 payer — supported by spec, not by the stock client

- The x402 Stellar spec uses auth-entry signing and states it supports C-accounts. The facilitator checks generic address credentials, simulation success, transfer events, and no sub-invocations. No G-account-only check was found.
- The stock `ExactStellarScheme` client builds `transfer(signer.address, payTo, amount)` and calls `AssembledTransaction.signAuthEntries` with a raw `signAuthEntry` callback. That produces a classic signature shape, not the OZ smart-account `AuthPayload` (signers map + context rule ids).
- Plan: write a thin x402 client mechanism that builds the same transaction XDR but signs the auth entry as the smart account. `scripts/testnet/lib.ts` already does this with smart-account-kit's `Ed25519Signer` and `computeEntryAuthDigest`. This is client-side glue, not authorization logic.
- Verified on testnet: simulating with the signed auth entry runs `__check_auth` and both policies (rejections surface as `#3221` / `#3303`), so a facilitator re-simulation will catch policy violations.
- Still to verify in Week 2: on protocol 27 the smart account's auth entry comes back as `sorobanCredentialsAddressV2`. The `@x402/stellar` 2.10.0 facilitator only accepts `sorobanCredentialsAddress` (V1) and may reject it as `invalid_exact_stellar_payload_unsupported_credential_type`. Also check that the policies' nested `require_auth` does not count as a sub-invocation.
- Fallback (SOW): a delegated/session signer pattern, documented.

## 5. Rejected-transaction evidence

- Both the client and the facilitator re-simulate. An over-cap or frozen payment fails simulation (`invalid_exact_stellar_payload_simulation_failed`) and is never submitted, so no tx hash exists.
- To get a failed tx on Stellar Expert, submit the signed over-policy transaction directly to RPC without the simulation gate. The contract error (`SpendingLimitExceeded`, code 3221) is then recorded on-chain.
- Evidence plan: show both the facilitator rejection (off-chain, via contract simulation) and one direct-submit failed tx (on-chain). Done for cap and allowlist (section 6) with `agent-pay.ts --force`.
- A frozen payment cannot be force-submitted the same way: no reference call passes while frozen, so the footprint for the policy contracts is unknown. The SOW does not require on-chain evidence for the freeze path.

## 6. Testnet results (2026-10-10)

Setup (all testnet, Stellar CLI identities `gc-owner`, `gc-agent`, `gc-merchant`, `gc-stranger`):

| Item | Value |
|---|---|
| Smart account (OZ `multisig-account-example`, WASM `1b5f4534…785a`) | `CDQSAMY2O6SCFRXA5SSZHAFT7SAZ7DYHLZVKCHH646KTEDFMBEWO4SFX` |
| Rule 0 `multisig` (Default) | owner Ed25519 signer |
| Rule 1 `agent-usdc` (CallContract USDC SAC) | agent Ed25519 signer; spending limit 10 USDC / 17,280 ledgers; allowlist [`gc-merchant`] |
| Allowlist policy | `CBJTSJ7M6BUIKZNNHLOPDNID6RBASIJRAM3AHDYPHIN56HKO5QX6HOQU` |
| USDC SAC (Circle testnet) | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |
| Funding | 100 USDC from `gc-owner` (swapped from XLM on the testnet DEX) |

| Scenario | Result | Transaction |
|---|---|---|
| Deploy allowlist policy | SUCCESS | [b6559ca3…](https://stellar.expert/explorer/testnet/tx/b6559ca301e774353da93041f4eadc89ab538ef72efa15e21654ebdde43466e2) |
| Deploy smart account | SUCCESS | [e1806925…](https://stellar.expert/explorer/testnet/tx/e1806925f8d4124fcde8769ce92e674d51e59633be417c74ab3fe3c39cd67307) |
| Add agent rule with both policies | SUCCESS | [fbf0132d…](https://stellar.expert/explorer/testnet/tx/fbf0132d22e7fac4ce109b4e188f41dd9166ace836cb1d48ff626255e415efab) |
| Agent pays 1 USDC to allowlisted merchant | SUCCESS | [ce8f43e2…](https://stellar.expert/explorer/testnet/tx/ce8f43e239e60a17afefebd1f79e756dcbd209a65dc4bc2c19db1a7a73a43e35) |
| Agent pays 1 USDC to non-allowlisted account | FAILED on-chain, `#3303` RecipientNotAllowed | [3572420c…](https://stellar.expert/explorer/testnet/tx/3572420c5cea81c59653e44d4e1934d4395b692cc1da53334288eeb5089ce82d) |
| Agent pays 15 USDC (cap 10) | FAILED on-chain, `#3221` SpendingLimitExceeded | [c3301b58…](https://stellar.expert/explorer/testnet/tx/c3301b58110e8f939a7366fc7c7adee8c373f0c3cb080aab782560bdd5674c7c) |
| Owner freezes agent | SUCCESS | [360e1694…](https://stellar.expert/explorer/testnet/tx/360e16940d294ffa53f2cf73f3df5905f75b10de115d988bdea28c19af04bf5f) |
| Agent pays while frozen | rejected in simulation, `#3016` | — |
| Owner unfreezes agent; spend history unchanged (1 USDC before and after) | SUCCESS | [56778ccb…](https://stellar.expert/explorer/testnet/tx/56778ccbb32893b1902691f4269ea7b22498dd7863e0e4b61d287bad9809b4c0) |
| Agent pays 1 USDC after a second freeze/unfreeze cycle | SUCCESS | [e52b9a4b…](https://stellar.expert/explorer/testnet/tx/e52b9a4ba27a6efe66190740f4ad2e138aa66afad1a445b7291f610abf7ef034) |

On-chain error codes were read from the failed transactions' diagnostic events.

Scripts: `scripts/testnet/add-agent-rule.ts`, `agent-pay.ts <identity> <usdc> [--force]`, `freeze.ts freeze|unfreeze`. Run with Node 24 (`node scripts/testnet/<file>.ts`).

## 7. Week 2 — x402 with the smart account as payer (2026-10-10)

Code: `x402-demo/server.ts` (Express + `@x402/express`, three paid routes), `x402-demo/agent.ts` (`@x402/fetch`), `x402-demo/smart-account-scheme.ts` (client scheme that signs the auth entry as the smart account). Packages pinned at `@x402/*` 2.28.0, `@stellar/stellar-sdk` 16.3.0, `express` 5.2.1.

Findings:

- **V2 credentials: resolved.** `@x402/stellar` 2.28.0 accepts both `sorobanCredentialsAddress` and `sorobanCredentialsAddressV2`.
- **Client:** the stock `ExactStellarScheme` client cannot sign for an OZ smart account. `SmartAccountExactStellarScheme` builds the same payload (transfer tx + signed auth entry). The x402 client's own `spendControls` are disabled so the on-chain policies are the guard.
- **Fee cap:** a smart-account USDC payment costs ~290,710 stroops in resource fees (~3.7M instructions; check_auth + Ed25519 verifier + two policies, plus the spend-history write). The x402 Stellar facilitator default cap is 50,000 stroops and rejects it (`invalid_exact_stellar_payload_fee_exceeds_maximum`). The spend-history write grows with the number of payments in the window, so the fee grows too.
- **Blocker — event check:** the x402 Stellar facilitator rejects any simulated contract event other than the single asset `transfer` (`invalid_exact_stellar_payload_event_not_transfer`). OZ's spending-limit policy always emits `spending_limit_enforced`. So the stock facilitator cannot settle payments from an OZ smart account that uses the spending-limit policy. The allowlist policy emits no event on `enforce` and is not affected.
- **Decision (2026-10-10): option A.** Self-host the facilitator (`x402-demo/facilitator.ts`) with the fee cap raised to 0.1 XLM and a narrowed event check. Balance-changing events (`transfer`, `mint`, `burn`, `clawback`) from any contract are still rejected; other events from non-asset contracts, such as policy events, are allowed. Propose the same change upstream to x402 and to OZ's facilitator plugin. This is a SOW deviation (OZ Channels named as facilitator) to report to the Chapter Lead. OZ Channels remains selectable with `FACILITATOR=oz-channels`.
- **Results with the self-hosted facilitator:**
  - `/api/report` ($1, allowlisted): HTTP 200, settled on-chain [0302568f…](https://stellar.expert/explorer/testnet/tx/0302568f8ae419b263d06d95f51727fe3f399ec883630db3ee2aa6f7eec2fabb)
  - `/api/premium-report` ($15, over cap): agent refuses, `#3221`
  - `/api/partner-report` ($1, non-allowlisted): agent refuses, `#3303`
  - Both with `--skip-local-check`: facilitator rejects, `invalid_exact_stellar_payload_simulation_failed`
- No other blockers: auth-entry structure, sub-invocation check and signature checks pass.
- **OZ Channels (tested 2026-10-10, `https://channels.openzeppelin.com/x402/testnet`):** same result as the stock facilitator.
  - `/api/report` (within policy): rejected, `invalid_exact_stellar_payload_event_not_transfer`. OZ Channels cannot settle payments from an OZ smart account with the spending-limit policy.
  - `/api/premium-report` and `/api/partner-report` with `--skip-local-check`: rejected, `invalid_exact_stellar_payload_simulation_failed` (the policies reject in simulation).
  - The fee cap did not trigger first. In the stock facilitator the fee check runs before the event check, so OZ Channels likely accepts the ~0.029 XLM fee. Inferred, not confirmed.

- **Upstream issues (opened 2026-10-10):** [x402-foundation/x402#3764](https://github.com/x402-foundation/x402/issues/3764), [OpenZeppelin/relayer-plugin-x402-facilitator#53](https://github.com/OpenZeppelin/relayer-plugin-x402-facilitator/issues/53).

## 8. Test coverage (Weeks 1–2)

| Suite | Command | Covers |
|---|---|---|
| Rust unit (10) | `pnpm test:contracts` | Allowlist policy: allow, reject, no signer, non-transfer, rule type, install twice, empty/duplicate lists, update, uninstall |
| Rust integration (15) | `pnpm test:contracts` | Both policies inside a real OZ smart account via `__check_auth`: cap per payment and cumulative, batched auth, rolling window reset, rejected payment not counted, allowlist update, freeze/unfreeze keeping history, agent cannot use the owner rule, call other contracts, call non-transfer functions or change its own rule/allowlist |
| TS unit (16) | `pnpm test:unit` | Auth-entry signing (V1 and V2 credentials) verified against the contract digest, rule-id binding, encoding order, spend-window math, error parsing, facilitator event check (policy events allowed, side transfers/mint/burn/clawback rejected) |
| Testnet e2e (13) | `pnpm test:e2e` | Direct payments (allowed, non-allowlisted, over cap, on-chain failed tx), owner allowlist and cap updates, freeze/unfreeze, x402 through the self-hosted facilitator (settle, agent refusal, facilitator rejection, frozen agent) and OZ Channels (known upstream rejection) |

Mutation check: breaking the allowlist check fails 5 tests; removing the signer check fails 1.

## Decisions needed

1. Chapter Lead approval for the custom allowlist policy (section 2).
2. Acceptance of the custom x402 client mechanism (section 4).
3. Chapter Lead approval for the self-hosted facilitator (section 7); upstream issues to x402 and OZ.
