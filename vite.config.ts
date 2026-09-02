import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const hasContract = Boolean(env.VITE_CONTRACT_ADDRESS);

  return {
    plugins: [react()],

    resolve: {
      alias: hasContract
        ? {}
        : {
            // In dev / simulation mode, redirect the real SDK wrapper to the stub.
            // This prevents Vite from trying to resolve @midnight-ntwrk/midnight-js-contracts.
            [path.resolve(__dirname, 'src/utils/midnight-sdk.ts')]:
              path.resolve(__dirname, 'src/utils/midnight-sdk.stub.ts'),
          },
    },

    build: {
      outDir: 'dist',
      sourcemap: true,
      rollupOptions: {
        // When building with a contract address, the SDK is expected to be installed.
        // Mark it external only in simulation/dev builds.
        external: hasContract ? [] : ['@midnight-ntwrk/midnight-js-contracts'],
      },
    },

    test: {
      globals: true,
      environment: 'node',
    },
  };
});
