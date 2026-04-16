/**
 * Google API IPC handlers.
 *
 * Two concerns:
 *   1. Auth — Google OAuth2 via GoogleAuthManager (like GitHub auth)
 *   2. Data — execute gogcli (gog) commands for Gmail/Calendar
 *
 * PATH resolution: Electron on macOS doesn't inherit the shell
 * PATH when launched from Finder/Dock. We probe common locations.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { execFile } from 'node:child_process';
import { IpcChannels } from '@/types/ipc-channels';
import { GoogleAuthManager } from '@electron/features/auth/google/auth-manager';
import {
  deriveKeyringPassword,
  getGoogleClientName,
} from '@electron/features/auth/google/gog-keyring';
import {
  buildGogPath,
  resolveGogBinaryPath,
} from '@electron/features/auth/google/gog-runtime';
import { onPluginConfigChange } from '@electron/features/plugin-config';

// ── Types ────────────────────────────────────────────────────

export interface GogExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

type ExecFileError = NodeJS.ErrnoException & {
  status?: number | null;
};

// ── gogcli execution ─────────────────────────────────────────

const GOG_TIMEOUT_MS = 30_000;

function runGog(args: string[], email?: string): Promise<GogExecResult> {
  return new Promise((resolve) => {
    const accountArgs = email ? ['--account', email] : [];
    const fullArgs = ['--client', getGoogleClientName(), '--json', '--no-input', ...accountArgs, ...args];
    const child = execFile(resolveGogBinaryPath(), fullArgs, {
      timeout: GOG_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, PATH: buildGogPath(), GOG_KEYRING_PASSWORD: deriveKeyringPassword() },
    }, (error, stdout, stderr) => {
      const childError = error as ExecFileError | null;
      if (childError?.code === 'ENOENT') {
        resolve({ stdout: '', stderr: 'gog binary not found', exitCode: 127 });
        return;
      }
      resolve({
        stdout: stdout ?? '',
        stderr: stderr ?? '',
        exitCode: childError ? (typeof childError.status === 'number' ? childError.status : 1) : 0,
      });
    });
    child.on('error', (err) => {
      resolve({ stdout: '', stderr: err.message, exitCode: 127 });
    });
  });
}

// ── Registration ─────────────────────────────────────────────

let googleAuth: GoogleAuthManager;

export function getGoogleAuthManager(): GoogleAuthManager {
  if (!googleAuth) googleAuth = new GoogleAuthManager();
  return googleAuth;
}

export function registerGoogleApiHandlers(): void {
  const auth = getGoogleAuthManager();

  // Reset auth manager state when Google plugin config changes
  // (e.g. user saves new OAuth credentials via the setup form)
  onPluginConfigChange('sero-google-plugin', () => {
    auth.resetForConfigChange();
  });

  /** Execute a gogcli data command — auto-injects --account from auth. */
  ipcMain.handle(
    IpcChannels.google.execute,
    async (_event, service: string, subArgs: string[]): Promise<GogExecResult> => {
      await auth.ensureCredentialsAvailable();
      return runGog([service, ...subArgs], auth.getEmail() ?? undefined);
    },
  );

  /** Get auth status. */
  ipcMain.handle(IpcChannels.google.authStatus, async () => {
    return auth.getStatus();
  });

  /** Start OAuth2 sign-in flow (opens browser). */
  ipcMain.handle(IpcChannels.google.login, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    await auth.login((progress) => {
      win?.webContents.send(IpcChannels.google.authEvent, progress);
    });
  });

  /** Logout. */
  ipcMain.handle(IpcChannels.google.logout, async () => {
    auth.logout();
  });
}
