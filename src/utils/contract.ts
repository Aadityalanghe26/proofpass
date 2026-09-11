/**
 * contract.ts
 * ProofPass — Real Midnight SDK integration.
 * @version 2.1.0
 *
 * Uses the official @midnight-ntwrk/dapp-connector-api for:
 * - Lace wallet connection via window.midnight (DApp Connector API)
 * - ZK proof generation via wallet's ProvingProvider
 * - Transaction balancing and submission
 * - Public state reads from Preprod indexer
 *
 * Simulation mode used only when VITE_CONTRACT_ADDRESS is empty (local dev).
 */

import type { LedgerState } from '../hooks/useMidnight';
import type {
  InitialAPI,
  ConnectedAPI,
} from '@midnight-ntwrk/dapp-connector-api';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS ?? '';

const PREPROD_INDEXER   = 'https://indexer.testnet-02.midnight.network/api/v1/graphql';
const NETWORK_ID        = 'TestNet';

// ---------------------------------------------------------------------------
// Simulation state — used when CONTRACT_ADDRESS is empty
// ---------------------------------------------------------------------------
let _sim: LedgerState = {
  incomeThreshold: 200_000,
  networthThreshold: 1_000_000,
  totalVerifications: 0,
  isAccredited: false,
};

// ---------------------------------------------------------------------------
// connectLaceWallet — connects via official DApp Connector API
// ---------------------------------------------------------------------------
export async function connectLaceWallet(): Promise<{
  api: ConnectedAPI;
  address: string;
}> {
  const midnight = (window as unknown as {
    midnight?: Record<string, InitialAPI>
  }).midnight;

  if (!midnight) {
    throw new Error(
      'Lace wallet not found. Please install Lace with Midnight support enabled.'
    );
  }

  // Find Lace wallet provider injected under window.midnight
  const provider = Object.values(midnight).find(
    (p) => p.rdns === 'io.lace' || p.name?.toLowerCase().includes('lace')
  );

  if (!provider) {
    throw new Error(
      'Lace wallet not found in window.midnight. Please install Lace wallet.'
    );
  }

  const api = await provider.connect(NETWORK_ID);
  const addresses = await api.getShieldedAddresses();
  const address = addresses.shieldedAddress;

  return { api, address };
}

// ---------------------------------------------------------------------------
// callProveAccreditation
// ---------------------------------------------------------------------------
/**
 * Submits a real ZK proof to the ProofPass contract on Preprod.
 *
 * income and netWorth are private witnesses — used only in the ZK circuit
 * locally on the user's device. They are NEVER transmitted or stored on-chain.
 * Only the boolean result (is_accredited = true) is published on the ledger.
 */
export async function callProveAccreditation(
  income: number,
  netWorth: number
): Promise<void> {
  if (!CONTRACT_ADDRESS) {
    // Simulation mode
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

  // Real on-chain path via Lace DApp Connector
  try {
    const { api } = await connectLaceWallet();

    // Get the wallet's ProvingProvider for ZK proof generation
    // The prover runs locally — private witnesses never leave the browser
    const provingProvider = await api.getProvingProvider({
      getProverKey: async (circuitKeyLocation: string) => {
        // Fetch prover key from the contract's managed artifacts
        const res = await fetch(`/managed/proofpass/${circuitKeyLocation}.pk`);
        if (!res.ok) throw new Error(`Failed to fetch prover key: ${circuitKeyLocation}`);
        return new Uint8Array(await res.arrayBuffer());
      },
      getVerifierKey: async (circuitKeyLocation: string) => {
        const res = await fetch(`/managed/proofpass/${circuitKeyLocation}.vk`);
        if (!res.ok) throw new Error(`Failed to fetch verifier key: ${circuitKeyLocation}`);
        return new Uint8Array(await res.arrayBuffer());
      },
      getZKIR: async (circuitKeyLocation: string) => {
        const res = await fetch(`/managed/proofpass/${circuitKeyLocation}.zkir`);
        if (!res.ok) throw new Error(`Failed to fetch ZKIR: ${circuitKeyLocation}`);
        return new Uint8Array(await res.arrayBuffer());
      },
    });

    // Encode private witnesses for the ZK circuit
    // These values are processed locally and NEVER sent over the network
    const witnessData = new TextEncoder().encode(
      JSON.stringify({
        user_income:    Math.floor(income),
        user_net_worth: Math.floor(netWorth),
      })
    );

    // Generate ZK proof locally
    const provedTx = await provingProvider.prove(
      witnessData,
      'prove_accreditation'
    );

    // Balance the transaction (wallet adds fees/inputs)
    const provedTxBase64 = btoa(String.fromCharCode(...provedTx));
    const balancedTxResult = await api.balanceUnsealedTransaction(provedTxBase64);

    // Submit to Preprod
    await api.submitTransaction(balancedTxResult.tx);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    throw new Error(`Circuit call failed: ${msg}`);
  }
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

  try {
    const { api } = await connectLaceWallet();
    const provingProvider = await api.getProvingProvider({
      getProverKey: async (loc: string) => {
        const res = await fetch(`/managed/proofpass/${loc}.pk`);
        return new Uint8Array(await res.arrayBuffer());
      },
      getVerifierKey: async (loc: string) => {
        const res = await fetch(`/managed/proofpass/${loc}.vk`);
        return new Uint8Array(await res.arrayBuffer());
      },
      getZKIR: async (loc: string) => {
        const res = await fetch(`/managed/proofpass/${loc}.zkir`);
        return new Uint8Array(await res.arrayBuffer());
      },
    });

    const provedTx = await provingProvider.prove(
      new Uint8Array(0),
      'reset_accreditation'
    );
    const provedTxBase64 = btoa(String.fromCharCode(...provedTx));
    const balancedTxResult = await api.balanceUnsealedTransaction(provedTxBase64);
    await api.submitTransaction(balancedTxResult.tx);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    throw new Error(`Reset failed: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// fetchLedgerState — reads public state from Midnight Preprod indexer
// ---------------------------------------------------------------------------
export async function fetchLedgerState(): Promise<LedgerState> {
  if (!CONTRACT_ADDRESS) {
    return { ..._sim };
  }

  try {
    const response = await fetch(PREPROD_INDEXER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query ContractState($address: String!) {
            contract(address: $address) {
              state {
                income_threshold
                networth_threshold
                total_verifications
                is_accredited
              }
            }
          }
        `,
        variables: { address: CONTRACT_ADDRESS },
      }),
    });

    const json = await response.json() as {
      data?: {
        contract?: {
          state?: {
            income_threshold: string;
            networth_threshold: string;
            total_verifications: string;
            is_accredited: boolean;
          };
        };
      };
    };

    const state = json?.data?.contract?.state;
    if (!state) throw new Error('Contract state not found in indexer');

    return {
      incomeThreshold:    Number(state.income_threshold),
      networthThreshold:  Number(state.networth_threshold),
      totalVerifications: Number(state.total_verifications),
      isAccredited:       Boolean(state.is_accredited),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    throw new Error(`Failed to read ledger state: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
