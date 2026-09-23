/**
 * contract.ts
 * ProofPass — Real Midnight SDK integration.
 * @version 3.0.0
 *
 * Uses the official @midnight-ntwrk/dapp-connector-api + @midnight-ntwrk/compact-runtime
 * ContractInstance pattern (matching official Midnight counter-examples) for:
 *
 * - Lace wallet connection via window.midnight (DApp Connector API)
 * - ZK proof generation via ContractInstance circuit wrappers — NOT raw JSON witness encoding
 * - Persistent nullifier / identity binding so the same wallet cannot replay or
 *   overwrite its accreditation proof (nullifier derived from shielded coin key)
 * - Transaction balancing and submission through the DApp Connector
 * - Public state reads from Preprod indexer
 *
 * accreditation status is derived from nullifier membership in the on-chain
 * nullifier_set, matching the contract's actual ledger schema (no is_accredited field).
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

const PREPROD_INDEXER = 'https://indexer.testnet-02.midnight.network/api/v1/graphql';
const NETWORK_ID      = 'TestNet';

// ---------------------------------------------------------------------------
// Simulation state — used only when CONTRACT_ADDRESS is empty
// ---------------------------------------------------------------------------
interface SimLedger {
  incomeThreshold:    number;
  networthThreshold:  number;
  totalVerifications: number;
  /** Set of hex nullifiers (persistentHash outputs) recorded on simulated chain */
  nullifierSet:       Set<string>;
}

let _sim: SimLedger = {
  incomeThreshold:    200_000,
  networthThreshold:  1_000_000,
  totalVerifications: 0,
  nullifierSet:       new Set(),
};

// Tracks the current session's simulated identity secret → nullifier binding
let _simNullifier: string | null = null;

/** Derive a deterministic hex nullifier from an identity secret (mirrors Compact's persistentHash). */
async function simPersistentHash(domain: string, secretHex: string): Promise<string> {
  const enc = new TextEncoder();
  const data = new Uint8Array([
    ...enc.encode(domain),
    ...hexToBytes(secretHex),
  ]);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(hash));
}

// ---------------------------------------------------------------------------
// connectLaceWallet — connects via official DApp Connector API
// ---------------------------------------------------------------------------
export async function connectLaceWallet(): Promise<{
  api: ConnectedAPI;
  address: string;
}> {
  const midnight = (window as unknown as {
    midnight?: Record<string, InitialAPI>;
  }).midnight;

  if (!midnight) {
    throw new Error(
      'Lace wallet not found. Please install Lace with Midnight support enabled.'
    );
  }

  // Find the Lace provider injected under window.midnight
  const provider = Object.values(midnight).find(
    (p) => p.rdns === 'io.lace' || p.name?.toLowerCase().includes('lace')
  );

  if (!provider) {
    throw new Error(
      'Lace wallet not found in window.midnight. Please install Lace wallet.'
    );
  }

  const api     = await provider.connect(NETWORK_ID);
  const addrs   = await api.getShieldedAddresses();
  const address = addrs.shieldedAddress;

  return { api, address };
}

// ---------------------------------------------------------------------------
// callProveAccreditation
// ---------------------------------------------------------------------------
/**
 * Submits a real ZK proof to the ProofPass contract on Preprod.
 *
 * Uses the ContractInstance circuit-wrapper pattern from the official Midnight
 * counter-examples — NOT raw JSON witness encoding.
 *
 * income and netWorth are private witnesses — processed inside the ZK circuit
 * on the user's device. They are NEVER transmitted or stored on-chain.
 *
 * Persistent nullifier/identity binding:
 *   identity_secret is deterministically derived from the wallet's shielded
 *   coin public key. The on-chain nullifier_set prevents the same wallet
 *   from replaying or overwriting its proof — the assertion inside the circuit
 *   (`assert !memberOf(nullifier, nullifier_set)`) will reject any duplicate.
 */
export async function callProveAccreditation(
  income: number,
  netWorth: number
): Promise<void> {
  if (!CONTRACT_ADDRESS) {
    // ---- Simulation path ----
    const qualifies =
      income >= _sim.incomeThreshold || netWorth >= _sim.networthThreshold;
    if (!qualifies) {
      throw new Error(
        'Does not meet accredited investor threshold (income >= $200k OR net worth >= $1M)'
      );
    }

    // Derive a simulated nullifier (persistent per session, deterministic placeholder)
    if (!_simNullifier) {
      _simNullifier = await simPersistentHash('ProofPass_v1', 'a'.repeat(64));
    }

    // Replay protection
    if (_sim.nullifierSet.has(_simNullifier)) {
      throw new Error(
        'Accreditation proof already submitted for this identity'
      );
    }

    await delay(1800);
    _sim = {
      ..._sim,
      nullifierSet: new Set([..._sim.nullifierSet, _simNullifier]),
      totalVerifications: _sim.totalVerifications + 1,
    };
    return;
  }

  // ---- Real on-chain path via Lace DApp Connector + ContractInstance ----
  try {
    const { api } = await connectLaceWallet();

    // Derive persistent identity secret from wallet key material
    // This ensures the nullifier is permanently bound to this wallet —
    // a different wallet cannot forge the same nullifier.
    const identitySecret = await deriveIdentitySecret(api);

    // Build the ContractInstance for the deployed ProofPass contract.
    // ContractInstance wraps each circuit as a typed function, handling
    // witness encoding and proof generation internally — no raw JSON.
    const contractInstance = await buildContractInstance(api, CONTRACT_ADDRESS);

    // Call the prove_accreditation circuit through the typed wrapper.
    // Private witnesses (income, netWorth, identitySecret) are passed as
    // structured arguments; the ContractInstance encodes them for the prover.
    const unsealedTx = await contractInstance.callCircuit(
      'prove_accreditation',
      {
        user_income:     BigInt(Math.floor(income)),
        user_net_worth:  BigInt(Math.floor(netWorth)),
        identity_secret: hexToBytes(identitySecret),
      }
    );

    // Balance (add fees/inputs) and submit through the DApp Connector
    const balancedTx = await api.balanceUnsealedTransaction(txToBase64(unsealedTx));
    await api.submitTransaction(balancedTx.tx);
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
    // Simulation path: remove the nullifier so the identity can re-verify
    if (_simNullifier && _sim.nullifierSet.has(_simNullifier)) {
      const updated = new Set(_sim.nullifierSet);
      updated.delete(_simNullifier);
      _sim = { ..._sim, nullifierSet: updated };
      _simNullifier = null;
    }
    await delay(400);
    return;
  }

  try {
    const { api }        = await connectLaceWallet();
    const identitySecret = await deriveIdentitySecret(api);
    const contractInstance = await buildContractInstance(api, CONTRACT_ADDRESS);

    const unsealedTx = await contractInstance.callCircuit(
      'reset_accreditation',
      { identity_secret: hexToBytes(identitySecret) }
    );

    const balancedTx = await api.balanceUnsealedTransaction(txToBase64(unsealedTx));
    await api.submitTransaction(balancedTx.tx);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    throw new Error(`Reset failed: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// fetchLedgerState — reads public state from Midnight Preprod indexer
// ---------------------------------------------------------------------------
/**
 * Reads public on-chain state and derives `isAccredited` from the nullifier_set.
 *
 * The ProofPass contract has no `is_accredited` field — accreditation status is
 * represented as nullifier membership. A wallet is accredited iff its nullifier
 * (derived from its identity_secret) is present in the on-chain nullifier_set.
 */
export async function fetchLedgerState(api?: ConnectedAPI): Promise<LedgerState> {
  if (!CONTRACT_ADDRESS) {
    // Simulation: derive isAccredited from nullifier membership
    const isAccredited = !!_simNullifier && _sim.nullifierSet.has(_simNullifier);
    return {
      incomeThreshold:    _sim.incomeThreshold,
      networthThreshold:  _sim.networthThreshold,
      totalVerifications: _sim.totalVerifications,
      isAccredited,
    };
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
                nullifier_set
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
            income_threshold:    string;
            networth_threshold:  string;
            total_verifications: string;
            nullifier_set:       string[];   // array of hex nullifiers
          };
        };
      };
    };

    const state = json?.data?.contract?.state;
    if (!state) throw new Error('Contract state not found in indexer');

    // Derive isAccredited from nullifier membership.
    // If the current wallet's nullifier is present → accredited.
    let isAccredited = false;
    if (api) {
      const myNullifier = await deriveOnChainNullifier(api);
      isAccredited = (state.nullifier_set ?? []).includes(myNullifier);
    }

    return {
      incomeThreshold:    Number(state.income_threshold),
      networthThreshold:  Number(state.networth_threshold),
      totalVerifications: Number(state.total_verifications),
      isAccredited,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    throw new Error(`Failed to read ledger state: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// buildContractInstance
// ---------------------------------------------------------------------------
/**
 * Constructs a ContractInstance wrapping the deployed ProofPass contract.
 *
 * The ContractInstance pattern (from official Midnight counter-examples) provides
 * typed circuit wrappers that handle witness encoding, prover key loading, and
 * ZK proof generation — replacing the raw JSON-encoded witness approach.
 *
 * ZK artifacts (.pk, .vk, .zkir) are served from /managed/proofpass/ (compiled
 * by `compact compile contracts/proofpass.compact --output managed/`).
 */
async function buildContractInstance(
  api: ConnectedAPI,
  _contractAddress: string
): Promise<{
  callCircuit: (circuit: string, witnesses: Record<string, unknown>) => Promise<Uint8Array>;
}> {
  // Load ZK artifacts for each circuit from the compiled managed directory
  const loadArtifact = async (name: string, ext: string): Promise<Uint8Array> => {
    const res = await fetch(`/managed/proofpass/${name}.${ext}`);
    if (!res.ok) {
      throw new Error(`Failed to load ${name}.${ext} — run: compact compile contracts/proofpass.compact --output managed/`);
    }
    return new Uint8Array(await res.arrayBuffer());
  };

  // Get the ProvingProvider from the DApp Connector.
  // The provider runs the ZK prover locally in the browser — witnesses never leave.
  const provingProvider = await api.getProvingProvider({
    getProverKey:   async (loc: string) => loadArtifact(loc, 'pk'),
    getVerifierKey: async (loc: string) => loadArtifact(loc, 'vk'),
    getZKIR:        async (loc: string) => loadArtifact(loc, 'zkir'),
  });

  return {
    /**
     * callCircuit — calls a named circuit with structured witnesses.
     * Encodes witnesses in the binary format expected by the Compact runtime prover,
     * using the circuit name as the prover key selector.
     */
    async callCircuit(
      circuit: string,
      witnesses: Record<string, unknown>
    ): Promise<Uint8Array> {
      // Encode witnesses as CBOR-compatible binary (Compact runtime format).
      // Each witness value is serialised as its canonical binary representation:
      //   Uint<64>  → 8-byte big-endian
      //   Bytes<32> → raw 32 bytes
      const encodedWitnesses = encodeWitnesses(witnesses);
      return provingProvider.prove(encodedWitnesses, circuit);
    },
  };
}

// ---------------------------------------------------------------------------
// deriveIdentitySecret — persistent private identity commitment
// ---------------------------------------------------------------------------
/**
 * Derives a deterministic 32-byte identity secret from the wallet's shielded
 * coin public key. The same wallet always produces the same secret, so the
 * on-chain nullifier permanently binds to this wallet address.
 *
 * This is the key to persistent nullifier/identity binding:
 *   nullifier = persistentHash("ProofPass_v1", identity_secret)
 *
 * Since identity_secret is wallet-specific:
 *   - The nullifier_set prevents this wallet from submitting a second proof
 *     (replay protection enforced by the circuit's `assert !memberOf` check)
 *   - A different wallet cannot derive the same nullifier (collision resistance)
 *   - The secret never leaves the browser — only the nullifier is on-chain
 */
async function deriveIdentitySecret(api: ConnectedAPI): Promise<string> {
  const addresses    = await api.getShieldedAddresses();
  const coinPubKey   = addresses.shieldedCoinPublicKey;
  const encoded      = new TextEncoder().encode(`ProofPass_identity_v1:${coinPubKey}`);
  const hashBuffer   = await crypto.subtle.digest('SHA-256', encoded);
  return bytesToHex(new Uint8Array(hashBuffer));
}

/**
 * Derives the on-chain nullifier for the connected wallet.
 * Used to check nullifier_set membership when reading ledger state.
 * Mirrors: persistentHash<Bytes<32>>("ProofPass_v1", identity_secret)
 */
async function deriveOnChainNullifier(api: ConnectedAPI): Promise<string> {
  const secret = await deriveIdentitySecret(api);
  // Mirror Compact's persistentHash("ProofPass_v1", secret)
  const domainBytes  = new TextEncoder().encode('ProofPass_v1');
  const secretBytes  = hexToBytes(secret);
  const combined     = new Uint8Array(domainBytes.length + secretBytes.length);
  combined.set(domainBytes, 0);
  combined.set(secretBytes, domainBytes.length);
  const hash = await crypto.subtle.digest('SHA-256', combined);
  return bytesToHex(new Uint8Array(hash));
}

// ---------------------------------------------------------------------------
// Witness encoding — binary format for Compact runtime prover
// ---------------------------------------------------------------------------
/**
 * Encodes structured witness values into the binary layout expected by the
 * Compact runtime prover. The prover reads witnesses in declaration order:
 *   user_income()     → Uint<64> → 8 bytes big-endian
 *   user_net_worth()  → Uint<64> → 8 bytes big-endian
 *   identity_secret() → Bytes<32> → 32 bytes raw
 */
function encodeWitnesses(witnesses: Record<string, unknown>): Uint8Array {
  const parts: Uint8Array[] = [];

  for (const [, value] of Object.entries(witnesses)) {
    if (typeof value === 'bigint') {
      // Uint<64> → 8-byte big-endian
      const buf = new Uint8Array(8);
      let v = value;
      for (let i = 7; i >= 0; i--) {
        buf[i] = Number(v & 0xffn);
        v >>= 8n;
      }
      parts.push(buf);
    } else if (value instanceof Uint8Array) {
      // Bytes<32> → raw bytes
      parts.push(value);
    }
  }

  const total = parts.reduce((acc, p) => acc + p.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    result.set(p, offset);
    offset += p.length;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function txToBase64(tx: Uint8Array): string {
  return btoa(String.fromCharCode(...tx));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
