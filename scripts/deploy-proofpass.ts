/**
 * deploy-proofpass.ts
 * Deploys ProofPass to Preprod using proofpass-deploy's working SDK setup.
 * Run from ~/proofpass-deploy:
 *   npx tsx src/deploy-proofpass.ts --network preprod
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveNetwork, getOrCreateWallet, formatWalletBackupNotice, recordDeployment } from './network';
import { createWallet, persistWalletState, unshieldedToken, type WalletContext } from './wallet';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocket } from 'ws';
import * as Rx from 'rxjs';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';

// @ts-expect-error websocket
globalThis.WebSocket = WebSocket;

const DUST_WAIT_TIMEOUT_MS = 5 * 60 * 1000;
const { network, config: networkConfig } = resolveNetwork();
const WALLET = getOrCreateWallet(network);
const SEED = WALLET.seed;
const notice = formatWalletBackupNotice(WALLET, network);
if (notice) console.log(notice);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Point to ProofPass compiled artifacts (copied into proofpass-deploy)
const zkConfigPath = path.resolve(__dirname, '..', 'contracts', 'managed', 'proofpass');
const contractPath = path.join(zkConfigPath, 'contract', 'index.js');

if (!fs.existsSync(contractPath)) {
  console.error('\n❌ ProofPass contract not found at:', contractPath);
  console.error('Run: cp -r <my-product>/managed ~/proofpass-deploy/contracts/managed/proofpass\n');
  process.exit(1);
}

const ProofPass = await import(pathToFileURL(contractPath).href);

// Witness stubs required by the Contract constructor.
// The initialize() circuit has no witnesses — these stubs satisfy the type
// check but are never invoked during deployment.
const witnessStubs = {
  user_income:     (_ctx: unknown) => [undefined, 0n] as [unknown, bigint],
  user_net_worth:  (_ctx: unknown) => [undefined, 0n] as [unknown, bigint],
  identity_secret: (_ctx: unknown) => [undefined, new Uint8Array(32)] as [unknown, Uint8Array],
};

// Build CompiledContract using withWitnesses (not withVacantWitnesses which sets witnesses:{})
const baseContract = CompiledContract.make('proofpass', ProofPass.Contract);
const withAssets = CompiledContract.withCompiledFileAssets(zkConfigPath)(baseContract);
// Apply witnesses directly using the internal TypeId symbol
const TypeId = Object.getOwnPropertySymbols(withAssets).find(
  s => s.toString().includes('compact-js/CompiledContract')
) ?? Object.getOwnPropertySymbols(withAssets)[0];
const compiledContract = {
  ...withAssets,
  [TypeId]: {
    ...withAssets[TypeId as keyof typeof withAssets],
    witnesses: witnessStubs,
  },
} as any;

async function createProviders(walletCtx: WalletContext, state: any) {
  const privateStatePassword = process.env.PRIVATE_STATE_PASSWORD?.trim() || 'ProofPass-Preprod-PrivState-Key-1';

  const walletProvider = {
    getCoinPublicKey: () => state.shielded.coinPublicKey,
    getEncryptionPublicKey: () => state.shielded.encryptionPublicKey,
    async balanceTx(tx: any, ttl?: Date) {
      const recipe = await walletCtx.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: walletCtx.shieldedSecretKeys, dustSecretKey: walletCtx.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      return walletCtx.wallet.finalizeRecipe(recipe);
    },
    submitTx: (tx: any) => walletCtx.wallet.submitTransaction(tx) as any,
  };
  const zkConfigProvider = new NodeZkConfigProvider(zkConfigPath);
  const accountId = walletCtx.unshieldedKeystore.getBech32Address().toString();
  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: 'proofpass-private-state',
      accountId,
      privateStoragePasswordProvider: () => privateStatePassword,
    }),
    publicDataProvider: indexerPublicDataProvider(networkConfig.indexer, networkConfig.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(networkConfig.proofServer, zkConfigProvider),
    walletProvider,
    midnightProvider: walletProvider,
  };
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  ProofPass — Deploy to Preprod                               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log('Setting up wallet...');
  const walletCtx = await createWallet({ network, networkConfig, seed: SEED });

  console.log('Syncing with Preprod (takes 5–15 min on first run)...');
  const syncStart = Date.now();
  const syncInterval = setInterval(() => {
    process.stdout.write(`\r  Still syncing... (${Math.round((Date.now() - syncStart) / 1000)}s)   `);
  }, 5000);

  const state = await walletCtx.wallet.waitForSyncedState();
  clearInterval(syncInterval);
  process.stdout.write('\r  ✓ Synced!                                              \n');

  await persistWalletState(network, walletCtx);

  const address = walletCtx.unshieldedKeystore.getBech32Address();
  const tNight = state.unshielded.balances[unshieldedToken().raw] ?? 0n;
  const dust = state.dust.balance(new Date());

  console.log(`\n  Address:  ${address}`);
  console.log(`  tNIGHT:   ${tNight.toLocaleString()}`);
  console.log(`  DUST:     ${dust.toLocaleString()}\n`);

  if (tNight === 0n) {
    console.error('❌ No tNIGHT. Fund your wallet at: https://faucet.preprod.midnight.network');
    console.error(`   Address: ${address}`);
    await walletCtx.wallet.stop();
    process.exit(1);
  }

  // Register NIGHT for DUST generation if needed
  const unregistered = state.unshielded.availableCoins.filter(
    (c: any) => !c.meta?.registeredForDustGeneration,
  );
  if (unregistered.length > 0) {
    console.log(`Registering ${unregistered.length} NIGHT UTXOs for DUST generation...`);
    const recipe = await walletCtx.wallet.registerNightUtxosForDustGeneration(
      unregistered,
      walletCtx.unshieldedKeystore.getPublicKey(),
      (payload: any) => walletCtx.unshieldedKeystore.signData(payload),
    );
    const finalized = await walletCtx.wallet.finalizeRecipe(recipe);
    await walletCtx.wallet.submitTransaction(finalized);
  }

  if (state.dust.balance(new Date()) === 0n) {
    console.log('Waiting for DUST tokens (needed for transaction fees)...');
    await Rx.firstValueFrom(
      walletCtx.wallet.state().pipe(
        Rx.throttleTime(5000),
        Rx.filter((s) => s.isSynced),
        Rx.filter((s) => s.dust.balance(new Date()) > 0n),
        Rx.timeout({ first: DUST_WAIT_TIMEOUT_MS }),
      ),
    );
  }
  console.log('✓ DUST ready\n');

  console.log('Deploying ProofPass contract...');
  const providers = await createProviders(walletCtx, state);

  await new Promise((r) => setTimeout(r, 6000));

  const MAX_RETRIES = 20;
  let deployed: Awaited<ReturnType<typeof deployContract>> | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      deployed = await deployContract(providers, {
        compiledContract: compiledContract as any,
        args: [],
        privateStateId: 'proofpassPrivateState',
        initialPrivateState: {},
      });
      break;
    } catch (err: any) {
      const msg = err?.message || '';
      const isDust = msg.includes('Not enough Dust') || msg.includes('Insufficient Funds') || msg.includes('could not balance dust');
      if (attempt < MAX_RETRIES && isDust) {
        process.stdout.write(`\r  DUST shortage, retrying (${attempt}/${MAX_RETRIES})...   `);
        await new Promise((r) => setTimeout(r, 5000));
      } else {
        throw err;
      }
    }
  }

  if (!deployed) throw new Error('Deploy failed after all retries');

  const contractAddress = deployed.deployTxData.public.contractAddress;

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  ✅ ProofPass Deployed Successfully!                         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\n  Contract Address: ${contractAddress}\n`);

  // Save to deployment.json in my-product
  const deploymentPath = '/mnt/c/Users/adity/OneDrive/Desktop/level/my-product/deployment.json';
  fs.writeFileSync(deploymentPath, JSON.stringify({
    contractAddress,
    network: 'preprod',
    deployedAt: new Date().toISOString(),
    walletAddress: address.toString(),
  }, null, 2));
  console.log(`  ✓ Saved to deployment.json`);
  console.log(`\n  Next: set VITE_CONTRACT_ADDRESS=${contractAddress} in .env`);

  recordDeployment(network, contractAddress, address.toString());
  await persistWalletState(network, walletCtx);
  await walletCtx.wallet.stop();
}

main().catch((err) => {
  console.error('\nDeploy failed:', err.message || err);
  process.exit(1);
});
