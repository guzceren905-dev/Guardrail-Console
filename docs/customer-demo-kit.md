# Customer demo kit (SOW 6.2)

Use this kit to run a recorded demo and interview with a potential customer. A single 20-minute Loom call can cover three rows of the 6.2 table: the customer demo, a user-testing session, and the interview summary. Run it with 3–5 people if you can. The Chapter Lead can check one recording, but several summaries make the case.

## Who to invite

People who run, or plan to run, an AI agent that spends money:

- Builders of AI agents that call paid APIs (x402, MPP, or API keys with billing)
- Teams on Stellar that hold a treasury and want to delegate spending
- Fintech or ops people who would approve an agent's budget

Do not invite teammates or people who helped build the product. The reviewer will ask who the person is.

## Before the call

1. Open https://guardrail-console.vercel.app and wait for the green **LIVE** pill.
2. Check the agent has at least $1 of budget left: `node scripts/testnet/freeze.ts status`.
3. Open a terminal in the repo, ready to run `pnpm demo`.
4. Start Loom (screen + camera). Record the customer's camera too if they agree.

## Call script (about 20 minutes)

### 1. Consent (30 s)

> "Can I record this call? I'll share it with the Stellar Ambassador program as evidence for our grant. I'll only use your first name and company unless you say otherwise."

Get a clear yes on the recording. Without it, do not use the call as evidence.

### 2. Discovery: before the demo (5 min)

Ask before showing anything, so the product does not shape the answers.

1. What do your agents (or the agents you plan to build) pay for today?
2. How do you limit what an agent can spend? What happens if it goes over?
3. Have you had, or worried about, an agent overspending or paying the wrong party?
4. Who needs to see what the agent spent? How do they see it now?

### 3. Demo (5 min)

Run `pnpm demo` and follow the steps in [demo-script.md](demo-script.md). Keep it short and say it in your own words:

| Step | Say |
|---|---|
| Starting point | "The agent pays from a smart account. I set a 10 USDC daily cap and a list of who it can pay. Stellar enforces both, not our app." |
| x402 payment | "The agent buys a $1 report. It settles, and the dashboard shows it." |
| Over cap | "A $15 report breaks the cap. The ledger rejects it, and spend doesn't change." |
| Not allowlisted | "Paying someone off the list also fails." |
| Freeze | "I can freeze the agent at any moment. Unfreezing doesn't reset the spend." |

### 4. User testing: the customer drives (5 min)

Send them the dashboard link and ask them to share their screen. Give one task at a time and stay quiet while they work. Note where they hesitate.

1. "How much has the agent spent today, and how much is left?"
2. "Find the payment that was blocked. Why was it blocked?"
3. "Is the agent allowed to pay right now? How can you tell?"
4. "Open one payment on the block explorer."

After each task: "On a scale of 1–5, how easy was that?"

### 5. Reaction (4 min)

1. What would stop you from using this for a real agent?
2. What's missing? (alerts, several agents, mainnet, other assets…)
3. If this worked on mainnet, would you try it? What would you pay, if anything?
4. Who else should I show this to?

### 6. Close (30 s)

Thank them. Ask if you can follow up when mainnet support ships.

## After the call: summary template

Fill one per call within a day, while it is fresh. Link the recording.

```
Interviewee: <first name>, <role>, <company / project>
Date: <YYYY-MM-DD>   Recording: <Loom link>   Consent to share: yes

Context
- What their agents pay for today:
- How they limit spending today:

Pain points (their words)
- "<quote>"

User testing
| Task | Completed? | Ease (1–5) | Notes |
| Spent / remaining today | | | |
| Find blocked payment + reason | | | |
| Is the agent allowed to pay? | | | |
| Open payment on explorer | | | |

Feedback
- Blockers to adoption:
- Missing features:
- Would try on mainnet? Willingness to pay:
- Referrals:

What we'll change because of this call
-
```

Store summaries in `docs/interviews/` (one file per call) or a shared Google Doc, and link them from the 6.2 table.

## Website traffic (row 3)

The dashboard has no analytics yet. To get a traffic report, enable Vercel Web Analytics on the `guardrail-console` project (Vercel → Project → Analytics), deploy, and share the link widely during the outreach. After a week or two, export a screenshot of visitors and top pages. Do not submit numbers from before analytics was enabled.

## Filling in the 6.2 table

| Evidence type | Description | Link |
|---|---|---|
| Loom demo with a potential customer | Live demo to <name, role, company>: discovery, demo, customer feedback | Loom link |
| User testing / UX session | Same call, section 4: customer completes 4 dashboard tasks, ease scores | Loom link + timestamp |
| Website traffic report | Vercel Web Analytics, <date range> | Screenshot / share link |
| Customer interview summary | <N> interview summaries using the template above | Doc link |
| Other | Narrated product demo video; live testnet dashboard; on-chain evidence; AI-assisted usability review ([ux-review.md](ux-review.md), labeled as AI, not customer evidence) | https://youtu.be/KkSlOZQgZTY, https://guardrail-console.vercel.app, [evidence.md](evidence.md) |
