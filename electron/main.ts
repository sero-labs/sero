import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { ContainerManager } from './container-manager';
import { AgentManager } from './agent-manager';
import { SkillManager } from './skill-manager';
import { LspManager } from './lsp/lsp-manager';
import { FileWatcherManager } from './file-watcher';
import { registerIpcHandlers } from './ipc-handlers';

// ── Global error safety net ──────────────────────────────────
// Catch transient stream errors (EPIPE, ECONNRESET) that can bubble up from
// container exec, terminal PTY writes, or IPC sends when processes/windows
// close during active I/O. These are non-fatal — log and continue.
const TRANSIENT_CODES = new Set(['EPIPE', 'ECONNRESET', 'ERR_IPC_CHANNEL_CLOSED']);

process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
  if (TRANSIENT_CODES.has(err.code ?? '')) {
    console.warn(`[sero] Suppressed transient error (${err.code}):`, err.message);
    return;
  }
  // For non-transient errors, log fully and let Electron handle normally
  console.error('[sero] Uncaught exception:', err);
});

process.on('unhandledRejection', (reason: any) => {
  const code = reason?.code ?? '';
  if (TRANSIENT_CODES.has(code)) {
    console.warn(`[sero] Suppressed transient rejection (${code}):`, reason?.message ?? reason);
    return;
  }
  console.error('[sero] Unhandled rejection:', reason);
});

let mainWindow: BrowserWindow | null = null;
const containerManager = new ContainerManager();
const skillManager = new SkillManager();
const agentManager = new AgentManager(containerManager, skillManager);
const lspManager = new LspManager(containerManager);
const fileWatcher = new FileWatcherManager();

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

  fileWatcher.setWindow(mainWindow);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  registerIpcHandlers(ipcMain, containerManager, agentManager, skillManager, lspManager, fileWatcher);

  // Discover skills on startup
  await skillManager.discoverAll();

  // Ensure the container API server is running before any container operations
  try {
    await containerManager.ensureSystemRunning();
  } catch (err) {
    console.error('[sero] Failed to start container system on boot — containers will retry on demand:', err);
  }

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
  await lspManager.disposeAll();
  containerManager.disposeAllTerminals();
  skillManager.cleanupAllPreviews();
  fileWatcher.disposeAll();

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


