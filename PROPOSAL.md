# Product Proposal — ProofPass: Private Accredited Investor Verification

## Problem

DeFi investment pools, private token sales, and yield vaults are legally required under SEC Rule 501 to restrict access to accredited investors — individuals with annual income above $200,000 or net worth above $1,000,000. Platforms face two bad options:

1. **Ignore compliance** — massive regulatory and legal risk
2. **Collect financial data** — users must upload IDs and financial statements to centralised servers, creating data breach liability and privacy violations

Neither option is acceptable. There is no current solution that achieves compliance without data collection.

## Solution

ProofPass uses Midnight's zero-knowledge proofs to let investors prove they meet the SEC accreditation threshold **without revealing their actual income, net worth, or any personal documents**.

The user enters their figures locally in their browser. A Compact ZK circuit proves:
```
income >= $200,000  OR  net_worth >= $1,000,000
```

Only the boolean result (accredited: true/false) is written on-chain. The financial values are private witnesses — they never leave the user's device.

## Why Midnight

Midnight's Compact language treats private data as a compile-time primitive:

- `witness` functions supply private financial inputs to the ZK circuit
- The compiler enforces that private data can only become public via explicit `disclose()` calls
- Accidental leakage of sensitive values is a **compile-time error**, not a runtime risk

No other blockchain platform enforces privacy at the language level.

## Privacy Model

| | |
|---|---|
| Public on-chain | Income threshold, net worth threshold, verification count, accreditation result |
| Private (never on-chain) | Actual income, actual net worth, financial documents, identity |
| ZK proof guarantees | `income >= $200k OR net_worth >= $1M` without revealing values |

## Real-World Impact

- DeFi protocols achieve SEC compliance without storing any user financial data
- Users retain financial privacy while accessing compliant investment opportunities
- Eliminates the data breach risk that comes with centralised KYC/AML providers

## Tech Stack

- **Contract**: Compact (Midnight) — `contracts/proofpass.compact`
- **Frontend**: React 18 + TypeScript + Vite
- **Wallet**: Lace (Midnight DApp Connector)
- **Tests**: Vitest (10 passing)
- **CI/CD**: GitHub Actions

---

*Approved for Level 4 — Midnight Builder Challenge, Rise In*
