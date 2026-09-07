// Vite config lives at the package root (not inside ui/).
// Keep Vite's root at the package root: @module-federation/vite writes
// physical virtual modules under node_modules, and `root: 'ui'` makes clean
// installs look for the generated host-init entry in the wrong place.
// `base: './'` in production is required so installed plugin remotes resolve
// assets via the `sero-ext://` scheme.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';
import tailwindcss from '@tailwindcss/vite';
import { seroPluginCssScope } from '@sero-ai/plugin-vite';

// Unit tests and the component preview harness (ui/__preview__) do not exercise
// module federation, and the MF plugin cannot start without a host manifest.
const skipFederation = process.env.VITEST === 'true' || process.env.SERO_PREVIEW === 'true';

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? './' : '/',
  plugins: [
    react(),
    tailwindcss(),
    seroPluginCssScope({ pluginId: 'architect' }),
    ...(skipFederation ? [] : [
      federation({
        // MF remote name convention: sero_<appId>. Must be a valid JS identifier.
        name: 'sero_architect',
        filename: 'remoteEntry.js',
        dts: false,
        manifest: true,
        exposes: {
          // Paths are relative to this config file (package root), not `root`.
          './ArchitectApp': './ui/ArchitectApp.tsx',
          './ArchitectWidget': './ui/widgets/ArchitectWidget.tsx',
        },
        shared: {
          react: { singleton: true },
          'react/': { singleton: true },
          'react-dom': { singleton: true },
          'react-dom/': { singleton: true },
          // NOTE: @sero-ai/app-runtime is NOT shared via MF.
          // The host provides a globalThis singleton; we just excludeDeps below.
        },
      }),
    ]),
  ],
  server: {
    port: 5200,
    strictPort: true,
    origin: 'http://localhost:5200',
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
