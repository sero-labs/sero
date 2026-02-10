import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { execSync } from 'child_process';
import { ContainerManager } from './container-manager';
import { AgentManager } from './agent-manager';
import { SkillManager } from './skill-manager';
import { PackageInstaller } from './package-installer';
import { LspManager } from './lsp/lsp-manager';
import { FileWatcherManager } from './file-watcher';
import { registerIpcHandlers } from './ipc-handlers';

// ── Fix Electron environment inheritance ─────────────────────
// On macOS (and Linux when launched from a desktop entry), Electron inherits the
// minimal system environment from launchd / the display manager, which does NOT
// include paths and variables injected by version managers like Volta, nvm, fnm,
// or pyenv. This means child-process calls to `npm`, `node`, `git`, etc. may
// resolve to the wrong binary or fail entirely.
//
// Just fixing PATH is not enough — version managers also rely on home-directory
// variables (VOLTA_HOME, NVM_DIR, etc.) to redirect global installs to the
// correct managed location.
//
// Fix: source the user's login shell to get the full environment, then apply
// all variables to this process before any managers are constructed.
function fixElectronEnv(): void {
  if (process.platform !== 'darwin' && process.platform !== 'linux') return;

  console.log(`[sero] Original PATH: ${process.env.PATH}`);

  try {
    const shell = process.env.SHELL || '/bin/zsh';
    // Get the full environment from the user's login shell.
    // `env` output is KEY=VALUE per line; multi-line values are rare and the
    // critical variables (PATH, VOLTA_HOME, NVM_DIR) are always single-line.
    const envOutput = execSync(`${shell} -ilc env`, {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Variables that should NOT be overwritten from the login shell
    const SKIP = new Set([
      '_', 'SHLVL', 'PWD', 'OLDPWD', 'SHELL', 'TERM', 'TERM_PROGRAM',
      'TERM_SESSION_ID', 'TMPDIR', 'HOME', 'USER', 'LOGNAME', 'DISPLAY',
      'ELECTRON_RUN_AS_NODE',
    ]);

    let changed = 0;
    for (const line of envOutput.split('\n')) {
      const eqIdx = line.indexOf('=');
      if (eqIdx <= 0) continue;
      const key = line.substring(0, eqIdx);
      const value = line.substring(eqIdx + 1);
      if (SKIP.has(key)) continue;
      // Skip vars that look like internal shell state
      if (key.startsWith('BASH_') || key.startsWith('ZSH_') || key.startsWith('COMP_')) continue;
      if (process.env[key] !== value) {
        process.env[key] = value;
        changed++;
      }
    }

    console.log(`[sero] Inherited ${changed} env var(s) from user login shell`);
    // Version manager vars
    if (process.env.VOLTA_HOME) console.log(`[sero] VOLTA_HOME: ${process.env.VOLTA_HOME}`);
    if (process.env.NVM_DIR) console.log(`[sero] NVM_DIR: ${process.env.NVM_DIR}`);
    // PI-specific vars
    if (process.env.PI_CODING_AGENT_DIR) console.log(`[sero] PI_CODING_AGENT_DIR: ${process.env.PI_CODING_AGENT_DIR}`);
    if (process.env.PI_PACKAGE_DIR) console.log(`[sero] PI_PACKAGE_DIR: ${process.env.PI_PACKAGE_DIR}`);
    if (process.env.PI_SKIP_VERSION_CHECK) console.log(`[sero] PI_SKIP_VERSION_CHECK: ${process.env.PI_SKIP_VERSION_CHECK}`);
    console.log(`[sero] Resolved PATH: ${process.env.PATH}`);
  } catch (err) {
    console.warn('[sero] Could not resolve shell environment, using system default:', err);
  }

  // ── Fix npm global prefix for Volta ──────────────────────────
  // Volta's npm shim manages which npm VERSION runs but does NOT change npm's
  // global prefix. So `npm root -g` still returns /usr/local/lib/node_modules
  // and `npm install -g` targets the system directory (which requires root).
  //
  // Fix: when Volta is detected, resolve the actual Node image path via
  // `volta which node` and set npm_config_prefix to that directory. This makes
  // `npm install -g` and `npm root -g` use Volta's managed location.
  if (process.env.VOLTA_HOME) {
    try {
      const nodeBin = execSync('volta which node', {
        encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      // nodeBin is e.g. /Users/user/.volta/tools/image/node/22.0.0/bin/node
      // prefix should be /Users/user/.volta/tools/image/node/22.0.0/
      const prefix = path.resolve(nodeBin, '..', '..');
      process.env.npm_config_prefix = prefix;
      console.log(`[sero] Set npm_config_prefix for Volta: ${prefix}`);
    } catch (voltaErr: any) {
      console.warn('[sero] Could not determine Volta node prefix:', voltaErr.message);
    }
  }

  // Diagnostic: verify npm resolution after env fix
  try {
    const npmPath = execSync('which npm', {
      encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const npmRoot = execSync('npm root -g', {
      encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    console.log(`[sero] npm binary: ${npmPath}`);
    console.log(`[sero] npm root -g: ${npmRoot}`);
  } catch (diagErr: any) {
    console.warn('[sero] npm diagnostic check failed:', diagErr.message);
  }
}

fixElectronEnv();

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
const packageInstaller = new PackageInstaller();
const skillManager = new SkillManager(packageInstaller);
const agentManager = new AgentManager(containerManager, skillManager, packageInstaller);
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
  registerIpcHandlers(ipcMain, containerManager, agentManager, skillManager, lspManager, fileWatcher, packageInstaller);

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


