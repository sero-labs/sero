import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { federation } from '@module-federation/vite';
import path from 'path';
import { globSync } from 'glob';
import { readFileSync } from 'fs';

const isDev = process.env.NODE_ENV !== 'production';

// ── Selective plugin dev mode ─────────────────────────────────
// SERO_DEV_PLUGINS controls which plugin remotes get dev servers (HMR, live reload).
// Unset / ""     → no plugins run in dev mode (all use pre-built bundles)
// "all"          → every plugin runs in dev mode
// "admin,kanban" → only listed plugins run in dev mode
// Keep in sync with the equivalent filter in electron/app-discovery.ts (Electron main process).
const devPluginsEnv = process.env.SERO_DEV_PLUGINS?.trim();
const devPluginsFilter: Set<string> | 'all' =
  !devPluginsEnv
    ? new Set<string>()
    : devPluginsEnv === 'all'
      ? 'all'
      : new Set(devPluginsEnv.split(',').map((s) => s.trim()).filter(Boolean));

function isPluginInDevMode(appId: string): boolean {
  if (!isDev) return false;
  if (devPluginsFilter === 'all') return true;
  return devPluginsFilter.has(appId);
}

// ── Auto-discover Sero app manifests from plugin remotes ─────────────

interface SeroAppDef {
  id: string;
  component: string;
  devPort: number;
  remoteName: string; // sero_<id> with hyphens → underscores
}

const APP_PACKAGE_GLOBS = [
  path.resolve(__dirname, '../../plugins/sero-*-plugin/package.json'),
];

function discoverAppPackageJsonPaths(): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];

  for (const pattern of APP_PACKAGE_GLOBS) {
    for (const pkgPath of globSync(pattern)) {
      if (seen.has(pkgPath)) continue;
      seen.add(pkgPath);
      paths.push(pkgPath);
    }
  }

  return paths.sort();
}

/**
 * Scan workspace app package.json files with sero.app manifests.
 * Returns an array of app definitions used to build MF config and types.
 */
function discoverSeroApps(): SeroAppDef[] {
  const apps: SeroAppDef[] = [];

  for (const pkgPath of discoverAppPackageJsonPaths()) {
    try {
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
 *
 * Apps in dev mode point to their local Vite dev server.
 * Apps NOT in dev mode use the sero-ext:// protocol (pre-built bundles).
 */
function buildRemotesConfig(apps: SeroAppDef[]): Record<string, string> {
  const remotes: Record<string, string> = {};
  for (const app of apps) {
    remotes[app.remoteName] = isPluginInDevMode(app.id)
      ? `http://localhost:${app.devPort}/mf-manifest.json`
      : `sero-ext://${app.id}/mf-manifest.json`;
  }
  return remotes;
}

// ── Dev-only: watch remote package UI dirs for live reload ────

function watchRemotes(): Plugin {
  const remoteDirs = discoverAppPackageJsonPaths()
    .map((pkgPath) => path.join(path.dirname(pkgPath), 'ui'))
    .filter((dir) => {
      if (devPluginsFilter === 'all') return true;
      try {
        const pkgPath = path.join(path.dirname(dir), 'package.json');
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
        return pkg.sero?.app?.id && devPluginsFilter.has(pkg.sero.app.id);
      } catch {
        return false;
      }
    });

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
        if (!remoteDirs.some((dir) => file.startsWith(dir))) return;

        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => {
          console.log(`[sero-watch-remotes] Remote changed: ${path.relative(__dirname, file)} → reloading`);
          server.ws.send({ type: 'full-reload' });
        }, 300);
      });
    },
  };
}

// ── Vite config ──────────────────────────────────────────────

const seroApps = discoverSeroApps();
const remotesConfig = buildRemotesConfig(seroApps);

const devPlugins = seroApps.filter((a) => isPluginInDevMode(a.id));
const builtPlugins = seroApps.filter((a) => !isPluginInDevMode(a.id));
console.log(`[sero] Discovered ${seroApps.length} app remotes`);
if (devPlugins.length > 0) console.log(`[sero]   Dev plugins: ${devPlugins.map((a) => a.id).join(', ')}`);
if (builtPlugins.length > 0) console.log(`[sero]   Pre-built: ${builtPlugins.map((a) => a.id).join(', ')}`);

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
  // Monaco's language workers are ES modules and are too big to inline as IIFE.
  worker: {
    format: 'es',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@assets': path.resolve(__dirname, '../../assets'),
      // NOTE: @sero-ai/app-runtime is NOT aliased here — it resolves via pnpm
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
