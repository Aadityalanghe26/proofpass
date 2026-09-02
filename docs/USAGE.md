# How to Use ProofPass

ProofPass lets you prove you are an accredited investor under SEC Rule 501 — without revealing your actual income or net worth to anyone. A zero-knowledge proof is generated on your device and recorded on the Midnight blockchain. Only the result (accredited or not) is ever public.

---

## What You Need

- **Lace wallet** — browser extension with Midnight support ([download here](https://www.lace.io/))
- **tDUST** — Preprod testnet tokens for transaction fees (free from the [Midnight faucet](https://faucet.midnight.network))
- **Modern browser** — Chrome or Firefox recommended
- **Your financial figures** — annual income and/or net worth in USD (used locally only, never transmitted)

No account, no sign-up, no document upload required.

---

## Step-by-Step Guide

1. **Open the app**
   Navigate to the live demo URL in your browser.

2. **Connect your Lace wallet**
   Click **Connect Lace Wallet**. A Lace popup will appear — click **Approve**.
   Your wallet address will appear once connected.

3. **Enter your financial data**
   In the "Prove Accreditation" section you will see two fields:
   - **Annual Income (USD)** — enter your yearly income before tax
   - **Net Worth (USD)** — enter your total net worth (assets minus liabilities)

   You only need to fill in one field if it meets the threshold on its own. Both fields are processed locally — nothing is sent anywhere.

4. **Click "Prove Accreditation"**
   The app generates a zero-knowledge proof on your device. This takes a few seconds. A spinner will show while it works.

5. **Approve the transaction in Lace**
   A Lace popup asks you to sign and submit the proof transaction to Midnight Preprod. Click **Confirm**. This uses a tiny amount of tDUST for the network fee.

6. **See your result**
   Once confirmed on-chain:
   - ✅ **Accredited** — your proof passed. The blockchain records that someone met the threshold. Your actual figures are never stored anywhere.
   - ✗ **Not accredited** — your figures did not meet either threshold. Nothing was submitted on-chain.

7. **Start a new session (optional)**
   Click **Start New Session** to reset and prove again.

---

## What Gets Proved (and What Stays Private)

| | Detail |
|---|---|
| **Public on-chain** | Income threshold ($200,000), net worth threshold ($1,000,000), total proof count, your accreditation result |
| **Private — never leaves your device** | Your actual income, your actual net worth, any financial documents |
| **What the ZK proof guarantees** | `income >= $200,000 OR net_worth >= $1,000,000` — proven cryptographically without the values being disclosed |

The SEC threshold enforced:
- Annual income ≥ $200,000 (or $300,000 joint with spouse), **OR**
- Net worth ≥ $1,000,000 (excluding primary residence)

---

## Troubleshooting

**"Lace wallet not found"**
→ Install the Lace extension from [lace.io](https://www.lace.io/) and enable Midnight support in Lace settings. Then refresh the page.

**"Transaction failed" or spinner never stops**
→ Check your tDUST balance in Lace. If it is zero, visit the [Midnight faucet](https://faucet.midnight.network) to top up, wait 1–2 minutes, then try again.

**"Does not meet accredited investor threshold"**
→ Your entered figures are below both thresholds ($200k income and $1M net worth). This is a local rejection — no transaction was submitted and no data was recorded.

**Proof takes a long time**
→ ZK proof generation can take 15–40 seconds on slower devices. Do not refresh the page — wait for it to complete.

**The app shows a blank page**
→ Hard-refresh (Ctrl+Shift+R or Cmd+Shift+R). If it persists, open DevTools (F12) → Console and check for errors, then open an issue on GitHub.
