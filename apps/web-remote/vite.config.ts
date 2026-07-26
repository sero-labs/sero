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
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'assets/index.js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  server: {
    port: 5174,
  },
});
