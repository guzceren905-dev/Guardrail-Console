# Guardrail Console

A testnet-first dashboard and integration demo for policy-governed AI-agent payments on Stellar.

Guardrail Console composes OpenZeppelin Stellar smart-account policies with **x402** and **MPP Charge**, then shows the owner a protocol-neutral view of confirmed payment activity and budget state. The dashboard is read-only: it never holds keys or signs transactions.

## Current status

The repository currently contains a responsive dashboard preview with clearly labeled sample data and the approved product scope, architecture, and delivery milestones. It is not yet connected to Stellar RPC, a smart account, or either payment protocol.

The ecosystem already has x402 spending-control projects. This project's focused differentiator is a shared owner-facing monitor for x402 and MPP Charge, built by composing official protocol packages and OpenZeppelin policy primitives rather than creating a new authorization or settlement layer.

## Run

Requirements: Node.js 22 or newer and pnpm.

    pnpm install
    pnpm dev

Open http://localhost:3000.

## Configuration

Copy .env.example to .env.local when beginning RPC integration. Do not add secrets to the repository. The dashboard must remain read-only; any protocol or facilitator credentials belong only in server-side environment variables.

## Product and delivery docs

- docs/product-scope.md
- docs/architecture.md
- docs/milestones.md

## Security boundary

The OpenZeppelin smart-account contracts and Smart Account Kit are distinct components. The SDK and this integration are not represented as independently audited. The final evidence must identify exact package versions, deployed WASM hashes, audit scope, and testnet transaction links.

MPP Session/channel mode, mainnet, multi-tenant support, custom policy contracts, and custody are out of scope.
