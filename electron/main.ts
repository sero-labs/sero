// Load .env BEFORE any SDK imports (they read process.env at module level)
import { loadSeroEnv } from './env';
loadSeroEnv();

import { app, BrowserWindow } from 'electron';
import path from 'path';
import { registerAllIpcHandlers } from './ipc/index';
import { workspaceManager } from './workspace';
import { registerExtProtocolScheme, setupExtProtocol, registerAllExtAssets } from './ext-protocol';
import { discoverApps, registerAppPath } from './app-discovery';

// Register custom protocol BEFORE app.whenReady()
registerExtProtocolScheme();

let mainWindow: BrowserWindow | null = null;

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

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // Init workspace registry + default workspaces before anything else
  await workspaceManager.init();

  // Set up custom protocol for serving extension UI assets
  setupExtProtocol();

  // Register local dev extension path
  // __dirname is dist/electron/ at runtime → go up 3 levels to monorepo root
  const todoExtPath = path.resolve(__dirname, '../../../packages/pi-todo-extension');
  registerAppPath(todoExtPath);

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
