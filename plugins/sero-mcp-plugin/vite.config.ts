import { build, defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';
import tailwindcss from '@tailwindcss/vite';
import { seroPluginCssScope } from '@sero-ai/plugin-vite';

/**
 * The MCP app viewer page loads its own small script from the viewer server,
 * outside the federated UI. Build it as a separate bundle into dist/ui after
 * the UI build, and once when the dev server starts.
 */
function viewerShell(): Plugin {
  const buildShell = () => build({
    configFile: false,
    logLevel: 'warn',
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: {
      outDir: 'dist/ui',
      emptyOutDir: false,
      copyPublicDir: false,
      target: 'es2022',
      lib: { entry: 'ui/viewer-shell/main.ts', formats: ['es'], fileName: () => 'viewer-shell.js' },
    },
  });
  return {
    name: 'sero-mcp-viewer-shell',
    async closeBundle() {
      await buildShell();
    },
    async configureServer() {
      await buildShell();
    },
  };
}

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? './' : '/',
  plugins: [
    react(),
    tailwindcss(),
    seroPluginCssScope({ pluginId: 'mcp' }),
    viewerShell(),
    federation({
      name: 'sero_mcp',
      filename: 'remoteEntry.js',
      dts: false,
      manifest: true,
      exposes: {
        './McpApp': './ui/McpApp.tsx',
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
    port: 5196,
    strictPort: true,
    origin: 'http://localhost:5196',
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
