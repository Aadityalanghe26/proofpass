/**
 * Layout — ProofPass app shell with sticky header and footer.
 * @version 1.1.0
 */
import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="layout">
      <header className="app-header" role="banner">
        <div className="header-inner">
          <div className="logo" aria-label="ProofPass">
            <span aria-hidden="true">🛡️</span>
            <span className="logo-text">ProofPass</span>
            <span className="logo-badge">on Midnight</span>
          </div>
          <nav className="header-nav" aria-label="Main navigation">
            <a href="https://midnight.network" target="_blank" rel="noopener noreferrer" className="nav-link">
              Midnight Network
            </a>
            <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="nav-link">
              GitHub
            </a>
            <a href="https://github.com/Aadityalanghe26/proofpass/blob/main/docs/USAGE.md" target="_blank" rel="noopener noreferrer" className="nav-link">Docs</a>
          </nav>
        </div>
      </header>

      <main className="main-content" id="main-content" role="main">
        {children}
      </main>

      <footer className="app-footer" role="contentinfo">
        <p>
          Built on{' '}
          <a href="https://midnight.network" target="_blank" rel="noopener noreferrer">
            Midnight Network
          </a>{' '}
          — privacy by default, powered by zero-knowledge proofs.
        </p>
        <p className="footer-disclaimer">
          Your financial data never leaves your device. Nothing is stored on any server.
        </p>
      </footer>
    </div>
  );
};

export default Layout;
