/**
 * Vite config for the kanban extension's federated UI (remote).
 *
 * Runs its own dev server on port 5175. The host (Sero on 5173)
 * declares this as a remote and imports components via MF.
 *
 * `server.origin` ensures all chunk URLs are absolute so the host
 * can load them cross-origin.
 *
 * IMPORTANT: @sero/app-runtime must NOT be aliased here — the MF
 * plugin must intercept that import so the host's singleton is used
 * at runtime. Resolution happens via node_modules symlink chain.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: 'ui',
  plugins: [
    react(),
    tailwindcss(),
    federation({
      name: 'sero_kanban',
      filename: 'remoteEntry.js',
      dts: false,
      manifest: true,
      exposes: {
        './KanbanApp': './ui/KanbanApp.tsx',
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
    port: 5175,
    strictPort: true,
    origin: 'http://localhost:5175',
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
