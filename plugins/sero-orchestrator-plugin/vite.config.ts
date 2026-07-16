/**
 * Vite config for the Orchestrator plugin's federated UI (remote).
 * Runs its own dev server on port 5198.
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
    seroPluginCssScope({ pluginId: 'orchestrator', allowGlobalSelectors: true }),
    ...(isTest ? [] : [
      federation({
        name: 'sero_orchestrator',
        filename: 'remoteEntry.js',
        dts: false,
        manifest: true,
        exposes: {
          './OrchestratorApp': './ui/OrchestratorApp.tsx',
          './LoopsWidget': './ui/widgets/LoopsWidget.tsx',
          './AttentionWidget': './ui/widgets/AttentionWidget.tsx',
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
    port: 5198,
    strictPort: true,
    origin: 'http://localhost:5198',
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
