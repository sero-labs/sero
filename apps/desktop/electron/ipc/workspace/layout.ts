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
import { IpcChannels } from '@/types/ipc-channels';
import type { LayoutState, LoadedLayoutState } from '@/types/layout';
import { SERO_AGENT_DIR } from '@electron/platform/env';

export type { LayoutState, LoadedLayoutState };

const LAYOUT_FILE = path.join(SERO_AGENT_DIR, 'layout.json');

let writeQueue: Promise<void> = Promise.resolve();

function isOptionalArray(value: unknown): boolean {
  return value === undefined || Array.isArray(value);
}

function isOptionalNumber(value: unknown): boolean {
  return value === undefined || typeof value === 'number';
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
  if (!isOptionalArray(c.browserTabs)) return false;
  if (!isOptionalArray(c.browserBookmarks)) return false;
  // Optional numeric panel sizes
  if (!isOptionalNumber(c.mainSidebarSizePct)) return false;
  if (!isOptionalNumber(c.chatPanelSizePct)) return false;
  if (!isOptionalNumber(c.chatCollaborationSizePct)) return false;
  // Optional strings — reject wrong types to prevent garbage propagation
  if (c.theme !== undefined && typeof c.theme !== 'string') return false;
  if (c.activeApp !== undefined && typeof c.activeApp !== 'string') return false;
  if (c.activeThemeId !== undefined && typeof c.activeThemeId !== 'string') return false;
  // Nullable strings
  if (c.activeWorkspaceId !== undefined && c.activeWorkspaceId !== null && typeof c.activeWorkspaceId !== 'string') return false;
  if (c.activeSessionId !== undefined && c.activeSessionId !== null && typeof c.activeSessionId !== 'string') return false;
  if (c.activeBrowserTabId !== undefined && c.activeBrowserTabId !== null && typeof c.activeBrowserTabId !== 'string') return false;
  if (c.activeBrowserTabIds !== undefined && (typeof c.activeBrowserTabIds !== 'object' || c.activeBrowserTabIds === null || Array.isArray(c.activeBrowserTabIds))) return false;
  return true;
}

function sanitizeBrowserTabs(value: unknown): import('@/types/layout').PersistedBrowserTab[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: import('@/types/layout').PersistedBrowserTab[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== 'string' || typeof e.url !== 'string') continue;
    const title = typeof e.title === 'string' ? e.title : undefined;
    const workspaceId = typeof e.workspaceId === 'string' ? e.workspaceId : undefined;
    out.push({
      id: e.id,
      url: e.url,
      ...(title !== undefined ? { title } : {}),
      ...(workspaceId !== undefined ? { workspaceId } : {}),
    });
  }
  return out;
}

function sanitizeActiveBrowserTabIds(value: unknown): Record<string, string | null> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof k !== 'string') continue;
    if (v === null || typeof v === 'string') out[k] = v;
  }
  return out;
}

function sanitizeBookmarks(value: unknown): import('@/types/layout').PersistedBrowserBookmark[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: import('@/types/layout').PersistedBrowserBookmark[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== 'string' || typeof e.url !== 'string' || typeof e.title !== 'string') continue;
    const favicon = typeof e.favicon === 'string' ? e.favicon : undefined;
    out.push({ id: e.id, title: e.title, url: e.url, ...(favicon !== undefined ? { favicon } : {}) });
  }
  return out;
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
      browserTabs: sanitizeBrowserTabs(parsed.browserTabs),
      activeBrowserTabIds: sanitizeActiveBrowserTabIds(parsed.activeBrowserTabIds),
      browserBookmarks: sanitizeBookmarks(parsed.browserBookmarks),
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
