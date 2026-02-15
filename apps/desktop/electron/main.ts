// Load .env BEFORE any SDK imports (they read process.env at module level)
import { loadSeroEnv, SERO_AGENT_DIR } from './env';
loadSeroEnv();

import { app, BrowserWindow, ipcMain } from 'electron';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import path from 'path';
import { registerAllIpcHandlers } from './ipc/index';
import { workspaceManager } from './workspace';
import { registerExtProtocolScheme, setupExtProtocol, registerAllExtAssets } from './ext-protocol';
import { discoverApps, registerAppPath } from './app-discovery';
import { containerManager } from './ipc/shared-infra';
import { FileWatcherManager } from './container/file-watcher';
import { IpcChannels } from '../src/types/ipc';

const fileWatcher = new FileWatcherManager();

// Register custom protocol BEFORE app.whenReady()
registerExtProtocolScheme();

let mainWindow: BrowserWindow | null = null;

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
 * Ensure Sero's built-in app packages are registered in settings.json.
 *
 * In development, adds monorepo-relative paths for the built-in apps.
 * Reads and patches the existing settings.json rather than overwriting.
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

  // __dirname is apps/desktop/dist/electron/ at runtime → monorepo root is 4 levels up
  const builtinPaths = [
    path.resolve(__dirname, '../../../../packages/pi-todo-extension'),
    path.resolve(__dirname, '../../../../packages/pi-weight-tracker'),
    path.resolve(__dirname, '../../../../packages/pi-daily-quote'),
  ];

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

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Wire file watcher to this window
  fileWatcher.setWindow(mainWindow);

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

    // __dirname is apps/desktop/dist/electron/ at runtime → monorepo root is 4 levels up
    const todoExtPath = path.resolve(__dirname, '../../../../packages/pi-todo-extension');
    registerAppPath(todoExtPath);

    const weightTrackerExtPath = path.resolve(__dirname, '../../../../packages/pi-weight-tracker');
    registerAppPath(weightTrackerExtPath);

    const dailyQuoteExtPath = path.resolve(__dirname, '../../../../packages/pi-daily-quote');
    registerAppPath(dailyQuoteExtPath);
  }

  // Discover apps and register their assets for the custom protocol
  const apps = await discoverApps();
  registerAllExtAssets(apps);

  registerAllIpcHandlers();

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

  // Start HTTP proxy so containers can access the internet through the host.
  // Needed when security software (Bitdefender, etc.) blocks outbound from vmnet.
  await containerManager.startProxy();

  // Clean up orphaned sero-* containers from previous crashes
  await cleanupOrphanedContainers();

  // ── File watcher IPC handlers ────────────────────────────────
  ipcMain.handle(IpcChannels.filetree.watch, async (_event, workspaceId: string) => {
    const wsPath = workspaceManager.getPath(workspaceId);
    if (wsPath) fileWatcher.watch(workspaceId, wsPath);
  });
  ipcMain.handle(IpcChannels.filetree.unwatch, async (_event, workspaceId: string) => {
    fileWatcher.unwatch(workspaceId);
  });
  ipcMain.handle(IpcChannels.filetree.setActive, async (_event, workspaceId: string | null) => {
    fileWatcher.setActiveWorkspace(workspaceId);
  });

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
  console.log('[sero] Shutting down — cleaning up containers and terminals...');

  // Dispose terminals, port forwards, and file watchers
  containerManager.disposeAllTerminals();
  containerManager.disposeAllPortForwards();
  fileWatcher.disposeAll();

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
