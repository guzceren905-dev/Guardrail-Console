# Product scope

## Product

Guardrail Console is a testnet-first, read-only monitoring console for one AI-agent treasury. It demonstrates an owner-configured spending policy and monitors payments made through x402 and Stellar MPP Charge.

The project composes OpenZeppelin Stellar smart-account contracts and policies. It does not create a competing authorization contract or payment protocol. The dashboard never stores or signs with the owner's private key; the test-only agent key is generated in memory and is not persisted.

## Differentiation

The ecosystem already contains x402-focused spending-control and dashboard projects, including Agent Card and SpendGuard. Guardrail Console focuses on a protocol-neutral owner view that normalizes x402 and MPP Charge activity, displays policy budget state, and separates confirmed chain events from off-chain rejected attempts.

## MVP scope

- Smart Account Kit configuration for one testnet demo account.
- A rolling ledger-window USDC spending cap on an agent-only rule scoped to the USDC SAC.
- Owner administrative path to remove the agent authorization rule.
- One paid endpoint with x402 and MPP Charge flows.
- Success and policy-rejection examples for both protocols.
- Read-only dashboard showing account balance, confirmed payments, rolling spend, remaining budget, protocol, recipient, and transaction links.
- Cursor-based event indexing from Stellar RPC; dashboard refresh target is 10 seconds.
- Failed submissions may appear as separate demo-service attempts and never count as confirmed spend.

## Explicitly excluded

Recipient allowlisting is excluded. The standard OpenZeppelin policies shipped with Smart Account Kit provide spending-limit and threshold controls, but no recipient-address allowlist. The scoped USDC transfer rule limits which token contract the agent can call; it does not restrict the transfer's recipient argument. The dashboard must never describe a UI or server-side recipient check as an on-chain security guarantee.

Also out of scope: mainnet, MPP Session/channel mode, multi-tenant accounts, custom payment or policy contracts, custody, and production alert delivery.

## Security wording

OpenZeppelin smart-account contracts and the TypeScript Smart Account Kit are separate components. Claims about audited code must name the exact contract release and audit scope. The SDK and application integration are not described as independently audited. Record package versions, deployed contract addresses, WASM hashes, and testnet transaction links in final evidence.

## Preview status

The overview dashboard uses sample values. It is not connected to Stellar RPC. The separate `/setup` flow submits explicit testnet operations and labels its test-only boundary.
