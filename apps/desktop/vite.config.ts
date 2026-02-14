import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { federation } from '@module-federation/vite';
import path from 'path';
import { globSync } from 'glob';

const isDev = process.env.NODE_ENV !== 'production';

// ── Dev-only: watch remote package UI dirs for live reload ────
// MF remotes run their own Vite dev servers, but the host doesn't know
// when they rebuild. This plugin adds the remote source dirs to the host's
// chokidar watcher and triggers a full page reload when they change.

function watchRemotes(): Plugin {
  const packagesDir = path.resolve(__dirname, '../../packages');
  // Find all remote package UI dirs that have a vite config (= are MF remotes)
  const remoteDirs = globSync('pi-*/ui', { cwd: packagesDir, absolute: true });

  return {
    name: 'sero-watch-remotes',
    apply: 'serve',
    configureServer(server) {
      if (remoteDirs.length === 0) return;

      for (const dir of remoteDirs) {
        server.watcher.add(dir);
      }

      let debounce: ReturnType<typeof setTimeout> | null = null;
      server.watcher.on('change', (file) => {
        if (!remoteDirs.some((d) => file.startsWith(d))) return;

        // Debounce: remote Vite needs a moment to rebuild after the file save
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => {
          console.log(`[sero-watch-remotes] Remote changed: ${path.relative(packagesDir, file)} → reloading`);
          server.ws.send({ type: 'full-reload' });
        }, 300);
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    watchRemotes(),
    federation({
      name: 'sero',
      dts: false,
      manifest: true,
      remotes: {
        sero_todo: isDev
          ? 'http://localhost:5174/mf-manifest.json'
          : 'sero-ext://todo/mf-manifest.json',
        sero_weight_tracker: isDev
          ? 'http://localhost:5176/mf-manifest.json'
          : 'sero-ext://weight-tracker/mf-manifest.json',
        sero_daily_quote: isDev
          ? 'http://localhost:5177/mf-manifest.json'
          : 'sero-ext://daily-quote/mf-manifest.json',
      },
      shared: {
        react: { singleton: true },
        'react/': { singleton: true },
        'react-dom': { singleton: true },
        'react-dom/': { singleton: true },
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
      // NOTE: @sero/app-runtime is NOT aliased here — it resolves via pnpm
      // workspace linking. An alias would conflict with Module Federation's
      // shared singleton mechanism (MF can't intercept aliased imports).
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    origin: 'http://localhost:5173',
  },
});
