# 📝 IC Notes – A Decentralized Note-taking App on ICP

IC Notes is a full-stack DApp built on the [Internet Computer Protocol (ICP)](https://internetcomputer.org). Users can **write personal notes**, **authenticate using Internet Identity**, and **send/receive tokens** using both an internal system and the ICRC-1 ledger.

---

## 📦 What’s Inside?

### 🔙 Backend (Rust)

The backend is a **Rust canister** that manages:

- 🧾 Notes:
  - Users can create, edit, delete, and search notes.
  - Notes are stored in stable memory (`StableBTreeMap`) so they persist even after upgrades.

- 🔐 Authentication:
  - Uses `ic_cdk::caller()` to ensure only the authenticated user can access or edit their notes.

- 🪙 Internal Tokens:
  - Each new user gets 1000 tokens by default.
  - You can send internal tokens to other users (by Principal).

- 💎 ICRC-1 Token Integration:
  - Supports real ICRC token transfers using the `icrc1_transfer` method.
  - Can call into a deployed ICRC ledger canister to get balances or send tokens.

- 📜 Transaction History:
  - Saves transfer history of both internal and ICRC transactions.

> Everything is stored in **stable memory**, using `ic-stable-structures`.

---

### 🖥️ Frontend (React + Internet Identity)

The frontend runs in the browser and:

- Uses **@dfinity/auth-client** to log in with Internet Identity.
- Displays:
  - Logged-in user's Principal ID
  - ICRC and internal balances
  - Notes (with ability to search, add, edit, delete)
  - Token transfer forms (internal + ICRC)
  - Transaction history

---


