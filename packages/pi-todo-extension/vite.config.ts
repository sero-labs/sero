/**
 * Vite config for the todo extension's federated UI (remote).
 *
 * Runs its own dev server on port 5174. The host (Sero on 5173)
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
  base: process.env.NODE_ENV === 'production' ? './' : '/',
  plugins: [
    react(),
    tailwindcss(),
    federation({
      name: 'sero_todo',
      filename: 'remoteEntry.js',
      dts: false,
      manifest: true,
      exposes: {
        './TodoApp': './ui/TodoApp.tsx',
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
    port: 5174,
    strictPort: true,
    origin: 'http://localhost:5174',
  },
  optimizeDeps: {
    exclude: ['@sero/app-runtime'],
    // Pre-include shared deps to avoid the "new dependencies optimized →
    // reloading" cycle that causes 504 "Outdated Optimize Dep" errors.
    include: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  },
  build: {
    target: 'esnext',
    outDir: '../dist/ui',
    emptyOutDir: true,
  },
});
