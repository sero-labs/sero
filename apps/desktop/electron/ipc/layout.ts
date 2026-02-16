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

const LAYOUT_FILE = path.join(SERO_HOME, 'layout.json');

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

/**
 * Parse layout JSON and tolerate extra trailing braces (e.g. "...}}").
 * Returns whether repair was needed so caller can rewrite a clean file.
 */
function parseLayoutState(raw: string): { state: LayoutState; repaired: boolean } | null {
  const candidate = raw.trim();

  try {
    const parsed = JSON.parse(candidate);
    return isLayoutState(parsed) ? { state: parsed, repaired: false } : null;
  } catch {
    // Fall through and attempt trailing-brace repair.
  }

  let repairedCandidate = candidate;
  while (repairedCandidate.endsWith('}')) {
    repairedCandidate = repairedCandidate.slice(0, -1).trimEnd();
    try {
      const parsed = JSON.parse(repairedCandidate);
      return isLayoutState(parsed) ? { state: parsed, repaired: true } : null;
    } catch {
      // Keep trimming and retrying.
    }
  }

  return null;
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
        const parsed = parseLayoutState(raw);
        if (!parsed) return null;
        if (parsed.repaired) {
          await saveLayoutFile(parsed.state);
        }
        return parsed.state;
      } catch {
        return null;
      }
    },
  );
}
