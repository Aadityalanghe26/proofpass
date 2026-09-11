/**
 * proofpass.test.ts
 * @version 2.0.0
 *
 * ProofPass contract tests using Compact runtime simulation.
 *
 * These tests mirror the compiled Compact contract behaviour using the
 * same circuit logic, data types, and state transitions that the on-chain
 * contract enforces. Each test validates:
 *   - Circuit pre/post conditions
 *   - Private witness handling (income, net_worth, identity_secret)
 *   - Nullifier derivation and replay protection
 *   - Ledger state transitions
 *
 * Run: npm test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createHash } from 'crypto';

// ---------------------------------------------------------------------------
// Types — mirror Compact contract types exactly
// ---------------------------------------------------------------------------

type Bytes32 = string; // hex string representing 32 bytes

interface ContractLedger {
  income_threshold:    bigint;
  networth_threshold:  bigint;
  total_verifications: bigint;
  nullifier_set:       Set<Bytes32>;
}

// ---------------------------------------------------------------------------
// Compact runtime helpers — mirror built-in Compact functions
// ---------------------------------------------------------------------------

/**
 * persistentHash — mirrors Compact's persistentHash<Bytes<32>>()
 * Derives a deterministic 32-byte commitment from a domain + secret.
 * One-way: reveals nothing about the input.
 */
function persistentHash(domain: string, secret: Bytes32): Bytes32 {
  return createHash('sha256')
    .update(domain)
    .update(Buffer.from(secret, 'hex'))
    .digest('hex');
}

/**
 * emptySet — mirrors Compact's emptySet<Bytes<32>>()
 */
function emptySet<T>(): Set<T> {
  return new Set<T>();
}

/**
 * memberOf — mirrors Compact's memberOf(value, set)
 */
function memberOf<T>(value: T, set: Set<T>): boolean {
  return set.has(value);
}

/**
 * insert — mirrors Compact's insert(set, value)
 */
function insert<T>(set: Set<T>, value: T): Set<T> {
  const newSet = new Set(set);
  newSet.add(value);
  return newSet;
}

/**
 * remove — mirrors Compact's remove(set, value)
 */
function remove<T>(set: Set<T>, value: T): Set<T> {
  const newSet = new Set(set);
  newSet.delete(value);
  return newSet;
}

// ---------------------------------------------------------------------------
// Circuit implementations — mirror compiled Compact circuits exactly
// ---------------------------------------------------------------------------

function circuit_initialize(
  inc_threshold: bigint,
  nw_threshold: bigint
): ContractLedger {
  return {
    income_threshold:    inc_threshold,
    networth_threshold:  nw_threshold,
    total_verifications: 0n,
    nullifier_set:       emptySet<Bytes32>(),
  };
}

/**
 * circuit_prove_accreditation
 *
 * Private witnesses (never disclosed on-chain):
 *   @param userIncome       — user's annual income (private witness)
 *   @param userNetWorth     — user's net worth (private witness)
 *   @param identitySecret   — 32-byte private secret for nullifier
 *
 * Public state changes (disclosed on ledger):
 *   - nullifier_set: nullifier added (hash of identitySecret)
 *   - total_verifications: incremented
 */
function circuit_prove_accreditation(
  ledger: ContractLedger,
  userIncome: bigint,
  userNetWorth: bigint,
  identitySecret: Bytes32  // private witness — never stored on-chain
): ContractLedger {
  // ZKP assertion: income >= threshold OR net_worth >= threshold
  const qualifies =
    userIncome >= ledger.income_threshold ||
    userNetWorth >= ledger.networth_threshold;

  if (!qualifies) {
    throw new Error(
      'Does not meet accredited investor threshold (income >= $200k OR net worth >= $1M)'
    );
  }

  // Derive nullifier — one-way commitment, reveals nothing about secret
  const nullifier = persistentHash('ProofPass_v1', identitySecret);

  // Replay protection assertion
  if (memberOf(nullifier, ledger.nullifier_set)) {
    throw new Error(
      'Accreditation proof already submitted for this identity'
    );
  }

  // Disclose only: nullifier (not secret), updated counter
  return {
    ...ledger,
    nullifier_set:       insert(ledger.nullifier_set, nullifier),
    total_verifications: ledger.total_verifications + 1n,
  };
}

function circuit_reset_accreditation(
  ledger: ContractLedger,
  identitySecret: Bytes32
): ContractLedger {
  const nullifier = persistentHash('ProofPass_v1', identitySecret);
  if (memberOf(nullifier, ledger.nullifier_set)) {
    return {
      ...ledger,
      nullifier_set: remove(ledger.nullifier_set, nullifier),
    };
  }
  return ledger;
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const INCOME_THRESHOLD    = 200_000n;
const NETWORTH_THRESHOLD  = 1_000_000n;

// Test identity secrets — 32 bytes hex (private witnesses, never on-chain)
const SECRET_ALICE = 'a'.repeat(64) as Bytes32;
const SECRET_BOB   = 'b'.repeat(64) as Bytes32;
const SECRET_CAROL = 'c'.repeat(64) as Bytes32;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProofPass Contract — Compact Runtime Tests', () => {
  let ledger: ContractLedger;

  beforeEach(() => {
    ledger = circuit_initialize(INCOME_THRESHOLD, NETWORTH_THRESHOLD);
  });

  // ------------------------------------------------------------------
  // Initialisation
  // ------------------------------------------------------------------

  it('TEST 1 — initialises with correct SEC thresholds and empty nullifier set', () => {
    expect(ledger.income_threshold).toBe(200_000n);
    expect(ledger.networth_threshold).toBe(1_000_000n);
    expect(ledger.total_verifications).toBe(0n);
    expect(ledger.nullifier_set.size).toBe(0);
  });

  // ------------------------------------------------------------------
  // Eligibility — boundary conditions
  // ------------------------------------------------------------------

  it('TEST 2 — accredits user with income exactly $200,000 (lower boundary)', () => {
    ledger = circuit_prove_accreditation(ledger, 200_000n, 0n, SECRET_ALICE);
    expect(ledger.total_verifications).toBe(1n);
    expect(ledger.nullifier_set.size).toBe(1);
  });

  it('TEST 3 — accredits user with net worth exactly $1,000,000 (lower boundary)', () => {
    ledger = circuit_prove_accreditation(ledger, 0n, 1_000_000n, SECRET_ALICE);
    expect(ledger.total_verifications).toBe(1n);
  });

  it('TEST 4 — accredits user who meets both thresholds', () => {
    ledger = circuit_prove_accreditation(ledger, 350_000n, 2_500_000n, SECRET_ALICE);
    expect(ledger.total_verifications).toBe(1n);
  });

  it('TEST 5 — rejects user below both thresholds ($150k income, $500k net worth)', () => {
    expect(() =>
      circuit_prove_accreditation(ledger, 150_000n, 500_000n, SECRET_ALICE)
    ).toThrow('Does not meet accredited investor threshold');
    expect(ledger.total_verifications).toBe(0n);
    expect(ledger.nullifier_set.size).toBe(0);
  });

  // ------------------------------------------------------------------
  // Nullifier / Replay protection
  // ------------------------------------------------------------------

  it('TEST 6 — nullifier is stored after successful proof (identity binding)', () => {
    const nullifier = persistentHash('ProofPass_v1', SECRET_ALICE);
    ledger = circuit_prove_accreditation(ledger, 250_000n, 0n, SECRET_ALICE);
    expect(memberOf(nullifier, ledger.nullifier_set)).toBe(true);
  });

  it('TEST 7 — replay attack rejected: same identity cannot submit twice', () => {
    ledger = circuit_prove_accreditation(ledger, 250_000n, 0n, SECRET_ALICE);
    expect(() =>
      circuit_prove_accreditation(ledger, 250_000n, 0n, SECRET_ALICE)
    ).toThrow('Accreditation proof already submitted for this identity');
    // Counter must NOT increment on replay attempt
    expect(ledger.total_verifications).toBe(1n);
  });

  it('TEST 8 — different identities get separate nullifiers (no collision)', () => {
    ledger = circuit_prove_accreditation(ledger, 250_000n, 0n, SECRET_ALICE);
    ledger = circuit_prove_accreditation(ledger, 0n, 1_500_000n, SECRET_BOB);
    ledger = circuit_prove_accreditation(ledger, 300_000n, 2_000_000n, SECRET_CAROL);
    expect(ledger.nullifier_set.size).toBe(3);
    expect(ledger.total_verifications).toBe(3n);
  });

  it('TEST 9 — nullifier reveals nothing about the private secret', () => {
    const nullifier = persistentHash('ProofPass_v1', SECRET_ALICE);
    ledger = circuit_prove_accreditation(ledger, 250_000n, 0n, SECRET_ALICE);
    // Nullifier is in ledger but secret is not
    expect(memberOf(nullifier, ledger.nullifier_set)).toBe(true);
    expect((ledger as unknown as Record<string, unknown>).identity_secret).toBeUndefined();
    expect((ledger as unknown as Record<string, unknown>).user_income).toBeUndefined();
    expect((ledger as unknown as Record<string, unknown>).user_net_worth).toBeUndefined();
  });

  // ------------------------------------------------------------------
  // Reset / Re-verification
  // ------------------------------------------------------------------

  it('TEST 10 — reset removes nullifier, allows re-verification', () => {
    ledger = circuit_prove_accreditation(ledger, 250_000n, 0n, SECRET_ALICE);
    expect(ledger.nullifier_set.size).toBe(1);

    ledger = circuit_reset_accreditation(ledger, SECRET_ALICE);
    expect(ledger.nullifier_set.size).toBe(0);

    // Can now prove again with same identity
    ledger = circuit_prove_accreditation(ledger, 250_000n, 0n, SECRET_ALICE);
    expect(ledger.total_verifications).toBe(2n);
  });

  it('TEST 11 — reset only removes correct nullifier, others unaffected', () => {
    ledger = circuit_prove_accreditation(ledger, 250_000n, 0n, SECRET_ALICE);
    ledger = circuit_prove_accreditation(ledger, 0n, 1_500_000n, SECRET_BOB);
    expect(ledger.nullifier_set.size).toBe(2);

    ledger = circuit_reset_accreditation(ledger, SECRET_ALICE);
    expect(ledger.nullifier_set.size).toBe(1);

    // Bob's nullifier still present
    const bobNullifier = persistentHash('ProofPass_v1', SECRET_BOB);
    expect(memberOf(bobNullifier, ledger.nullifier_set)).toBe(true);
  });

  it('TEST 12 — rejects income $199,999 and net worth $999,999 (just below both)', () => {
    expect(() =>
      circuit_prove_accreditation(ledger, 199_999n, 999_999n, SECRET_ALICE)
    ).toThrow('Does not meet accredited investor threshold');
  });
});
