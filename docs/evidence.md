# Evidence package

Instawards SOW (2026.08.11): Guardrail Console. Stellar testnet. Collected 2026-10-10.

- Repository: https://github.com/guzceren905-dev/Guardrail-Console (MIT license)
- Live dashboard: https://guardrail-console.vercel.app
- Demo video: _to be added (recording guide: [demo-script.md](demo-script.md))_

## SOW 6.1 — evidence per deliverable

### Deliverable 1 — Policy-gated smart account and configuration SDK

| Evidence | Link |
|---|---|
| Smart account (OZ smart account, testnet) | [`CDQSAMY2…O4SFX`](https://stellar.expert/explorer/testnet/contract/CDQSAMY2O6SCFRXA5SSZHAFT7SAZ7DYHLZVKCHH646KTEDFMBEWO4SFX) |
| Deployment | [e1806925…](https://stellar.expert/explorer/testnet/tx/e1806925f8d4124fcde8769ce92e674d51e59633be417c74ab3fe3c39cd67307) |
| Agent rule with cap + allowlist policies installed | [fbf0132d…](https://stellar.expert/explorer/testnet/tx/fbf0132d22e7fac4ce109b4e188f41dd9166ace836cb1d48ff626255e415efab) |
| OZ spending-limit policy | [`CABXBYJN…TIP5G`](https://stellar.expert/explorer/testnet/contract/CABXBYJNZ7IUW4G3D6BND5YCAQF3ASSDMDAOKQQ63UYFSO7WUU2TIP5G) |
| Recipient allowlist policy (custom) | [`CBJTSJ7M…6HOQU`](https://stellar.expert/explorer/testnet/contract/CBJTSJ7M6BUIKZNNHLOPDNID6RBASIJRAM3AHDYPHIN56HKO5QX6HOQU), deployed in [b6559ca3…](https://stellar.expert/explorer/testnet/tx/b6559ca301e774353da93041f4eadc89ab538ef72efa15e21654ebdde43466e2) |
| Owner freeze / unfreeze | [88ca99bb…](https://stellar.expert/explorer/testnet/tx/88ca99bb410de5f279f10b30c5aeba4268c01f2328ddb71584cfad2fad3aef28) / [c0d260b0…](https://stellar.expert/explorer/testnet/tx/c0d260b045168df419b5e283c4562ef65631735920a34e516f628b75e442abc6) |
| Configuration SDK | [`sdk/`](../sdk/src/index.ts): `GuardrailAccount` (create smart account, add agent rule, set cap, set allowlist, freeze, unfreeze, status), `GuardrailAgent` (payments, x402 scheme). The e2e suite creates and configures a fresh account through the SDK on every run. |
| Configuration docs | [setup.md](setup.md) |

Configuration on-chain:
- Rule 0 (owner): `Default` context, owner Ed25519 signer, no policies.
- Rule 1 (agent): `CallContract(USDC SAC)`, agent Ed25519 signer, 10 USDC per 17,280 ledgers (~24h), allowlist = demo merchant.

### Deliverable 2 — x402 payment flow with on-chain enforcement

| Path | Result | Transaction |
|---|---|---|
| x402 payment within policy ($1 report) | Settled | [a365e288…](https://stellar.expert/explorer/testnet/tx/a365e2880d2eb1f71a126d4864356dbbd140454076e77971c628b1eeea74b8fe), [0302568f…](https://stellar.expert/explorer/testnet/tx/0302568f8ae419b263d06d95f51727fe3f399ec883630db3ee2aa6f7eec2fabb) |
| Over the daily cap | Failed on-chain, `#3221 SpendingLimitExceeded` | [2121a4d6…](https://stellar.expert/explorer/testnet/tx/2121a4d63a328e2b8f425ba2a3bd025a64a7a26a47303c02dfd369e71ba3b672), [c3301b58…](https://stellar.expert/explorer/testnet/tx/c3301b58110e8f939a7366fc7c7adee8c373f0c3cb080aab782560bdd5674c7c) |
| Recipient not allowlisted | Failed on-chain, `#3303 RecipientNotAllowed` | [106f3e14…](https://stellar.expert/explorer/testnet/tx/106f3e14fd9f9304e107f62f630391552d03b0262970f9a8727ccde46b539f67), [3572420c…](https://stellar.expert/explorer/testnet/tx/3572420c5cea81c59653e44d4e1934d4395b692cc1da53334288eeb5089ce82d) |
| Frozen agent | Rejected in simulation, `#3016 UnauthorizedSigner` | none: the transaction never reaches the ledger |
| Over-cap / non-allowlisted via x402 | Agent refuses; if forced, the facilitator rejects (`simulation_failed`) | none: off-chain |

**How to read the rejection evidence.** The policy check is the same contract code in every path, but where it fires differs:

- **x402 path:** a policy-violating payment never reaches the ledger. The agent simulates the payment and refuses. If the agent skips that check, the facilitator's simulation runs the same policy and refuses to settle (`invalid_exact_stellar_payload_simulation_failed`). So the x402 path produces no failed transaction hash.
- **On-chain path:** the `FAILED` transactions above were submitted directly to Stellar by the agent's key (`agent.pay({ recordRejection })`), bypassing simulation, to show that the ledger itself rejects the payment. They are not x402 settlements.

Error codes come from the failed transactions' diagnostic events. Code: [`x402-demo/`](../x402-demo/), agent scheme in [`sdk/src/agent.ts`](../sdk/src/agent.ts).

### Deliverable 3 — Live read-only dashboard

- URL: https://guardrail-console.vercel.app (no login, no wallet, no keys)
- Shows the smart account's USDC balance, rolling spend vs the cap (Recharts), remaining budget, near-cap / cap-reached / frozen alerts, the allowlist, and the full payment history (x402, direct, blocked, deposits) with Stellar Expert links. Refreshes every 10 seconds.
- Reconciliation: the dashboard compares indexed agent payments in the window with the spending-limit policy's own total and shows "Reconciled with policy" when they match (they matched at every check on 2026-10-10).
- Cross-browser check (2026-10-10): Chromium at desktop and 375 px mobile width (automated); Safari and Firefox (manual).
- x402 only. MPP is not implemented (see deviations).

## SOW 6.2 — verification checklist (for the Chapter Lead)

| Deliverable | Evidence | Where |
|---|---|---|
| D1 | Smart account + policies on Stellar Expert, SDK in repo | Deliverable 1 table |
| D2 | ≥1 successful x402 payment, ≥1 on-chain rejection for cap and for allowlist | Deliverable 2 table |
| D3 | Public dashboard with real testnet data, demo video | URL above; video pending |

## Build provenance

| Component | Source | SHA-256 / WASM hash (verified against chain 2026-10-10) |
|---|---|---|
| Smart account | OZ `stellar-contracts@1e513890`, `multisig-account-example` (smart-account-kit testnet upload) | `1b5f4534a76322da2ad7c745f6900857a6802b0ca79850c35a03561df997785a` |
| Spending-limit policy | same commit, `multisig-spending-limit-policy-example` | `e41b563c4454f5a6742acfa6d44e1ece96d443bb5f40efddd6ed05180210219a` |
| Ed25519 verifier | same commit, `multisig-ed25519-verifier-example` | `60e8798db610bdaf3370d39ebda56ee1dc2c15ce1c3a9e28b528bfa24a06b477` |
| Allowlist policy | this repo, `contracts/allowlist-policy` (Rust 1.99.0, Stellar CLI 27.1.0, `stellar contract build`) | `5d484bd7b8ac885e521d0feae6c09822bb69920e4af80cb464be6ddd07a1cbc6` (rebuilds reproducibly) |

Package versions: `@stellar/stellar-sdk` 16.3.0, `smart-account-kit` 0.8.0, `@x402/core` / `@x402/express` / `@x402/fetch` / `@x402/stellar` 2.28.0, `express` 5.2.1, `next` 16.3.8, `react` 19.2.8, `recharts` 3.10.1, `soroban-sdk` 26.1.0. Node.js 24, pnpm 11.25.0.

## Audit scope (what is and is not audited)

- **Audited:** OpenZeppelin's [Stellar Contracts RC v0.7.0 audit](https://www.openzeppelin.com/news/stellar-contracts-rc-v0.7.0-audit) (2026-03-02 to 03-19, fixes merged at `d55dd37`) covers `packages/accounts`: `smart_account`, `policies/spending_limit`, `verifiers/ed25519`.
- **Not covered by that audit:**
  - The deployed commit `1e513890` is 47 commits after `d55dd37`. The only code change in `packages/accounts` is a 9-line zero-amount early return in `spending_limit::enforce` ([#759](https://github.com/OpenZeppelin/stellar-contracts/pull/759)); the rest are doc comments.
  - The `examples/multisig-smart-account/*` wrapper contracts (thin wrappers around the audited library) are outside the audit tree.
  - The custom allowlist policy (`contracts/allowlist-policy`).
  - smart-account-kit, the Guardrail SDK, the x402 demo, the self-hosted facilitator change, and the dashboard.
- Tests in this repo: 25 Rust (unit + integration with an OZ smart account), 16 TypeScript unit, 14 live testnet end-to-end ([spike-notes.md](spike-notes.md), section 8).

## Deviations from the SOW

1. **Custom recipient allowlist policy.** OpenZeppelin ships no recipient-allowlist policy, so the allowlist uses one small custom policy implementing OZ's `Policy` trait. _Chapter Lead confirmation: pending._
2. **Self-hosted facilitator instead of OZ Channels.** OZ Channels and the reference x402 facilitator reject every payment from an OZ smart account that uses the spending-limit policy (event check). The demo uses the reference facilitator with a narrowed event check. Reported upstream: [x402-foundation/x402#3764](https://github.com/x402-foundation/x402/issues/3764), [OpenZeppelin/relayer-plugin-x402-facilitator#53](https://github.com/OpenZeppelin/relayer-plugin-x402-facilitator/issues/53). Switching back is a config change (`FACILITATOR=oz-channels`). _Chapter Lead confirmation: pending._
3. **x402 only, no MPP.** The SOW objective and D3 mention "x402/MPP" history; D2 and the budget cover x402 only. MPP is not implemented. The dashboard's activity model is protocol-neutral, so an MPP rail can be added later. _Chapter Lead confirmation: pending._
4. **Freeze = signer removal.** The SOW's "freeze/pause override" is the owner removing the agent signer from its rule (no global pause exists in OZ smart accounts).

## Known limitations

- Testnet only. The dashboard index lives in server memory and backfills from RPC retention (~7 days) after a restart.
- Payments rejected in simulation (frozen agent, x402 refusals) never reach the chain, so they have no transaction hash and do not appear in the dashboard.
- OZ spending-limit history is capped at 1,000 payments per window, and its write cost grows with history size.
