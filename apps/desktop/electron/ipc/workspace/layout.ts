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
import { IpcChannels } from '../../../src/types/ipc';
import type { LayoutState, LoadedLayoutState } from '../../../src/types/layout';
import { SERO_AGENT_DIR } from '../../platform/env';

export type { LayoutState, LoadedLayoutState };

const LAYOUT_FILE = path.join(SERO_AGENT_DIR, 'layout.json');

let writeQueue: Promise<void> = Promise.resolve();

function isOptionalArray(value: unknown): boolean {
  return value === undefined || Array.isArray(value);
}

function sanitizeStringArray(values: string[] | undefined): string[] | undefined {
  return Array.isArray(values)
    ? values.filter((value): value is string => typeof value === 'string')
    : undefined;
}

function isLayoutState(value: unknown): value is LoadedLayoutState {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  // Required booleans
  if (typeof c.mainSidebarOpen !== 'boolean') return false;
  if (typeof c.chatPanelOpen !== 'boolean') return false;
  // Optional arrays
  if (!isOptionalArray(c.favouriteApps)) return false;
  if (!isOptionalArray(c.favouriteModels)) return false;
  if (!isOptionalArray(c.hiddenModels)) return false;
  if (!isOptionalArray(c.hiddenProviders)) return false;
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
function parseLayoutState(raw: string): LoadedLayoutState | null {
  try {
    const parsed = JSON.parse(raw.trim());
    if (!isLayoutState(parsed)) return null;
    return {
      ...parsed,
      favouriteApps: sanitizeStringArray(parsed.favouriteApps),
      favouriteModels: sanitizeStringArray(parsed.favouriteModels),
      hiddenModels: sanitizeStringArray(parsed.hiddenModels),
      hiddenProviders: sanitizeStringArray(parsed.hiddenProviders),
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
