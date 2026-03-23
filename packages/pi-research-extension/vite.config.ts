/**
 * Vite config for the research extension's federated UI (remote).
 *
 * Runs its own dev server on port 5191. The host (Sero on 5173)
 * auto-discovers this via the sero.app.devPort manifest field.
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
      name: 'sero_research',
      filename: 'remoteEntry.js',
      dts: false,
      manifest: true,
      exposes: {
        './ResearchApp': './ui/ResearchApp.tsx',
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
    port: 5191,
    strictPort: true,
    origin: 'http://localhost:5191',
  },
  optimizeDeps: {
    exclude: ['@sero-ai/app-runtime'],
    include: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  },
  build: {
    target: 'esnext',
    outDir: '../dist/ui',
    emptyOutDir: true,
  },
});
