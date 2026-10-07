# Milestone 1 testnet runbook

## Pinned dependencies and contract provenance

- `smart-account-kit@0.8.0` — published release with fail-closed wallet birth, current-code, signer, and fresh-passkey verification.
- `@stellar/stellar-sdk@16.3.0` — supported SDK line for Smart Account Kit 0.8.0; do not upgrade to SDK 17 without a compatible kit release.
- OpenZeppelin source commit: `1e513890ecf79833c9d6e7ef38a9358001c0b111`.
- Contract WASM hashes, testnet verifier/policy addresses, upload tx hashes, and deployment tx hashes are maintained in the upstream Protocol 27 manifest: https://github.com/stellar/smart-account-kit/blob/main/docs/deployments-protocol-27-2026-07-09.md

The SDK, demo, relayer proxy, and integration code are not independently audited. The underlying OpenZeppelin audit has a different scope and the deployed artifacts are from a later source revision. Treat this as a testnet-only demonstration; never fund it with assets of value.

## Browser setup

1. Copy `.env.example` to `.env.local`.
2. Install dependencies and run the app with Node.js 22+ and pnpm.
3. Open `/setup` on a browser origin that supports WebAuthn/passkeys.
4. Create a testnet smart account with a user-controlled passkey. The kit's public testnet relayer sponsors deployment fees; the account is funded with testnet XLM.
5. Generate and attach an ephemeral Ed25519 agent signer to an agent-only `CallContract(USDC SAC)` rule with the spending-limit policy.
6. Claim Circle testnet USDC to the smart account and prepare a recipient account with a USDC trustline. The Circle faucet may require interactive browser verification.
7. Run one transfer within the cap, one transfer above it, and save the transaction result/hash for each.
8. Remove the agent context rule with the owner passkey and show that the same agent signer can no longer transfer.
9. Record the account address, rule ID, policy params, package versions, WASM hashes, and transaction hashes in `docs/milestone-1-evidence.md`.

## Acceptance checklist

- [ ] Account deployment transaction is confirmed on testnet.
- [ ] Owner passkey is the only signer on the default administrative rule.
- [ ] Agent signer is isolated to the USDC SAC context rule.
- [ ] Policy state reads back as 5,000,000 USDC base units per 17,280 ledgers (test cap; 0.50 USDC).
- [ ] In-cap USDC transfer succeeds.
- [ ] Above-cap USDC transfer returns the spending-limit rejection from chain.
- [ ] Owner removes the agent-only rule; subsequent agent transfer fails authorization.
- [ ] Owner can still read/manage the account after revoke.
- [ ] Evidence contains hashes and explorer URLs, with no secrets.

Recipient allowlisting is excluded. The spending-limit policy does not validate the recipient argument.

## Known external inputs

The owner must create/authorize a passkey in their browser. A testnet USDC faucet may require a human challenge and funding recipient setup. No seed phrase or private key is requested by this runbook.
