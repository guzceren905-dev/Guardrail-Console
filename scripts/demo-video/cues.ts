// Narration for the demo video. Each cue is spoken (macOS `say`) when the demo
// reaches it, and the dashboard scrolls to `view` while it plays.
export type View = "top" | "chart" | "guardrails" | "activity";
export type Cue = { text: string; view: View };

export const cues = {
  intro: {
    view: "top",
    text: "This is Guardrail Console: on-chain spending guardrails for an A.I. agent on Stellar testnet. The agent pays for A.P.I.s from an OpenZeppelin smart account. The owner gave it a ten U.S.D.C. daily cap and a recipient allowlist, and both are enforced by the smart account on-chain. This dashboard is read-only. It holds no keys.",
  },
  x402Pay: {
    view: "top",
    text: "First, the agent buys a one-dollar report from a paid A.P.I. over x402. It signs as the agent, and the smart account checks the payment against its policies.",
  },
  x402Paid: {
    view: "activity",
    text: "The payment settled on Stellar. The dashboard picked up the new x402 payment, and the daily spend went up by one dollar.",
  },
  overCap: {
    view: "chart",
    text: "Next, a premium report costs fifteen dollars, more than the agent's daily cap.",
  },
  overCapRefused: {
    view: "chart",
    text: "The agent's payment is rejected by the policy. Even when the agent skips its own check, the facilitator's simulation runs the same on-chain policy and refuses to settle. Nothing reaches the ledger.",
  },
  onChain: {
    view: "chart",
    text: "Now the same over-cap payment is submitted straight to the Stellar ledger.",
  },
  onChainBlocked: {
    view: "activity",
    text: "Stellar rejects it on-chain with a spending-limit error. The dashboard lists it as blocked, and the spend is unchanged. The ledger enforces the limit, not our app.",
  },
  allowlist: {
    view: "guardrails",
    text: "The agent may only pay allowlisted recipients. Here it tries to pay a partner that is not on the list.",
  },
  allowlistBlocked: {
    view: "activity",
    text: "That is rejected too, and recorded on-chain as blocked: recipient not allowlisted.",
  },
  freeze: {
    view: "top",
    text: "The owner can freeze the agent at any time. Freezing removes the agent's signer, while the policies and spend history stay.",
  },
  frozen: {
    view: "top",
    text: "The dashboard shows the agent as frozen, and a frozen agent cannot pay at all.",
  },
  unfreeze: {
    view: "top",
    text: "Unfreezing restores the agent on the same rule.",
  },
  unfrozen: {
    view: "chart",
    text: "The agent is active again, and the daily spend was not reset.",
  },
  outro: {
    view: "chart",
    text: "The dashboard's totals reconcile with the spending-limit policy's own on-chain state. Every payment and every rejection you saw is on Stellar testnet, with a link to Stellar Expert. The code is open source on GitHub.",
  },
} satisfies Record<string, Cue>;

export type CueId = keyof typeof cues;
