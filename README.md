# ProofPass — Private Accredited Investor Verification

![CI](https://github.com/YOUR_GITHUB_USERNAME/proofpass/actions/workflows/ci.yml/badge.svg)

> Prove you meet SEC accredited investor thresholds — without revealing your income or net worth. Zero-knowledge proofs on Midnight Network.

---

## Live Demo

[https://proofpass-eight.vercel.app](https://proofpass-eight.vercel.app)

---

## Contract Address

| Network | Address |
|---------|---------|
| Preprod | Deployment pending — Midnight registry unreachable from current network. Contract code is complete at `contracts/proofpass.compact`. Demo runs in simulation mode at the live URL above. |

---

## What This Product Does

DeFi investment pools, private sales, and yield vaults are legally required under SEC Rule 501 to restrict access to accredited investors only — individuals with annual income above $200,000 or net worth above $1,000,000. Today, platforms solve this one of two ways: they either ignore the requirement entirely (regulatory risk) or force users to upload government IDs and financial statements to a centralised server (data breach liability). Neither is acceptable.

ProofPass removes both problems. A user enters their income and net worth locally in their browser. A zero-knowledge proof is generated on their device that cryptographically proves the SEC threshold is met. Only the boolean result — accredited or not — is recorded on the Midnight blockchain. The actual financial figures never leave the browser, are never transmitted to any server, and are never written to any chain.

The result is a verifiable, auditable, on-chain accreditation proof that DeFi protocols can query for compliance — with zero personal data exposure. Users get privacy. Protocols get compliance. Nobody gets a data liability.

---

## Privacy Model

| Category | Detail |
|----------|--------|
| **PUBLIC** (on-chain, anyone can verify) | Income threshold ($200,000) · Net worth threshold ($1,000,000) · Total verification count · Accreditation result (true/false) |
| **PRIVATE** (private witness, never on-chain) | User's actual annual income · User's actual net worth · Any financial documents or identity data |
| **PROVED without revealing** | `income >= $200,000 OR net_worth >= $1,000,000` — the ZK circuit asserts this relation; the values themselves are never disclosed |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart contract | Compact (Midnight's ZK contract language) |
| ZK proof system | Built into Midnight's Compact compiler |
| Frontend | React 18 + TypeScript + Vite |
| Wallet | Lace (Midnight DApp Connector) |
| Testing | Vitest (10 passing tests) |
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
✓ tests/proofpass.test.ts (10 tests)
  ✓ initializes with correct SEC thresholds and default state
  ✓ accredits a user with income exactly $200,000 (boundary)
  ✓ accredits a user with net worth exactly $1,000,000 (boundary)
  ✓ accredits a user who meets both income and net worth thresholds
  ✓ rejects a user with income $150k and net worth $500k
  ✓ increments total_verifications with each successful proof
  ✓ resets is_accredited flag without changing total_verifications
  ✓ never exposes user_income or user_net_worth in ledger state
  ✓ accredits a user with income $1M and net worth $0
  ✓ rejects a user with income $199,999 and net worth $999,999

Test Files  1 passed (1)
     Tests  10 passed (10)
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
# 1. Compile the contract
compact compile contracts/proofpass.compact --output managed/

# 2. Deploy to Preprod
midnight deploy \
  --network preprod \
  --contract managed/proofpass \
  --init-circuit initialize \
  --init-args 200000 1000000
```

After deploying, paste the contract address into `.env` and the Contract Address table above.

---

## Usage Guide

See [docs/USAGE.md](docs/USAGE.md) for a full step-by-step guide written for non-technical users.

---

## Product X Profile

[PLACEHOLDER — add your product X (Twitter) profile link here after creating the account]

---

## Contributing

Pull requests are welcome. For major changes, open an issue first to discuss what you would like to change. Please make sure tests pass before submitting a PR.
