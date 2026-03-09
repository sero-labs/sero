// Load .env BEFORE any SDK imports (they read process.env at module level)
import { loadSeroEnv, SERO_AGENT_DIR, SERO_HOME, ACTIVE_PROFILE_ID } from './env';
loadSeroEnv();

import { app, components, BrowserWindow, session, shell } from 'electron';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'fs';
import path from 'path';

// ── Per-profile Chromium userData isolation ──────────────────
// Set userData path BEFORE app.whenReady() so Chromium initialises with the
// correct directory. This isolates cookies, localStorage, caches, and
// session data between profiles.
if (ACTIVE_PROFILE_ID) {
  const profileUserData = path.join(
    app.getPath('userData'),
    'profiles',
    ACTIVE_PROFILE_ID,
  );
  app.setPath('userData', profileUserData);
}
import { registerAllIpcHandlers } from './ipc/index';
import { workspaceManager } from './workspace';
import { registerExtProtocolScheme, setupExtProtocol, registerAllExtAssets } from './ext-protocol';
import { discoverApps, registerAppPath } from './app-discovery';
import { watchForNewApps } from './ipc/apps';
import { ensureDefaultAgents, ensureProfileTemplates } from './profile/setup';
import { containerManager, fileWatcherManager, lspManager, vcsManager, gatewayServer } from './ipc/shared-infra';
import { startGateway, stopGateway } from './ipc/gateway';
import { setupContentSecurityPolicy } from './csp';

// Register custom protocol BEFORE app.whenReady()
registerExtProtocolScheme();

let mainWindow: BrowserWindow | null = null;

// Spotify Web Playback SDK needs autoplay + EME support in the renderer.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// Use a mock keychain so macOS doesn't prompt for "Chromium Safe Storage"
// access on every launch (the dev binary isn't code-signed so the grant
// never sticks). Data is still persisted — just not keychain-encrypted.
app.commandLine.appendSwitch('use-mock-keychain');

/**
 * Bootstrap ~/.sero-ui/agent/ on first run.
 *
 * Creates the agent directory and a default settings.json with Sero's
 * built-in app packages. Skips if settings.json already exists.
 */
function bootstrapAgentDir(): void {
  mkdirSync(SERO_AGENT_DIR, { recursive: true });

  const settingsPath = path.join(SERO_AGENT_DIR, 'settings.json');
  if (!existsSync(settingsPath)) {
    const defaults = {
      defaultProvider: 'anthropic',
      defaultModel: 'claude-opus-4-6',
      defaultThinkingLevel: 'high',
      packages: [] as string[],
    };
    writeFileSync(settingsPath, JSON.stringify(defaults, null, 2) + '\n');
    console.log('[sero] Created default settings at', settingsPath);
  }
}

/**
 * Discover all pi-* extension packages (with or without a sero.app UI).
 * Returns absolute paths. Works at runtime (from dist/electron/).
 *
 * A directory qualifies if it has a package.json with either:
 *   - a `piExtension` field (Pi SDK extension entry point), or
 *   - a `sero.app` manifest (Sero UI app), or
 *   - an `extension/` subdirectory (convention for Sero extensions)
 */
function discoverSeroPackagePaths(): string[] {
  // __dirname is apps/desktop/dist/electron/ at runtime → packages/ is 4 levels up
  const pkgsDir = path.resolve(__dirname, '../../../../packages');
  try {
    return readdirSync(pkgsDir)
      .filter((d) => d.startsWith('pi-'))
      .map((d) => path.join(pkgsDir, d))
      .filter((p) => {
        try {
          const pkg = JSON.parse(readFileSync(path.join(p, 'package.json'), 'utf8'));
          return pkg.pi?.extensions != null || pkg.piExtension != null || pkg.sero?.app != null || existsSync(path.join(p, 'extension'));
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
}

/**
 * Ensure Sero's built-in app packages are registered in settings.json.
 *
 * In development, auto-discovers packages/pi-* with sero.app manifests
 * and adds their paths. No hardcoded package list needed.
 */
function ensureBuiltinPackages(): void {
  if (process.env.NODE_ENV !== 'development') return;

  const settingsPath = path.join(SERO_AGENT_DIR, 'settings.json');
  let settings: Record<string, unknown> = {};
  try {
    settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  } catch {
    // Will be created by bootstrapAgentDir
  }

  const packages = (settings.packages as string[]) ?? [];
  const builtinPaths = discoverSeroPackagePaths();

  let changed = false;
  for (const p of builtinPaths) {
    if (!packages.includes(p)) {
      packages.push(p);
      changed = true;
    }
  }

  if (changed) {
    settings.packages = packages;
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
    console.log('[sero] Registered built-in app packages in', settingsPath);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    backgroundColor: '#0a0a0b',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      plugins: true,
    },
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Forward renderer warnings and errors to stdout for debugging
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) { // 2 = warning, 3 = error
      console.error(`[renderer ${level === 3 ? 'ERROR' : 'WARN'}] ${message} (${sourceId}:${line})`);
    }
  });

  // ── Security: navigation restrictions ──────────────────────────
  // Block navigation to untrusted origins. Only allow the dev server
  // and the production renderer HTML. All other navigation attempts
  // (e.g., from XSS or malicious content) are blocked.
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const allowedOrigins = ['http://localhost:5173'];
    try {
      const parsed = new URL(navigationUrl);
      const origin = parsed.origin;
      if (!allowedOrigins.includes(origin) && parsed.protocol !== 'file:') {
        console.warn(`[security] Blocked navigation to untrusted origin: ${navigationUrl}`);
        event.preventDefault();
      }
    } catch {
      event.preventDefault();
    }
  });

  // Open external links (target="_blank", href to external domains) in the
  // system browser instead of a new Electron window. This ensures the user's
  // existing browser session (GitHub login, etc.) is used.
  // Also blocks file:// and other dangerous protocols from opening new windows.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      void shell.openExternal(url);
    }
    // Always deny new windows — external links open in system browser
    return { action: 'deny' };
  });

  // ── Security: deny unnecessary permissions ──────────────────
  // Block permission requests for capabilities Sero doesn't need.
  // Only media (for Spotify) is allowed.
  const allowedPermissions = new Set(['media']);
  mainWindow.webContents.session.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      if (allowedPermissions.has(permission)) {
        callback(true);
      } else {
        console.warn(`[security] Denied permission request: ${permission}`);
        callback(false);
      }
    },
  );

  // Give the file watcher manager access to the window for push events
  fileWatcherManager.setWindow(mainWindow);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // Bootstrap Sero's agent directory (creates settings.json on first run)
  bootstrapAgentDir();

  // Init workspace registry + default workspaces before anything else
  await workspaceManager.init();

  // Set up custom protocol for serving extension UI assets
  setupExtProtocol();

  // In development, ensure built-in app packages are in settings.json
  // and register their paths for app discovery
  if (process.env.NODE_ENV === 'development') {
    ensureBuiltinPackages();

    // Auto-discover and register all sero app packages for app discovery
    for (const pkgPath of discoverSeroPackagePaths()) {
      registerAppPath(pkgPath);
    }
  }

  // Discover apps and register their assets for the custom protocol
  const apps = await discoverApps();
  registerAllExtAssets(apps);

  // Watch for new app packages created while running (e.g. by the agent)
  const knownAppIds = new Set(apps.map((a) => a.id));
  watchForNewApps(knownAppIds);

  registerAllIpcHandlers();

  // ── Copy default templates if first launch ─────────────────
  ensureDefaultAgents().catch((err) => console.warn('[sero] Agent template copy failed:', err));
  ensureProfileTemplates().catch((err) => console.warn('[sero] Profile template copy failed:', err));

  // ── Widevine CDM (castlabs ECS) ─────────────────────────────
  // The castlabs Electron fork auto-downloads the Widevine CDM via the
  // Component Updater. Wait for it before creating the window so that
  // EME (Encrypted Media Extensions) is available from the first paint.
  try {
    await components.whenReady();
    console.log('[sero] Widevine CDM ready:', components.status());
  } catch (err) {
    console.error('[sero] Widevine CDM install failed — DRM playback will be unavailable:', err);
  }

  // ── Content Security Policy ────────────────────────────────────
  // Set a strict CSP on all renderer responses to silence Electron's
  // "Insecure Content-Security-Policy" warning and reduce attack surface.
  setupContentSecurityPolicy();

  // ── User-Agent ────────────────────────────────────────────────
  // Strip "Electron/<version>" from the session User-Agent. Services like
  // Spotify and Peacock reject Widevine license requests when they see an
  // Electron UA. Removing the token makes requests look like regular Chrome
  // (which is accurate — Electron IS Chromium). Must be set on the session,
  // not via app.userAgentFallback, because Chromium sets a session-level
  // default that takes priority over the fallback.
  const cleanUA = session.defaultSession.getUserAgent()
    .replace(/\sElectron\/[\S]+/, '')
    .replace(/\s+sero\/[\S]+/i, '');
  session.defaultSession.setUserAgent(cleanUA);
  console.log('[sero] User-Agent:', cleanUA);

  // ── Container system bootstrap ───────────────────────────────
  // Ensure the container API server is running (non-blocking on failure)
  try {
    await containerManager.ensureSystemRunning();
  } catch (err) {
    console.error('[sero] Failed to start container system on boot — containers will retry on demand:', err);
  }

  // Ensure sero-node image is built (non-blocking on failure)
  try {
    // __dirname is apps/desktop/dist/electron/ → images dir is 2 levels up
    const imagesDir = path.resolve(__dirname, '../../images');
    await containerManager.ensureImage(imagesDir);
  } catch (err) {
    console.error('[sero] Failed to ensure sero-node image:', err);
  }

  // Start HTTP proxy for container internet access.
  // The proxy runs on the host and tunnels HTTP/HTTPS from containers via
  // the gateway IP (192.168.64.1). This is the primary networking path because
  // NAT alone doesn't provide DNS resolution inside the container VM.
  // Set SERO_CONTAINER_PROXY=0 to disable if using an alternative network setup.
  if (process.env.SERO_CONTAINER_PROXY !== '0') {
    await containerManager.startProxy();
  }

  // Clean up orphaned sero-* containers from previous crashes
  await cleanupOrphanedContainers();

  // ── Gateway ──────────────────────────────────────────────────
  // Start the WebSocket gateway + web chat UI. The agent ops bridge
  // is already wired by registerAgentHandlers() above, so the gateway
  // can proxy prompts/steer/abort to the agent pool.
  // Set SERO_GATEWAY=1 to auto-start (disabled by default).
  if (process.env.SERO_GATEWAY === '1') {
    try {
      await startGateway();
    } catch (err) {
      console.error('[sero] Gateway failed to start:', err);
    }
  }

  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ── Graceful shutdown ──────────────────────────────────────────
app.on('before-quit', async (e) => {
  e.preventDefault();
  console.log('[sero] Shutting down — cleaning up containers, terminals, LSP, watchers...');

  // Stop gateway services
  if (gatewayServer.getStatus().running) {
    await stopGateway();
  }

  // Dispose LSP servers and file watchers
  await lspManager.disposeAll();
  fileWatcherManager.disposeAll();
  vcsManager.disposeAll();

  // Dispose terminals and port forwards
  containerManager.terminals.disposeAllTerminals();
  containerManager.disposeAllPortForwards();

  // Stop all sero-* containers
  try {
    const containers = await containerManager.list();
    await Promise.allSettled(
      containers.map((c) => {
        const workspaceId = c.id.replace(/^sero-/, '');
        return containerManager.stop(workspaceId);
      }),
    );
  } catch (err) {
    console.error('[sero] Error during shutdown cleanup:', err);
  }

  app.exit(0);
});

// ── Orphan cleanup ─────────────────────────────────────────────
/**
 * Clean up any orphaned sero-* containers from previous crashes.
 * Compares running containers against registered workspaces.
 */
async function cleanupOrphanedContainers(): Promise<void> {
  try {
    const workspaces = await workspaceManager.list();
    const registeredIds = new Set(workspaces.map((w) => `sero-${w.id}`));

    const running = await containerManager.list();
    for (const c of running) {
      if (!registeredIds.has(c.id)) {
        console.log(`[sero] Cleaning up orphaned container: ${c.id}`);
        const workspaceId = c.id.replace(/^sero-/, '');
        try {
          await containerManager.stop(workspaceId);
          await containerManager.remove(workspaceId);
        } catch {
          // Best effort
        }
      }
    }
  } catch (err) {
    console.error('[sero] Orphan cleanup error:', err);
  }
}
