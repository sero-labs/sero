// Vite config lives at the package root (not inside ui/). @module-federation/vite
// writes physical virtual modules under node_modules; keeping Vite's root here
// avoids clean-install path breakage. `base: './'` in production lets installed
// remotes resolve assets via the `sero-ext://` scheme.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? './' : '/',
  plugins: [
    react(),
    tailwindcss(),
    federation({
      // MF remote name convention: sero_<appId>. Must be a valid JS identifier.
      name: 'sero_orchestrator',
      filename: 'remoteEntry.js',
      dts: false,
      manifest: true,
      exposes: {
        './OrchestratorApp': './ui/OrchestratorApp.tsx',
      },
      shared: {
        react: { singleton: true },
        'react/': { singleton: true },
        'react-dom': { singleton: true },
        'react-dom/': { singleton: true },
        // NOTE: @sero-ai/app-runtime is NOT shared via MF — host globalThis singleton.
      },
    }),
  ],
  server: {
    // Must match `sero.app.devPort` in package.json.
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
