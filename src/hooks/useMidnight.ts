import { useState, useCallback } from 'react';
import {
  callProveAccreditation,
  callResetAccreditation,
  fetchLedgerState,
} from '../utils/contract';

export interface LedgerState {
  incomeThreshold: number;
  networthThreshold: number;
  totalVerifications: number;
  isAccredited: boolean;
}

const DEFAULT_LEDGER: LedgerState = {
  incomeThreshold: 200_000,
  networthThreshold: 1_000_000,
  totalVerifications: 0,
  isAccredited: false,
};

export function useMidnight() {
  const [ledger, setLedger] = useState<LedgerState>(DEFAULT_LEDGER);
  const [proving, setProving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * proveAccreditation
   * Sends a ZK proof to the contract.
   * @param income   — private witness (USD, local only, never disclosed)
   * @param netWorth — private witness (USD, local only, never disclosed)
   */
  const proveAccreditation = useCallback(async (income: number, netWorth: number) => {
    setProving(true);
    setError(null);
    try {
      await callProveAccreditation(income, netWorth);
      const newState = await fetchLedgerState();
      setLedger(newState);
    } catch (err: any) {
      setError(err?.message ?? 'Proof generation failed. Please try again.');
    } finally {
      setProving(false);
    }
  }, []);

  const resetAccreditation = useCallback(async () => {
    setProving(true);
    setError(null);
    try {
      await callResetAccreditation();
      const newState = await fetchLedgerState();
      setLedger(newState);
    } catch (err: any) {
      setError(err?.message ?? 'Reset failed. Please try again.');
    } finally {
      setProving(false);
    }
  }, []);

  return { ledger, proving, error, proveAccreditation, resetAccreditation };
}
