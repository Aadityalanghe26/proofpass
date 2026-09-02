import React, { useState } from 'react';
import Layout from './components/Layout';
import WalletConnect from './components/WalletConnect';
import InvestorGate from './components/InvestorGate';
import './styles.css';

const App: React.FC = () => {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  return (
    <Layout>
      <div className="app-container">

        {/* Hero */}
        <section className="hero" aria-labelledby="hero-heading">
          <h1 id="hero-heading">
            <span aria-hidden="true">🛡️ </span>ProofPass
          </h1>
          <p className="hero-subtitle">
            Prove you're an accredited investor — without revealing your income or net worth.
            <br />
            Powered by zero-knowledge proofs on{' '}
            <a href="https://midnight.network" target="_blank" rel="noopener noreferrer">
              Midnight Network
            </a>.
          </p>
          <div className="hero-badges">
            <span className="badge">SEC Rule 501 Compliant</span>
            <span className="badge">Zero Data Exposure</span>
            <span className="badge">On-Chain Verifiable</span>
          </div>
        </section>

        {/* Step 1 — Connect wallet */}
        <section className="section" aria-labelledby="wallet-heading">
          <h2 id="wallet-heading" className="section-title">Step 1 — Connect Wallet</h2>
          <WalletConnect onConnected={setWalletAddress} />
        </section>

        {/* Step 2 — Generate proof */}
        {walletAddress && (
          <section className="section" aria-labelledby="proof-heading">
            <h2 id="proof-heading" className="section-title">Step 2 — Prove Accreditation</h2>
            <InvestorGate />
          </section>
        )}

        {/* Privacy model explainer */}
        <section className="section privacy-model" aria-labelledby="privacy-heading">
          <h2 id="privacy-heading" className="section-title">How the Privacy Works</h2>
          <div className="privacy-grid">
            <div className="privacy-card public">
              <h3>🌐 Public (on-chain)</h3>
              <ul>
                <li>Income threshold ($200k)</li>
                <li>Net worth threshold ($1M)</li>
                <li>Total verification count</li>
                <li>Your accreditation result (✓ or ✗)</li>
              </ul>
            </div>
            <div className="privacy-card private">
              <h3>🔒 Private (never leaves your device)</h3>
              <ul>
                <li>Your actual income</li>
                <li>Your actual net worth</li>
                <li>Any financial documents</li>
                <li>Your identity</li>
              </ul>
            </div>
            <div className="privacy-card proved">
              <h3>✅ What Gets Proved</h3>
              <ul>
                <li>income ≥ $200,000 OR</li>
                <li>net_worth ≥ $1,000,000</li>
                <li>Proof is cryptographically valid</li>
                <li>No trust in verifier needed</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Use case explainer */}
        <section className="section" aria-labelledby="usecases-heading">
          <h2 id="usecases-heading" className="section-title">Who Needs This</h2>
          <div className="usecase-grid">
            <div className="usecase-card">
              <span className="usecase-icon" aria-hidden="true">🏦</span>
              <h3>DeFi Lending Protocols</h3>
              <p>Meet SEC compliance for accredited-only pools without storing user financial data.</p>
            </div>
            <div className="usecase-card">
              <span className="usecase-icon" aria-hidden="true">📈</span>
              <h3>Private Investment DAOs</h3>
              <p>Gate membership to verified accredited investors — privately and verifiably.</p>
            </div>
            <div className="usecase-card">
              <span className="usecase-icon" aria-hidden="true">🔐</span>
              <h3>Yield Vaults</h3>
              <p>Allow high-yield strategies restricted to accredited investors without a KYC provider.</p>
            </div>
          </div>
        </section>

      </div>
    </Layout>
  );
};

export default App;
