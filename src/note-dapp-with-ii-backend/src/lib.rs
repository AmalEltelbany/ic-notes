use ic_cdk::caller;
use candid::{CandidType, Deserialize, Principal, Nat};
use std::cell::RefCell;
use std::collections::HashMap;
use ic_stable_structures::{StableBTreeMap, DefaultMemoryImpl, memory_manager::{MemoryId, MemoryManager, VirtualMemory}};
use ic_stable_structures::storable::{Bound, Storable};
use std::borrow::Cow;

// Memory management
type Memory = VirtualMemory<DefaultMemoryImpl>;
const NOTES_MEMORY_ID: MemoryId = MemoryId::new(0);
const TRANSACTION_MEMORY_ID: MemoryId = MemoryId::new(1);

thread_local! {
    static MEMORY_MANAGER: RefCell<MemoryManager<DefaultMemoryImpl>> = RefCell::new(
        MemoryManager::init(DefaultMemoryImpl::default())
    );
    static NOTES: RefCell<StableBTreeMap<u64, Note, Memory>> = RefCell::new(
        StableBTreeMap::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(NOTES_MEMORY_ID))
        )
    );
    static TRANSACTION_HISTORY: RefCell<StableBTreeMap<String, TransactionRecord, Memory>> = RefCell::new(
        StableBTreeMap::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(TRANSACTION_MEMORY_ID))
        )
    );
    static ID_COUNTER: RefCell<u64> = RefCell::new(0);
    static BALANCES: RefCell<HashMap<String, u64>> = RefCell::new(HashMap::new());
    static ICRC_LEDGER_CANISTER_ID: RefCell<Option<Principal>> = RefCell::new(None);
}

#[derive(Clone, CandidType, Deserialize)]
struct Note {
    content: String,
    owner: String,
    created_at: u64,
    updated_at: u64,
}

#[derive(Clone, CandidType, Deserialize)]
struct TransactionRecord {
    sender: String,
    receiver: String,
    amount: u64,
    timestamp: u64,
    transaction_id: String,
    transaction_type: TransactionType,
    block_index: Option<u64>, // For ICRC transactions
}

#[derive(Clone, CandidType, Deserialize)]
enum TransactionType {
    Internal, // Our internal token system
    ICRC,     // ICRC ledger transaction
}

#[derive(CandidType, Deserialize)]
enum TransferError {
    BadFee { expected_fee: Nat },
    BadBurn { min_burn_amount: Nat },
    InsufficientFunds { balance: Nat },
    TooOld,
    CreatedInFuture { ledger_time: u64 },
    Duplicate { duplicate_of: Nat },
    TemporarilyUnavailable,
    GenericError { error_code: Nat, message: String },
    // Internal errors
    InsufficientBalance,
    Unauthorized,
    InvalidReceiver,
}

// ICRC-1 types
#[derive(CandidType, Deserialize)]
struct Account {
    owner: Principal,
    subaccount: Option<Vec<u8>>,
}

#[derive(CandidType, Deserialize)]
struct ICRCTransferArgs {
    from_subaccount: Option<Vec<u8>>,
    to: Account,
    amount: Nat,
    fee: Option<Nat>,
    memo: Option<Vec<u8>>,
    created_at_time: Option<u64>,
}

#[derive(CandidType, Deserialize)]
enum TransferResult {
    Ok(Nat), // Block index
    Err(TransferError),
}

// Storable implementations
impl Storable for Note {
    fn to_bytes(&self) -> Cow<[u8]> {
        Cow::Owned(candid::encode_one(self).unwrap())
    }

    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        candid::decode_one(&bytes).unwrap()
    }

    const BOUND: Bound = Bound::Unbounded;
}

impl Storable for TransactionRecord {
    fn to_bytes(&self) -> Cow<[u8]> {
        Cow::Owned(candid::encode_one(self).unwrap())
    }

    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        candid::decode_one(&bytes).unwrap()
    }

    const BOUND: Bound = Bound::Unbounded;
}

// Helper functions
fn get_timestamp() -> u64 {
    ic_cdk::api::time()
}

fn generate_transaction_id(sender: &str, receiver: &str, amount: u64, timestamp: u64) -> String {
    format!("{}-{}-{}-{}", sender, receiver, amount, timestamp)
}

fn ensure_user_balance(principal: &str) {
    BALANCES.with(|balances| {
        let mut balances = balances.borrow_mut();
        if !balances.contains_key(principal) {
            balances.insert(principal.to_string(), 1000); // Give new users 1000 tokens
        }
    });
}

fn is_authenticated() -> bool {
    caller() != Principal::anonymous()
}

// Configuration functions
#[ic_cdk::update]
fn set_icrc_ledger_canister_id(canister_id: Principal) -> Result<(), String> {
    if !is_authenticated() {
        return Err("Unauthorized".to_string());
    }
    
    ICRC_LEDGER_CANISTER_ID.with(|id| {
        *id.borrow_mut() = Some(canister_id);
    });
    
    Ok(())
}

#[ic_cdk::query]
fn get_icrc_ledger_canister_id() -> Option<Principal> {
    ICRC_LEDGER_CANISTER_ID.with(|id| *id.borrow())
}

// Notes functions (using stable memory)
#[ic_cdk::update]
fn add_note(content: String) -> Result<u64, String> {
    if !is_authenticated() {
        return Err("Authentication required".to_string());
    }
    
    let caller_principal = caller().to_text();
    let timestamp = get_timestamp();
    let note = Note {
        content,
        owner: caller_principal,
        created_at: timestamp,
        updated_at: timestamp,
    };
    
    NOTES.with(|notes| {
        ID_COUNTER.with(|id_counter| {
            let mut id = id_counter.borrow_mut();
            let current_id = *id;
            notes.borrow_mut().insert(current_id, note);
            *id += 1;
            Ok(current_id)
        })
    })
}

#[ic_cdk::update]
fn delete_note(id: u64) {
    let caller_principal = caller().to_text();
    NOTES.with(|notes| {
        let mut notes = notes.borrow_mut();
        if let Some(note) = notes.get(&id) {
            if note.owner == caller_principal {
                notes.remove(&id);
            }
        }
    });
}

#[ic_cdk::update]
fn update_note(id: u64, new_content: String) {
    let caller_principal = caller().to_text();
    NOTES.with(|notes| {
        let mut notes = notes.borrow_mut();
        if let Some(mut note) = notes.get(&id) {
            if note.owner == caller_principal {
                note.content = new_content;
                note.updated_at = get_timestamp();
                notes.insert(id, note);
            }
        }
    });
}

#[ic_cdk::query]
fn get_notes() -> Vec<(u64, String)> {
    let caller_principal = caller().to_text();
    NOTES.with(|notes| {
        notes
            .borrow()
            .iter()
            .filter(|(_, note)| note.owner == caller_principal)
            .map(|(id, note)| (id, note.content.clone()))
            .collect()
    })
}

#[ic_cdk::query]
fn search_notes(query: String) -> Vec<(u64, String)> {
    let caller_principal = caller().to_text();
    NOTES.with(|notes| {
        notes
            .borrow()
            .iter()
            .filter(|(_, note)| {
                note.owner == caller_principal && 
                note.content.to_lowercase().contains(&query.to_lowercase())
            })
            .map(|(id, note)| (id, note.content.clone()))
            .collect()
    })
}

// Token functions - Internal token system
#[ic_cdk::query]
fn get_balance() -> u64 {
    if !is_authenticated() {
        return 0;
    }
    
    let caller_principal = caller().to_text();
    ensure_user_balance(&caller_principal);
    
    BALANCES.with(|balances| {
        *balances.borrow().get(&caller_principal).unwrap_or(&0)
    })
}

#[ic_cdk::query]
fn get_balance_of(principal: Principal) -> u64 {
    let principal_text = principal.to_text();
    BALANCES.with(|balances| {
        *balances.borrow().get(&principal_text).unwrap_or(&0)
    })
}

#[ic_cdk::update]
fn transfer(to: Principal, amount: u64) -> Result<String, TransferError> {
    let caller_principal = caller();
    let sender = caller_principal.to_text();
    let receiver = to.to_text();
    
    // Check if user is authenticated (not anonymous)
    if caller_principal == Principal::anonymous() {
        return Err(TransferError::Unauthorized);
    }
    
    // Ensure both users have balances initialized
    ensure_user_balance(&sender);
    ensure_user_balance(&receiver);
    
    // Check if sender has sufficient balance
    let sender_balance = BALANCES.with(|balances| {
        *balances.borrow().get(&sender).unwrap_or(&0)
    });
    
    if sender_balance < amount {
        return Err(TransferError::InsufficientBalance);
    }
    
    // Perform the transfer
    BALANCES.with(|balances| {
        let mut balances = balances.borrow_mut();
        
        // Deduct from sender
        let new_sender_balance = sender_balance - amount;
        balances.insert(sender.clone(), new_sender_balance);
        
        // Add to receiver
        let receiver_balance = *balances.get(&receiver).unwrap_or(&0);
        let new_receiver_balance = receiver_balance + amount;
        balances.insert(receiver.clone(), new_receiver_balance);
    });
    
    // Record the transaction
    let timestamp = get_timestamp();
    let transaction_id = generate_transaction_id(&sender, &receiver, amount, timestamp);
    
    let transaction = TransactionRecord {
        sender: sender.clone(),
        receiver: receiver.clone(),
        amount,
        timestamp,
        transaction_id: transaction_id.clone(),
        transaction_type: TransactionType::Internal,
        block_index: None,
    };
    
    // Store transaction for both sender and receiver
    TRANSACTION_HISTORY.with(|history| {
        let mut history = history.borrow_mut();
        history.insert(format!("{}:{}", sender, transaction_id), transaction.clone());
        history.insert(format!("{}:{}", receiver, transaction_id), transaction);
    });
    
    Ok(transaction_id)
}

// ICRC Token functions
#[ic_cdk::update]
async fn get_icrc_balance() -> Result<Nat, String> {
    if !is_authenticated() {
        return Err("Authentication required".to_string());
    }
    
    let ledger_id = ICRC_LEDGER_CANISTER_ID.with(|id| *id.borrow())
        .ok_or("ICRC ledger canister ID not set")?;
    
    let account = Account {
        owner: caller(),
        subaccount: None,
    };
    
    let balance: Result<(Nat,), _> = ic_cdk::call(ledger_id, "icrc1_balance_of", (account,)).await;
    
    match balance {
        Ok((balance,)) => Ok(balance),
        Err((_, err)) => Err(format!("Failed to get balance: {}", err)),
    }
}

#[ic_cdk::update]
async fn icrc_transfer(to: Principal, amount: u64) -> Result<String, TransferError> {
    if !is_authenticated() {
        return Err(TransferError::Unauthorized);
    }
    
    let ledger_id = ICRC_LEDGER_CANISTER_ID.with(|id| *id.borrow())
        .ok_or(TransferError::GenericError { 
            error_code: Nat::from(1u64), 
            message: "ICRC ledger canister ID not set".to_string() 
        })?;
    
    let transfer_args = ICRCTransferArgs {
        from_subaccount: None,
        to: Account {
            owner: to,
            subaccount: None,
        },
        amount: Nat::from(amount),
        fee: None,
        memo: None,
        created_at_time: Some(get_timestamp()),
    };
    
    let result: Result<(TransferResult,), _> = ic_cdk::call(ledger_id, "icrc1_transfer", (transfer_args,)).await;
    
    match result {
        Ok((TransferResult::Ok(block_index),)) => {
            // Record the transaction
            let timestamp = get_timestamp();
            let sender = caller().to_text();
            let receiver = to.to_text();
            let transaction_id = generate_transaction_id(&sender, &receiver, amount, timestamp);
            
            let transaction = TransactionRecord {
                sender: sender.clone(),
                receiver: receiver.clone(),
                amount,
                timestamp,
                transaction_id: transaction_id.clone(),
                transaction_type: TransactionType::ICRC,
                block_index: Some(block_index.0.try_into().unwrap_or(0)),
            };
            
            // Store transaction for both sender and receiver
            TRANSACTION_HISTORY.with(|history| {
                let mut history = history.borrow_mut();
                history.insert(format!("{}:{}", sender, transaction_id), transaction.clone());
                history.insert(format!("{}:{}", receiver, transaction_id), transaction);
            });
            
            Ok(transaction_id)
        }
        Ok((TransferResult::Err(err),)) => Err(err),
        Err((_, err)) => Err(TransferError::GenericError { 
            error_code: Nat::from(2u64), 
            message: format!("Call failed: {}", err) 
        }),
    }
}

#[ic_cdk::update]
async fn get_icrc_balance_of(principal: Principal) -> Result<Nat, String> {
    let ledger_id = ICRC_LEDGER_CANISTER_ID.with(|id| *id.borrow())
        .ok_or("ICRC ledger canister ID not set")?;
    
    let account = Account {
        owner: principal,
        subaccount: None,
    };
    
    let balance: Result<(Nat,), _> = ic_cdk::call(ledger_id, "icrc1_balance_of", (account,)).await;
    
    match balance {
        Ok((balance,)) => Ok(balance),
        Err((_, err)) => Err(format!("Failed to get balance: {}", err)),
    }
}

// Transaction history functions
#[ic_cdk::query]
fn get_transaction_history() -> Vec<TransactionRecord> {
    if !is_authenticated() {
        return vec![];
    }
    
    let caller_principal = caller().to_text();
    
    TRANSACTION_HISTORY.with(|history| {
        history
            .borrow()
            .iter()
            .filter_map(|(key, transaction)| {
                // Check if this transaction involves the caller
                if key.starts_with(&format!("{}:", caller_principal)) {
                    Some(transaction.clone())
                } else {
                    None
                }
            })
            .collect()
    })
}

#[ic_cdk::query]
fn get_transaction_history_filtered(transaction_type: Option<TransactionType>) -> Vec<TransactionRecord> {
    let caller_principal = caller().to_text();
    
    TRANSACTION_HISTORY.with(|history| {
        history
            .borrow()
            .iter()
            .filter_map(|(key, transaction)| {
                // Check if this transaction involves the caller
                if key.starts_with(&format!("{}:", caller_principal)) {
                    match &transaction_type {
                        Some(filter_type) => {
                            if std::mem::discriminant(&transaction.transaction_type) == std::mem::discriminant(filter_type) {
                                Some(transaction.clone())
                            } else {
                                None
                            }
                        }
                        None => Some(transaction.clone()),
                    }
                } else {
                    None
                }
            })
            .collect()
    })
}

// Administrative functions (for testing)
#[ic_cdk::update]
fn mint_tokens(to: Principal, amount: u64) -> Result<(), String> {
    let to_text = to.to_text();
    ensure_user_balance(&to_text);
    
    BALANCES.with(|balances| {
        let mut balances = balances.borrow_mut();
        let current_balance = *balances.get(&to_text).unwrap_or(&0);
        balances.insert(to_text, current_balance + amount);
    });
    
    Ok(())
}

#[ic_cdk::query]
fn get_all_balances() -> Vec<(String, u64)> {
    BALANCES.with(|balances| {
        balances
            .borrow()
            .iter()
            .map(|(principal, balance)| (principal.clone(), *balance))
            .collect()
    })
}

// System information functions
#[ic_cdk::query]
fn whoami() -> Principal {
    caller()
}

#[ic_cdk::query]
fn is_user_authenticated() -> bool {
    is_authenticated()
}

// Export the candid interface
ic_cdk::export_candid!();