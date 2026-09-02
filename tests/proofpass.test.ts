/**
 * proofpass.test.ts
 *
 * Tests for the ProofPass — Private Accredited Investor Verification contract.
 * Simulates ZK circuit logic in TypeScript to validate contract behaviour
 * before deployment to Midnight Preprod.
 *
 * SEC Rule 501 thresholds:
 *   income   >= $200,000/year  OR
 *   net_worth >= $1,000,000
 *
 * Run: npm test
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Simulated ledger state — mirrors on-chain public state
// ---------------------------------------------------------------------------
interface LedgerState {
  income_threshold: number;
  networth_threshold: number;
  total_verifications: number;
  is_accredited: boolean;
}

// ---------------------------------------------------------------------------
// Simulated circuit implementations
// ---------------------------------------------------------------------------

function initialize(incThreshold: number, nwThreshold: number): LedgerState {
  return {
    income_threshold: incThreshold,
    networth_threshold: nwThreshold,
    total_verifications: 0,
    is_accredited: false,
  };
}

/**
 * prove_accreditation
 * Private witnesses: userIncome, userNetWorth — stay local, never disclosed.
 * Public outcome: is_accredited (boolean) + incremented counter.
 */
function prove_accreditation(
  ledger: LedgerState,
  userIncome: number,
  userNetWorth: number
): LedgerState {
  // ZKP assertion: income >= threshold OR net_worth >= threshold
  const qualifies =
    userIncome >= ledger.income_threshold ||
    userNetWorth >= ledger.networth_threshold;

  if (!qualifies) {
    throw new Error(
      'Does not meet accredited investor threshold (income >= $200k OR net worth >= $1M)'
    );
  }

  return {
    ...ledger,
    is_accredited: true,
    total_verifications: ledger.total_verifications + 1,
  };
}

function reset_accreditation(ledger: LedgerState): LedgerState {
  return { ...ledger, is_accredited: false };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProofPass Contract', () => {
  let ledger: LedgerState;

  // SEC standard thresholds
  const INCOME_THRESHOLD = 200_000;
  const NETWORTH_THRESHOLD = 1_000_000;

  beforeEach(() => {
    ledger = initialize(INCOME_THRESHOLD, NETWORTH_THRESHOLD);
  });

  // TEST 1 — Initialization
  it('initializes with correct SEC thresholds and default state', () => {
    expect(ledger.income_threshold).toBe(200_000);
    expect(ledger.networth_threshold).toBe(1_000_000);
    expect(ledger.total_verifications).toBe(0);
    expect(ledger.is_accredited).toBe(false);
  });

  // TEST 2 — Qualifies via income (exact boundary)
  it('accredits a user with income exactly $200,000 (boundary)', () => {
    ledger = prove_accreditation(ledger, 200_000, 0);
    expect(ledger.is_accredited).toBe(true);
    expect(ledger.total_verifications).toBe(1);
  });

  // TEST 3 — Qualifies via net worth (exact boundary)
  it('accredits a user with net worth exactly $1,000,000 (boundary)', () => {
    ledger = prove_accreditation(ledger, 0, 1_000_000);
    expect(ledger.is_accredited).toBe(true);
    expect(ledger.total_verifications).toBe(1);
  });

  // TEST 4 — Qualifies via both criteria
  it('accredits a user who meets both income and net worth thresholds', () => {
    ledger = prove_accreditation(ledger, 350_000, 2_500_000);
    expect(ledger.is_accredited).toBe(true);
  });

  // TEST 5 — Rejected (neither criterion met)
  it('rejects a user with income $150k and net worth $500k', () => {
    expect(() => prove_accreditation(ledger, 150_000, 500_000)).toThrow(
      'Does not meet accredited investor threshold'
    );
    expect(ledger.is_accredited).toBe(false);
    expect(ledger.total_verifications).toBe(0);
  });

  // TEST 6 — Counter increments across multiple successful proofs
  it('increments total_verifications with each successful proof', () => {
    ledger = prove_accreditation(ledger, 250_000, 0);
    ledger = reset_accreditation(ledger);
    ledger = prove_accreditation(ledger, 0, 1_500_000);
    ledger = reset_accreditation(ledger);
    ledger = prove_accreditation(ledger, 300_000, 2_000_000);
    expect(ledger.total_verifications).toBe(3);
  });

  // TEST 7 — Reset clears accreditation without touching counter
  it('resets is_accredited flag without changing total_verifications', () => {
    ledger = prove_accreditation(ledger, 500_000, 0);
    expect(ledger.is_accredited).toBe(true);
    ledger = reset_accreditation(ledger);
    expect(ledger.is_accredited).toBe(false);
    expect(ledger.total_verifications).toBe(1);
  });

  // TEST 8 — Privacy: financial values never appear in ledger state
  it('never exposes user_income or user_net_worth in ledger state', () => {
    const newLedger = prove_accreditation(ledger, 250_000, 800_000);
    expect((newLedger as any).user_income).toBeUndefined();
    expect((newLedger as any).user_net_worth).toBeUndefined();
    expect((newLedger as any).income).toBeUndefined();
    expect((newLedger as any).net_worth).toBeUndefined();
  });

  // TEST 9 — Edge case: qualifies with high income but zero net worth
  it('accredits a user with income $1M and net worth $0', () => {
    ledger = prove_accreditation(ledger, 1_000_000, 0);
    expect(ledger.is_accredited).toBe(true);
  });

  // TEST 10 — Edge case: just below income threshold, just below net worth threshold
  it('rejects a user with income $199,999 and net worth $999,999', () => {
    expect(() => prove_accreditation(ledger, 199_999, 999_999)).toThrow(
      'Does not meet accredited investor threshold'
    );
  });
});
