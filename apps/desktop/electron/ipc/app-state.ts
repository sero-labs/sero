/**
 * App state IPC handlers.
 *
 * Bridges renderer ↔ AppStateManager for reading, writing, and
 * watching app state JSON files.
 */

import { ipcMain } from 'electron';
import { IpcChannels } from '../../src/types/ipc';
import { appStateManager } from '../app-state';

export function registerAppStateHandlers(): void {
  // Read state file
  ipcMain.handle(
    IpcChannels.appState.read,
    async (_event, filePath: string): Promise<unknown> => {
      return appStateManager.read(filePath);
    },
  );

  // Write state file (atomic + serialised)
  ipcMain.handle(
    IpcChannels.appState.write,
    async (_event, filePath: string, data: unknown): Promise<void> => {
      await appStateManager.write(filePath, data);
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
