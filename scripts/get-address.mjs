import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { encodeUserAddress } from '@midnight-ntwrk/compact-runtime';

const seed = 'b91a89a52193783890ccbaa04d099b1a9681aa4cf1d29cf5dc30275aa84820cd';
const hd = HDWallet.fromSeed(Buffer.from(seed, 'hex'));
if (hd.type !== 'seedOk') { console.error('Bad seed'); process.exit(1); }

const d = hd.hdWallet
  .selectAccount(0)
  .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
  .deriveKeysAt(0);

// NightExternal role index = 2, convert to hex string for encodeUserAddress
const pubKeyBytes = new Uint8Array(d.keys[2]);
const pubKeyHex = Buffer.from(pubKeyBytes).toString('hex');

try {
  const addr = encodeUserAddress(pubKeyHex);
  console.log('\nYour preprod wallet address (paste into faucet):');
  console.log(addr);
} catch (e) {
  console.log('encodeUserAddress failed:', e.message);
  // Try manual bech32 encoding
  const { bech32 } = await import('bech32').catch(() => ({ bech32: null }));
  if (bech32) {
    const words = bech32.toWords(pubKeyBytes);
    const addr = bech32.encode('mn_addr_preprod', words);
    console.log('\nManual bech32 address:');
    console.log(addr);
  } else {
    console.log('\nPublic key hex (use this with the faucet if it accepts hex):');
    console.log(pubKeyHex);
  }
}
process.exit(0);
