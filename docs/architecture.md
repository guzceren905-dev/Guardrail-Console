# Architecture

## Data and trust boundaries

The overview dashboard is a read-only sample preview. The separate `/setup` route can create a testnet smart account and configure an agent rule through Smart Account Kit. It contains no mainnet configuration or secret persistence.

## Testnet components pinned for Milestone 1

- `smart-account-kit@0.8.0`
- `@stellar/stellar-sdk@16.3.0`
- OpenZeppelin Stellar Contracts source commit `1e513890ecf79833c9d6e7ef38a9358001c0b111`
- Protocol 27 uploaded testnet artifacts from the Smart Account Kit deployment manifest.

## Payment policy

The agent rule is scoped to a single USDC SAC invocation context and uses the standard OpenZeppelin spending-limit policy. The policy checks the transfer amount over a rolling **ledger-count window**. `LEDGERS_PER_DAY` is approximately 17,280 ledgers at five seconds per ledger; it is not a wall-clock exact 24-hour guarantee. Amounts use USDC's seven-decimal base units (1 USDC = 10,000,000 units).

Recipient allowlisting is excluded. Context rules scope the called contract, not the recipient argument, and the standard policy set has no recipient allowlist. No recipient restriction is claimed.

## Emergency control

The owner control removes the agent-only USDC context rule. The owner retains the passkey-backed default administrative rule. Removing the agent rule must be verified on-chain, then a transfer signed by the former agent must fail authorization.

## Testnet artifacts

- Smart-account WASM hash: `1b5f4534a76322da2ad7c745f6900857a6802b0ca79850c35a03561df997785a`
- WebAuthn verifier: `CC7EKIHQP3TN4CARQDND6CEOY2UXLWWC2X5GHTD5NLAT7BG5GPZIOM3F`
- Ed25519 verifier: `CAAVTMCBXEIBPR64EAASKFXERVPYFZA2JYP5A3BG6PESWEFUJX5IHKN4`
- Spending-limit policy: `CABXBYJNZ7IUW4G3D6BND5YCAQF3ASSDMDAOKQQ63UYFSO7WUU2TIP5G`

The addresses and hashes are taken from the published Protocol 27 deployment manifest; the setup runbook records independent RPC/WASM checks and the account's own deployment transaction when completed.

## Event index (later milestone)

The server will read Soroban events from Stellar RPC, persist a paging cursor (ledger and event cursor), and de-duplicate confirmed events by transaction hash and event index. It calculates spend from confirmed events in the active ledger window. UI refresh target: 10 seconds.

Failed request or settlement attempts are stored separately by the demo service, clearly labeled as off-chain attempts, and excluded from confirmed spend.

## Runtime configuration

All configured values are public testnet references. Do not commit signing keys or privileged facilitator/relayer credentials.
