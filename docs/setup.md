# Setup and integration guide

Testnet only. This guide covers the policy-gated smart account (Deliverable 1), the x402 paid API demo (Deliverable 2) and the tests.

## Components

| Path | What it is |
|---|---|
| `contracts/allowlist-policy` | Custom recipient-allowlist policy for OZ smart accounts (Rust/Soroban). Unaudited. |
| `sdk/` | TypeScript configuration SDK: `GuardrailAccount` (owner) and `GuardrailAgent` (agent payments, x402 scheme). |
| `scripts/testnet/` | Demo configuration for the deployed testnet account, CLI scripts and the end-to-end test. |
| `x402-demo/` | Express paid API, self-hosted facilitator, and an x402 agent client. |

Deployed testnet addresses and transaction evidence: [spike-notes.md](spike-notes.md), section 6.

## Requirements

- Node.js 24 (runs the TypeScript files directly), pnpm 11 (`corepack enable`)
- Rust with the `wasm32v1-none` target and Stellar CLI 27 (contract work only)

```bash
pnpm install
```

## Policy model

The smart account is OZ `multisig-account-example` (stellar-contracts `1e513890`, the WASM smart-account-kit deployed on testnet). It has two context rules:

| Rule | Scope | Signer | Policies |
|---|---|---|---|
| 0 owner | `Default` (any call) | owner Ed25519 key | none |
| 1 agent | `CallContract(USDC SAC)` | agent Ed25519 key | OZ spending limit (cap per rolling window), Guardrail allowlist |

- The agent can only call `transfer` on USDC, only to allowlisted recipients, and only up to the cap in the rolling window (~24h = 17,280 ledgers).
- The agent cannot use the owner rule, call other contracts, or change its own rule or allowlist.
- **Freeze** removes the agent signer from rule 1. Policies and spend history stay, so unfreezing does not reset the cap.
- Amounts are in USDC base units (7 decimals): `1 USDC = 10_000_000`.

## SDK

```ts
import { Keypair } from "@stellar/stellar-sdk";
import { Ed25519Signer } from "smart-account-kit";
import { GuardrailAccount, GuardrailAgent, TESTNET } from "./sdk/src/index.ts";

// 1. Create the smart account (OZ smart-account WASM uploaded by smart-account-kit).
const ownerSigner = new Ed25519Signer(Keypair.fromSecret(process.env.OWNER_SECRET!), ED25519_VERIFIER);
const { smartAccount } = await GuardrailAccount.createSmartAccount({
  network: TESTNET,
  deployer: Keypair.fromSecret(process.env.OWNER_SECRET!),
  owner: ownerSigner,                             // owner rule 0: Default, no policies
});

// 2. Configure the agent.
const owner = new GuardrailAccount({
  network: TESTNET,
  smartAccount,
  policies: { spendingLimit: "C...", allowlist: "C..." },
  feeSource: Keypair.fromSecret(process.env.OWNER_SECRET!),
  owner: ownerSigner,
});

const { ruleId } = await owner.addAgentRule({
  token: USDC_SAC,
  agent: agentSigner,                             // Ed25519Signer for the agent key
  dailyCap: 10n * 10_000_000n,                    // 10 USDC per window
  recipients: ["G...merchant"],
});

await owner.setDailyCap(ruleId, 20n * 10_000_000n);
await owner.setAllowlist(ruleId, ["G...merchant", "G...other"]);
await owner.freezeAgent(ruleId);
await owner.unfreezeAgent(ruleId, agentSigner);
const status = await owner.getAgentStatus(ruleId); // frozen, dailyCap, spentInWindow, remaining, recipients

const agent = new GuardrailAgent({ network: TESTNET, smartAccount: "C...", agent: agentSigner, ruleId });
await agent.pay({ token: USDC_SAC, to: "G...merchant", amount: 10_000_000n, feeSource: agentFeeKeypair });
```

`pay` returns `{ status, errorCode, hash }`. Rejections come back as contract error codes (`GuardrailErrors`):

| Code | Meaning |
|---|---|
| 3221 | Payment would exceed the cap in the rolling window (OZ spending limit) |
| 3303 | Recipient not on the allowlist (Guardrail allowlist) |
| 3016 | Agent signer not on the rule (agent frozen) |
| 3002 | No rule allows the call (wrong contract or rule) |

## CLI scripts (demo deployment)

The scripts use Stellar CLI identities `gc-owner`, `gc-agent`, `gc-merchant`, `gc-stranger` and `gc-facilitator` (testnet keys in the local Stellar CLI config).

```bash
node scripts/testnet/freeze.ts status
node scripts/testnet/agent-pay.ts gc-merchant 0.5          # allowed
node scripts/testnet/agent-pay.ts gc-stranger 0.5 --force  # rejected, recorded on-chain as a failed tx
node scripts/testnet/freeze.ts freeze
node scripts/testnet/freeze.ts unfreeze
```

## x402 paid API

```bash
node --env-file-if-exists=.env.local x402-demo/server.ts   # http://localhost:4021
node x402-demo/agent.ts /api/report                         # $1, within policy: settles
node x402-demo/agent.ts /api/premium-report                 # $15, over the 10 USDC cap: refused (#3221)
node x402-demo/agent.ts /api/partner-report                 # recipient not allowlisted: refused (#3303)
node x402-demo/agent.ts /api/premium-report --skip-local-check  # facilitator rejects (simulation_failed)
```

- The agent uses `GuardrailAgent.x402Scheme()`, which signs the x402 auth entry as the smart account. The stock `@x402/stellar` client cannot do this: it signs as a classic account.
- The x402 client's own `spendControls` are off; the on-chain policies are the guard.
- **Facilitator.** By default the server uses a self-hosted facilitator (`x402-demo/facilitator.ts`). It is `@x402/stellar`'s facilitator with a 0.1 XLM fee cap and a narrowed event check. OZ Channels and the reference facilitator reject every payment from an OZ smart account that uses the spending-limit policy, because of the policy's `spending_limit_enforced` event. Upstream: [x402-foundation/x402#3764](https://github.com/x402-foundation/x402/issues/3764), [OpenZeppelin/relayer-plugin-x402-facilitator#53](https://github.com/OpenZeppelin/relayer-plugin-x402-facilitator/issues/53).
- To use OZ Channels instead, put `OZ_API_KEY=...` in `.env.local` and start the server with `FACILITATOR=oz-channels`.
- Environment overrides: `PORT`, `MERCHANT_ADDRESS`, `PARTNER_ADDRESS`, `REPORT_PRICE`, `PREMIUM_PRICE`, `FACILITATOR_URL`.

## Tests

```bash
pnpm test:contracts   # Rust: allowlist unit tests + integration with an OZ smart account
pnpm test:unit        # TypeScript: SDK signing/encoding, facilitator event check
pnpm test:e2e         # live testnet: payments, owner config, freeze, x402 (self-hosted and OZ Channels)
```

`test:e2e` also deploys a fresh smart account through the SDK on every run. It spends about 0.06 USDC of the daily cap and some testnet XLM per run. It restores the allowlist, cap and freeze state when it finishes.

## Limitations

- Testnet only. The allowlist policy and the facilitator change are not audited.
- The OZ spending-limit policy keeps at most 1,000 payments per window (`HistoryCapacityExceeded`). Its write cost grows with history size, so the fee per payment grows during a busy window.
- A smart-account payment costs ~0.03 XLM in resource fees (paid by the facilitator in x402).
- A frozen agent's payment cannot be recorded on-chain with `--force`, because no reference payment passes while frozen. It is rejected in simulation (`#3016`).
