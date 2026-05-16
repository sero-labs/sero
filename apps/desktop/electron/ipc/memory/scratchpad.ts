/**
 * Memory scratchpad IPC handlers.
 *
 * Thin pass-through that reads SCRATCHPAD.md and broadcasts changes to
 * the renderer. All parsing logic lives in the memory plugin
 * (`parseScratchpad`, path resolution) so this file stays a bridge.
 */

import { ipcMain } from 'electron';
import { watch, type FSWatcher } from 'node:fs';
import path from 'node:path';

import { IpcChannels } from '@/types/ipc-channels';
import { readFile, resolveMemoryRoot, getScratchpadPath } from '@plugins/sero-memory-plugin/extension/memory-manager';
import { parseScratchpad } from '@plugins/sero-memory-plugin/extension/scratchpad';
import { broadcastToWindows } from '../lib/window-broadcast';

interface ScratchpadListResult {
  path: string;
  openCount: number;
  openItems: Array<{ text: string }>;
}

async function readOpenScratchpad(): Promise<ScratchpadListResult> {
  const filePath = getScratchpadPath(resolveMemoryRoot());
  const content = await readFile(filePath);
  const open = content?.trim()
    ? parseScratchpad(content).filter((i) => !i.done)
    : [];
  return {
    path: filePath,
    openCount: open.length,
    openItems: open.map((i) => ({ text: i.text })),
  };
}

let watcher: FSWatcher | undefined;

function startWatcher(): void {
  if (watcher) return;
  const filePath = getScratchpadPath(resolveMemoryRoot());
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  try {
    // Watch the parent dir — the file may not exist yet (lazy creation).
    watcher = watch(dir, { persistent: false }, (_event, filename) => {
      if (filename === base) {
        broadcastToWindows(IpcChannels.memory.scratchpadChanged);
      }
    });
  } catch {
    // Non-fatal: renderer can still poll on popover open.
  }
}

export function registerMemoryScratchpadHandlers(): void {
  ipcMain.handle(IpcChannels.memory.scratchpadList, async (): Promise<ScratchpadListResult> => {
    return readOpenScratchpad();
  });

  startWatcher();
}
