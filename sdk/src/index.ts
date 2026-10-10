export * from "./core.ts";
export * from "./account.ts";
export * from "./agent.ts";

/** Contract error codes surfaced by the guardrails. */
export const GuardrailErrors = {
  /** OZ smart account: signer is not part of the selected rule (e.g. agent frozen). */
  UnauthorizedSigner: 3016,
  /** OZ smart account: no rule matches the call (e.g. agent calling another contract). */
  UnvalidatedContext: 3002,
  /** OZ spending-limit policy: payment would exceed the cap in the rolling window. */
  SpendingLimitExceeded: 3221,
  /** Guardrail allowlist policy: recipient not on the allowlist. */
  RecipientNotAllowed: 3303,
} as const;
