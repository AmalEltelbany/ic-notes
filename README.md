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
<img width="1920" height="850" alt="Screenshot (45)" src="https://github.com/user-attachments/assets/3a59cac5-cc0f-4bcf-8cc7-2fc292d85830" />
<img width="1920" height="869" alt="Screenshot (50)" src="https://github.com/user-attachments/assets/9d7d53e4-0b32-4f5d-b8ae-a85e3619d1e1" />
<img width="1178" height="393" alt="image" src="https://github.com/user-attachments/assets/e9aa6f77-3f2b-498c-a313-6c9cefdf038d" />
<img width="1920" height="841" alt="Screenshot (52)" src="https://github.com/user-attachments/assets/00ed8c9a-0ea8-4ff8-863a-0c443ae94442" />

