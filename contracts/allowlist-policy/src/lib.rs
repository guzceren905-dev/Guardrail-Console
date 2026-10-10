//! # Recipient Allowlist Policy
//!
//! An OpenZeppelin smart-account policy that only lets a context rule
//! authorize SEP-41 `transfer(from, to, amount)` calls whose `to` is on a
//! per-rule allowlist. It is meant to sit next to OpenZeppelin's
//! spending-limit policy on the agent's USDC context rule.
//!
//! OpenZeppelin does not ship a recipient allowlist policy, so this contract
//! is custom and NOT audited. It mirrors the structure of OpenZeppelin's
//! `spending_limit` policy and implements the same `Policy` trait.
#![no_std]

use soroban_sdk::{
    auth::{Context, ContractContext},
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error,
    symbol_short, Address, Env, TryFromVal, Vec,
};
use stellar_accounts::{
    policies::Policy,
    smart_account::{ContextRule, ContextRuleType, Signer},
};

#[cfg(test)]
mod test;

const DAY_IN_LEDGERS: u32 = 17280;
pub const ALLOWLIST_EXTEND_AMOUNT: u32 = 30 * DAY_IN_LEDGERS;
pub const ALLOWLIST_TTL_THRESHOLD: u32 = ALLOWLIST_EXTEND_AMOUNT - DAY_IN_LEDGERS;

/// Upper bound on recipients per rule, to keep `enforce` cheap.
pub const MAX_RECIPIENTS: u32 = 20;

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq)]
#[repr(u32)]
pub enum AllowlistError {
    /// The policy is not installed for this smart account and context rule.
    SmartAccountNotInstalled = 3300,
    /// The policy is already installed for this smart account and context rule.
    AlreadyInstalled = 3301,
    /// No authenticated signer, or the call is not a well-formed `transfer`.
    NotAllowed = 3302,
    /// The transfer recipient is not on the allowlist.
    RecipientNotAllowed = 3303,
    /// Only the `CallContract` context rule type is allowed.
    OnlyCallContractAllowed = 3304,
    /// The recipient list is empty, too long, or contains duplicates.
    InvalidRecipients = 3305,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct AllowlistAccountParams {
    pub recipients: Vec<Address>,
}

#[contracttype]
pub enum AllowlistStorageKey {
    AccountContext(Address, u32),
}

#[contractevent]
#[derive(Clone, Debug)]
pub struct AllowlistInstalled {
    #[topic]
    pub smart_account: Address,
    pub context_rule_id: u32,
    pub recipients: Vec<Address>,
}

#[contractevent]
#[derive(Clone, Debug)]
pub struct AllowlistChanged {
    #[topic]
    pub smart_account: Address,
    pub context_rule_id: u32,
    pub recipients: Vec<Address>,
}

#[contractevent]
#[derive(Clone, Debug)]
pub struct AllowlistUninstalled {
    #[topic]
    pub smart_account: Address,
    pub context_rule_id: u32,
}

fn validate_recipients(e: &Env, recipients: &Vec<Address>) {
    if recipients.is_empty() || recipients.len() > MAX_RECIPIENTS {
        panic_with_error!(e, AllowlistError::InvalidRecipients)
    }
    for (i, recipient) in recipients.iter().enumerate() {
        if recipients.first_index_of(&recipient) != Some(i as u32) {
            panic_with_error!(e, AllowlistError::InvalidRecipients)
        }
    }
}

fn get_recipients(e: &Env, context_rule_id: u32, smart_account: &Address) -> Vec<Address> {
    let key = AllowlistStorageKey::AccountContext(smart_account.clone(), context_rule_id);
    e.storage()
        .persistent()
        .get(&key)
        .inspect(|_: &Vec<Address>| {
            e.storage().persistent().extend_ttl(
                &key,
                ALLOWLIST_TTL_THRESHOLD,
                ALLOWLIST_EXTEND_AMOUNT,
            );
        })
        .unwrap_or_else(|| panic_with_error!(e, AllowlistError::SmartAccountNotInstalled))
}

#[contract]
pub struct AllowlistPolicyContract;

#[contractimpl]
impl Policy for AllowlistPolicyContract {
    type AccountParams = AllowlistAccountParams;

    /// Rejects the call unless it is a `transfer` to an allowlisted recipient,
    /// authorized by at least one signer of the rule.
    fn enforce(
        e: &Env,
        context: Context,
        authenticated_signers: Vec<Signer>,
        context_rule: ContextRule,
        smart_account: Address,
    ) {
        smart_account.require_auth();

        if authenticated_signers.is_empty() {
            panic_with_error!(e, AllowlistError::NotAllowed)
        }

        let recipients = get_recipients(e, context_rule.id, &smart_account);

        if let Context::Contract(ContractContext { fn_name, args, .. }) = context {
            if fn_name == symbol_short!("transfer") {
                if let Some(to_val) = args.get(1) {
                    if let Ok(to) = Address::try_from_val(e, &to_val) {
                        if recipients.contains(&to) {
                            return;
                        }
                        panic_with_error!(e, AllowlistError::RecipientNotAllowed)
                    }
                }
            }
        }
        panic_with_error!(e, AllowlistError::NotAllowed)
    }

    fn install(
        e: &Env,
        install_params: Self::AccountParams,
        context_rule: ContextRule,
        smart_account: Address,
    ) {
        smart_account.require_auth();

        if !matches!(context_rule.context_type, ContextRuleType::CallContract(_)) {
            panic_with_error!(e, AllowlistError::OnlyCallContractAllowed)
        }
        validate_recipients(e, &install_params.recipients);

        let key = AllowlistStorageKey::AccountContext(smart_account.clone(), context_rule.id);
        if e.storage().persistent().has(&key) {
            panic_with_error!(e, AllowlistError::AlreadyInstalled)
        }
        e.storage().persistent().set(&key, &install_params.recipients);

        AllowlistInstalled {
            smart_account,
            context_rule_id: context_rule.id,
            recipients: install_params.recipients,
        }
        .publish(e);
    }

    fn uninstall(e: &Env, context_rule: ContextRule, smart_account: Address) {
        smart_account.require_auth();

        let key = AllowlistStorageKey::AccountContext(smart_account.clone(), context_rule.id);
        if !e.storage().persistent().has(&key) {
            panic_with_error!(e, AllowlistError::SmartAccountNotInstalled)
        }
        e.storage().persistent().remove(&key);

        AllowlistUninstalled { smart_account, context_rule_id: context_rule.id }.publish(e);
    }
}

#[contractimpl]
impl AllowlistPolicyContract {
    /// Returns the allowlisted recipients for a smart account's context rule.
    pub fn get_recipients(e: Env, context_rule_id: u32, smart_account: Address) -> Vec<Address> {
        get_recipients(&e, context_rule_id, &smart_account)
    }

    /// Replaces the allowlist. Requires authorization from the smart account.
    pub fn set_recipients(
        e: Env,
        recipients: Vec<Address>,
        context_rule: ContextRule,
        smart_account: Address,
    ) {
        smart_account.require_auth();

        let key = AllowlistStorageKey::AccountContext(smart_account.clone(), context_rule.id);
        if !e.storage().persistent().has(&key) {
            panic_with_error!(&e, AllowlistError::SmartAccountNotInstalled)
        }
        validate_recipients(&e, &recipients);
        e.storage().persistent().set(&key, &recipients);

        AllowlistChanged { smart_account, context_rule_id: context_rule.id, recipients }
            .publish(&e);
    }
}
