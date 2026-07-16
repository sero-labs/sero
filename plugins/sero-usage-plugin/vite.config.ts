// Vite config lives at the package root (not inside ui/).
// `base: './'` in production is required so installed plugin remotes resolve
// assets via the `sero-ext://` scheme.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';
import tailwindcss from '@tailwindcss/vite';
import { seroPluginCssScope } from '@sero-ai/plugin-vite';

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? './' : '/',
  plugins: [
    react(),
    tailwindcss(),
    seroPluginCssScope({ pluginId: 'usage' }),
    federation({
      name: 'sero_usage',
      filename: 'remoteEntry.js',
      dts: false,
      manifest: true,
      exposes: {
        './UsageApp': './ui/UsageApp.tsx',
        './UsageWidget': './ui/widgets/UsageWidget.tsx',
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
  ],
  server: {
    // Must match `sero.app.devPort` in package.json.
    port: 5189,
    strictPort: true,
    origin: 'http://localhost:5189',
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
