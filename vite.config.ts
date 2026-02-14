import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { federation } from '@module-federation/vite';
import path from 'path';

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
          entry: 'http://localhost:5174/remoteEntry.js',
          entryGlobalName: 'sero_todo',
          shareScope: 'default',
        },
      },
      shared: {
        react: { singleton: true },
        'react-dom': { singleton: true },
        '@sero/app-runtime': { singleton: true, version: '0.1.0' },
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
      '@sero/app-runtime': path.resolve(__dirname, '../packages/app-runtime/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    origin: 'http://localhost:5173',
  },
});
