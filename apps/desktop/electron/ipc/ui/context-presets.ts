/**
 * IPC handlers for context editor preset persistence.
 * Presets are stored as JSON at ~/.sero-ui/context-presets.json.
 */

import { ipcMain } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import { IpcChannels } from '../../../src/types/ipc';
import type { ContextPreset } from '../../../src/types/ipc';
import { SERO_HOME } from '../../env';

const PRESETS_PATH = path.join(SERO_HOME, 'context-presets.json');

export function registerContextPresetsHandlers(): void {
  ipcMain.handle(
    IpcChannels.contextPresets.load,
    async (): Promise<ContextPreset[]> => {
      try {
        const raw = await fs.readFile(PRESETS_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    },
  );

  ipcMain.handle(
    IpcChannels.contextPresets.save,
    async (_event, presets: ContextPreset[]): Promise<void> => {
      await fs.mkdir(path.dirname(PRESETS_PATH), { recursive: true });
      await fs.writeFile(PRESETS_PATH, JSON.stringify(presets, null, 2), 'utf8');
    },
  );
}
