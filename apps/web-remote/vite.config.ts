import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: '@sero-ai/ui/ai-elements',
        replacement: path.resolve(
          __dirname,
          '../../packages/ui/src/components/ai-elements',
        ),
      },
      {
        find: '@sero-ai/ui/model-selection',
        replacement: path.resolve(
          __dirname,
          '../../packages/ui/src/components/model-selection',
        ),
      },
      {
        find: '@sero-ai/ui',
        replacement: path.resolve(__dirname, '../../packages/ui/src'),
      },
      { find: '@assets', replacement: path.resolve(__dirname, '../../assets') },
      { find: '@', replacement: path.resolve(__dirname, 'src') },
    ],
  },
  build: {
    outDir: path.resolve(__dirname, '../desktop/electron/features/gateway/web-dist'),
    emptyOutDir: true,
    // Hashed multi-chunk output. Module federation shared singletons and
    // the service-worker shell cache both need real chunk files with
    // stable, content-addressed names. `inlineDynamicImports` blocks both.
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  server: {
    port: 5174,
  },
});
