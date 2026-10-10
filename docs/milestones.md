# Delivery milestones

Status (2026-10-10): Milestones 1–3 delivered; Milestone 4 delivered except the demo video recording, the Safari/Firefox check and Chapter Lead confirmation of the two deviations. See [evidence.md](evidence.md).

## Sprint target

Deliver a demonstrable testnet MVP in 30 calendar days, as agreed in the Instawards SOW: 20 engineering days at $250 per day, for a total of $5,000. Dates remain as provided in the SOW and must be confirmed by the program owner separately.

## Milestone 1 — Smart account and policy configuration (Week 1, 7 days, $1,750)

- Days 1–2 spike: wire the policy-gated smart account as the x402 payer signer. If contract-account auth-entry signing proves non-trivial, fall back to a documented delegated/session signer authorized by the smart account.
- Pin Smart Account Kit and OpenZeppelin contract versions.
- Provision one testnet smart account for the demo agent identity.
- Configure a daily USDC spend cap, a recipient allowlist, and a human-owner freeze override from OpenZeppelin context-rule, signer, policy, and verifier primitives. No custom authorization logic.
- Build a reusable TypeScript configuration SDK wrapper so other builders can apply the same policy pattern.
- Unit tests on testnet validating policy enforcement; configuration documentation and code review.
- Record contract addresses, WASM hashes, package versions, and the exact audit scope.
- Gate: policy-gated smart account live on testnet, configuration documented in the repo.

## Milestone 2 — x402 payment flow and adversarial testing (Week 2, 5 days, $1,250)

- Express API scaffold with @x402/express and @x402/stellar on stellar:testnet.
- Wire the OZ Channels facilitator and connect the payer client to the policy-gated account.
- Success path: an end-to-end within-policy payment.
- Rejection paths: over-cap and non-allowlisted-recipient attempts, confirming the transaction is rejected on-chain.
- Bug fixes, transaction hash capture, and integration documentation.
- Gate: at least one successful and one rejected transaction viewable on Stellar Expert.

## Milestone 3 — Dashboard (Week 3, 6 days, $1,500)

- Next.js scaffold with Stellar RPC/Horizon client setup.
- Live balance and cap-vs-spend visualization with Recharts.
- x402 transaction history feed for the demo agent.
- Near-cap alert state and UI polish.
- Deploy to a public testnet demo URL with a cross-browser check.
- Gate: live, publicly viewable read-only dashboard showing real testnet data.

## Milestone 4 — Documentation, demo video, and evidence (Week 4, 2 days, $500)

- Setup guide and architecture documentation with the integration security boundary.
- Demo video: agent pays within policy → dashboard updates → agent attempts an over-cap payment → on-chain rejection → dashboard reflects the block.
- Evidence package: transaction hashes, Stellar Expert links, repository README, demo URL, and video.
- Gate: evidence checklist is complete and the preview/sample-data state cannot be confused with live chain data.

## Scope control

The SOW deliverables are x402 only. MPP Charge is not a funded deliverable; it may be added only as a stretch goal after all SOW gates pass. The dashboard's activity model stays protocol-neutral so MPP can be added later without rework.
