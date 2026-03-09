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

import { ipcMain } from 'electron';
import { IpcChannels } from '../../src/types/ipc';
import { appStateManager } from '../app-state';
import { kanbanOrchestrator, ensureInfra } from './shared-infra';
import type { KanbanState } from '../kanban/types';

const KANBAN_STATE_SUFFIX = '/apps/kanban/state.json';

/** Notify the orchestrator if this is a kanban state file. */
function notifyKanbanOrchestrator(filePath: string, data: unknown): void {
  if (filePath.endsWith(KANBAN_STATE_SUFFIX) && data) {
    console.log(`[app-state] Kanban state file written: ${filePath} — notifying orchestrator`);
    // Ensure shared infrastructure is initialised (deps injected) before
    // forwarding the state change. Fire-and-forget — don't block the write.
    ensureInfra()
      .then(() => kanbanOrchestrator.onStateChange(filePath, data as KanbanState))
      .catch((err) => {
        console.error('[app-state] Kanban orchestrator error:', err);
      });
  }
}

export function registerAppStateHandlers(): void {
  // Read state file
  ipcMain.handle(
    IpcChannels.appState.read,
    async (_event, filePath: string): Promise<unknown> => {
      return appStateManager.read(filePath);
    },
  );

  // Read file as raw text (no JSON parsing)
  ipcMain.handle(
    IpcChannels.appState.readText,
    async (_event, filePath: string): Promise<string | null> => {
      return appStateManager.readText(filePath);
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
      notifyKanbanOrchestrator(filePath, data);
    },
  );

  // Start watching a state file (returns current state)
  ipcMain.handle(
    IpcChannels.appState.watch,
    async (_event, filePath: string): Promise<unknown> => {
      appStateManager.watch(filePath);
      return appStateManager.read(filePath);
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
