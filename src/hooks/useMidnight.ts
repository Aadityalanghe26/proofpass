/**
 * useMidnight — ProofPass ZK proof state management.
 * @version 3.0.0
 *
 * Wraps the real Midnight DApp Connector API and contract interaction helpers.
 * When VITE_CONTRACT_ADDRESS is set, uses real on-chain ZK proofs via Lace wallet.
 * When not set, falls back to simulation mode for local development.
 *
 * isAccredited is derived from nullifier_set membership (matching the actual
 * contract ledger schema) — not from a non-existent is_accredited field.
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
  incomeThreshold:    number;
  networthThreshold:  number;
  totalVerifications: number;
  /** Derived from nullifier membership — true iff this wallet's nullifier is in nullifier_set */
  isAccredited:       boolean;
}

const DEFAULT_LEDGER: LedgerState = {
  incomeThreshold:    200_000,
  networthThreshold:  1_000_000,
  totalVerifications: 0,
  isAccredited:       false,
};

export function useMidnight() {
  const [ledger, setLedger]         = useState<LedgerState>(DEFAULT_LEDGER);
  const [proving, setProving]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [walletApi, setWalletApi]   = useState<ConnectedAPI | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isSimulation]              = useState(!CONTRACT_ADDRESS);

  // -------------------------------------------------------------------------
  // connectWallet — connects Lace via official DApp Connector
  // -------------------------------------------------------------------------
  const connectWallet = useCallback(async (): Promise<string> => {
    setError(null);

    if (!CONTRACT_ADDRESS) {
      // Simulation mode — return a mock address, load initial sim state
      const mockAddr = `sim_${Math.random().toString(36).slice(2, 10)}`;
      setWalletAddress(mockAddr);
      const state = await fetchLedgerState();
      setLedger(state);
      return mockAddr;
    }

    try {
      const { api, address } = await connectLaceWallet();
      setWalletApi(api);
      setWalletAddress(address);

      // Load initial ledger state; pass api so nullifier membership can be checked
      const state = await fetchLedgerState(api);
      setLedger(state);

      return address;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Wallet connection failed';
      setError(msg);
      throw new Error(msg);
    }
  }, []);

  // -------------------------------------------------------------------------
  // proveAccreditation — submits ZK proof on-chain via ContractInstance wrapper
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
      // Refresh ledger state; pass cached api for nullifier membership check
      const newState = await fetchLedgerState(walletApi ?? undefined);
      setLedger(newState);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Proof generation failed';
      setError(msg);
    } finally {
      setProving(false);
    }
  }, [walletApi]);

  // -------------------------------------------------------------------------
  // resetAccreditation — removes nullifier from on-chain nullifier_set
  // -------------------------------------------------------------------------
  const resetAccreditation = useCallback(async () => {
    setProving(true);
    setError(null);
    try {
      await callResetAccreditation();
      const newState = await fetchLedgerState(walletApi ?? undefined);
      setLedger(newState);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Reset failed';
      setError(msg);
    } finally {
      setProving(false);
    }
  }, [walletApi]);

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
