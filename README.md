# ProofPass — Private Accredited Investor Verification

![CI](https://github.com/YOUR_GITHUB_USERNAME/proofpass/actions/workflows/ci.yml/badge.svg)

> Prove you meet SEC accredited investor thresholds — without revealing your income or net worth. Zero-knowledge proofs on Midnight Network.

---

## Live Demo

[https://proofpass-eight.vercel.app](https://proofpass-eight.vercel.app)

## Demo Video

[Watch the MVP demo on Loom](https://www.loom.com/share/71f8b3fbd93141529ea17fc70ce8898e)

---

## Contract Address

| Network | Address |
|---------|---------|
| Preprod | Deployment in progress — contract compiled, wallet funded (5000 tNIGHT at `mn_addr_preprod178jr8skwwt5wh954k2lg8mxldcy8l2vzyumakqkmhk6s65ukqudspd8s3v`), Preprod blockchain sync running. Address will be updated here once the sync completes and `deployContract()` confirms. |

> The Compact contract is **compiled** — all ZK artifacts (prover keys, verifier keys, ZKIR circuits) are in `managed/`. The deploy script uses `deployContract()` from the official Midnight SDK and calls `initialize()` on-chain immediately after.

---

## Level 5 — User Validation

- **Target:** 50 Preprod users
- **Current:** 0 / 50 — [updating as users come in]
- See [USERS.md](USERS.md) for wallet addresses
- See [docs/FEEDBACK.md](docs/FEEDBACK.md) for feedback log and changes made

---

---

## What This Product Does

DeFi investment pools, private sales, and yield vaults are legally required under SEC Rule 501 to restrict access to accredited investors only — individuals with annual income above $200,000 or net worth above $1,000,000. Today, platforms solve this one of two ways: they either ignore the requirement entirely (regulatory risk) or force users to upload government IDs and financial statements to a centralised server (data breach liability). Neither is acceptable.

ProofPass removes both problems. A user enters their income and net worth locally in their browser. A zero-knowledge proof is generated on their device that cryptographically proves the SEC threshold is met. Only the boolean result — accredited or not — is recorded on the Midnight blockchain. The actual financial figures never leave the browser, are never transmitted to any server, and are never written to any chain.

The result is a verifiable, auditable, on-chain accreditation proof that DeFi protocols can query for compliance — with zero personal data exposure. Users get privacy. Protocols get compliance. Nobody gets a data liability.

---

## Privacy Model

| Category | Detail |
|----------|--------|
| **PUBLIC** (on-chain, anyone can verify) | Income threshold ($200,000) · Net worth threshold ($1,000,000) · Total verification count · Nullifier set (one opaque 32-byte commitment per accredited identity — reveals nothing about the identity) |
| **PRIVATE** (private witness, never on-chain) | User's actual annual income · User's actual net worth · Identity secret (32-byte key from wallet's shielded coin public key) |
| **PROVED without revealing** | `income >= $200,000 OR net_worth >= $1,000,000` — the ZK circuit asserts this relation and writes only the nullifier; the financial values themselves are never disclosed |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart contract | Compact (Midnight's ZK contract language) |
| ZK proof system | Built into Midnight's Compact compiler |
| Frontend | React 18 + TypeScript + Vite |
| Wallet | Lace (Midnight DApp Connector) |
| Testing | Vitest (19 passing tests — @midnight-ntwrk/compact-runtime built-ins) |
| CI/CD | GitHub Actions |
| Hosting | Vercel / Netlify |

---

## Prerequisites

- **Lace wallet** — [lace.io](https://www.lace.io/) with Midnight support enabled
- **Node.js v22+** — [nodejs.org](https://nodejs.org/)
- **Docker** — required by Midnight CLI for ZK proof compilation
- **Midnight CLI** — `npm install -g @midnight-ntwrk/midnight-cli`
- **tDUST** — Preprod testnet tokens from the [Midnight faucet](https://faucet.midnight.network)

---

## Setup & Run Locally

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_GITHUB_USERNAME/proofpass.git
cd proofpass

# 2. Install dependencies
npm install

# 3. (Optional) Set contract address for live Preprod network
cp .env.example .env
# Edit .env: VITE_CONTRACT_ADDRESS=mn1abc123...

# 4. Start the development server
npm run dev

# 5. Open http://localhost:5173
```

> Without a contract address in `.env`, the app runs in **simulation mode** — full UI, local state, no blockchain required.

---

## Run Tests

```bash
npm test
```

Expected output:
```
✓ tests/proofpass.test.ts (19 tests)
  ✓ CompactTypeUnsignedInteger (Uint<64>) round-trips SEC thresholds correctly
  ✓ CompactTypeBytes(32) round-trips 32-byte secrets without corruption
  ✓ persistentHash() produces deterministic 32-byte nullifiers (real SDK)
  ✓ persistentHash() produces distinct nullifiers for different secrets
  ✓ persistentHash() is domain-separated (different domains → different nullifiers)
  ✓ initialize() sets correct SEC Rule 501 thresholds and empty nullifier_set
  ✓ prove_accreditation() accredits user with income exactly $200,000 (boundary)
  ✓ prove_accreditation() accredits user with net worth exactly $1,000,000 (boundary)
  ✓ prove_accreditation() accredits user meeting both thresholds
  ✓ prove_accreditation() rejects income $199,999 and net worth $999,999
  ✓ prove_accreditation() rejects income $150k and net worth $500k
  ✓ nullifier stored on-chain is the exact SDK persistentHash output (binding)
  ✓ replay attack rejected: same identity cannot submit twice
  ✓ proof cannot be overwritten: different qualifying amounts, same identity, still rejected
  ✓ three distinct identities get three separate nullifiers (no collision)
  ✓ ledger exposes only nullifier and counter; private witnesses are absent
  ✓ reset_accreditation() removes nullifier, allows re-verification
  ✓ reset_accreditation() removes only the targeted nullifier, others unaffected
  ✓ reset_accreditation() on unknown nullifier is a no-op

Test Files  1 passed (1)
     Tests  19 passed (19)
```

---

## CI/CD

Every push to `main` triggers the GitHub Actions pipeline:

1. Install dependencies (`npm ci`)
2. TypeScript type check (`tsc --noEmit`)
3. Compile Compact contract (`compact compile`)
4. Run all tests (`npm test`)
5. Build frontend (`npm run build`)

See [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

---

## Deploy Contract to Preprod

```bash
# 1. Compile the contract (requires Docker + Midnight CLI)
compact compile contracts/proofpass.compact --output managed/

# 2. Set environment variables
export WALLET_SEED=<64-char-hex-seed>   # funded from https://faucet.midnight.network

# 3. Deploy to Preprod (calls deployContract() + initialize() in one script)
node scripts/deploy.mjs
```

The deploy script:
1. Connects to Midnight Preprod using the official SDK wallet providers
2. Calls `deployContract()` to deploy the compiled contract
3. Immediately calls the `initialize()` circuit to set `income_threshold = $200,000` and `networth_threshold = $1,000,000` on-chain
4. Saves the contract address to `deployment.json`

After deploying, set the contract address in `.env` and redeploy the frontend:

```bash
echo "VITE_CONTRACT_ADDRESS=<address from deployment.json>" >> .env
npm run build
```

---

## Usage Guide

See [docs/USAGE.md](docs/USAGE.md) for a full step-by-step guide written for non-technical users.

---

## Product X Profile

[@ProofPass on X](https://x.com/ProofPass)

---

## Contributing

Pull requests are welcome. For major changes, open an issue first to discuss what you would like to change. Please make sure tests pass before submitting a PR.
