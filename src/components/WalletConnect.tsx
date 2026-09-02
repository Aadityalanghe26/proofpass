import React, { useState } from 'react';

interface WalletConnectProps {
  onConnected: (address: string) => void;
}

const WalletConnect: React.FC<WalletConnectProps> = ({ onConnected }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState<string | null>(null);

  const connectWallet = async () => {
    setLoading(true);
    setError(null);
    try {
      const midnight = (window as any).midnight;
      if (midnight?.mnLace) {
        const connector = await midnight.mnLace.enable();
        const state = await connector.state();
        const walletAddress = state?.address ?? 'lace-wallet-connected';
        setAddress(walletAddress);
        setConnected(true);
        onConnected(walletAddress);
      } else {
        // Dev fallback — no Lace required for local testing
        const devAddress = `dev_${Math.random().toString(36).slice(2, 10)}`;
        setAddress(devAddress);
        setConnected(true);
        onConnected(devAddress);
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to connect wallet. Is Lace installed?');
    } finally {
      setLoading(false);
    }
  };

  const truncate = (addr: string) =>
    addr.length > 16 ? `${addr.slice(0, 8)}...${addr.slice(-6)}` : addr;

  if (connected && address) {
    return (
      <div className="wallet-connected" role="status" aria-live="polite">
        <span className="wallet-dot" aria-hidden="true">●</span>
        <span className="wallet-label">Wallet connected:</span>
        <code className="wallet-address" title={address}>{truncate(address)}</code>
      </div>
    );
  }

  return (
    <div className="wallet-connect">
      <button
        className="btn btn-primary"
        onClick={connectWallet}
        disabled={loading}
        aria-busy={loading}
        aria-label="Connect Lace wallet"
      >
        {loading ? 'Connecting…' : 'Connect Lace Wallet'}
      </button>
      {error && <p className="error-message" role="alert">{error}</p>}
      <p className="wallet-hint">
        Requires <a href="https://www.lace.io/" target="_blank" rel="noopener noreferrer">Lace wallet</a> with Midnight enabled.
      </p>
    </div>
  );
};

export default WalletConnect;
