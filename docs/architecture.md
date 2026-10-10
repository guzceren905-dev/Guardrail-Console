# Architecture

## Data and trust boundaries

The browser dashboard is read-only. It does not request private keys, sign transactions, or submit payments. Wallet administration and agent payment signing stay in the Smart Account Kit and protocol client flows.

The application composes:
- OpenZeppelin Stellar smart-account contracts and standard spending-limit policy.
- Smart Account Kit for typed account, signer, context-rule, and policy configuration.
- Official x402 Stellar client/server packages for x402 negotiation and settlement.
- Stellar RPC for contract state and Soroban event reads.

## Payment policy

The spending cap is a rolling 24-hour USDC window, not a UTC calendar-day reset. Configure amounts in the USDC token's seven-decimal on-chain base units (1 USDC = 10,000,000 units). The policy is attached to the narrow agent context rule for USDC SAC transfer calls. The owner retains a separate administrative authorization path.

## Emergency control (owner freeze)

The SOW's human-owner freeze override is implemented as an authorization revocation, not a global pause. Freezing removes the agent signer from its context rule (the rule, its policies and the spend history stay) while preserving the owner's management and recovery path; unfreezing restores it. The dashboard may display the control state but cannot invoke it.

## Event index

The dashboard server (`src/lib/indexer.ts`) reads two event streams from Stellar RPC: USDC `transfer` events from and to the smart account, and the spending-limit policy's `spending_limit_enforced` events. It pages with the RPC cursor and de-duplicates by event id. A transfer counts as an agent payment when its transaction also carries the policy event; otherwise it was authorized by the owner rule. Agent payments are labeled x402 when the transaction source is a configured facilitator fee payer, and direct otherwise.

Failed on-chain attempts come from Horizon (failed transactions of the configured agent fee payers), with the contract error code read from the transaction's diagnostic events. They are labeled "Blocked" and never count as spend. Payments that a policy rejects in simulation never reach the chain and are not shown.

Rolling spend and the remaining budget come from the spending-limit policy's own state, using its eviction rule. The dashboard also sums indexed agent payments in the same window and shows whether the two totals match. Every row links to Stellar Expert. The UI refreshes every 10 seconds.

The cursor and index live in server memory. After a restart the index backfills from `INDEX_START_LEDGER`, limited to the RPC retention window (about 7 days on testnet), so older history needs a persistent store or an archive RPC.

## Runtime configuration

Only public RPC, network, demo account, USDC SAC, and explorer configuration belong in client-visible environment variables. Signing keys and facilitator secrets must remain in server-side environment configuration and must never be committed.
