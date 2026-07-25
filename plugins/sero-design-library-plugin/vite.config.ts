import { federation } from '@module-federation/vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { seroPluginCssScope } from '@sero-ai/plugin-vite';
import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? './' : '/',
  plugins: [
    react(),
    tailwindcss(),
    seroPluginCssScope({ pluginId: 'design-library' }),
    federation({
      name: 'sero_design_library',
      filename: 'remoteEntry.js',
      dts: false,
      manifest: true,
      exposes: {
        './DesignLibraryApp': './ui/DesignLibraryApp.tsx',
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
    port: 5190,
    strictPort: true,
    origin: 'http://localhost:5190',
  },
  optimizeDeps: {
    exclude: ['@sero-ai/app-runtime'],
    include: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  },
  build: {
    target: 'esnext',
    outDir: 'dist/ui',
    emptyOutDir: true,
    rollupOptions: {
      input: 'ui/index.html',
    },
  },
});
