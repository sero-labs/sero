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
  plugins: [
    react(),
    tailwindcss(),
    federation({
      name: 'sero_todo',
      filename: 'remoteEntry.js',
      dts: false,
      exposes: {
        './TodoApp': './ui/TodoApp.tsx',
      },
      shared: {
        react: { singleton: true },
        'react-dom': { singleton: true },
        // @sero/app-runtime is NOT shared via MF — the loadShare virtual
        // module breaks named exports. Instead it resolves via node_modules
        // and uses a globalThis singleton for the React context, so the
        // host's AppProvider is still visible to the remote's useContext.
      },
    }),
  ],
  server: {
    port: 5174,
    strictPort: true,
    origin: 'http://localhost:5174',
  },
  optimizeDeps: {
    // @sero/app-runtime must NOT be pre-bundled — MF handles it as a shared
    // singleton from the host. Without this, Vite bundles its own copy and
    // MF's factory wrapper breaks with "factory is not a function".
    exclude: ['@sero/app-runtime'],
  },
  build: {
    target: 'esnext',
    outDir: '../dist/ui',
    emptyOutDir: true,
  },
});
