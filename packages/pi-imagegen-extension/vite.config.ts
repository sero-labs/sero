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
      name: 'sero_imagegen',
      filename: 'remoteEntry.js',
      dts: false,
      manifest: true,
      exposes: {
        './ImageGenApp': './ui/ImageGenApp.tsx',
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
    port: 5181,
    strictPort: true,
    origin: 'http://localhost:5181',
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
