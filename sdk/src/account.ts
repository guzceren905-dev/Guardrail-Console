// Owner-side configuration of a policy-gated OZ smart account for an AI agent:
// agent context rule, daily USDC cap (OZ spending-limit policy), recipient
// allowlist (Guardrail allowlist policy), and the owner freeze override.
import { Address, type Keypair, Operation, StrKey, TransactionBuilder, hash, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { type Ed25519Signer, signerToScVal } from "smart-account-kit";
import {
  type AgentStatus,
  type ContextRule,
  DAY_IN_LEDGERS,
  type PolicyAddresses,
  type InvokeResult,
  type Network,
  addr,
  i128,
  invokeAsSmartAccount,
  readContract,
  readContractScVal,
  sortedMap,
  struct,
  readAgentStatus,
  submit,
  sym,
  u32,
} from "./core.ts";


export type AgentRuleConfig = {
  /** SEP-41 token the agent may transfer (e.g. the USDC SAC). */
  token: string;
  agent: Ed25519Signer;
  /** Cap in token base units (USDC: 7 decimals) per rolling window. */
  dailyCap: bigint;
  /** Rolling window in ledgers; defaults to ~24h. */
  periodLedgers?: number;
  /** Recipients the agent may pay. 1–20 addresses. */
  recipients: string[];
  name?: string;
};


/**
 * OZ `multisig-account-example` WASM uploaded to testnet by smart-account-kit
 * (protocol 27 deployment, OZ stellar-contracts@1e513890).
 */
export const TESTNET_SMART_ACCOUNT_WASM = "1b5f4534a76322da2ad7c745f6900857a6802b0ca79850c35a03561df997785a";

/** Contract address a deployer gets for a given salt (CAP-46 contract id preimage). */
export function deployedContractAddress(network: Network, deployer: string, salt: Buffer): string {
  const preimage = xdr.HashIdPreimage.envelopeTypeContractId(
    new xdr.HashIdPreimageContractId({
      networkId: hash(Buffer.from(network.networkPassphrase)),
      contractIdPreimage: xdr.ContractIdPreimage.contractIdPreimageFromAddress(
        new xdr.ContractIdPreimageFromAddress({ address: Address.fromString(deployer).toScAddress(), salt }),
      ),
    }),
  );
  return StrKey.encodeContract(hash(preimage.toXDR()));
}

export class GuardrailAccount {
  readonly network: Network;
  readonly smartAccount: string;
  readonly policies: PolicyAddresses;
  private readonly feeSource: Keypair;
  private readonly owner: Ed25519Signer;
  private readonly ownerRuleId: number;

  constructor(opts: {
    network: Network;
    smartAccount: string;
    policies: PolicyAddresses;
    /** Pays fees and sequence for admin transactions. */
    feeSource: Keypair;
    /** Owner signer on the owner (Default) context rule. */
    owner: Ed25519Signer;
    ownerRuleId?: number;
  }) {
    this.network = opts.network;
    this.smartAccount = opts.smartAccount;
    this.policies = opts.policies;
    this.feeSource = opts.feeSource;
    this.owner = opts.owner;
    this.ownerRuleId = opts.ownerRuleId ?? 0;
  }

  /**
   * Deploys a new OZ smart account whose owner rule (id 0, `Default`) has the
   * owner's Ed25519 signer and no policies. Returns the account address.
   */
  static async createSmartAccount(opts: {
    network: Network;
    /** Pays fees and deploys the contract. */
    deployer: Keypair;
    owner: Ed25519Signer;
    accountWasmHash?: string;
    salt?: Buffer;
  }): Promise<{ smartAccount: string; hash: string }> {
    const server = new rpc.Server(opts.network.rpcUrl);
    const salt = opts.salt ?? Buffer.from(crypto.getRandomValues(new Uint8Array(32)));
    const source = await server.getAccount(opts.deployer.publicKey());
    const tx = new TransactionBuilder(source, { fee: "10000000", networkPassphrase: opts.network.networkPassphrase })
      .addOperation(
        Operation.createCustomContract({
          address: Address.fromString(opts.deployer.publicKey()),
          wasmHash: Buffer.from(opts.accountWasmHash ?? TESTNET_SMART_ACCOUNT_WASM, "hex"),
          salt,
          constructorArgs: [xdr.ScVal.scvVec([signerToScVal(opts.owner.signer)]), xdr.ScVal.scvMap([])],
        }),
      )
      .setTimeout(120)
      .build();
    const prepared = await server.prepareTransaction(tx);
    prepared.sign(opts.deployer);
    const result = GuardrailAccount.check(await submit(server, prepared), "create smart account");
    const smartAccount = Address.fromScVal(result.returnValue!).toString();
    if (smartAccount !== deployedContractAddress(opts.network, opts.deployer.publicKey(), salt)) {
      throw new Error("Deployed address does not match the expected contract id");
    }
    return { smartAccount, hash: result.hash };
  }

  private asOwner(contract: string, method: string, args: xdr.ScVal[]): Promise<InvokeResult> {
    return invokeAsSmartAccount({
      network: this.network,
      feeSource: this.feeSource,
      smartAccount: this.smartAccount,
      signer: this.owner,
      contextRuleIds: [this.ownerRuleId],
      contract,
      method,
      args,
    });
  }

  private static check(result: InvokeResult, action: string): InvokeResult {
    if (result.status !== "SUCCESS") {
      throw Object.assign(new Error(`${action} failed: ${result.status}${result.errorCode ? ` #${result.errorCode}` : ""}`), { result });
    }
    return result;
  }

  /** Adds the agent's context rule with the cap and allowlist policies. Returns the new rule id. */
  async addAgentRule(cfg: AgentRuleConfig): Promise<{ ruleId: number; hash: string }> {
    if (cfg.dailyCap <= 0n) throw new Error("dailyCap must be positive");
    const result = GuardrailAccount.check(
      await this.asOwner(this.smartAccount, "add_context_rule", [
        xdr.ScVal.scvVec([sym("CallContract"), addr(cfg.token)]),
        xdr.ScVal.scvString(cfg.name ?? "agent"),
        xdr.ScVal.scvVoid(),
        xdr.ScVal.scvVec([signerToScVal(cfg.agent.signer)]),
        sortedMap([
          [addr(this.policies.spendingLimit), struct({ spending_limit: i128(cfg.dailyCap), period_ledgers: u32(cfg.periodLedgers ?? DAY_IN_LEDGERS) })],
          [addr(this.policies.allowlist), struct({ recipients: xdr.ScVal.scvVec(cfg.recipients.map(addr)) })],
        ]),
      ]),
      "add_context_rule",
    );
    return { ruleId: (scValToNative(result.returnValue!) as ContextRule).id, hash: result.hash };
  }

  async getRule(ruleId: number): Promise<ContextRule> {
    return readContract<ContextRule>(this.network, { contract: this.smartAccount, method: "get_context_rule", args: [u32(ruleId)] });
  }

  private ruleScVal(ruleId: number): Promise<xdr.ScVal> {
    return readContractScVal(this.network, { contract: this.smartAccount, method: "get_context_rule", args: [u32(ruleId)] });
  }

  async setDailyCap(ruleId: number, dailyCap: bigint): Promise<string> {
    const rule = await this.ruleScVal(ruleId);
    const result = await this.asOwner(this.policies.spendingLimit, "set_spending_limit", [i128(dailyCap), rule, addr(this.smartAccount)]);
    return GuardrailAccount.check(result, "set_spending_limit").hash;
  }

  async setAllowlist(ruleId: number, recipients: string[]): Promise<string> {
    const rule = await this.ruleScVal(ruleId);
    const result = await this.asOwner(this.policies.allowlist, "set_recipients", [
      xdr.ScVal.scvVec(recipients.map(addr)),
      rule,
      addr(this.smartAccount),
    ]);
    return GuardrailAccount.check(result, "set_recipients").hash;
  }

  /** Owner freeze override: removes the agent signer; the rule, policies and spend history stay. */
  async freezeAgent(ruleId: number): Promise<string> {
    const rule = await this.getRule(ruleId);
    if (rule.signer_ids.length === 0) throw new Error(`Rule ${ruleId} is already frozen`);
    if (rule.signer_ids.length !== 1) throw new Error(`Rule ${ruleId} has ${rule.signer_ids.length} signers; expected one agent`);
    const result = await this.asOwner(this.smartAccount, "remove_signer", [u32(ruleId), u32(rule.signer_ids[0])]);
    return GuardrailAccount.check(result, "remove_signer").hash;
  }

  /** Restores the agent signer on its rule. */
  async unfreezeAgent(ruleId: number, agent: Ed25519Signer): Promise<string> {
    const result = await this.asOwner(this.smartAccount, "add_signer", [u32(ruleId), signerToScVal(agent.signer)]);
    return GuardrailAccount.check(result, "add_signer").hash;
  }

  getAgentStatus(ruleId: number): Promise<AgentStatus> {
    return readAgentStatus(this.network, this.smartAccount, this.policies, ruleId);
  }

}
