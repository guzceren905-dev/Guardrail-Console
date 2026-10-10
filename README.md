# Guardrail Console

A testnet-first dashboard and integration demo for policy-governed AI-agent payments on Stellar.

Guardrail Console composes OpenZeppelin Stellar smart-account policies with **x402** payments, then shows the owner a protocol-neutral view of confirmed payment activity and budget state. The dashboard is read-only: it never holds keys or signs transactions.

## Current status

Working on Stellar testnet:

- **Policy-gated smart account (D1).** OpenZeppelin smart account with an agent rule limited to USDC transfers, a rolling daily cap (OZ spending-limit policy), a recipient allowlist (custom policy) and an owner freeze override. Configured with the TypeScript SDK in `sdk/`.
- **x402 paid API (D2).** Express API in `x402-demo/` that the agent pays from the smart account. Within-policy payments settle; over-cap and non-allowlisted payments are rejected on-chain.
- **Live dashboard (D3).** Read-only Next.js dashboard showing balance, rolling spend against the cap, a near-cap alert, freeze status and the full payment history from Stellar RPC. Refreshes every 10 seconds.

Live demo: https://guardrail-console.vercel.app (testnet, read-only).

Addresses and transaction evidence: [docs/spike-notes.md](docs/spike-notes.md). Setup and integration: [docs/setup.md](docs/setup.md).

The ecosystem already has x402 spending-control projects. This project's focused differentiator is an owner-facing monitor for a policy-gated smart account that pays via x402, built by composing official protocol packages and OpenZeppelin policy primitives rather than creating a new authorization or settlement layer.

## Run

Requirements: Node.js 24 and pnpm 11.

    pnpm install
    pnpm dev

Open http://localhost:3000. The dashboard reads the testnet demo deployment by default.

Tests:

    pnpm typecheck && pnpm lint
    pnpm test:contracts   # Rust unit + smart-account integration tests
    pnpm test:unit        # SDK and facilitator unit tests
    pnpm test:e2e         # live testnet end-to-end (spends a little testnet USDC/XLM)

## Configuration

See `.env.example`. Every dashboard variable is a public address or URL, and the defaults point at the testnet demo deployment. The dashboard never holds keys. The OZ Channels API key is used only by the x402 demo server; keep it in `.env.local`, which is gitignored.

## Product and delivery docs

- docs/product-scope.md
- docs/architecture.md
- docs/milestones.md
- docs/setup.md
- docs/spike-notes.md

## Security boundary

The OpenZeppelin smart-account contracts and Smart Account Kit are distinct components. The SDK and this integration are not represented as independently audited. The recipient allowlist policy in `contracts/allowlist-policy` is custom code, because OpenZeppelin ships no recipient allowlist policy, and it is not audited. The x402 demo uses a self-hosted facilitator with a narrowed event check, because OZ Channels currently rejects payments from OZ smart accounts that use the spending-limit policy ([x402-foundation/x402#3764](https://github.com/x402-foundation/x402/issues/3764), [OpenZeppelin/relayer-plugin-x402-facilitator#53](https://github.com/OpenZeppelin/relayer-plugin-x402-facilitator/issues/53)). The final evidence must identify exact package versions, deployed WASM hashes, audit scope, and testnet transaction links.

MPP (a possible stretch goal, not a funded deliverable), mainnet, multi-tenant support, custom policy contracts, and custody are out of scope.
