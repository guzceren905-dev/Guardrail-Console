# AI-assisted usability review

**This is not customer evidence.** An AI agent (Claude, via Claude Code's built-in browser) used the live dashboard on 2026-10-15 and tried the same tasks we give customers in [customer-demo-kit.md](customer-demo-kit.md). It is a heuristic review that finds problems before real users see them. No real person took part.

- Target: https://guardrail-console.vercel.app (Stellar testnet, ledger ~5,209,790)
- Viewports: desktop (1024 px) and mobile (375 × 812)

## Tasks

| Task | Result | Notes |
|---|---|---|
| How much has the agent spent today, and how much is left? | Done, first screen | "Spent in rolling 24h $0.00" and "Budget remaining $10.00" are the first cards. Clear. |
| Find a blocked payment and its reason | Done | The **Blocked** filter shows 14 rows; each states the reason ("Over daily cap", "Recipient not allowlisted"). |
| Is the agent allowed to pay right now? | Done | "Agent active" badge on the header and "Agent rule active" in Guardrails. |
| Open a payment on the block explorer | Done on desktop | TX column links to Stellar Expert. On mobile the column is off-screen until you scroll the table sideways. |
| Move between Overview / Guardrails / Activity | Desktop only | The sidebar nav is hidden on mobile and nothing replaces it. |

## Findings

Ranked by impact on a first-time, non-technical viewer (such as the Ambassador Chapter Lead).

1. **Slow, empty first load.** For 5–10 seconds the page shows only "Loading live data from Stellar RPC…" and "LIVE · CONNECTING". A first-time visitor may think it is broken. *Fix:* show skeleton cards, or render the last known snapshot first.
2. **Protocol jargon without explanation.** "Rolling 17,280-ledger window", "Context rule 1", "Rule 1", "x402" and "Reconciled with policy" mean nothing to a non-technical reader. *Fix:* say "~24 hours" first and move ledger counts to a tooltip; add a one-line tooltip for x402 and the reconciled badge.
3. **No navigation on mobile.** At 375 px the sidebar disappears; Guardrails and Activity are reachable only by scrolling. *Fix:* a compact top tab bar on small screens.
4. **Table cut off on mobile.** The payment table is 650 px inside a 345 px container. It scrolls, but the result and TX columns are hidden and nothing hints at the scroll. *Fix:* card rows on mobile, or a fade edge.
5. **Demo looks idle.** All activity is 4–5 days old and today's spend is $0.00, so the chart is a flat line. Visitors do not see the product doing anything. *Fix:* run `pnpm demo` before sharing the link or a call, or add a short "what you're looking at" explainer.
6. **Odd amounts.** Rows like "$10.0000001 USDC" come from boundary tests and look like a bug to an outsider. *Fix:* label test transactions, or round display to 2 decimals with the exact value in a tooltip.
7. **Freeze state is invisible in history.** The owner freeze is the strongest safety story, but past freeze/unfreeze events do not appear in the payment history. *Fix:* show them as events in the activity list.

## What worked

- The three headline numbers answer "what can it spend / what did it spend" at once.
- Blocked rows state the reason in plain words, and every row links to a public explorer.
- "Read-only · no keys held" is repeated where a cautious owner looks for it.
- No horizontal page scroll on mobile; the layout stacks cleanly.
