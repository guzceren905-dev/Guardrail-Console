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

## Emergency control

The owner control is an authorization revocation, not a global pause. It removes the agent signer or disables the agent's payment rule while preserving the owner's management and recovery path. The dashboard may display the control state but cannot invoke it.

## Event index

The server reads Soroban events from Stellar RPC, persists a paging cursor (ledger and event cursor), and de-duplicates confirmed events by transaction hash and event index. It calculates rolling spend from confirmed events in the active 24-hour window. UI refresh target: 10 seconds.

Failed request or settlement attempts are stored separately by the demo service, clearly labeled as off-chain attempts, and excluded from confirmed spend. The dashboard links only confirmed transactions to Stellar Expert.

## Runtime configuration

Only public RPC, network, demo account, USDC SAC, and explorer configuration belong in client-visible environment variables. Signing keys and facilitator secrets must remain in server-side environment configuration and must never be committed.
