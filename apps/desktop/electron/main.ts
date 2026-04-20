// Load .env BEFORE any SDK imports (they read process.env at module level)
import {
  loadSeroEnv,
  SERO_AGENT_DIR,
  SERO_HOME,
  ACTIVE_PROFILE_ID,
  PROFILE_STARTUP_ISSUE,
} from './platform/env';
loadSeroEnv();

import { app, components, BrowserWindow, session, shell } from 'electron';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import path from 'path';
import type { SettingsPackageSource } from '../src/types/ipc';

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
import { registerAllIpcHandlers } from './ipc';
import { disposeAllAgentSessions } from './ipc/agent';
import { workspaceManager } from './features/workspace/manager';
import { registerExtProtocolScheme, setupExtProtocol, registerAllExtAssets } from './platform/protocols/ext-protocol';
import { discoverApps, registerAppPath } from './features/apps/discovery';
import { watchForNewApps } from './ipc/apps';
import { ensureDefaultAgents, ensureDefaultSkills, ensureDefaultThemes, ensureProfileTemplates } from './features/profile/setup';
import { handleProfileRegistryRecovery } from './features/profile/recovery';
import {
  containerManager,
  ensureInfra,
  fileWatcherManager,
  gatewayServer,
  lspManager,
  pluginDevSessionManager,
  vcsManager,
} from './shared/infra/shared-infra';
import { startGateway, stopGateway } from './ipc/gateway';
import { setupContentSecurityPolicy } from './platform/security/csp';
import { discoverBuiltinPackagePaths, discoverBuiltinPluginPaths } from './platform/protocols/builtin-resources';
import {
  ensureConfiguredModelFallbackChain,
  getDefaultModelFallbackChain,
} from './shared/settings/model-fallback-chain';
import { getDefaultMemoryLoggingSettings, ensureConfiguredMemoryLoggingSettings } from './shared/settings/memory-logging-settings';
import { getContainerAvailability } from './features/container/core/availability';

// Register custom protocol BEFORE app.whenReady()
registerExtProtocolScheme();

let mainWindow: BrowserWindow | null = null;
let isGracefullyShuttingDown = false;
const SHUTDOWN_STEP_TIMEOUT_MS = 2_500;

// Spotify Web Playback SDK needs autoplay + EME support in the renderer.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// Use a mock keychain so macOS doesn't prompt for "Chromium Safe Storage"
// access on every launch (the dev binary isn't code-signed so the grant
// never sticks). Data is still persisted — just not keychain-encrypted.
app.commandLine.appendSwitch('use-mock-keychain');

function getWorkspaceAppPaths(): string[] {
  return [...discoverBuiltinPackagePaths(), ...discoverBuiltinPluginPaths()];
}

/**
 * Bootstrap ~/.sero-ui/agent/ on first run.
 *
 * Creates the agent directory and a default settings.json with Sero's
 * built-in packages and workspace plugins. Skips if settings.json already exists.
 */
function bootstrapAgentDir(): void {
  mkdirSync(SERO_AGENT_DIR, { recursive: true });

  const settingsPath = path.join(SERO_AGENT_DIR, 'settings.json');
  if (!existsSync(settingsPath)) {
    const workspacePackages = getWorkspaceAppPaths();
    const defaults = {
      defaultThinkingLevel: 'high',
      packages: workspacePackages,
      sero: {
        modelFallbackChain: getDefaultModelFallbackChain(),
        modelTiers: {},
        memory: {
          logging: getDefaultMemoryLoggingSettings(),
        },
      },
    };
    writeFileSync(settingsPath, JSON.stringify(defaults, null, 2) + '\n');
    console.log('[sero] Created default settings at', settingsPath);
  }
}

/**
 * Ensure Sero's built-in app packages and workspace plugins are registered in
 * settings.json.
 *
 * Works in both development and packaged builds so the Pi runtime can always
 * discover Sero's app packages via settings.json.
 */
function ensureBuiltinPackages(): void {
  const settingsPath = path.join(SERO_AGENT_DIR, 'settings.json');
  let settings: Record<string, unknown> = {};
  try {
    settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  } catch {
    // Will be created by bootstrapAgentDir
  }

  const packages = Array.isArray(settings.packages)
    ? settings.packages as SettingsPackageSource[]
    : [];
  const workspacePackages = getWorkspaceAppPaths();

  let changed = false;
  const fallbackSettings = ensureConfiguredModelFallbackChain(settings);
  settings = fallbackSettings.settings;
  if (fallbackSettings.changed) changed = true;

  const memoryLoggingSettings = ensureConfiguredMemoryLoggingSettings(settings);
  settings = memoryLoggingSettings.settings;
  if (memoryLoggingSettings.changed) changed = true;
  for (const p of workspacePackages) {
    const hasPackagePath = packages.some((entry) =>
      (typeof entry === 'string' ? entry : entry.source) === p,
    );
    if (!hasPackagePath) {
      packages.push(p);
      changed = true;
    }
  }

  if (changed) {
    settings.packages = packages;
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
    console.log('[sero] Registered built-in app packages and workspace plugins in', settingsPath);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
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

  mainWindow.maximize();

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
  // (in development) and the production renderer HTML (file: protocol).
  // All other navigation attempts (e.g., from XSS or malicious content)
  // are blocked.
  const isDev = process.env.NODE_ENV === 'development';
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsed = new URL(navigationUrl);
      // Production: only file: protocol (local renderer HTML) is allowed
      if (parsed.protocol === 'file:') return;
      // Development: allow the Vite dev server origin
      if (isDev && parsed.origin === 'http://localhost:5173') return;
      console.warn(`[security] Blocked navigation to untrusted origin: ${navigationUrl}`);
      event.preventDefault();
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
  // Allow media (Spotify) and clipboard-sanitized-write for in-app copy actions.
  const allowedPermissions = new Set(['media', 'clipboard-sanitized-write']);
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
  if (PROFILE_STARTUP_ISSUE) {
    const recoveryAction = await handleProfileRegistryRecovery(PROFILE_STARTUP_ISSUE);
    if (recoveryAction === 'relaunch') {
      app.relaunch();
    }
    app.exit(0);
    return;
  }

  // Bootstrap Sero's agent directory (creates settings.json on first run)
  bootstrapAgentDir();

  // ── Content Security Policy ────────────────────────────────────
  // Set a strict CSP on all renderer responses to silence Electron's
  // "Insecure Content-Security-Policy" warning and reduce attack surface.
  setupContentSecurityPolicy();

  // Init workspace registry + default workspaces before anything else
  await workspaceManager.init();

  // Set up custom protocol for serving extension UI assets
  setupExtProtocol();

  // Ensure built-in app packages and workspace plugins are in settings.json.
  ensureBuiltinPackages();

  // Auto-discover and register all built-in app packages and workspace
  // plugins for app discovery. We register them directly as well as via
  // settings.json so discovery still works even if the user's settings file
  // is missing or stale.
  for (const pkgPath of discoverBuiltinPackagePaths()) {
    registerAppPath(pkgPath);
  }
  for (const pluginPath of discoverBuiltinPluginPaths()) {
    registerAppPath(pluginPath);
  }

  // Discover apps and register their assets for the custom protocol.
  const apps = await discoverApps();
  registerAllExtAssets(apps);

  // Watch for new app packages created while running (e.g. by the agent)
  const knownAppIds = new Set(apps.map((a) => a.id));
  watchForNewApps(knownAppIds);

  registerAllIpcHandlers();

  // ── Copy default templates if first launch ─────────────────
  ensureDefaultAgents().catch((err) => console.warn('[sero] Agent template copy failed:', err));
  ensureDefaultSkills().catch((err) => console.warn('[sero] Skill template copy failed:', err));
  ensureProfileTemplates().catch((err) => console.warn('[sero] Profile template copy failed:', err));
  ensureDefaultThemes().catch((err) => console.warn('[sero] Theme template copy failed:', err));

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
  try {
    const availability = await getContainerAvailability();
    if (availability.status === 'available') {
      console.log('[sero] Container runtime available:', availability.message);
    } else {
      console.warn('[sero] Container runtime degraded:', availability.message);
    }
  } catch (err) {
    console.warn('[sero] Failed to read container runtime availability during boot:', err);
  }

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

  // Kick off shared infra + background app runtime startup after core
  // workspace/container bootstrap. This stays non-blocking because runtimes
  // may perform recovery work on existing state.
  void ensureInfra().catch((err) => {
    console.error('[sero] Failed to initialize shared infra:', err);
  });

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

function hideAllWindowsForShutdown(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    window.hide();
  }
}

async function withShutdownTimeout(
  label: string,
  task: () => Promise<void>,
  timeoutMs = SHUTDOWN_STEP_TIMEOUT_MS,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const startedAt = Date.now();
  console.log(`[sero] Shutdown step start: ${label}`);

  try {
    await Promise.race([
      task(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
    console.log(`[sero] Shutdown step done: ${label} (${Date.now() - startedAt}ms)`);
  } catch (err) {
    console.warn(`[sero] Shutdown step failed: ${label} (${Date.now() - startedAt}ms)`, err);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function stopRunningContainers(): Promise<void> {
  const containers = await containerManager.list();
  await Promise.allSettled(
    containers.map((c) => {
      const workspaceId = c.id.replace(/^sero-/, '');
      return containerManager.stop(workspaceId);
    }),
  );
}

async function performGracefulShutdown(): Promise<void> {
  const startedAt = Date.now();
  console.log('[sero] Shutting down — cleaning up containers, terminals, LSP, watchers...');

  fileWatcherManager.disposeAll();
  console.log('[sero] Shutdown sync step done: file watchers');
  vcsManager.disposeAll();
  console.log('[sero] Shutdown sync step done: vcs manager');
  containerManager.terminals.disposeAllTerminals();
  console.log('[sero] Shutdown sync step done: terminals');

  await Promise.allSettled([
    withShutdownTimeout('agent sessions', disposeAllAgentSessions),
    withShutdownTimeout('plugin dev sessions', () => pluginDevSessionManager.dispose()),
    withShutdownTimeout(
      'gateway',
      async () => {
        if (gatewayServer.getStatus().running) {
          await stopGateway();
        }
      },
    ),
    withShutdownTimeout('language servers', () => lspManager.disposeAll()),
    withShutdownTimeout('port forwards', () => containerManager.disposeAllPortForwards()),
    withShutdownTimeout('containers', stopRunningContainers),
  ]);

  console.log(`[sero] Graceful shutdown complete (${Date.now() - startedAt}ms)`);
}

// ── Graceful shutdown ──────────────────────────────────────────
app.on('before-quit', (e) => {
  if (isGracefullyShuttingDown) return;

  e.preventDefault();
  isGracefullyShuttingDown = true;
  hideAllWindowsForShutdown();

  void performGracefulShutdown()
    .catch((err) => {
      console.error('[sero] Unexpected error during graceful shutdown:', err);
    })
    .finally(() => {
      app.exit(0);
    });
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
