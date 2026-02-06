import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { ContainerManager } from './container-manager';
import { AgentManager } from './agent-manager';
import { SkillManager } from './skill-manager';
import { registerIpcHandlers } from './ipc-handlers';

let mainWindow: BrowserWindow | null = null;
const containerManager = new ContainerManager();
const skillManager = new SkillManager();
const agentManager = new AgentManager(containerManager, skillManager);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
    },
  });

  // In dev, load from Vite dev server; in production, load built files
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  registerIpcHandlers(ipcMain, containerManager, agentManager, skillManager);

  // Discover skills on startup
  await skillManager.discoverAll();

  // Clean up orphaned sero containers from previous crashes
  await cleanupOrphanedContainers();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

// Graceful shutdown — stop all containers and clean up agent sessions
app.on('before-quit', async (e) => {
  e.preventDefault();
  console.log('[sero] Shutting down — cleaning up containers and agents...');
  agentManager.disposeAll();
  containerManager.disposeAllTerminals();

  try {
    const containers = await containerManager.list();
    await Promise.allSettled(
      containers.map((c) => {
        const projectId = c.id.replace('sero-', '');
        return containerManager.stop(projectId);
      })
    );
  } catch (err) {
    console.error('[sero] Error during shutdown cleanup:', err);
  }

  app.exit(0);
});

/**
 * Clean up any orphaned sero-* containers from previous crashes.
 * Compares running containers against persisted project list.
 */
async function cleanupOrphanedContainers(): Promise<void> {
  try {
    const { loadPersistedProjects } = await import('./persistence');
    const persisted = loadPersistedProjects();
    const persistedIds = new Set(persisted.map((p) => `sero-${p.id}`));

    const running = await containerManager.list();
    for (const c of running) {
      if (!persistedIds.has(c.id)) {
        console.log(`[sero] Cleaning up orphaned container: ${c.id}`);
        const projectId = c.id.replace('sero-', '');
        try {
          await containerManager.stop(projectId);
          await containerManager.remove(projectId);
        } catch {
          // Best effort
        }
      }
    }
  } catch (err) {
    console.error('[sero] Orphan cleanup error:', err);
  }
}


