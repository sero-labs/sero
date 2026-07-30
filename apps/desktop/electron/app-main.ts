// Heavy app entry. Reachable only via dynamic import from `main.ts` once
// the doctor short-circuit has been ruled out, so safe mode never triggers
// any of the static-import side effects below (in particular, the top-level
// `resolveStartupEnv()` inside `./platform/env`, which reads profiles.json
// and may run profile migration / repair logic).

// Load .env BEFORE any SDK imports (they read process.env at module level)
import {
  loadSeroEnv,
  SERO_AGENT_DIR,
  SERO_HOME,
  ACTIVE_PROFILE_ID,
  PROFILE_STARTUP_ISSUE,
} from './platform/env';
loadSeroEnv();

import { app, BrowserWindow, session } from 'electron';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import path from 'path';
import type { SettingsPackageSource } from '../src/types/ipc';

// electron-builder's `productName: Sero` only names the packaged macOS app
// bundle. In dev mode (`electron .`), the process name — and so the macOS
// menu bar app name — falls back to package.json's `name` field
// (`@sero/desktop`), which Electron then mangles to "Electron". Setting it
// explicitly here fixes the menu bar in both dev and packaged builds, and
// must run before `app.whenReady()`.
app.setName('Sero');

// ── Per-profile Chromium userData isolation ──────────────────
// Set userData path BEFORE app.whenReady() so Chromium initialises with the
// correct directory. This isolates cookies, localStorage, caches, and
// session data between profiles.
//
// userData always lives under SERO_HOME so it tracks the active profile.
// When there is no active profile yet (fresh install / pre-onboarding) there
// is no legacy data worth preserving, so migration is intentionally skipped
// and Chromium simply starts fresh in the SERO_HOME location.
const profileUserData = profileUserDataPath(SERO_HOME);
if (ACTIVE_PROFILE_ID) {
  const defaultUserDataPath = app.getPath('userData');
  migrateLegacyProfileUserData(
    legacyProfileUserDataPath(defaultUserDataPath, ACTIVE_PROFILE_ID),
    profileUserData,
  );
}
mkdirSync(profileUserData, { recursive: true });
app.setPath('userData', profileUserData);
import { registerAllIpcHandlers } from './ipc';
import { forwardWindowStateEvents } from './ipc/platform/system/window';
import {
  CHROME_BACKGROUND_COLOR,
  CHROME_BAR_HEIGHT,
  CHROME_OVERLAY_SYMBOL_COLOR,
  getMacTrafficLightPosition,
} from './chrome';
import { disposeAllAgentSessions } from './ipc/agent/core/agent';
import { workspaceManager } from './features/workspace/manager';
import { setupExtProtocol, registerAllExtAssets } from './platform/protocols/ext-protocol';
import { discoverApps, registerAppPath } from './features/apps/discovery';
import { watchForNewApps } from './ipc/apps/apps';
import { ensureBundledPiDocs, ensureDefaultAgents, ensureDefaultSkills, ensureDefaultThemes, ensureProfileTemplates } from './features/profile/setup';
import { handleProfileRegistryRecovery } from './features/profile/recovery';
import {
  appRuntimeManager,
  containerManager,
  ensureInfra,
  fileWatcherManager,
  gatewayServer,
  lspManager,
  pluginDevSessionManager,
  runtimeManager,
  vcsManager,
} from './shared/infra/shared-infra';
import { startGateway, stopGateway } from './ipc/gateway/gateway';
import { setupContentSecurityPolicy } from './platform/security/csp';
import { setupMainWindowSecurity } from './platform/security/window-security';
import { browserViewManager } from './features/browser/view-manager';
import { discoverBuiltinPackagePaths, discoverBuiltinPluginPaths } from './platform/protocols/builtin-resources';
import {
  ensureConfiguredModelFallbackChain,
  getDefaultModelFallbackChain,
} from './shared/settings/model-fallback-chain';
import { getDefaultMemoryLoggingSettings, ensureConfiguredMemoryLoggingSettings } from './shared/settings/memory-logging-settings';
import {
  ensureHostSeroCliBridge,
  type HostSeroCliBridgeDependencies,
} from './cli/host-bridge/server';
import { getCliRegistry } from './cli';
import { executeCliArgv } from './cli/core/batch-executor';
import { initUpdater } from './features/updater/updater';
import { installApplicationMenu } from './features/updater/menu';
import { getPackageSource, removeStaleBuiltinPackages } from './platform/protocols/builtin-package-settings';
import {
  legacyProfileUserDataPath,
  migrateLegacyProfileUserData,
  profileUserDataPath,
} from './platform/profile-user-data';

let mainWindow: BrowserWindow | null = null;
let isGracefullyShuttingDown = false;
const SHUTDOWN_STEP_TIMEOUT_MS = 2_500;

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

  let packages = Array.isArray(settings.packages)
    ? settings.packages as SettingsPackageSource[]
    : [];
  const workspacePackages = getWorkspaceAppPaths();
  const stalePackageCleanup = removeStaleBuiltinPackages(packages, workspacePackages);
  packages = stalePackageCleanup.packages;

  let changed = stalePackageCleanup.changed;
  const fallbackSettings = ensureConfiguredModelFallbackChain(settings);
  settings = fallbackSettings.settings;
  if (fallbackSettings.changed) changed = true;

  const memoryLoggingSettings = ensureConfiguredMemoryLoggingSettings(settings);
  settings = memoryLoggingSettings.settings;
  if (memoryLoggingSettings.changed) changed = true;
  for (const p of workspacePackages) {
    const packagePath = path.resolve(p);
    const hasPackagePath = packages.some((entry) => {
      const source = getPackageSource(entry);
      return source ? path.resolve(source) === packagePath : false;
    });
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

/**
 * Per-platform window frame. The renderer draws one identical chrome
 * everywhere; only the window-control corner differs:
 *   macOS   — native traffic lights over the custom bar (hiddenInset)
 *   Windows — native overlay buttons (min/max/close + snap layouts)
 *   Linux   — frameless; the renderer draws its own controls via IPC
 */
function platformFrameOptions(): Electron.BrowserWindowConstructorOptions {
  if (process.platform === 'darwin') {
    return {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: getMacTrafficLightPosition(),
    };
  }
  if (process.platform === 'win32') {
    return {
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        height: CHROME_BAR_HEIGHT,
        color: CHROME_BACKGROUND_COLOR,
        symbolColor: CHROME_OVERLAY_SYMBOL_COLOR,
      },
    };
  }
  return { frame: false };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    minWidth: 800,
    minHeight: 500,
    ...platformFrameOptions(),
    backgroundColor: CHROME_BACKGROUND_COLOR,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  forwardWindowStateEvents(mainWindow);

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

  setupMainWindowSecurity(mainWindow, {
    isDevelopment: process.env.NODE_ENV === 'development',
  });

  // Give the file watcher manager access to the window for push events
  fileWatcherManager.setWindow(mainWindow);

  // Attach the in-app browser's view manager so new WebContentsViews land
  // on top of the renderer at the bounds the BrowserPanel reports.
  browserViewManager.setWindow(mainWindow);

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

  const hostSeroCliBridgeDependencies: HostSeroCliBridgeDependencies = {
    workspaceManager,
    containerManager,
    executeArgv: (argv, context) => executeCliArgv(getCliRegistry(), argv, context),
  };
  const startHostSeroCliBridge = () => ensureHostSeroCliBridge(hostSeroCliBridgeDependencies);
  runtimeManager.setHostSeroCliBridgeStarter(startHostSeroCliBridge);
  await startHostSeroCliBridge().catch((err: unknown) => {
    console.error('[sero] Failed to start host Sero CLI bridge:', err);
  });

  // ── Copy default templates if first launch ─────────────────
  ensureDefaultAgents().catch((err) => console.warn('[sero] Agent template copy failed:', err));
  ensureDefaultSkills().catch((err) => console.warn('[sero] Skill template copy failed:', err));
  ensureProfileTemplates().catch((err) => console.warn('[sero] Profile template copy failed:', err));
  ensureDefaultThemes().catch((err) => console.warn('[sero] Theme template copy failed:', err));
  await ensureBundledPiDocs().catch((err) => console.warn('[sero] Pi docs copy failed:', err));

  // ── User-Agent ────────────────────────────────────────────────
  // Keep embedded browser sessions closer to Chrome so login flows and
  // compatibility checks do not reject the app solely because it is Electron.
  // Must be set on the session, not via app.userAgentFallback, because
  // Chromium sets a session-level default that takes priority over the fallback.
  const cleanUA = session.defaultSession.getUserAgent()
    .replace(/\sElectron\/[\S]+/, '')
    .replace(/\s+sero\/[\S]+/i, '');
  session.defaultSession.setUserAgent(cleanUA);
  console.log('[sero] User-Agent:', cleanUA);

  // Runtime backends are started on demand by each selected workspace.

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

  // Application menu (adds "Check for Updates…") + background auto-update.
  installApplicationMenu();
  initUpdater();
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
  browserViewManager.hideAll();
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

async function performGracefulShutdown(): Promise<void> {
  const startedAt = Date.now();
  console.log('[sero] Shutting down — cleaning up containers, terminals, LSP, watchers...');

  fileWatcherManager.disposeAll();
  console.log('[sero] Shutdown sync step done: file watchers');
  console.log('[sero] Shutdown sync step done: vcs manager');

  await Promise.allSettled([
    withShutdownTimeout('agent sessions', disposeAllAgentSessions),
    withShutdownTimeout('app runtimes', () => appRuntimeManager.dispose()),
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
    withShutdownTimeout('runtimes', () => runtimeManager.destroyAll()),
  ]);

  console.log(`[sero] Graceful shutdown complete (${Date.now() - startedAt}ms)`);
}

function requestGracefulAppQuit(): void {
  if (isGracefullyShuttingDown) return;
  if (app.isReady()) {
    app.quit();
  } else {
    app.exit(0);
  }
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

process.once('SIGTERM', requestGracefulAppQuit);
process.once('SIGINT', requestGracefulAppQuit);
