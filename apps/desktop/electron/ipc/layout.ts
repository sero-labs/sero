/**
 * Layout IPC handlers — persists UI layout state to disk.
 *
 * Saves to ~/.sero-ui/layout.json using atomic write (temp + rename)
 * to prevent corruption from concurrent saves.
 */

import { ipcMain } from 'electron';
import { promises as fs } from 'fs';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { IpcChannels } from '../../src/types/ipc';
import { SERO_HOME } from '../env';

const LAYOUT_FILE = path.join(SERO_HOME, 'agent', 'layout.json');

export interface LayoutState {
  mainSidebarOpen: boolean;
  chatPanelOpen: boolean;
}

let writeQueue: Promise<void> = Promise.resolve();

function isLayoutState(value: unknown): value is LayoutState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<LayoutState>;
  return (
    typeof candidate.mainSidebarOpen === 'boolean' &&
    typeof candidate.chatPanelOpen === 'boolean'
  );
}

/** Parse layout JSON. Returns the state if valid, null otherwise. */
function parseLayoutState(raw: string): LayoutState | null {
  try {
    const parsed = JSON.parse(raw.trim());
    return isLayoutState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function saveLayoutFile(state: LayoutState): Promise<void> {
  mkdirSync(SERO_HOME, { recursive: true });
  const tmpFile = `${LAYOUT_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmpFile, LAYOUT_FILE);
}

export function registerLayoutHandlers(): void {
  ipcMain.handle(
    IpcChannels.layout.save,
    async (_e, state: LayoutState) => {
      // Serialize writes to avoid temp-file races under rapid toggle/save bursts.
      writeQueue = writeQueue
        .then(() => saveLayoutFile(state))
        .catch(() => saveLayoutFile(state));
      await writeQueue;
    },
  );

  ipcMain.handle(
    IpcChannels.layout.load,
    async () => {
      if (!existsSync(LAYOUT_FILE)) return null;
      try {
        const raw = await fs.readFile(LAYOUT_FILE, 'utf8');
        return parseLayoutState(raw);
      } catch {
        return null;
      }
    },
  );
}
