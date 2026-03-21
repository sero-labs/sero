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
import { IpcChannels } from '../../src/types/ipc';
import { appStateManager } from '../app-state';
import { kanbanOrchestrator, ensureInfra, workspaceManager } from './shared-infra';
import type { KanbanState } from '../kanban/types';
import { SERO_HOME } from '../env';

const KANBAN_STATE_SUFFIX = '/apps/kanban/state.json';
const KANBAN_WORKSPACE_SUFFIX = '/.sero/apps/kanban/state.json';

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
  });

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
    },
  );

  // Start watching a state file (returns current state)
  ipcMain.handle(
    IpcChannels.appState.watch,
    async (_event, filePath: string): Promise<unknown> => {
      appStateManager.watch(filePath);
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
    },
  );
}
