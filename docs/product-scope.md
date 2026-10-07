# Product scope

## Product

Guardrail Console is a testnet-first, read-only monitoring console for a single AI-agent treasury. It demonstrates that an owner can set policy-governed spending permissions and observe payments made through both x402 and Stellar MPP Charge.

The project composes OpenZeppelin Stellar smart-account contracts and policies. It does not create a competing authorization contract or payment protocol, and it never stores, receives, or signs with the owner's or agent's private key in the dashboard.

## Differentiation

The ecosystem already contains x402-focused spending-control and dashboard projects, including Agent Card and SpendGuard. Guardrail Console narrows its product claim to a protocol-neutral owner view that normalizes x402 and MPP Charge activity, displays policy budget state, and separates confirmed chain events from off-chain rejected attempts. The project will document these existing projects and reuse protocol-native packages rather than reimplement their settlement flows.

## MVP scope

- OpenZeppelin Smart Account Kit configuration for one testnet demo account.
- Rolling 24-hour USDC spending cap and recipient allowlist.
- Owner administrative path to revoke the agent's payment authorization.
- One paid endpoint with x402 and MPP Charge flows.
- Success and policy-rejection examples for both protocols.
- Read-only dashboard showing account balance, confirmed payments, rolling spend, remaining budget, protocol, recipient, and transaction links.
- Cursor-based event indexing from Stellar RPC; dashboard refresh target is 10 seconds.
- Failed submissions may appear as separate demo-service attempts and never count as confirmed spend.

## Out of scope

- Mainnet deployment, MPP Session/channel mode, multi-tenant accounts, custom payment protocols, custom spending-policy contracts, custody, signing, and production alert delivery.

## Security wording

OpenZeppelin smart-account contracts and the TypeScript Smart Account Kit are separate components. Claims about audited code must name the exact contract release and audit scope. The SDK and application integration are not described as independently audited. Record package versions, deployed contract addresses, and WASM hashes in the final evidence.

## Preview status

The current dashboard is explicitly marked as a preview and uses sample values. It is not connected to Stellar RPC and does not show live balances, policies, or transaction events.
