/**
 * deploy-preprod.mjs
 * ProofPass — Deploy to Preprod using the same SDK pattern as create-mn-app.
 *
 * Run from the my-product directory using the proofpass-deploy node_modules:
 *   NODE_PATH=/home/adity/proofpass-deploy/node_modules \
 *   WALLET_SEED=<seed> node --experimental-vm-modules scripts/deploy-preprod.mjs
 */

import { writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// Use proofpass-deploy's node_modules which has the correct working versions
const DEPLOY_MODULES = '/home/adity/proofpass-deploy/node_modules';
const req = createRequire(DEPLOY_MODULES + '/package.json');

const WALLET_SEED = process.env.WALLET_SEED;
if (!WALLET_SEED) {
  console.error('ERROR: WALLET_SEED environment variable required');
  process.exit(1);
}

const PREPROD = {
  indexer:     'https://indexer.testnet-02.midnight.network/api/v1/graphql',
  indexerWS:   'wss://indexer.testnet-02.midnight.network/api/v1/graphql/ws',
  node:        'https://rpc.testnet-02.midnight.network',
  proofServer: 'https://proof-server.testnet-02.midnight.network',
};

const INCOME_THRESHOLD   = 200_000n;
const NETWORTH_THRESHOLD = 1_000_000n;

console.log('ProofPass — Deploying to Preprod');
console.log('=================================');

// Dynamic imports from proofpass-deploy node_modules
async function load(pkg) {
  return import(pathToFileURL(path.join(DEPLOY_MODULES, pkg.replace('@midnight-ntwrk/', '@midnight-ntwrk/'), 'dist', 'esm', 'index.js')).href)
    .catch(() => import(pathToFileURL(path.join(DEPLOY_MODULES, pkg, 'dist', 'index.js')).href))
    .catch(() => import(pathToFileURL(path.join(DEPLOY_MODULES, pkg, 'dist', 'cjs', 'index.js')).href))
    .catch(async () => {
      // fallback: use require
      return req(pkg);
    });
}

try {
  const { WebSocket } = await import(pathToFileURL(path.join(DEPLOY_MODULES, 'ws', 'lib', 'websocket.js')).href)
    .catch(() => import('ws'));
  globalThis.WebSocket = WebSocket;

  const { deployContract } = await import(pathToFileURL(path.join(DEPLOY_MODULES, '@midnight-ntwrk', 'midnight-js-contracts', 'dist', 'esm', 'index.js')).href)
    .catch(() => load('@midnight-ntwrk/midnight-js-contracts'));

  const { httpClientProofProvider } = await load('@midnight-ntwrk/midnight-js-http-client-proof-provider');
  const { indexerPublicDataProvider } = await load('@midnight-ntwrk/midnight-js-indexer-public-data-provider');
  const { levelPrivateStateProvider } = await load('@midnight-ntwrk/midnight-js-level-private-state-provider');
  const { NodeZkConfigProvider } = await load('@midnight-ntwrk/midnight-js-node-zk-config-provider');
  const { setNetworkId, getNetworkId } = await load('@midnight-ntwrk/midnight-js-network-id');

  // Load wallet from proofpass-deploy's wallet.ts helpers (already compiled)
  const walletSDK = await import(pathToFileURL(path.join(DEPLOY_MODULES, '@midnight-ntwrk', 'wallet-sdk', 'dist', 'esm', 'index.js')).href)
    .catch(() => load('@midnight-ntwrk/wallet-sdk'));

  const { CompiledContract } = await import(pathToFileURL(path.join(DEPLOY_MODULES, '@midnight-ntwrk', 'midnight-js-protocol', 'dist', 'esm', 'compact-js', 'index.js')).href)
    .catch(() => load('@midnight-ntwrk/midnight-js-protocol/compact-js'));

  setNetworkId('TestNet');

  console.log('Loading compiled ProofPass contract...');
  const zkConfigPath = path.join(projectRoot, 'managed');
  const contractModulePath = path.join(zkConfigPath, 'contract', 'index.js');

  if (!existsSync(contractModulePath)) {
    console.error('ERROR: Contract not compiled. Run: compact compile contracts/proofpass.compact managed/');
    process.exit(1);
  }

  const ProofPass = await import(pathToFileURL(contractModulePath).href);
  console.log('✓ Contract module loaded');

  const compiledContract = CompiledContract.make('proofpass', ProofPass.Contract).pipe(
    CompiledContract.withVacantWitnesses,
    CompiledContract.withCompiledFileAssets(zkConfigPath),
  );

  console.log('Setting up wallet from seed...');
  // Use the wallet-sdk createWallet pattern from proofpass-deploy
  const { createWallet } = await import(pathToFileURL(path.join('/home/adity/proofpass-deploy/src', 'wallet.ts')).href)
    .catch(async () => {
      // Fallback: inline wallet creation
      return { createWallet: null };
    });

  if (!createWallet) {
    console.error('Could not load wallet helpers from proofpass-deploy');
    process.exit(1);
  }

  const walletCtx = await createWallet(WALLET_SEED, {
    indexerHttpUrl: PREPROD.indexer,
    indexerWsUrl:   PREPROD.indexerWS,
    proofServerUrl: PREPROD.proofServer,
    nodeUrl:        PREPROD.node,
  });

  console.log('✓ Wallet ready');
  console.log(`  Address: ${walletCtx.unshieldedAddress}`);
  console.log(`  DUST:    ${walletCtx.dust}`);

  const zkProvider = new NodeZkConfigProvider(zkConfigPath);

  const providers = {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: 'proofpass-private',
      accountId: walletCtx.coinPublicKey,
      privateStoragePasswordProvider: () => walletCtx.coinPublicKey + '!ProofPass',
    }),
    publicDataProvider:  indexerPublicDataProvider(PREPROD.indexer, PREPROD.indexerWS),
    zkConfigProvider:    zkProvider,
    proofProvider:       httpClientProofProvider(PREPROD.proofServer, zkProvider),
    walletProvider:      walletCtx.provider,
    midnightProvider:    walletCtx.provider,
  };

  console.log('\nDeploying ProofPass to Preprod...');
  const deployed = await deployContract(providers, {
    contract: compiledContract,
    privateStateId: 'proofpassPrivateState',
    initialPrivateState: {},
  });

  const contractAddress = deployed.deployTxData.public.contractAddress;
  console.log('\n✅ DEPLOYED!');
  console.log(`Contract Address: ${contractAddress}`);

  // Save deployment info
  const info = {
    contractAddress,
    network: 'preprod',
    deployedAt: new Date().toISOString(),
  };
  writeFileSync(path.join(projectRoot, 'deployment.json'), JSON.stringify(info, null, 2));
  console.log('✓ Saved to deployment.json');

  process.exit(0);
} catch (err) {
  console.error('\nDeploy failed:', err.message);
  if (err.stack) console.error(err.stack.split('\n').slice(0, 5).join('\n'));
  process.exit(1);
}
