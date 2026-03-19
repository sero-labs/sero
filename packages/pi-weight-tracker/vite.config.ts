/**
 * Vite config for the weight tracker extension's federated UI (remote).
 *
 * Runs its own dev server on port 5176. The host (Sero on 5173)
 * declares this as a remote and imports components via MF.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: 'ui',
  base: process.env.NODE_ENV === 'production' ? './' : '/',
  plugins: [
    react(),
    tailwindcss(),
    federation({
      name: 'sero_weight_tracker',
      filename: 'remoteEntry.js',
      dts: false,
      manifest: true,
      exposes: {
        './WeightTracker': './ui/WeightTracker.tsx',
      },
      shared: {
        react: { singleton: true },
        'react/': { singleton: true },
        'react-dom': { singleton: true },
        'react-dom/': { singleton: true },
      },
    }),
  ],
  server: {
    port: 5176,
    strictPort: true,
    origin: 'http://localhost:5176',
  },
  optimizeDeps: {
    exclude: ['@sero/app-runtime'],
    include: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  },
  build: {
    target: 'esnext',
    outDir: '../dist/ui',
    emptyOutDir: true,
  },
});
