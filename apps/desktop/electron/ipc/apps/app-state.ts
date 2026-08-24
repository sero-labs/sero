/**
 * App state IPC handlers.
 *
 * Bridges renderer ↔ AppStateManager for reading, writing, and
 * watching app state JSON files.
 */

import path from 'path';
import { ipcMain } from 'electron';
import type { AppStateReadResult, AppStateWriteResult } from '@/types/ipc';
import { IpcChannels } from '@/types/ipc-channels';
import { appStateManager } from '@electron/features/apps/state/manager';
import { SERO_HOME } from '@electron/platform/env';
import { gitWorkspaceStateManager } from '@electron/features/apps/git-app/manager';
import { appRuntimeManager, ensureInfra, SERO_CONFIG_PATH, applyRuntimeSettings } from '@electron/shared/infra/shared-infra';
import { reloadAllSessionResources } from '../agent/core/agent';

const SETTINGS_RELOAD_COALESCE_MS = 75;

let runtimeSettingsReloadPending = false;
let runtimeSettingsReloadTask: Promise<void> | null = null;

function notifyAppRuntimeManager(filePath: string, data: unknown): void {
  if (!data) return;
  appRuntimeManager.handleStateChange(filePath, data).catch((err) => {
    console.error('[app-state] App runtime manager error:', err);
  });
}

async function runRuntimeSettingsReload(): Promise<void> {
  const infra = await ensureInfra();
  infra.settingsManager.reload();
  applyRuntimeSettings(infra.settingsManager);
  await reloadAllSessionResources();
}

/**
 * Coalesce repeated settings.json notifications from both the direct IPC write
 * path and the file watcher. The short coalescing window collapses back-to-back
 * events for the same logical change, and any additional notifications that
 * arrive during a reload trigger one more pass before the task settles.
 */
function queueCoalescedRuntimeSettingsReload(): Promise<void> {
  runtimeSettingsReloadPending = true;

  if (runtimeSettingsReloadTask) {
    return runtimeSettingsReloadTask;
  }

  runtimeSettingsReloadTask = (async () => {
    await new Promise((resolve) => setTimeout(resolve, SETTINGS_RELOAD_COALESCE_MS));

    const drainPendingReload = async (): Promise<void> => {
      if (!runtimeSettingsReloadPending) return;
      runtimeSettingsReloadPending = false;
      try {
        await runRuntimeSettingsReload();
      } catch (err) {
        console.error('[app-state] Failed to reload runtime settings:', err);
      }
      await drainPendingReload();
    };

    await drainPendingReload();
  })().finally(() => {
    runtimeSettingsReloadTask = null;
  });

  return runtimeSettingsReloadTask;
}

async function refreshRuntimeSettingsIfNeeded(filePath: string): Promise<void> {
  if (path.resolve(filePath) !== path.resolve(SERO_CONFIG_PATH)) return;
  await queueCoalescedRuntimeSettingsReload();
}

export function registerAppStateHandlers(): void {
  // Register file-watcher listener so app runtimes get notified for ALL
  // state changes — including direct writes from Pi extensions that bypass
  // the IPC layer.
  appStateManager.onFileChange((filePath, data) => {
    notifyAppRuntimeManager(filePath, data);

    refreshRuntimeSettingsIfNeeded(filePath).catch((err) => {
      console.error('[app-state] Settings change reload failed:', err);
    });
  });

  // Watch settings.json so direct edits or package-manager writes that bypass
  // the IPC layer still refresh session resources and CLI-bridged tools.
  // This watcher is registered before main.ts's non-blocking ensureInfra()
  // bootstrap settles; early file changes are still safe because the reload
  // path calls ensureInfra() lazily on demand.
  appStateManager.watch(SERO_CONFIG_PATH);

  // Read state file
  ipcMain.handle(
    IpcChannels.appState.read,
    async (_event, filePath: string): Promise<unknown> => {
      return appStateManager.read(filePath);
    },
  );

  // Read file as raw text (no JSON parsing).
  // Restricted to SERO_HOME and /tmp/sero-* to prevent arbitrary file reads.
  ipcMain.handle(
    IpcChannels.appState.readText,
    async (_event, filePath: string): Promise<string | null> => {
      const resolved = path.resolve(filePath);
      const seroHome = path.resolve(SERO_HOME);
      const isSeroPath = resolved.startsWith(seroHome + path.sep) || resolved === seroHome;
      const isSeroLog = resolved.startsWith('/tmp/sero-');
      if (!isSeroPath && !isSeroLog) {
        throw new Error(`readText: access denied — path must be under SERO_HOME or /tmp/sero-*`);
      }
      return appStateManager.readText(resolved);
    },
  );

  // Delete a file
  ipcMain.handle(
    IpcChannels.appState.remove,
    async (_event, filePath: string): Promise<void> => {
      await appStateManager.remove(filePath);
    },
  );

  // Write state file (atomic + serialised + cross-process locked).
  // `expectedEtag` rejects a write based on state that is no longer current.
  ipcMain.handle(
    IpcChannels.appState.write,
    async (_event, filePath: string, data: unknown, expectedEtag?: string | null): Promise<AppStateWriteResult> => {
      const result = await appStateManager.write(filePath, data, expectedEtag);
      if (result.ok) {
        // Immediate notification for IPC-originated writes (no file watcher delay)
        notifyAppRuntimeManager(filePath, data);
        await refreshRuntimeSettingsIfNeeded(filePath);
      }
      return result;
    },
  );

  // Start watching a state file (returns current state plus its etag)
  ipcMain.handle(
    IpcChannels.appState.watch,
    async (_event, filePath: string): Promise<AppStateReadResult> => {
      appStateManager.watch(filePath);
      if (gitWorkspaceStateManager.isGitStateFile(filePath)) {
        gitWorkspaceStateManager.watchStateFile(filePath);
      }
      return appStateManager.readWithEtag(filePath);
    },
  );

  // Stop watching a state file
  ipcMain.handle(
    IpcChannels.appState.unwatch,
    async (_event, filePath: string): Promise<void> => {
      appStateManager.unwatch(filePath);
      if (gitWorkspaceStateManager.isGitStateFile(filePath)) {
        gitWorkspaceStateManager.unwatchStateFile(filePath);
      }
    },
  );
}
