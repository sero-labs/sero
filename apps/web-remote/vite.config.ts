import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@assets': path.resolve(__dirname, '../../assets'),
      '@sero-ai/ui': path.resolve(__dirname, '../../packages/ui/src'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, '../desktop/electron/features/gateway/web-dist'),
    emptyOutDir: true,
  },
  server: {
    port: 5174,
  },
});
