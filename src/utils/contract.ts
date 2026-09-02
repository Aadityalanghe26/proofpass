/**
 * contract.ts
 * ProofPass — contract interaction helpers.
 * @version 1.1.0
 *
 * When VITE_CONTRACT_ADDRESS is empty the simulation path is used.
 * When it is set, calls go to the live Preprod/Mainnet contract.
 */

import type { LedgerState } from '../hooks/useMidnight';
import { Contract, createMidnightProvider } from './midnight-sdk';

export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS ?? '';

// ---------------------------------------------------------------------------
// Simulation state
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
/**
 * Both income and netWorth are private witnesses — they enter only the ZK
 * circuit and are never written to the ledger or sent over the network.
 */
export async function callProveAccreditation(
  income: number,
  netWorth: number
): Promise<void> {
  if (!CONTRACT_ADDRESS) {
    const qualifies =
      income >= _sim.incomeThreshold || netWorth >= _sim.networthThreshold;
    if (!qualifies) {
      throw new Error(
        'Does not meet accredited investor threshold (income >= $200k OR net worth >= $1M)'
      );
    }
    await simulateDelay(1800);
    _sim = {
      ..._sim,
      isAccredited: true,
      totalVerifications: _sim.totalVerifications + 1,
    };
    return;
  }

  try {
    const provider = await createMidnightProvider({ contractAddress: CONTRACT_ADDRESS });
    const contract = new Contract(provider);
    await contract.callTx.prove_accreditation(
      {},
      {
        user_income:    () => BigInt(Math.floor(income)),
        user_net_worth: () => BigInt(Math.floor(netWorth)),
      }
    );
  } catch (err: any) {
    throw new Error(`Circuit call failed: ${err?.message ?? 'unknown error'}`);
  }
}

// ---------------------------------------------------------------------------
// callResetAccreditation
// ---------------------------------------------------------------------------
export async function callResetAccreditation(): Promise<void> {
  if (!CONTRACT_ADDRESS) {
    await simulateDelay(400);
    _sim = { ..._sim, isAccredited: false };
    return;
  }
  try {
    const provider = await createMidnightProvider({ contractAddress: CONTRACT_ADDRESS });
    const contract = new Contract(provider);
    await contract.callTx.reset_accreditation({}, {});
  } catch (err: any) {
    throw new Error(`Reset failed: ${err?.message ?? 'unknown error'}`);
  }
}

// ---------------------------------------------------------------------------
// fetchLedgerState
// ---------------------------------------------------------------------------
export async function fetchLedgerState(): Promise<LedgerState> {
  if (!CONTRACT_ADDRESS) {
    return { ..._sim };
  }
  try {
    const provider = await createMidnightProvider({ contractAddress: CONTRACT_ADDRESS });
    const contract = new Contract(provider);
    const state = await contract.ledger();
    return {
      incomeThreshold:    Number(state.income_threshold),
      networthThreshold:  Number(state.networth_threshold),
      totalVerifications: Number(state.total_verifications),
      isAccredited:       Boolean(state.is_accredited),
    };
  } catch (err: any) {
    throw new Error(`Failed to read ledger: ${err?.message ?? 'unknown error'}`);
  }
}

function simulateDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
