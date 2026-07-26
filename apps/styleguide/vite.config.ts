import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

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
      { find: '@', replacement: path.resolve(__dirname, 'src') },
    ],
  },
  server: {
    port: 5176,
  },
});
