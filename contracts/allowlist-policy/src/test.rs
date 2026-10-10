extern crate std;

use soroban_sdk::{
    auth::{Context, ContractContext},
    symbol_short, testutils::Address as _, vec, Address, Env, IntoVal, String, Symbol, Vec,
};
use stellar_accounts::smart_account::{ContextRule, ContextRuleType, Signer};

use crate::{AllowlistAccountParams, AllowlistPolicyContract, AllowlistPolicyContractClient};

struct Setup {
    e: Env,
    client: AllowlistPolicyContractClient<'static>,
    smart_account: Address,
    token: Address,
    agent: Address,
    allowed: Address,
    rule: ContextRule,
}

fn rule(e: &Env, context_type: ContextRuleType, agent: &Address, policy: &Address) -> ContextRule {
    ContextRule {
        id: 1,
        context_type,
        name: String::from_str(e, "agent-usdc"),
        signers: vec![e, Signer::Delegated(agent.clone())],
        signer_ids: vec![e, 1],
        policies: vec![e, policy.clone()],
        policy_ids: vec![e, 1],
        valid_until: None,
    }
}

fn setup() -> Setup {
    let e = Env::default();
    e.mock_all_auths();
    let policy = e.register(AllowlistPolicyContract, ());
    let client = AllowlistPolicyContractClient::new(&e, &policy);
    let smart_account = Address::generate(&e);
    let token = Address::generate(&e);
    let agent = Address::generate(&e);
    let allowed = Address::generate(&e);
    let rule = rule(&e, ContextRuleType::CallContract(token.clone()), &agent, &policy);

    client.install(
        &AllowlistAccountParams { recipients: vec![&e, allowed.clone()] },
        &rule,
        &smart_account,
    );
    Setup { e, client, smart_account, token, agent, allowed, rule }
}

fn call(s: &Setup, fn_name: Symbol, to: &Address) -> Context {
    Context::Contract(ContractContext {
        contract: s.token.clone(),
        fn_name,
        args: (s.smart_account.clone(), to.clone(), 1_000_000i128).into_val(&s.e),
    })
}

fn signers(s: &Setup) -> Vec<Signer> {
    vec![&s.e, Signer::Delegated(s.agent.clone())]
}

#[test]
fn allows_transfer_to_allowlisted_recipient() {
    let s = setup();
    let ctx = call(&s, symbol_short!("transfer"), &s.allowed);
    s.client.enforce(&ctx, &signers(&s), &s.rule, &s.smart_account);
}

#[test]
#[should_panic(expected = "Error(Contract, #3303)")]
fn rejects_transfer_to_other_recipient() {
    let s = setup();
    let other = Address::generate(&s.e);
    let ctx = call(&s, symbol_short!("transfer"), &other);
    s.client.enforce(&ctx, &signers(&s), &s.rule, &s.smart_account);
}

#[test]
#[should_panic(expected = "Error(Contract, #3302)")]
fn rejects_without_authenticated_signers() {
    let s = setup();
    let ctx = call(&s, symbol_short!("transfer"), &s.allowed);
    s.client.enforce(&ctx, &Vec::new(&s.e), &s.rule, &s.smart_account);
}

#[test]
#[should_panic(expected = "Error(Contract, #3302)")]
fn rejects_non_transfer_calls() {
    let s = setup();
    let ctx = call(&s, symbol_short!("approve"), &s.allowed);
    s.client.enforce(&ctx, &signers(&s), &s.rule, &s.smart_account);
}

#[test]
#[should_panic(expected = "Error(Contract, #3304)")]
fn install_rejects_default_rule() {
    let s = setup();
    let default_rule = rule(&s.e, ContextRuleType::Default, &s.agent, &s.client.address);
    s.client.install(
        &AllowlistAccountParams { recipients: vec![&s.e, s.allowed.clone()] },
        &default_rule,
        &Address::generate(&s.e),
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #3301)")]
fn install_twice_fails() {
    let s = setup();
    s.client.install(
        &AllowlistAccountParams { recipients: vec![&s.e, s.allowed.clone()] },
        &s.rule,
        &s.smart_account,
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #3305)")]
fn rejects_duplicate_recipients() {
    let s = setup();
    s.client.set_recipients(
        &vec![&s.e, s.allowed.clone(), s.allowed.clone()],
        &s.rule,
        &s.smart_account,
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #3305)")]
fn rejects_empty_recipients() {
    let s = setup();
    s.client.set_recipients(&Vec::new(&s.e), &s.rule, &s.smart_account);
}

#[test]
fn set_recipients_replaces_allowlist() {
    let s = setup();
    let new_recipient = Address::generate(&s.e);
    s.client.set_recipients(&vec![&s.e, new_recipient.clone()], &s.rule, &s.smart_account);

    assert_eq!(s.client.get_recipients(&1, &s.smart_account), vec![&s.e, new_recipient.clone()]);
    let ctx = call(&s, symbol_short!("transfer"), &new_recipient);
    s.client.enforce(&ctx, &signers(&s), &s.rule, &s.smart_account);
    let old = call(&s, symbol_short!("transfer"), &s.allowed);
    assert!(s.client.try_enforce(&old, &signers(&s), &s.rule, &s.smart_account).is_err());
}

#[test]
#[should_panic(expected = "Error(Contract, #3300)")]
fn enforce_fails_after_uninstall() {
    let s = setup();
    s.client.uninstall(&s.rule, &s.smart_account);
    let ctx = call(&s, symbol_short!("transfer"), &s.allowed);
    s.client.enforce(&ctx, &signers(&s), &s.rule, &s.smart_account);
}
