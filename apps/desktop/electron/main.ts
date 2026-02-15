// Load .env BEFORE any SDK imports (they read process.env at module level)
import { loadSeroEnv, SERO_AGENT_DIR } from './env';
loadSeroEnv();

import { app, BrowserWindow } from 'electron';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import path from 'path';
import { registerAllIpcHandlers } from './ipc/index';
import { workspaceManager } from './workspace';
import { registerExtProtocolScheme, setupExtProtocol, registerAllExtAssets } from './ext-protocol';
import { discoverApps, registerAppPath } from './app-discovery';

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
