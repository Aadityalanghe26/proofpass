/**
 * deploy.mjs
 * ProofPass — Preprod deployment script.
 *
 * Uses the official Midnight counter-example pattern:
 * deployContract() from @midnight-ntwrk/midnight-js/contracts
 *
 * Environment variables required:
 *   WALLET_SEED      — 64-char hex seed for the deployment wallet
 *   INDEXER          — Preprod indexer HTTP URL
 *   INDEXER_WS       — Preprod indexer WebSocket URL
 *   NODE             — Preprod node RPC URL
 *   PROOF_SERVER     — Preprod proof server URL
 *
 * Run: node scripts/deploy.mjs
 */

import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// ---- Config ----
const config = {
  seed:        process.env.WALLET_SEED,
  indexer:     process.env.INDEXER     ?? 'https://indexer.testnet-02.midnight.network/api/v1/graphql',
  indexerWS:   process.env.INDEXER_WS  ?? 'wss://indexer.testnet-02.midnight.network/api/v1/graphql/ws',
  node:        process.env.NODE        ?? 'https://rpc.testnet-02.midnight.network',
  proofServer: process.env.PROOF_SERVER ?? 'https://proof-server.testnet-02.midnight.network',
  network:     process.env.NETWORK     ?? 'preprod',
};

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
  // Dynamic imports — packages must be installed
  const { deployContract }     = await import('@midnight-ntwrk/midnight-js/contracts');
  const { HDWallet, Roles, generateRandomSeed } = await import('@midnight-ntwrk/wallet-sdk-hd');
  const { WalletFacade }       = await import('@midnight-ntwrk/wallet-sdk-facade');
  const { ShieldedWallet }     = await import('@midnight-ntwrk/wallet-sdk-shielded');
  const { DustWallet }         = await import('@midnight-ntwrk/wallet-sdk-dust-wallet');
  const { createKeystore, InMemoryTransactionHistoryStorage, UnshieldedWallet } =
    await import('@midnight-ntwrk/wallet-sdk-unshielded-wallet');
  const { httpClientProofProvider } =
    await import('@midnight-ntwrk/midnight-js-http-client-proof-provider');
  const { indexerPublicDataProvider } =
    await import('@midnight-ntwrk/midnight-js-indexer-public-data-provider');
  const { NodeZkConfigProvider } =
    await import('@midnight-ntwrk/midnight-js-node-zk-config-provider');
  const { levelPrivateStateProvider } =
    await import('@midnight-ntwrk/midnight-js-level-private-state-provider');
  const { setNetworkId, getNetworkId } =
    await import('@midnight-ntwrk/midnight-js/network-id');
  const { CompiledContract } = await import('@midnight-ntwrk/compact-js');
  const Rx = await import('rxjs');
  const { WebSocket } = await import('ws');
  const { Buffer } = await import('buffer');

  // Required for GraphQL subscriptions
  globalThis.WebSocket = WebSocket;

  // Set network
  setNetworkId('TestNet');

  // ---- Derive wallet keys from seed ----
  console.log('Initializing wallet from seed...');
  const hdWallet = HDWallet.fromSeed(Buffer.from(config.seed, 'hex'));
  if (hdWallet.type !== 'seedOk') throw new Error('Invalid wallet seed');

  const derivationResult = hdWallet.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);

  if (derivationResult.type !== 'keysDerived') throw new Error('Key derivation failed');
  const keys = derivationResult.keys;
  hdWallet.hdWallet.clear();

  const shieldedSecretKeys = keys.Zswap;
  const dustSecretKey = keys.Dust;

  // ---- Build wallet facade ----
  const unshieldedKeystore = createKeystore(keys.NightExternal.privateKey);
  const { unshieldedToken } = await import('@midnight-ntwrk/ledger-v8');

  const shieldedWallet = await ShieldedWallet.create({
    networkId: getNetworkId(),
    indexerClientConnection: {
      indexerHttpUrl: config.indexer,
      indexerWsUrl: config.indexerWS,
    },
    provingServerUrl: new URL(config.proofServer),
    relayURL: new URL(config.node.replace(/^http/, 'ws')),
    secretKeys: shieldedSecretKeys,
  });

  const dustWallet = await DustWallet.create({
    networkId: getNetworkId(),
    costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
    indexerClientConnection: {
      indexerHttpUrl: config.indexer,
      indexerWsUrl: config.indexerWS,
    },
    provingServerUrl: new URL(config.proofServer),
    relayURL: new URL(config.node.replace(/^http/, 'ws')),
    dustSecretKey,
  });

  const unshieldedWallet = await UnshieldedWallet.create({
    networkId: getNetworkId(),
    indexerClientConnection: {
      indexerHttpUrl: config.indexer,
      indexerWsUrl: config.indexerWS,
    },
    txHistoryStorage: new InMemoryTransactionHistoryStorage(),
    keystore: unshieldedKeystore,
  });

  const wallet = new WalletFacade(shieldedWallet, dustWallet, unshieldedWallet);

  // ---- Wait for wallet sync ----
  console.log('Waiting for wallet sync...');
  const syncedState = await Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(5_000),
      Rx.filter((s) => s.isSynced),
    ),
  );
  console.log(`✓ Wallet synced`);

  const address = syncedState.shielded?.addresses?.[0]?.shieldedAddress ?? 'unknown';
  console.log(`  Wallet address: ${address}`);

  // Check DUST balance
  const dust = syncedState.dust.balance(new Date());
  console.log(`  DUST balance: ${dust.toLocaleString()}`);
  if (dust === 0n) {
    console.error('ERROR: No DUST available. Fund your wallet at https://faucet.midnight.network');
    process.exit(1);
  }

  // ---- Configure providers ----
  console.log('\nConfiguring providers...');
  const coinPublicKey = syncedState.shielded.coinPublicKey.toHexString();
  const storagePassword = `${Buffer.from(coinPublicKey, 'hex').toString('base64')}!`;

  const walletAndMidnightProvider = {
    getCoinPublicKey: () => coinPublicKey,
    getEncryptionPublicKey: () => syncedState.shielded.encryptionPublicKey.toHexString(),
    async balanceTx(tx, ttl) {
      const recipe = await wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys, dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      const signFn = (payload) => unshieldedKeystore.signData(payload);
      return wallet.finalizeRecipe(recipe);
    },
    submitTx: (tx) => wallet.submitTransaction(tx),
  };

  const zkConfigPath = './managed/proofpass';
  const zkConfigProvider = new NodeZkConfigProvider(zkConfigPath);

  const providers = {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: 'proofpass-private-state',
      accountId: coinPublicKey,
      privateStoragePasswordProvider: () => storagePassword,
    }),
    publicDataProvider: indexerPublicDataProvider(config.indexer, config.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(config.proofServer, zkConfigProvider),
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };
  console.log('✓ Providers configured');

  // ---- Load compiled contract ----
  console.log('\nLoading compiled contract...');
  const { Contract, witnesses } = await import('../managed/proofpass/proofpass.cjs');
  const compiledContract = CompiledContract.make('proofpass', Contract).pipe(
    CompiledContract.withVacantWitnesses,
    CompiledContract.withCompiledFileAssets(zkConfigPath),
  );
  console.log('✓ Contract loaded');

  // ---- Deploy ----
  console.log('\nDeploying ProofPass contract to Preprod...');
  const deployed = await deployContract(providers, {
    compiledContract,
    privateStateId: 'proofpassPrivateState',
    initialPrivateState: {},
  });

  const contractAddress = deployed.deployTxData.public.contractAddress;
  const txId = deployed.deployTxData.public.txId;
  const blockHeight = deployed.deployTxData.public.blockHeight;

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  ProofPass Deployed Successfully!                        ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  Contract Address: ${contractAddress}`);
  console.log(`  Transaction ID:   ${txId}`);
  console.log(`  Block Height:     ${blockHeight}`);
  console.log('');

  // Save deployment info
  const deployment = {
    contractAddress,
    txId,
    blockHeight,
    network: 'preprod',
    deployedAt: new Date().toISOString(),
  };
  writeFileSync('deployment.json', JSON.stringify(deployment, null, 2));
  console.log('✓ Saved to deployment.json');

  await wallet.stop();
  process.exit(0);
} catch (err) {
  console.error('Deploy failed:', err.message);
  console.error(err.stack);
  process.exit(1);
}
