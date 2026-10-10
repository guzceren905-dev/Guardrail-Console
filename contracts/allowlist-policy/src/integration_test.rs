//! Integration tests: the allowlist policy and OZ's spending-limit policy
//! attached to a real OZ smart account (same storage/auth code as the
//! deployed `multisig-account-example`), exercised through `__check_auth`.
extern crate std;

use soroban_sdk::{
    auth::{Context, ContractContext, CustomAccountInterface},
    contract, contractimpl,
    crypto::Hash,
    map, symbol_short,
    testutils::{Address as _, Ledger},
    vec, Address, BytesN, Env, IntoVal, Map, String, Symbol, Val, Vec,
};
use stellar_accounts::{
    policies::{spending_limit, Policy},
    smart_account::{
        self, AuthPayload, ContextRule, ContextRuleType, Signer, SmartAccount, SmartAccountError,
    },
};

use crate::{AllowlistAccountParams, AllowlistPolicyContract, AllowlistPolicyContractClient};

// ---- Test doubles mirroring the deployed OZ example contracts ----

#[contract]
struct TestSmartAccount;

#[contractimpl]
impl TestSmartAccount {
    pub fn __constructor(e: &Env, signers: Vec<Signer>, policies: Map<Address, Val>) {
        smart_account::add_context_rule(
            e,
            &ContextRuleType::Default,
            &String::from_str(e, "owner"),
            None,
            &signers,
            &policies,
        );
    }
}

#[contractimpl]
impl CustomAccountInterface for TestSmartAccount {
    type Error = SmartAccountError;
    type Signature = AuthPayload;

    fn __check_auth(
        e: Env,
        signature_payload: Hash<32>,
        signatures: AuthPayload,
        auth_contexts: Vec<Context>,
    ) -> Result<(), Self::Error> {
        smart_account::do_check_auth(&e, &signature_payload, &signatures, &auth_contexts)
    }
}

#[contractimpl(contracttrait)]
impl SmartAccount for TestSmartAccount {}

#[contract]
struct TestSpendingLimitPolicy;

#[contractimpl]
impl Policy for TestSpendingLimitPolicy {
    type AccountParams = spending_limit::SpendingLimitAccountParams;

    fn enforce(e: &Env, context: Context, signers: Vec<Signer>, rule: ContextRule, account: Address) {
        spending_limit::enforce(e, &context, &signers, &rule, &account)
    }

    fn install(e: &Env, params: Self::AccountParams, rule: ContextRule, account: Address) {
        spending_limit::install(e, &params, &rule, &account)
    }

    fn uninstall(e: &Env, rule: ContextRule, account: Address) {
        spending_limit::uninstall(e, &rule, &account)
    }
}

#[contractimpl]
impl TestSpendingLimitPolicy {
    pub fn total_spent(e: Env, context_rule_id: u32, account: Address) -> i128 {
        spending_limit::get_spending_limit_data(&e, context_rule_id, &account).cached_total_spent
    }
}

// ---- Fixture ----

const USDC: i128 = 10_000_000;
const DAILY_CAP: i128 = 10 * USDC;
const DAY_IN_LEDGERS: u32 = 17280;
const OWNER_RULE: u32 = 0;
const AGENT_RULE: u32 = 1;

struct Setup {
    e: Env,
    account: Address,
    account_client: TestSmartAccountClient<'static>,
    spending: TestSpendingLimitPolicyClient<'static>,
    allowlist: AllowlistPolicyContractClient<'static>,
    usdc: Address,
    owner: Signer,
    agent: Signer,
    merchant: Address,
}

fn setup() -> Setup {
    let e = Env::default();
    e.ledger().with_mut(|l| l.sequence_number = 1_000);
    // Mocks the Delegated signers' require_auth and the owner's admin calls.
    // `__check_auth` itself always runs for real via try_invoke_contract_check_auth.
    e.mock_all_auths_allowing_non_root_auth();

    let owner = Signer::Delegated(Address::generate(&e));
    let agent = Signer::Delegated(Address::generate(&e));
    let usdc = Address::generate(&e);
    let merchant = Address::generate(&e);

    let spending_id = e.register(TestSpendingLimitPolicy, ());
    let allowlist_id = e.register(AllowlistPolicyContract, ());
    let account = e.register(
        TestSmartAccount,
        (vec![&e, owner.clone()], Map::<Address, Val>::new(&e)),
    );
    let account_client = TestSmartAccountClient::new(&e, &account);

    let policies: Map<Address, Val> = map![
        &e,
        (
            spending_id.clone(),
            spending_limit::SpendingLimitAccountParams {
                spending_limit: DAILY_CAP,
                period_ledgers: DAY_IN_LEDGERS,
            }
            .into_val(&e)
        ),
        (
            allowlist_id.clone(),
            AllowlistAccountParams { recipients: vec![&e, merchant.clone()] }.into_val(&e)
        )
    ];
    let rule = account_client.add_context_rule(
        &ContextRuleType::CallContract(usdc.clone()),
        &String::from_str(&e, "agent-usdc"),
        &None,
        &vec![&e, agent.clone()],
        &policies,
    );
    assert_eq!(rule.id, AGENT_RULE);

    Setup {
        account_client,
        spending: TestSpendingLimitPolicyClient::new(&e, &spending_id),
        allowlist: AllowlistPolicyContractClient::new(&e, &allowlist_id),
        e,
        account,
        usdc,
        owner,
        agent,
        merchant,
    }
}

impl Setup {
    fn call(&self, contract: &Address, fn_name: Symbol, args: Vec<Val>) -> Context {
        Context::Contract(ContractContext { contract: contract.clone(), fn_name, args })
    }

    fn transfer(&self, to: &Address, amount: i128) -> Context {
        self.call(
            &self.usdc,
            symbol_short!("transfer"),
            (self.account.clone(), to.clone(), amount).into_val(&self.e),
        )
    }

    /// Runs the smart account's real `__check_auth` and returns the contract error code, if any.
    fn check_auth(&self, signer: &Signer, rule_ids: &[u32], contexts: &[Context]) -> Result<(), u32> {
        let e = &self.e;
        let payload = AuthPayload {
            signers: map![e, (signer.clone(), soroban_sdk::Bytes::new(e))],
            context_rule_ids: Vec::from_slice(e, rule_ids),
        };
        let hash: BytesN<32> = BytesN::from_array(e, &[7; 32]);
        e.try_invoke_contract_check_auth::<soroban_sdk::Error>(
            &self.account,
            &hash,
            payload.into_val(e),
            &Vec::from_slice(e, contexts),
        )
        .map_err(|err| match err {
            Ok(error) => error.get_code(),
            Err(invoke) => panic!("unexpected invoke error: {invoke:?}"),
        })
    }

    fn agent_pays(&self, to: &Address, amount: i128) -> Result<(), u32> {
        self.check_auth(&self.agent, &[AGENT_RULE], &[self.transfer(to, amount)])
    }

    fn agent_signer_id(&self) -> u32 {
        self.account_client.get_context_rule(&AGENT_RULE).signer_ids.get_unchecked(0)
    }
}

// ---- Allowed path ----

#[test]
fn agent_pays_allowlisted_recipient_within_cap() {
    let s = setup();
    assert_eq!(s.agent_pays(&s.merchant, 3 * USDC), Ok(()));
    assert_eq!(s.spending.total_spent(&AGENT_RULE, &s.account), 3 * USDC);
}

#[test]
fn agent_can_spend_exactly_the_cap() {
    let s = setup();
    assert_eq!(s.agent_pays(&s.merchant, DAILY_CAP), Ok(()));
}

// ---- Allowlist ----

#[test]
fn agent_cannot_pay_non_allowlisted_recipient() {
    let s = setup();
    let stranger = Address::generate(&s.e);
    assert_eq!(s.agent_pays(&stranger, USDC), Err(3303));
}

#[test]
fn rejected_payment_does_not_count_towards_cap() {
    let s = setup();
    let stranger = Address::generate(&s.e);
    assert!(s.agent_pays(&stranger, 5 * USDC).is_err());
    assert_eq!(s.agent_pays(&s.merchant, DAILY_CAP), Ok(()));
}

#[test]
fn owner_can_update_allowlist() {
    let s = setup();
    let new_merchant = Address::generate(&s.e);
    let rule = s.account_client.get_context_rule(&AGENT_RULE);
    s.allowlist.set_recipients(&vec![&s.e, new_merchant.clone()], &rule, &s.account);

    assert_eq!(s.agent_pays(&new_merchant, USDC), Ok(()));
    assert_eq!(s.agent_pays(&s.merchant, USDC), Err(3303));
}

// ---- Daily cap ----

#[test]
fn agent_cannot_exceed_cap_in_one_payment() {
    let s = setup();
    assert_eq!(s.agent_pays(&s.merchant, DAILY_CAP + 1), Err(3221));
}

#[test]
fn agent_cannot_exceed_cap_across_payments() {
    let s = setup();
    assert_eq!(s.agent_pays(&s.merchant, 9 * USDC), Ok(()));
    assert_eq!(s.agent_pays(&s.merchant, 2 * USDC), Err(3221));
}

#[test]
fn agent_cannot_exceed_cap_in_one_batched_authorization() {
    let s = setup();
    let half = s.transfer(&s.merchant, 6 * USDC);
    assert_eq!(s.check_auth(&s.agent, &[AGENT_RULE, AGENT_RULE], &[half.clone(), half]), Err(3221));
}

#[test]
fn cap_window_rolls_after_a_day() {
    let s = setup();
    assert_eq!(s.agent_pays(&s.merchant, 9 * USDC), Ok(()));
    assert_eq!(s.agent_pays(&s.merchant, 2 * USDC), Err(3221));

    s.e.ledger().with_mut(|l| l.sequence_number += DAY_IN_LEDGERS);
    assert_eq!(s.agent_pays(&s.merchant, 2 * USDC), Ok(()));
}

// ---- Owner freeze ----

#[test]
fn frozen_agent_cannot_pay_and_unfreeze_keeps_spend_history() {
    let s = setup();
    assert_eq!(s.agent_pays(&s.merchant, 4 * USDC), Ok(()));

    // Freeze: owner removes the agent signer from the rule.
    s.account_client.remove_signer(&AGENT_RULE, &s.agent_signer_id());
    assert_eq!(s.agent_pays(&s.merchant, USDC), Err(SmartAccountError::UnauthorizedSigner as u32));

    // Unfreeze: same rule, same policies, same spend history.
    s.account_client.add_signer(&AGENT_RULE, &s.agent);
    assert_eq!(s.spending.total_spent(&AGENT_RULE, &s.account), 4 * USDC);
    assert_eq!(s.agent_pays(&s.merchant, 6 * USDC), Ok(()));
    assert_eq!(s.agent_pays(&s.merchant, 1), Err(3221));
}

// ---- Privilege boundaries ----

#[test]
fn agent_cannot_use_owner_rule() {
    let s = setup();
    let payment = s.transfer(&Address::generate(&s.e), 50 * USDC);
    assert_eq!(s.check_auth(&s.agent, &[OWNER_RULE], &[payment]), Err(SmartAccountError::UnvalidatedContext as u32));
}

#[test]
fn agent_cannot_call_other_contracts() {
    let s = setup();
    let other_token = Address::generate(&s.e);
    let ctx = s.call(&other_token, symbol_short!("transfer"), (s.account.clone(), s.merchant.clone(), USDC).into_val(&s.e));
    assert_eq!(s.check_auth(&s.agent, &[AGENT_RULE], &[ctx]), Err(SmartAccountError::UnvalidatedContext as u32));
}

#[test]
fn agent_cannot_call_non_transfer_functions_on_usdc() {
    let s = setup();
    let ctx = s.call(
        &s.usdc,
        symbol_short!("approve"),
        (s.account.clone(), s.merchant.clone(), 100 * USDC, 10_000u32).into_val(&s.e),
    );
    let err = s.check_auth(&s.agent, &[AGENT_RULE], &[ctx]).unwrap_err();
    assert!(err == 3223 || err == 3302, "unexpected error {err}"); // spending-limit or allowlist NotAllowed
}

#[test]
fn agent_cannot_change_its_own_rule_or_allowlist() {
    let s = setup();
    let add_signer = s.call(
        &s.account,
        Symbol::new(&s.e, "add_signer"),
        (AGENT_RULE, Signer::Delegated(Address::generate(&s.e))).into_val(&s.e),
    );
    assert_eq!(s.check_auth(&s.agent, &[AGENT_RULE], &[add_signer]), Err(SmartAccountError::UnvalidatedContext as u32));

    let set_recipients = s.call(&s.allowlist.address, Symbol::new(&s.e, "set_recipients"), Vec::new(&s.e));
    assert_eq!(s.check_auth(&s.agent, &[AGENT_RULE], &[set_recipients]), Err(SmartAccountError::UnvalidatedContext as u32));
}

#[test]
fn owner_rule_is_unrestricted() {
    let s = setup();
    let payment = s.transfer(&Address::generate(&s.e), 50 * USDC);
    assert_eq!(s.check_auth(&s.owner, &[OWNER_RULE], &[payment]), Ok(()));
}
