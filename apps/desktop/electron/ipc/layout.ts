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
import type { LayoutState } from '../../src/types/layout';
import { SERO_AGENT_DIR } from '../env';

export type { LayoutState };

const LAYOUT_FILE = path.join(SERO_AGENT_DIR, 'layout.json');

let writeQueue: Promise<void> = Promise.resolve();

function isLayoutState(value: unknown): value is LayoutState {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  // Required booleans
  if (typeof c.mainSidebarOpen !== 'boolean') return false;
  if (typeof c.chatPanelOpen !== 'boolean') return false;
  // Optional array
  if (c.favouriteApps !== undefined && !Array.isArray(c.favouriteApps)) return false;
  // Optional strings — reject wrong types to prevent garbage propagation
  if (c.theme !== undefined && typeof c.theme !== 'string') return false;
  if (c.activeApp !== undefined && typeof c.activeApp !== 'string') return false;
  if (c.activeThemeId !== undefined && typeof c.activeThemeId !== 'string') return false;
  // Nullable strings
  if (c.activeWorkspaceId !== undefined && c.activeWorkspaceId !== null && typeof c.activeWorkspaceId !== 'string') return false;
  if (c.activeSessionId !== undefined && c.activeSessionId !== null && typeof c.activeSessionId !== 'string') return false;
  return true;
}

/** Parse layout JSON. Returns the state if valid, null otherwise. */
function parseLayoutState(raw: string): LayoutState | null {
  try {
    const parsed = JSON.parse(raw.trim());
    if (!isLayoutState(parsed)) return null;
    if (!Array.isArray(parsed.favouriteApps)) return parsed;
    return {
      ...parsed,
      favouriteApps: parsed.favouriteApps.filter((id): id is string => typeof id === 'string'),
    };
  } catch {
    return null;
  }
}

async function saveLayoutFile(state: LayoutState): Promise<void> {
  mkdirSync(SERO_AGENT_DIR, { recursive: true });
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
