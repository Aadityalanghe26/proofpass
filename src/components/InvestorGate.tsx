import React, { useState } from 'react';
import { useMidnight } from '../hooks/useMidnight';

/**
 * InvestorGate — Core Privacy Feature UI
 * @version 1.1.0
 *
 * The user enters their income and/or net worth locally.
 * Both values are used as private witnesses inside the ZK circuit —
 * they are NEVER sent to the blockchain, any server, or any third party.
 * Only the boolean result (accredited / not accredited) is published on-chain.
 *
 * SEC Rule 501 thresholds enforced by the contract:
 *   income >= $200,000/year  OR  net_worth >= $1,000,000
 */
const InvestorGate: React.FC = () => {
  const { ledger, proving, error, proveAccreditation, resetAccreditation } = useMidnight();

  const [income, setIncome] = useState('');
  const [netWorth, setNetWorth] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleProve = async () => {
    setLocalError(null);
    const inc = parseFloat(income.replace(/,/g, ''));
    const nw = parseFloat(netWorth.replace(/,/g, ''));

    if ((income !== '' && isNaN(inc)) || (netWorth !== '' && isNaN(nw))) {
      setLocalError('Please enter valid numbers (no symbols other than commas).');
      return;
    }
    if (income === '' && netWorth === '') {
      setLocalError('Enter at least one value — annual income or net worth.');
      return;
    }

    await proveAccreditation(income !== '' ? inc : 0, netWorth !== '' ? nw : 0);
  };

  const handleReset = async () => {
    setIncome('');
    setNetWorth('');
    setLocalError(null);
    await resetAccreditation();
  };

  const displayError = localError ?? error;

  const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  return (
    <section className="investor-gate-card" aria-labelledby="gate-heading">
      <h2 id="gate-heading">Accredited Investor Proof</h2>

      {/* Privacy callout */}
      <div className="privacy-notice" role="note">
        <span aria-hidden="true">🔒</span>{' '}
        <strong>Your financial data never leaves your device.</strong> Only a
        zero-knowledge proof of eligibility is submitted on-chain. No income
        or net worth values are ever stored or transmitted.
      </div>

      {/* Public on-chain state */}
      <div className="ledger-state" aria-live="polite">
        <div className="stat">
          <span className="stat-label">Income threshold (SEC)</span>
          <span className="stat-value">{fmt(ledger.incomeThreshold ?? 200000)}+</span>
        </div>
        <div className="stat">
          <span className="stat-label">Net worth threshold (SEC)</span>
          <span className="stat-value">{fmt(ledger.networthThreshold ?? 1000000)}+</span>
        </div>
        <div className="stat">
          <span className="stat-label">Total proofs verified</span>
          <span className="stat-value">{ledger.totalVerifications ?? 0}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Your accreditation</span>
          <span className={`stat-value accreditation ${ledger.isAccredited ? 'accredited' : 'unknown'}`}>
            {ledger.isAccredited ? '✓ Accredited' : '— Not proved yet'}
          </span>
        </div>
      </div>

      {/* Input form — private, local only */}
      {!ledger.isAccredited && (
        <div className="input-section">
          <p className="input-section-title">
            Enter one or both values{' '}
            <span className="private-badge" aria-label="private, never shared">🔒 Private — stays on your device</span>
          </p>

          <div className="input-grid">
            {/* Income input */}
            <div className="input-group">
              <label htmlFor="income-input" className="input-label">
                Annual Income (USD)
              </label>
              <div className="input-prefix-wrap">
                <span className="input-prefix" aria-hidden="true">$</span>
                <input
                  id="income-input"
                  type="number"
                  min={0}
                  value={income}
                  onChange={(e) => setIncome(e.target.value)}
                  placeholder="e.g. 250000"
                  className="finance-input"
                  disabled={proving}
                  aria-describedby="income-hint"
                />
              </div>
              <p id="income-hint" className="input-hint">Threshold: $200,000/year</p>
            </div>

            {/* Net worth input */}
            <div className="input-group">
              <label htmlFor="networth-input" className="input-label">
                Net Worth (USD)
              </label>
              <div className="input-prefix-wrap">
                <span className="input-prefix" aria-hidden="true">$</span>
                <input
                  id="networth-input"
                  type="number"
                  min={0}
                  value={netWorth}
                  onChange={(e) => setNetWorth(e.target.value)}
                  placeholder="e.g. 1500000"
                  className="finance-input"
                  disabled={proving}
                  aria-describedby="networth-hint"
                />
              </div>
              <p id="networth-hint" className="input-hint">Threshold: $1,000,000</p>
            </div>
          </div>

          <p className="disclaimer">
            These values are used only as private witnesses in the ZK circuit
            and are discarded immediately after proof generation.
          </p>

          <button
            className="btn btn-primary btn-large"
            onClick={handleProve}
            disabled={proving || (income === '' && netWorth === '')}
            aria-busy={proving}
          >
            {proving ? 'Generating ZK Proof…' : 'Prove Accreditation'}
          </button>
        </div>
      )}

      {/* Loading state */}
      {proving && (
        <div className="loading-state" role="status" aria-live="assertive">
          <div className="spinner" aria-hidden="true" />
          <div>
            <p className="loading-title">Generating zero-knowledge proof…</p>
            <p className="loading-sub">Your financial data never leaves this device.</p>
          </div>
        </div>
      )}

      {/* Success state */}
      {ledger.isAccredited && !proving && (
        <div className="success-state" role="status" aria-live="polite">
          <div className="success-icon" aria-hidden="true">✅</div>
          <div>
            <h3>Accreditation Verified</h3>
            <p>
              A zero-knowledge proof has been recorded on-chain confirming you
              meet the SEC accredited investor threshold — without revealing your
              income or net worth.
            </p>
          </div>
          <button className="btn btn-secondary" onClick={handleReset}>
            Start New Session
          </button>
        </div>
      )}

      {/* Error state */}
      {displayError && !proving && (
        <div className="error-state" role="alert">
          <strong>Error:</strong> {displayError}
        </div>
      )}
    </section>
  );
};

export default InvestorGate;
