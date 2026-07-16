/**
 * Vite config for the graphify extension's federated UI (remote).
 * Runs its own dev server on port 5197.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';
import tailwindcss from '@tailwindcss/vite';
import { seroPluginCssScope } from '@sero-ai/plugin-vite';

// Unit tests do not exercise module-federation wiring, and the MF plugin
// interferes with direct TSX imports under Vitest.
const isTest = process.env.VITEST === 'true';

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? './' : '/',
  plugins: [
    react(),
    tailwindcss(),
    seroPluginCssScope({ pluginId: 'graphify', allowGlobalSelectors: true }),
    ...(isTest ? [] : [
      federation({
        name: 'sero_graphify',
        filename: 'remoteEntry.js',
        dts: false,
        manifest: true,
        exposes: {
          './GraphifyApp': './ui/GraphifyApp.tsx',
        },
        shared: {
          react: { singleton: true },
          'react/': { singleton: true },
          'react-dom': { singleton: true },
          'react-dom/': { singleton: true },
        },
      }),
    ]),
  ],
  server: {
    port: 5197,
    strictPort: true,
    origin: 'http://localhost:5197',
  },
  optimizeDeps: {
    exclude: ['@sero-ai/app-runtime'],
    include: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  },
  build: {
    target: 'esnext',
    outDir: 'dist/ui',
    emptyOutDir: true,
    rollupOptions: {
      input: 'ui/index.html',
    },
  },
});
