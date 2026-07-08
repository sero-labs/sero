// Vite config lives at the package root (not inside ui/).
// `base: './'` in production is required so installed plugin remotes resolve
// assets via the `sero-ext://` scheme.

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
      name: 'sero_loom',
      filename: 'remoteEntry.js',
      dts: false,
      manifest: true,
      exposes: {
        // Paths are relative to this config file (package root).
        './LoomApp': './ui/LoomApp.tsx',
      },
      shared: {
        react: { singleton: true },
        'react/': { singleton: true },
        'react-dom': { singleton: true },
        'react-dom/': { singleton: true },
        // NOTE: @sero-ai/app-runtime is NOT shared via MF (globalThis singleton).
      },
    }),
  ],
  server: {
    // Must match `sero.app.devPort` in package.json.
    port: 5199,
    strictPort: true,
    origin: 'http://localhost:5199',
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
