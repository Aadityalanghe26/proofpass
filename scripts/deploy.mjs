/**
 * deploy.mjs
 * ProofPass — Preprod deployment script.
 * @version 2.0.0
 *
 * Uses the official Midnight counter-example pattern:
 *   deployContract() from @midnight-ntwrk/midnight-js/contracts
 *
 * After deployment the initialize() circuit is called programmatically
 * (equivalent to --init-circuit initialize --init-args 200000 1000000)
 * to set the SEC thresholds and seed the nullifier_set on-chain.
 *
 * Environment variables required:
 *   WALLET_SEED      — 64-char hex seed for the deployment wallet
 *
 * Optional overrides (defaults point to Midnight testnet-02):
 *   INDEXER          — Preprod indexer HTTP URL
 *   INDEXER_WS       — Preprod indexer WebSocket URL
 *   NODE             — Preprod node RPC URL
 *   PROOF_SERVER     — Preprod proof server URL
 *
 * Run: node scripts/deploy.mjs
 *
 * Prerequisites:
 *   1. compact compile contracts/proofpass.compact --output managed/
 *   2. Fund the deployment wallet at https://faucet.midnight.network
 */

import { writeFileSync } from 'node:fs';

// ---- Config ----------------------------------------------------------------
const config = {
  seed:        process.env.WALLET_SEED,
  indexer:     process.env.INDEXER      ?? 'https://indexer.testnet-02.midnight.network/api/v1/graphql',
  indexerWS:   process.env.INDEXER_WS   ?? 'wss://indexer.testnet-02.midnight.network/api/v1/graphql/ws',
  node:        process.env.NODE         ?? 'https://rpc.testnet-02.midnight.network',
  proofServer: process.env.PROOF_SERVER ?? 'https://proof-server.testnet-02.midnight.network',
};

const INCOME_THRESHOLD  = 200_000n;   // SEC Rule 501: $200,000/year
const NETWORTH_THRESHOLD = 1_000_000n; // SEC Rule 501: $1,000,000

if (!config.seed) {
  console.error('ERROR: WALLET_SEED environment variable is required');
  process.exit(1);
}

console.log('ProofPass — Deploying to Preprod');
console.log('=================================');
console.log(`Indexer:      ${config.indexer}`);
console.log(`Node:         ${config.node}`);
console.log(`Proof Server: ${config.proofServer}`);
console.log('');

try {
  // ---- Dynamic imports (all packages must be installed) -------------------
  const { deployContract, callTx }        = await import('@midnight-ntwrk/midnight-js/contracts');
  const { HDWallet, Roles }               = await import('@midnight-ntwrk/wallet-sdk-hd');
  const { WalletFacade }                  = await import('@midnight-ntwrk/wallet-sdk-facade');
  const { ShieldedWallet }                = await import('@midnight-ntwrk/wallet-sdk-shielded');
  const { DustWallet }                    = await import('@midnight-ntwrk/wallet-sdk-dust-wallet');
  const {
    createKeystore,
    InMemoryTransactionHistoryStorage,
    UnshieldedWallet,
  }                                        = await import('@midnight-ntwrk/wallet-sdk-unshielded-wallet');
  const { httpClientProofProvider }        = await import('@midnight-ntwrk/midnight-js-http-client-proof-provider');
  const { indexerPublicDataProvider }      = await import('@midnight-ntwrk/midnight-js-indexer-public-data-provider');
  const { NodeZkConfigProvider }           = await import('@midnight-ntwrk/midnight-js-node-zk-config-provider');
  const { levelPrivateStateProvider }      = await import('@midnight-ntwrk/midnight-js-level-private-state-provider');
  const { setNetworkId, getNetworkId }     = await import('@midnight-ntwrk/midnight-js/network-id');
  const { Contract }                       = await import('../managed/proofpass/proofpass.cjs');
  const Rx                                 = await import('rxjs');
  const { WebSocket }                      = await import('ws');
  const { Buffer }                         = await import('buffer');

  // Required for GraphQL subscriptions over WebSocket
  globalThis.WebSocket = WebSocket;

  // Set network to Midnight testnet
  setNetworkId('TestNet');

  // ---- Derive wallet keys from seed ---------------------------------------
  console.log('Initializing wallet from seed…');
  const hdResult = HDWallet.fromSeed(Buffer.from(config.seed, 'hex'));
  if (hdResult.type !== 'seedOk') throw new Error('Invalid wallet seed');

  const derivation = hdResult.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);

  if (derivation.type !== 'keysDerived') throw new Error('Key derivation failed');
  const keys = derivation.keys;
  hdResult.hdWallet.clear();

  const shieldedSecretKeys  = keys.Zswap;
  const dustSecretKey       = keys.Dust;
  const unshieldedKeystore  = createKeystore(keys.NightExternal.privateKey);

  // Sign function used by the wallet to authorise unshielded transactions
  const signFn = (payload) => unshieldedKeystore.signData(payload);

  // ---- Build wallet facade -----------------------------------------------
  const { unshieldedToken } = await import('@midnight-ntwrk/ledger-v8');

  const shieldedWallet = await ShieldedWallet.create({
    networkId: getNetworkId(),
    indexerClientConnection: { indexerHttpUrl: config.indexer, indexerWsUrl: config.indexerWS },
    provingServerUrl: new URL(config.proofServer),
    relayURL:         new URL(config.node.replace(/^http/, 'ws')),
    secretKeys:       shieldedSecretKeys,
  });

  const dustWallet = await DustWallet.create({
    networkId: getNetworkId(),
    costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
    indexerClientConnection: { indexerHttpUrl: config.indexer, indexerWsUrl: config.indexerWS },
    provingServerUrl: new URL(config.proofServer),
    relayURL:         new URL(config.node.replace(/^http/, 'ws')),
    dustSecretKey,
  });

  const unshieldedWallet = await UnshieldedWallet.create({
    networkId: getNetworkId(),
    indexerClientConnection: { indexerHttpUrl: config.indexer, indexerWsUrl: config.indexerWS },
    txHistoryStorage: new InMemoryTransactionHistoryStorage(),
    keystore:         unshieldedKeystore,
  });

  const wallet = new WalletFacade(shieldedWallet, dustWallet, unshieldedWallet);

  // ---- Wait for wallet sync ----------------------------------------------
  console.log('Waiting for wallet sync…');
  const syncedState = await Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(5_000),
      Rx.filter((s) => s.isSynced),
    ),
  );
  console.log('✓ Wallet synced');

  const coinPublicKey = syncedState.shielded.coinPublicKey.toHexString();
  const address       = syncedState.shielded?.addresses?.[0]?.shieldedAddress ?? 'unknown';
  console.log(`  Address: ${address}`);

  // Check DUST balance (needed to pay transaction fees)
  const dust = syncedState.dust.balance(new Date());
  console.log(`  DUST balance: ${dust.toLocaleString()}`);
  if (dust === 0n) {
    console.error('ERROR: No DUST balance. Fund your wallet at https://faucet.midnight.network');
    process.exit(1);
  }

  // ---- Configure providers -----------------------------------------------
  console.log('\nConfiguring providers…');

  const storagePassword = `${Buffer.from(coinPublicKey, 'hex').toString('base64')}!`;

  /**
   * walletAndMidnightProvider — bridges the wallet facade to the Midnight SDK
   * provider interface used by deployContract() and callTx().
   *
   * balanceTx: balances an unbound transaction (adds fees / DUST inputs),
   *   then finalises and signs using signFn — required for unshielded TXs.
   */
  const walletAndMidnightProvider = {
    getCoinPublicKey:       () => coinPublicKey,
    getEncryptionPublicKey: () => syncedState.shielded.encryptionPublicKey.toHexString(),

    async balanceTx(tx, ttl) {
      const recipe = await wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys, dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      // Pass signFn so the wallet can authorise unshielded transactions
      return wallet.finalizeRecipe(recipe, signFn);
    },

    submitTx: (tx) => wallet.submitTransaction(tx),
  };

  const zkConfigPath    = './managed/proofpass';
  const zkConfigProvider = new NodeZkConfigProvider(zkConfigPath);

  const providers = {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName:    'proofpass-private-state',
      accountId:                coinPublicKey,
      privateStoragePasswordProvider: () => storagePassword,
    }),
    publicDataProvider: indexerPublicDataProvider(config.indexer, config.indexerWS),
    zkConfigProvider,
    proofProvider:  httpClientProofProvider(config.proofServer, zkConfigProvider),
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };
  console.log('✓ Providers configured');

  // ---- Deploy contract ---------------------------------------------------
  console.log('\nDeploying ProofPass contract to Preprod…');

  const deployed = await deployContract(providers, {
    contract: new Contract({}),           // compiled Contract class from proofpass.cjs
    privateStateId:    'proofpassPrivateState',
    initialPrivateState: {},
  });

  const contractAddress = deployed.deployTxData.public.contractAddress;
  const deployTxId      = deployed.deployTxData.public.txId;
  const deployBlock     = deployed.deployTxData.public.blockHeight;

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  ProofPass Contract Deployed!                            ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  Contract Address: ${contractAddress}`);
  console.log(`  Transaction ID:   ${deployTxId}`);
  console.log(`  Block Height:     ${deployBlock}`);

  // ---- Call initialize() circuit -----------------------------------------
  // Sets income_threshold = 200,000, networth_threshold = 1,000,000 and
  // seeds the nullifier_set on-chain. Equivalent to:
  //   midnight deploy --init-circuit initialize --init-args 200000 1000000
  console.log('\nCalling initialize() circuit (SEC thresholds + nullifier_set seed)…');

  const initTxData = await callTx(providers, deployed, 'initialize', [
    INCOME_THRESHOLD,
    NETWORTH_THRESHOLD,
  ]);

  const initTxId    = initTxData.public.txId;
  const initBlock   = initTxData.public.blockHeight;

  console.log('✓ initialize() complete');
  console.log(`  Tx ID:       ${initTxId}`);
  console.log(`  Block Height: ${initBlock}`);
  console.log(`  income_threshold:    $${INCOME_THRESHOLD.toLocaleString()}`);
  console.log(`  networth_threshold:  $${NETWORTH_THRESHOLD.toLocaleString()}`);

  // ---- Save deployment info ---------------------------------------------
  const deployment = {
    contractAddress,
    deployTxId,
    deployBlockHeight: deployBlock,
    initTxId,
    initBlockHeight:   initBlock,
    incomeThreshold:   INCOME_THRESHOLD.toString(),
    networthThreshold: NETWORTH_THRESHOLD.toString(),
    network:           'preprod',
    deployedAt:        new Date().toISOString(),
  };

  writeFileSync('deployment.json', JSON.stringify(deployment, null, 2));
  console.log('\n✓ Deployment info saved to deployment.json');
  console.log('\nNext step: add VITE_CONTRACT_ADDRESS to .env and redeploy frontend.');
  console.log(`  VITE_CONTRACT_ADDRESS=${contractAddress}`);

  await wallet.stop();
  process.exit(0);
} catch (err) {
  console.error('\nDeploy failed:', err.message);
  console.error(err.stack);
  process.exit(1);
}
