// Server-side dashboard configuration. Only public addresses and URLs; the
// dashboard never holds keys. Defaults point at the testnet demo deployment.
import "server-only";

const env = (name: string, fallback: string) => process.env[name]?.trim() || fallback;
const list = (name: string, fallback: string) =>
  env(name, fallback).split(",").map((s) => s.trim()).filter(Boolean);

export const config = {
  network: {
    rpcUrl: env("STELLAR_RPC_URL", "https://soroban-testnet.stellar.org"),
    networkPassphrase: env("STELLAR_NETWORK_PASSPHRASE", "Test SDF Network ; September 2015"),
  },
  horizonUrl: env("STELLAR_HORIZON_URL", "https://horizon-testnet.stellar.org"),
  explorerUrl: env("NEXT_PUBLIC_STELLAR_EXPLORER", "https://stellar.expert/explorer/testnet"),
  networkLabel: env("NETWORK_LABEL", "Stellar testnet"),

  smartAccount: env("NEXT_PUBLIC_DEMO_ACCOUNT", "CDQSAMY2O6SCFRXA5SSZHAFT7SAZ7DYHLZVKCHH646KTEDFMBEWO4SFX"),
  agentRuleId: Number(env("AGENT_RULE_ID", "1")),
  usdc: env("NEXT_PUBLIC_USDC_SAC", "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA"),
  policies: {
    spendingLimit: env("SPENDING_LIMIT_POLICY", "CABXBYJNZ7IUW4G3D6BND5YCAQF3ASSDMDAOKQQ63UYFSO7WUU2TIP5G"),
    allowlist: env("ALLOWLIST_POLICY", "CBJTSJ7M6BUIKZNNHLOPDNID6RBASIJRAM3AHDYPHIN56HKO5QX6HOQU"),
  },

  /** First ledger to index (the smart account's deployment). Clamped to the RPC retention window. */
  indexStartLedger: Number(env("INDEX_START_LEDGER", "5120111")),
  /** Transaction sources that settle x402 payments (facilitator fee payers). */
  facilitators: list("X402_FACILITATORS", "GAR7DVPDGZMDOOEKTKFPU3WIEFFT5P3U2RPODJ56V3B6LPBYGB7ZCJCA"),
  /** Accounts that submit the agent's direct payments; their failed transactions are shown as blocked attempts. */
  agentFeePayers: list("AGENT_FEE_PAYERS", "GDTD7OYXPFGHGODNOC6JT25ATL4WCDGTDKK5IB3POOJ4XUQMOEJA3BGZ"),
  /** Optional labels for known counterparties: "G...=Merchant,G...=Partner". */
  labels: Object.fromEntries(
    list("COUNTERPARTY_LABELS", "GAKQLYQXVMZHTQSRHIKXJZCAOJHPOZYT3XZHRXBBD7X2QWGJ3TLJEYUA=Demo merchant,GCMMT5XZCVVD6B4ZTQUPNFMX4SV45RP7XLC33F5DXDJGQ2HZTSSVB32M=Demo partner,GD3TR23CWTTIDAEHTZPYMCWDZQRZJJNWWUZ2DXMIVQSMSNGUHLWYBPMO=Owner")
      .map((pair) => pair.split("=") as [string, string]),
  ),
  /** Share of the cap at which the near-cap alert shows. */
  nearCapRatio: Number(env("NEAR_CAP_RATIO", "0.8")),
};
