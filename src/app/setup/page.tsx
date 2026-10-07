"use client";

import Link from "next/link";
import { Buffer } from "buffer";
import { useRef, useState } from "react";

type Kit = import("smart-account-kit").SmartAccountKit;
type SelectedSigner = import("smart-account-kit").SelectedSigner;

const ACCOUNT_WASM = process.env.NEXT_PUBLIC_SMART_ACCOUNT_WASM_HASH!;
const WEBAUTHN_VERIFIER = process.env.NEXT_PUBLIC_WEBAUTHN_VERIFIER_ADDRESS!;
const ED25519_VERIFIER = process.env.NEXT_PUBLIC_ED25519_VERIFIER_ADDRESS!;
const SPENDING_POLICY = process.env.NEXT_PUBLIC_SPENDING_LIMIT_POLICY_ADDRESS!;
const XLM_SAC = process.env.NEXT_PUBLIC_XLM_SAC_ADDRESS!;
const RELAYER_URL = process.env.NEXT_PUBLIC_RELAYER_URL!;
const RPC_URL = process.env.NEXT_PUBLIC_STELLAR_RPC_URL!;
const NETWORK_PASSPHRASE = process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE!;
const USDC_ISSUER = process.env.NEXT_PUBLIC_USDC_ISSUER!;
const DAILY_CAP_USDC = 0.5;
const LEDGER_WINDOW = 17_280;
const RULE_NAME = "Guardrail Agent USDC Spend";
const RULE_ID_KEY = "guardrail-agent-rule-id";

export default function SetupPage() {
  const kitRef = useRef<Kit | null>(null);
  const selectedRef = useRef<SelectedSigner[] | null>(null);
  const [accountId, setAccountId] = useState("");
  const [agentAddress, setAgentAddress] = useState("");
  const [ruleId, setRuleId] = useState<number | null>(null);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("0.1");
  const [status, setStatus] = useState("No testnet account connected.");
  const [busy, setBusy] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [policyReadback, setPolicyReadback] = useState("");
  const [ruleRevoked, setRuleRevoked] = useState(false);

  async function createKit() {
    const { SmartAccountKit, IndexedDBStorage } = await import("smart-account-kit");
    return new SmartAccountKit({
      rpcUrl: RPC_URL,
      networkPassphrase: NETWORK_PASSPHRASE,
      accountWasmHash: ACCOUNT_WASM,
      acceptedWasmHashes: [ACCOUNT_WASM],
      acceptedBirthWasmHashes: [ACCOUNT_WASM],
      webauthnVerifierAddress: WEBAUTHN_VERIFIER,
      ed25519VerifierAddress: ED25519_VERIFIER,
      relayerUrl: RELAYER_URL,
      storage: new IndexedDBStorage(),
    });
  }

  async function withBusy(action: () => Promise<void>) {
    setBusy(true);
    setTxHash("");
    try {
      await action();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The operation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function createAccount() {
    await withBusy(async () => {
      const kit = await createKit();
      setStatus("Create or confirm the owner passkey in your browser.");
      const created = await kit.createWallet("Guardrail Console", "Treasury Owner", {
        autoSubmit: true,
        autoFund: true,
        nativeTokenContract: XLM_SAC,
      });
      kitRef.current = kit;
      setAccountId(created.contractId);
      sessionStorage.setItem("guardrail-account-id", created.contractId);
      setStatus("Testnet smart account deployed and connected.");
    });
  }

  async function connectAccount() {
    await withBusy(async () => {
      const kit = await createKit();
      setStatus("Confirm ownership with your passkey.");
      const connected = await kit.connectWallet({ prompt: true });
      kitRef.current = kit;
      setAccountId(connected.contractId);
      const storedRule = sessionStorage.getItem(RULE_ID_KEY);
      if (storedRule) setRuleId(Number(storedRule));
      setStatus("Testnet smart account connected.");
    });
  }

  async function addAgentRule() {
    await withBusy(async () => {
      const kit = kitRef.current;
      if (!kit || !accountId) throw new Error("Create or connect the owner account first.");
      const [{ Keypair, Asset, Networks }, sdk] = await Promise.all([
        import("@stellar/stellar-sdk"),
        import("smart-account-kit"),
      ]);
      const { createCallContractContext, createEd25519Signer, createSpendingLimitParams, LEDGERS_PER_DAY } = sdk;
      const usdcSac = new Asset("USDC", USDC_ISSUER).contractId(Networks.TESTNET);
      const keypair = Keypair.random();
      const registered = kit.externalSigners.addEd25519FromSecret(keypair.secret(), ED25519_VERIFIER);
      const signer = createEd25519Signer(ED25519_VERIFIER, Buffer.from(registered.publicKey, "hex"));
      const selected: SelectedSigner[] = [{
        type: "ed25519",
        ed25519PublicKey: registered.publicKey,
        signer,
        label: "Ephemeral test agent",
      }];
      const params = kit.convertPolicyParams(
        "spending_limit",
        createSpendingLimitParams(BigInt(Math.round(DAILY_CAP_USDC * 10_000_000)), LEDGERS_PER_DAY),
      );
      const nextRuleId = await kit.rules.count();
      const tx = await kit.rules.add(
        createCallContractContext(usdcSac),
        RULE_NAME,
        [signer],
        new Map([[SPENDING_POLICY, params]]),
      );
      setStatus("Approve the agent-only USDC rule with the owner passkey.");
      const result = await kit.signAndSubmitAdmin(tx);
      if (!result.success) throw new Error(result.error.message);
      selectedRef.current = selected;
      sessionStorage.setItem(RULE_ID_KEY, String(nextRuleId));
      setRuleId(nextRuleId);
      setAgentAddress(registered.address);
      setRuleRevoked(false);
      const readback = await kit.policyClients.spendingLimit(SPENDING_POLICY).getSpendingLimitData(nextRuleId);
      setPolicyReadback(JSON.stringify(readback, (_key, value) => typeof value === "bigint" ? value.toString() : value));
      setStatus("Agent rule is confirmed. The key is memory-only and will not survive a page reload.");
      setTxHash(result.hash);
    });
  }

  async function transfer() {
    await withBusy(async () => {
      const kit = kitRef.current;
      const selected = selectedRef.current;
      if (!kit || !selected || ruleId === null) {
        throw new Error("Connect the account and create the agent rule in this browser session first.");
      }
      if (!recipient.startsWith("G") && !recipient.startsWith("C")) {
        throw new Error("Enter a Stellar G... or C... recipient.");
      }
      const { Asset, Networks } = await import("@stellar/stellar-sdk");
      const usdcSac = new Asset("USDC", USDC_ISSUER).contractId(Networks.TESTNET);
      const result = await kit.multiSigners.transfer(
        usdcSac,
        recipient,
        Number(amount),
        selected,
        { resolveContextRuleIds: () => [ruleId] },
      );
      if (result.success) {
        setStatus("USDC transfer confirmed on testnet.");
        setTxHash(result.hash);
      } else {
        setStatus(result.error.message);
        if (result.hash) setTxHash(result.hash);
      }
    });
  }

  async function revokeAgent() {
    await withBusy(async () => {
      const kit = kitRef.current;
      if (!kit || ruleId === null) throw new Error("Connect the owner account and locate the agent rule first.");
      const { result: rule } = await kit.rules.get(ruleId);
      if (!rule || rule.name !== RULE_NAME) throw new Error("The saved rule ID does not match the agent rule; refusing to remove it.");
      setStatus("Approve removal of the agent rule with the owner passkey.");
      const result = await kit.signAndSubmitAdmin(await kit.rules.remove(ruleId));
      if (!result.success) throw new Error(result.error.message);
      setRuleRevoked(true);
      setStatus("Agent rule removed. Attempt a transfer with the former agent signer to verify revocation.");
      setTxHash(result.hash);
      sessionStorage.removeItem(RULE_ID_KEY);
    });
  }

  const usdcFaucetUrl = "https://faucet.circle.com/";

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-10 text-slate-900">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Guardrail Console · Testnet only</p>
      <h1 className="mt-3 text-3xl font-semibold">Milestone 1 account setup</h1>
      <p className="mt-2 text-sm text-slate-600">
        Create a passkey-owned smart account, install an agent-only USDC spending cap, and revoke that rule.
        Nothing on this page is configured for mainnet.
      </p>

      <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        Smart Account Kit and this integration are not independently audited. Use only testnet assets.
        The agent signing key is ephemeral and stays in browser memory. Recipient allowlisting is not provided.
      </div>

      <section className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <button disabled={busy} onClick={createAccount} className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            Create testnet account
          </button>
          <button disabled={busy} onClick={connectAccount} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-50">
            Connect existing account
          </button>
          <button disabled={busy || !accountId || ruleId !== null} onClick={addAgentRule} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-50">
            Add $0.50 / ledger-window agent rule
          </button>
        </div>

        <div className="rounded-md bg-slate-50 p-3 text-sm">
          <p><strong>Status:</strong> {busy ? "Working…" : status}</p>
          {accountId && <p className="mt-1 break-all"><strong>Account:</strong> {accountId}</p>}
          {agentAddress && <p className="mt-1 break-all"><strong>Agent signer:</strong> {agentAddress}</p>}
          {ruleId !== null && <p className="mt-1"><strong>Agent rule ID:</strong> {ruleId}{ruleRevoked ? " (revoked)" : ""}</p>}
          {policyReadback && <p className="mt-1 break-all"><strong>On-chain policy readback:</strong> {policyReadback}</p>}
          {txHash && <p className="mt-1 break-all"><strong>Transaction:</strong> <a className="text-blue-700 underline" href={process.env.NEXT_PUBLIC_STELLAR_EXPLORER + "/tx/" + txHash} target="_blank" rel="noreferrer">{txHash}</a></p>}
        </div>

        <div className="border-t border-slate-200 pt-4 text-sm">
          <h2 className="font-semibold">Verify spending limit and revoke</h2>
          <p className="mt-1 text-slate-600">Claim testnet USDC to the smart account and use a recipient with a USDC trustline for the allowed-transfer check.</p>
          <a className="mt-2 inline-block text-blue-700 underline" href={usdcFaucetUrl} target="_blank" rel="noreferrer">Open Circle testnet USDC faucet</a>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_140px]">
            <label className="text-xs font-medium text-slate-600">Recipient G... address
              <input value={recipient} onChange={(event) => setRecipient(event.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="G..." />
            </label>
            <label className="text-xs font-medium text-slate-600">USDC amount
              <input value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" inputMode="decimal" />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            <button disabled={busy || ruleId === null || !agentAddress || !selectedRef.current} onClick={transfer} className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {ruleRevoked ? "Verify revoked agent transfer" : "Attempt transfer with agent signer"}
            </button>
            <button disabled={busy || !ruleId} onClick={revokeAgent} className="rounded-md border border-rose-300 px-4 py-2 text-sm font-medium text-rose-700 disabled:opacity-50">
              Revoke agent rule
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Use an amount at or below $0.50 to test an allowed transfer, then above $0.50 to test policy rejection.
            A ledger-window is approximately 24 hours and is measured in ledger count, not exact wall-clock time.
          </p>
        </div>
      </section>
      <footer className="mt-6 flex justify-between text-sm text-slate-500"><Link href="/" className="underline">Back to preview</Link><span>Stellar testnet</span></footer>
    </main>
  );
}
