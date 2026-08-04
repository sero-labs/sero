// Vite config lives at the package root (not inside ui/).
// @module-federation/vite writes physical virtual modules under node_modules,
// and `root: 'ui'` makes clean installs look for the generated host-init entry
// in the wrong place. `base: './'` in production is required so installed
// plugin remotes resolve assets via the `sero-ext://` scheme.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';
import tailwindcss from '@tailwindcss/vite';
import { seroPluginCssScope } from '@sero-ai/plugin-vite';

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
    // Must match `sero.app.devPort` in package.json.
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
