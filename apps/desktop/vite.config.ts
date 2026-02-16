import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { federation } from '@module-federation/vite';
import path from 'path';
import { globSync } from 'glob';
import { readFileSync } from 'fs';

const isDev = process.env.NODE_ENV !== 'production';

// ── Auto-discover Sero app manifests from packages/ ──────────

interface SeroAppDef {
  id: string;
  component: string;
  devPort: number;
  remoteName: string; // sero_<id> with hyphens → underscores
}

/**
 * Scan packages/pi-* for package.json files with sero.app manifests.
 * Returns an array of app definitions used to build MF config and types.
 */
function discoverSeroApps(): SeroAppDef[] {
  const pkgsDir = path.resolve(__dirname, '../../packages');
  const apps: SeroAppDef[] = [];

  for (const dir of globSync('pi-*', { cwd: pkgsDir })) {
    try {
      const pkgPath = path.join(pkgsDir, dir, 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      const app = pkg.sero?.app;
      if (!app?.id || !app?.component || !app?.devPort) continue;

      apps.push({
        id: app.id,
        component: app.component,
        devPort: app.devPort,
        remoteName: `sero_${app.id.replace(/-/g, '_')}`,
      });
    } catch {
      // Skip packages with unreadable/missing package.json
    }
  }

  // Validate no duplicate ports
  const ports = new Map<number, string>();
  for (const app of apps) {
    if (ports.has(app.devPort)) {
      throw new Error(
        `[sero] Port conflict: "${app.id}" and "${ports.get(app.devPort)}" both use devPort ${app.devPort}`,
      );
    }
    ports.set(app.devPort, app.id);
  }

  return apps.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Build the MF remotes config object from discovered apps.
 */
function buildRemotesConfig(apps: SeroAppDef[]): Record<string, string> {
  const remotes: Record<string, string> = {};
  for (const app of apps) {
    remotes[app.remoteName] = isDev
      ? `http://localhost:${app.devPort}/mf-manifest.json`
      : `sero-ext://${app.id}/mf-manifest.json`;
  }
  return remotes;
}

// ── Dev-only: watch remote package UI dirs for live reload ────

function watchRemotes(): Plugin {
  const packagesDir = path.resolve(__dirname, '../../packages');
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
        if (!remoteDirs.some((d:any) => file.startsWith(d))) return;

        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => {
          console.log(`[sero-watch-remotes] Remote changed: ${path.relative(packagesDir, file)} → reloading`);
          server.ws.send({ type: 'full-reload' });
        }, 300);
      });
    },
  };
}

// ── Vite config ──────────────────────────────────────────────

const seroApps = discoverSeroApps();
const remotesConfig = buildRemotesConfig(seroApps);

console.log(`[sero] Discovered ${seroApps.length} app remotes: ${seroApps.map((a) => a.id).join(', ')}`);

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    watchRemotes(),
    federation({
      name: 'sero',
      dts: false,
      manifest: true,
      remotes: remotesConfig,
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
