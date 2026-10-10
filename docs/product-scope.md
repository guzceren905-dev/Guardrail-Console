# Product scope

## Product

Guardrail Console is a testnet-first, read-only monitoring console for a single AI-agent treasury. It demonstrates that an owner can set policy-governed spending permissions and observe the payments the agent makes through x402.

The project composes OpenZeppelin Stellar smart-account contracts and policies. It does not create a competing authorization contract or payment protocol, and it never stores, receives, or signs with the owner's or agent's private key in the dashboard.

## Differentiation

The ecosystem already contains x402-focused spending-control and dashboard projects, including Agent Card and SpendGuard. Guardrail Console narrows its product claim to an owner view for an OpenZeppelin-native, policy-gated smart account that shows x402 activity, displays policy budget state, and separates confirmed chain events from off-chain rejected attempts. The project will document these existing projects and reuse protocol-native packages rather than reimplement their settlement flows.

## MVP scope

- OpenZeppelin Smart Account Kit configuration for one testnet demo account.
- Rolling 24-hour USDC spending cap and recipient allowlist.
- Human-owner freeze override: the owner revokes the agent's payment authorization (removes the agent signer or disables its payment rule) and can restore it.
- Reusable TypeScript configuration SDK wrapper for applying the same policy pattern.
- One paid x402 endpoint (Express, @x402/express, @x402/stellar, OZ Channels facilitator).
- Success and on-chain policy-rejection examples (over-cap and non-allowlisted recipient).
- Read-only dashboard showing account balance, confirmed payments, rolling spend, remaining budget, recipient, and transaction links, with a Recharts cap-vs-spend chart and a near-cap alert state.
- Cursor-based event indexing from Stellar RPC; dashboard refresh target is 10 seconds.
- Failed submissions may appear as separate demo-service attempts and never count as confirmed spend.

## Out of scope

- MPP (a possible stretch goal after all SOW gates pass, not a funded deliverable), mainnet deployment, multi-tenant accounts, custom payment protocols, custom spending-policy contracts other than the recipient allowlist policy (OpenZeppelin ships none), custody, signing, and production alert delivery.

## Security wording

OpenZeppelin smart-account contracts and the TypeScript Smart Account Kit are separate components. Claims about audited code must name the exact contract release and audit scope. The SDK and application integration are not described as independently audited. Record package versions, deployed contract addresses, and WASM hashes in the final evidence.

## Preview status

The current dashboard is explicitly marked as a preview and uses sample values. It is not connected to Stellar RPC and does not show live balances, policies, or transaction events.
