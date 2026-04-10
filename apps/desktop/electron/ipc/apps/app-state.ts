/**
 * App state IPC handlers.
 *
 * Bridges renderer ↔ AppStateManager for reading, writing, and
 * watching app state JSON files.
 *
 * Also notifies the KanbanOrchestrator when the kanban state file
 * is written, so it can detect column transitions and trigger
 * automated phases (planning, implementation, review).
 */

import path from 'path';
import { ipcMain } from 'electron';
import { IpcChannels } from '@/types/ipc';
import { appStateManager } from '@electron/features/apps/state/manager';
import { SERO_HOME } from '@electron/platform/env';
import { gitWorkspaceStateManager } from '@electron/features/apps/git-app/manager';
import type { KanbanState } from '@electron/features/kanban/core/types';
import { kanbanOrchestrator, ensureInfra, workspaceManager, SERO_CONFIG_PATH, applyRuntimeSettings } from '@electron/shared/infra/shared-infra';
import { reloadAllSessionResources } from '../agent';

const KANBAN_STATE_SUFFIX = '/apps/kanban/state.json';
const KANBAN_WORKSPACE_SUFFIX = '/.sero/apps/kanban/state.json';
const SETTINGS_RELOAD_COALESCE_MS = 75;

let runtimeSettingsReloadPending = false;
let runtimeSettingsReloadTask: Promise<void> | null = null;

/** Notify the orchestrator immediately if this is a kanban state file. */
function notifyKanbanOrchestrator(filePath: string, data: unknown): void {
  if (filePath.endsWith(KANBAN_STATE_SUFFIX) && data) {
    ensureInfra()
      .then(() => kanbanOrchestrator.onStateChange(filePath, data as KanbanState))
      .catch((err) => console.error('[app-state] Kanban orchestrator error:', err));
  }
}

async function primeKanbanWorkspaceWatch(filePath: string, data: unknown): Promise<void> {
  if (!filePath.endsWith(KANBAN_STATE_SUFFIX) || !data) return;
  await ensureInfra();
  if (!filePath.endsWith(KANBAN_WORKSPACE_SUFFIX)) return;
  const workspacePath = filePath.slice(0, -KANBAN_WORKSPACE_SUFFIX.length);
  const workspace = workspaceManager.findByPath(workspacePath);
  if (workspace) {
    await kanbanOrchestrator.watchWorkspace(workspace.id, workspace.path);
  }
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

    while (runtimeSettingsReloadPending) {
      runtimeSettingsReloadPending = false;
      try {
        await runRuntimeSettingsReload();
      } catch (err) {
        console.error('[app-state] Failed to reload runtime settings:', err);
      }
    }
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
  // Register file-watcher listener so the orchestrator gets notified
  // for ALL state changes — including direct writes from Pi extensions
  // that bypass the IPC layer.
  appStateManager.onFileChange((filePath, data) => {
    if (filePath.endsWith(KANBAN_STATE_SUFFIX) && data) {
      ensureInfra()
        .then(() => kanbanOrchestrator.onStateChange(filePath, data as KanbanState))
        .catch((err) => console.error('[app-state] Kanban orchestrator listener error:', err));
    }

    refreshRuntimeSettingsIfNeeded(filePath).catch((err) => {
      console.error('[app-state] Settings change reload failed:', err);
    });
  });

  // Watch settings.json so direct edits or package-manager writes that bypass
  // the IPC layer still refresh session resources and CLI-bridged tools.
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

  // Write state file (atomic + serialised)
  ipcMain.handle(
    IpcChannels.appState.write,
    async (_event, filePath: string, data: unknown): Promise<void> => {
      await appStateManager.write(filePath, data);
      // Immediate notification for IPC-originated writes (no file watcher delay)
      notifyKanbanOrchestrator(filePath, data);
      await refreshRuntimeSettingsIfNeeded(filePath);
    },
  );

  // Start watching a state file (returns current state)
  ipcMain.handle(
    IpcChannels.appState.watch,
    async (_event, filePath: string): Promise<unknown> => {
      appStateManager.watch(filePath);
      if (gitWorkspaceStateManager.isGitStateFile(filePath)) {
        gitWorkspaceStateManager.watchStateFile(filePath);
      }
      const data = await appStateManager.read(filePath);
      await primeKanbanWorkspaceWatch(filePath, data);
      return data;
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
