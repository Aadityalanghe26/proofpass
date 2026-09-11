/**
 * WalletConnect — Lace wallet connection via official Midnight DApp Connector API.
 * @version 2.0.0
 *
 * Uses window.midnight (injected by Lace) to connect via the official
 * @midnight-ntwrk/dapp-connector-api InitialAPI interface.
 */

import React, { useState } from 'react';
import { CONTRACT_ADDRESS } from '../utils/contract';
import { connectLaceWallet } from '../utils/contract';

interface WalletConnectProps {
  onConnected: (address: string) => void;
}

const WalletConnect: React.FC<WalletConnectProps> = ({ onConnected }) => {
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [address, setAddress]     = useState<string | null>(null);
  const isSimulation = !CONTRACT_ADDRESS;

  const handleConnect = async () => {
    setLoading(true);
    setError(null);

    try {
      if (isSimulation) {
        // Simulation mode — no real wallet needed
        const mockAddr = `sim_${Math.random().toString(36).slice(2, 10)}`;
        setAddress(mockAddr);
        setConnected(true);
        onConnected(mockAddr);
      } else {
        // Real mode — connect via official Lace DApp Connector
        const { address: walletAddr } = await connectLaceWallet();
        setAddress(walletAddr);
        setConnected(true);
        onConnected(walletAddr);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to connect wallet';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const truncate = (addr: string) =>
    addr.length > 20 ? `${addr.slice(0, 10)}...${addr.slice(-6)}` : addr;

  if (connected && address) {
    return (
      <div className="wallet-connected" role="status" aria-live="polite">
        <span className="wallet-dot" aria-hidden="true">●</span>
        <span className="wallet-label">
          {isSimulation ? 'Simulation wallet:' : 'Lace wallet:'}
        </span>
        <code className="wallet-address" title={address}>{truncate(address)}</code>
        {isSimulation && (
          <span className="sim-badge" title="Running in simulation mode — no blockchain connection">
            SIM
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="wallet-connect">
      <button
        className="btn btn-primary"
        onClick={handleConnect}
        disabled={loading}
        aria-busy={loading}
        aria-label={isSimulation ? 'Connect simulation wallet' : 'Connect Lace wallet'}
      >
        {loading
          ? 'Connecting…'
          : isSimulation
          ? 'Connect (Simulation Mode)'
          : 'Connect Lace Wallet'}
      </button>
      {error && <p className="error-message" role="alert">{error}</p>}
      {!isSimulation && (
        <p className="wallet-hint">
          Requires{' '}
          <a href="https://www.lace.io/" target="_blank" rel="noopener noreferrer">
            Lace wallet
          </a>{' '}
          with Midnight support enabled on Preprod network.
        </p>
      )}
      {isSimulation && (
        <p className="wallet-hint sim-note">
          ⚠️ Running in simulation mode. Set <code>VITE_CONTRACT_ADDRESS</code> for live Preprod.
        </p>
      )}
    </div>
  );
};

export default WalletConnect;
