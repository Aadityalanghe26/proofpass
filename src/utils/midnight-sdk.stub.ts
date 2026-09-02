/**
 * Stub used in simulation/dev mode (no VITE_CONTRACT_ADDRESS set).
 * Vite aliases midnight-sdk.ts → this file so the real SDK is never imported.
 */
export function Contract(): never {
  throw new Error('Midnight SDK not available in simulation mode.');
}
export function createMidnightProvider(): never {
  throw new Error('Midnight SDK not available in simulation mode.');
}
