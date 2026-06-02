import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@sero-ai/ui': path.resolve(__dirname, '../../packages/ui/src'),
    },
  },
  server: {
    port: 5176,
  },
});
