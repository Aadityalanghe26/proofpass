/**
 * contract.ts
 * ProofPass — contract interaction helpers.
 * @version 1.2.0
 *
 * Simulation mode is always used when VITE_CONTRACT_ADDRESS is empty.
 * No external SDK imports are attempted in simulation mode.
 */

import type { LedgerState } from '../hooks/useMidnight';

export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS ?? '';

// ---------------------------------------------------------------------------
// Simulation state — mirrors on-chain ledger, lives only in memory
// ---------------------------------------------------------------------------
let _sim: LedgerState = {
  incomeThreshold: 200_000,
  networthThreshold: 1_000_000,
  totalVerifications: 0,
  isAccredited: false,
};

// ---------------------------------------------------------------------------
// callProveAccreditation
// ---------------------------------------------------------------------------
export async function callProveAccreditation(
  income: number,
  netWorth: number
): Promise<void> {
  // Always use simulation when no contract address is configured
  if (!CONTRACT_ADDRESS) {
    const qualifies =
      income >= _sim.incomeThreshold || netWorth >= _sim.networthThreshold;
    if (!qualifies) {
      throw new Error(
        'Does not meet accredited investor threshold (income >= $200k OR net worth >= $1M)'
      );
    }
    await delay(1800);
    _sim = {
      ..._sim,
      isAccredited: true,
      totalVerifications: _sim.totalVerifications + 1,
    };
    return;
  }

  // Live path — only reached when CONTRACT_ADDRESS is set at build time
  throw new Error(
    'Live contract calls require the Midnight SDK. Set VITE_CONTRACT_ADDRESS and rebuild.'
  );
}

// ---------------------------------------------------------------------------
// callResetAccreditation
// ---------------------------------------------------------------------------
export async function callResetAccreditation(): Promise<void> {
  if (!CONTRACT_ADDRESS) {
    await delay(400);
    _sim = { ..._sim, isAccredited: false };
    return;
  }
  throw new Error(
    'Live contract calls require the Midnight SDK. Set VITE_CONTRACT_ADDRESS and rebuild.'
  );
}

// ---------------------------------------------------------------------------
// fetchLedgerState
// ---------------------------------------------------------------------------
export async function fetchLedgerState(): Promise<LedgerState> {
  if (!CONTRACT_ADDRESS) {
    return { ..._sim };
  }
  throw new Error(
    'Live contract calls require the Midnight SDK. Set VITE_CONTRACT_ADDRESS and rebuild.'
  );
}

// ---------------------------------------------------------------------------
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
