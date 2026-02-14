import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { federation } from '@module-federation/vite';
import path from 'path';

const isDev = process.env.NODE_ENV !== 'production';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    federation({
      name: 'sero',
      dts: false,
      remotes: {
        sero_todo: {
          type: 'module',
          name: 'sero_todo',
          // Dev: MF remote dev server. Prod: custom protocol serving built assets.
          entry: isDev
            ? 'http://localhost:5174/remoteEntry.js'
            : 'sero-ext://todo/remoteEntry.js',
          entryGlobalName: 'sero_todo',
          shareScope: 'default',
        },
      },
      shared: {
        react: { singleton: true },
        'react-dom': { singleton: true },
        // @sero/app-runtime is NOT shared via MF — its loadShare virtual
        // module breaks ESM named exports. Resolves via node_modules instead;
        // context.ts uses a globalThis singleton so host + remote share state.
      },
    }),
  ],
  base: './',
  root: '.',
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
    target: 'esnext',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // NOTE: @sero/app-runtime is NOT aliased here — it resolves via pnpm
      // workspace linking. An alias would conflict with Module Federation's
      // shared singleton mechanism (MF can't intercept aliased imports).
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    origin: 'http://localhost:5173',
  },
});
