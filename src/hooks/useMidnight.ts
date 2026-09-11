/**
 * useMidnight — ProofPass ZK proof state management.
 * @version 2.0.0
 *
 * Wraps the real Midnight DApp Connector API and contract interaction helpers.
 * When VITE_CONTRACT_ADDRESS is set, uses real on-chain ZK proofs via Lace wallet.
 * When not set, falls back to simulation mode for local development.
 */

import { useState, useCallback } from 'react';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import {
  connectLaceWallet,
  callProveAccreditation,
  callResetAccreditation,
  fetchLedgerState,
  CONTRACT_ADDRESS,
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
  const [ledger, setLedger]   = useState<LedgerState>(DEFAULT_LEDGER);
  const [proving, setProving] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [walletApi, setWalletApi] = useState<ConnectedAPI | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isSimulation] = useState(!CONTRACT_ADDRESS);

  // -------------------------------------------------------------------------
  // connectWallet — connects Lace via official DApp connector
  // -------------------------------------------------------------------------
  const connectWallet = useCallback(async (): Promise<string> => {
    setError(null);

    if (!CONTRACT_ADDRESS) {
      // Simulation mode — return a mock address
      const mockAddr = `sim_${Math.random().toString(36).slice(2, 10)}`;
      setWalletAddress(mockAddr);
      return mockAddr;
    }

    try {
      const { api, address } = await connectLaceWallet();
      setWalletApi(api);
      setWalletAddress(address);

      // Load initial ledger state from indexer
      const state = await fetchLedgerState();
      setLedger(state);

      return address;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Wallet connection failed';
      setError(msg);
      throw new Error(msg);
    }
  }, []);

  // -------------------------------------------------------------------------
  // proveAccreditation — submits ZK proof on-chain
  // income and netWorth are private witnesses — never disclosed
  // -------------------------------------------------------------------------
  const proveAccreditation = useCallback(async (
    income: number,
    netWorth: number
  ) => {
    setProving(true);
    setError(null);
    try {
      await callProveAccreditation(income, netWorth);
      const newState = await fetchLedgerState();
      setLedger(newState);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Proof generation failed';
      setError(msg);
    } finally {
      setProving(false);
    }
  }, []);

  // -------------------------------------------------------------------------
  // resetAccreditation — resets is_accredited flag on-chain
  // -------------------------------------------------------------------------
  const resetAccreditation = useCallback(async () => {
    setProving(true);
    setError(null);
    try {
      await callResetAccreditation();
      const newState = await fetchLedgerState();
      setLedger(newState);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Reset failed';
      setError(msg);
    } finally {
      setProving(false);
    }
  }, []);

  return {
    ledger,
    proving,
    error,
    walletApi,
    walletAddress,
    isSimulation,
    connectWallet,
    proveAccreditation,
    resetAccreditation,
  };
}
