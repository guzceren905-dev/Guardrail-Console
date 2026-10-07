# Delivery milestones

## Sprint target

Deliver a demonstrable testnet MVP in 30 calendar days. The revised estimate is 23 engineering days at $250 per day, for a total of $5,750. Dates remain as provided in the SOW and must be confirmed by the program owner separately.

## Milestone 1 — Account and policy spike (Days 1–5)

- Pin Smart Account Kit, Stellar SDK, and OpenZeppelin source/artifact versions.
- Deploy/configure one testnet smart account with owner passkey and an agent-only USDC SAC context rule.
- Apply a ledger-window USDC cap (approximately 24 hours at 17,280 ledgers).
- Demonstrate owner removal of the agent authorization rule.
- Record contract addresses, WASM hashes, package versions, audit scope, and transaction evidence.
- Gate: a transfer within the cap succeeds; a transfer above the cap is rejected on-chain; after owner revocation the agent transfer is rejected while owner administration remains available.
- Recipient allowlisting is explicitly out of MVP scope; no on-chain recipient restriction is claimed.

## Milestone 2 — Protocol payment flows (Days 6–12)

- Implement one x402 paid API path using the supported Stellar client and facilitator.
- Implement MPP Charge for the same demo service using the official Stellar MPP SDK.
- Use the policy-governed account as payer in both flows.
- Capture one confirmed success and one on-chain policy rejection for each protocol.
- Keep MPP Session/channel mode out of scope.
- Gate: both clients complete successful requests and policy violations cannot settle.

## Milestone 3 — Event indexing and dashboard (Days 13–18)

- Read account state and Soroban contract events through Stellar RPC.
- Maintain a cursor by ledger/event position and de-duplicate indexed records.
- Normalize x402 and MPP Charge events into one read-only activity model.
- Show balance, confirmed rolling spend, budget remaining, recipient, protocol, status, and explorer links.
- Refresh the displayed index at least every 10 seconds.
- Gate: displayed confirmed totals reconcile with the testnet account and event links.

## Milestone 4 — Evidence and release (Days 19–23)

- Exercise allowed, cap-exceeded, and revoked-agent paths.
- Publish setup and architecture documentation with the integration security boundary.
- Deploy a public testnet demo URL and capture a short walkthrough.
- Package transaction hashes, Stellar Expert links, repository, demo URL, and video.
- Gate: evidence checklist is complete and the preview/sample-data state cannot be confused with live chain data.

## Scope control

If the 20-day / $5,000 cap cannot change, remove MPP from this award and update the objective, dashboard, and evidence criteria to x402 only. Do not promise both protocols without the added three engineering days.
