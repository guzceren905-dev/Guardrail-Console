# Guardrail Console

A testnet-first dashboard and integration demo for policy-governed AI-agent payments on Stellar.

Guardrail Console composes OpenZeppelin Stellar smart-account policies with **x402** and **MPP Charge**, then shows the owner a protocol-neutral view of confirmed payment activity and budget state. The dashboard is read-only: it never holds keys or signs transactions.

## Current status

The repository contains a sample-data dashboard and an interactive Milestone 1 testnet setup flow at `/setup`. The setup uses Smart Account Kit and pre-deployed Protocol 27 OpenZeppelin artifacts. A live testnet account is not yet recorded in the evidence file.

## Run

Requirements: Node.js 22 or newer and pnpm.

    pnpm install
    pnpm dev

Open http://localhost:3000/setup to create or connect a testnet account and configure its agent spending rule. Use a browser with WebAuthn/passkey support.

## Testnet configuration

Copy `.env.example` to `.env.local`. The values are public testnet contract/network references. Never put a wallet secret, passkey material, or privileged relayer token in the repository.

The current Smart Account Kit uses fail-closed wallet verification. It relies on the public schema-2 Mercury indexer and its official testnet relayer proxy. If either dependency rejects the operation, stop and investigate; do not bypass wallet verification.

## Product and delivery docs

- `docs/product-scope.md`
- `docs/architecture.md`
- `docs/milestones.md`
- `docs/milestone-1-runbook.md`

## Security boundary

OpenZeppelin smart-account contracts and Smart Account Kit are distinct components. Smart Account Kit and this app integration are not independently audited. The evidence must identify exact versions, contract artifact hashes, transaction links, and this limitation.

Recipient allowlisting is out of scope for this MVP. The on-chain guardrails are the USDC spending cap and owner-controlled removal of the agent authorization. MPP Session/channel mode, mainnet, multi-tenant accounts, custom policy contracts, and custody are out of scope.
