# Demo video script

Target length: 3–4 minutes. Record the screen with two windows side by side: the dashboard (https://guardrail-console.vercel.app) on the left, a terminal on the right.

## Before recording

1. `pnpm install`, Stellar CLI identities `gc-owner`, `gc-agent`, `gc-merchant`, `gc-stranger`, `gc-facilitator` present (see [setup.md](setup.md)).
2. The agent needs at least $1 of daily budget left: `node scripts/testnet/freeze.ts status` (`remaining`). Each run spends `REPORT_PRICE` (default `$1.00`).
3. Open the dashboard and wait for the green **LIVE** pill.

## Run

```bash
pnpm demo
```

The script pauses before each step; press Enter when the narration is done. After each payment step, wait ~10 s for the dashboard to refresh before moving on.

| Step | Terminal | Dashboard to point at | Narration |
|---|---|---|---|
| 1. Starting point | status line | balance, spend vs cap, guardrails panel | "An AI agent pays for APIs from an OpenZeppelin smart account. The owner set a 10 USDC daily cap and an allowlist, enforced on-chain. This dashboard is read-only; it holds no keys." |
| 2. x402 within policy | `✓ HTTP 200 … settled` + link | new **x402** row, spend goes up | "The agent buys a $1 report over x402. The payment settles on Stellar." |
| 3. Over cap via x402 | agent refuses; facilitator refuses | nothing changes | "A $15 report would break the cap. The agent's payment is rejected, and even if the agent skips its own check, the facilitator's simulation runs the same on-chain policy." |
| 4. Over cap on-chain | `✗ FAILED on-chain (#3221)` + link | **Blocked · Over daily cap** row; spend unchanged | "Submitted straight to the ledger, it fails on-chain. The ledger enforces the limit, not our app." Open the Stellar Expert link. |
| 5. Not allowlisted | `#3303` | **Blocked · Recipient not allowlisted** row | "Paying someone who is not on the allowlist fails the same way." |
| 6. Freeze | `frozen` + link | **Agent frozen** banner and badge | "The owner can freeze the agent at any time. It can no longer pay." |
| 7. Unfreeze | `unfrozen` + status | banner gone; spend unchanged | "Unfreezing restores the agent. The daily spend is not reset." |

Close on the dashboard's **Reconciled with policy** badge: the dashboard's totals match the policy's own on-chain state.

## After recording

Upload the video and add its link to [evidence.md](evidence.md) (top of the file).
