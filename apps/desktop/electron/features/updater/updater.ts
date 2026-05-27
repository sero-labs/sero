/**
 * Auto-update via electron-updater + GitHub Releases.
 *
 * Policy: silent background download (check on launch + every 6h), with a
 * renderer-driven "Restart to update" prompt once an update is downloaded.
 * `allowPrerelease` is on while Sero ships beta prereleases — flip it off when
 * cutting a stable channel.
 *
 * electron-updater needs a packaged app with an embedded `app-update.yml`
 * (generated from electron-builder's `publish` stanza). In dev there is none,
 * so init/checks are no-ops outside a packaged build.
 */

import { app, BrowserWindow, dialog } from 'electron';
import electronUpdater from 'electron-updater';
import { IpcChannels } from '@/types/ipc-channels';
import type { UpdaterStatusEvent } from '@/types/ipc';

const { autoUpdater } = electronUpdater;

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

let initialized = false;
let manualCheck = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastStatus: UpdaterStatusEvent = { state: 'idle' };

function broadcast(status: UpdaterStatusEvent): void {
  lastStatus = status;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IpcChannels.updater.event, status);
    }
  }
}

export function getUpdaterStatus(): UpdaterStatusEvent {
  return lastStatus;
}

// A manual check from the app menu must give visible feedback even when nothing
// is downloading. The renderer indicator only shows for in-flight updates, so
// "up to date" and error results surface as a native dialog.
function notifyManualResult(kind: 'up-to-date' | 'error', detail?: string): void {
  const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
  const options =
    kind === 'up-to-date'
      ? {
          type: 'info' as const,
          message: 'You’re up to date',
          detail: `Sero ${app.getVersion()} is the latest version.`,
          buttons: ['OK'],
          defaultId: 0,
        }
      : {
          type: 'error' as const,
          message: 'Update check failed',
          detail: detail ?? 'Could not check for updates. Please try again later.',
          buttons: ['OK'],
          defaultId: 0,
        };
  if (parent) {
    void dialog.showMessageBox(parent, options);
  } else {
    void dialog.showMessageBox(options);
  }
}

async function runCheck(manual: boolean): Promise<void> {
  manualCheck = manual;
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    broadcast({
      state: 'error',
      message: err instanceof Error ? err.message : String(err),
      manual,
    });
    manualCheck = false;
  }
}

export function initUpdater(): void {
  if (initialized) return;
  initialized = true;

  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = true;

  autoUpdater.on('checking-for-update', () => {
    broadcast({ state: 'checking', manual: manualCheck });
  });
  autoUpdater.on('update-available', (info) => {
    broadcast({ state: 'available', version: info.version, manual: manualCheck });
  });
  autoUpdater.on('update-not-available', (info) => {
    const wasManual = manualCheck;
    broadcast({ state: 'not-available', version: info?.version, manual: wasManual });
    manualCheck = false;
    if (wasManual) notifyManualResult('up-to-date');
  });
  autoUpdater.on('download-progress', (progress) => {
    broadcast({ state: 'downloading', percent: Math.round(progress.percent) });
  });
  autoUpdater.on('update-downloaded', (info) => {
    broadcast({ state: 'downloaded', version: info.version });
    manualCheck = false;
  });
  autoUpdater.on('error', (err) => {
    const wasManual = manualCheck;
    const message = err instanceof Error ? err.message : String(err);
    broadcast({ state: 'error', message, manual: wasManual });
    manualCheck = false;
    if (wasManual) notifyManualResult('error', message);
  });

  void runCheck(false);
  pollTimer = setInterval(() => void runCheck(false), CHECK_INTERVAL_MS);
  app.on('before-quit', () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  });
}

export async function checkForUpdates(opts?: { manual?: boolean }): Promise<void> {
  const manual = opts?.manual ?? false;
  if (!app.isPackaged) {
    if (manual) broadcast({ state: 'not-available', manual: true });
    return;
  }
  await runCheck(manual);
}

export function restartToUpdate(): void {
  if (!app.isPackaged) return;
  // Defer past the IPC reply so the renderer's invoke settles before we quit.
  // isSilent=false (show installer UI where relevant), isForceRunAfter=true (relaunch).
  setImmediate(() => autoUpdater.quitAndInstall(false, true));
}
