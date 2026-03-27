/**
 * FileWatcherManager — watches workspace directories on the host filesystem
 * and pushes change events to the renderer via IPC.
 *
 * Uses Node's native `fs.watch` with `recursive: true` which leverages macOS
 * FSEvents under the hood — no polling, no dependencies.
 *
 * For container workspaces, the watched directory is the host-side bind-mount
 * source. For host workspaces, it's the workspace directory itself.
 * In both cases, the renderer receives /workspace-prefixed paths.
 */

import fs from 'fs';
import path from 'path';
import type { BrowserWindow } from 'electron';
import { IpcChannels } from '../../../src/types/ipc';

const DEBOUNCE_MS = 150;

interface WorkspaceWatcher {
  /** The underlying FSWatcher (null when paused). */
  watcher: fs.FSWatcher | null;
  workspaceId: string;
  hostDir: string;
  /** Debounce timer for batching rapid changes. */
  debounceTimer: ReturnType<typeof setTimeout> | null;
  /** Changed directory paths accumulated during debounce window. */
  pendingDirs: Set<string>;
  /** Whether this watcher is logically active. */
  active: boolean;
}

export class FileWatcherManager {
  private watchers = new Map<string, WorkspaceWatcher>();
  private window: BrowserWindow | null = null;

  setWindow(win: BrowserWindow): void {
    this.window = win;
  }

  /** Start watching a workspace directory. */
  watch(workspaceId: string, hostDir: string): void {
    if (this.watchers.has(workspaceId)) return;

    const ww: WorkspaceWatcher = {
      watcher: null,
      workspaceId,
      hostDir,
      debounceTimer: null,
      pendingDirs: new Set(),
      active: false,
    };

    this.watchers.set(workspaceId, ww);
    this.startFSWatch(ww);
  }

  /** Stop and remove the watcher entirely. */
  unwatch(workspaceId: string): void {
    const ww = this.watchers.get(workspaceId);
    if (!ww) return;
    this.stopFSWatch(ww);
    this.watchers.delete(workspaceId);
  }

  /** Clean up everything. */
  disposeAll(): void {
    for (const ww of this.watchers.values()) {
      this.stopFSWatch(ww);
    }
    this.watchers.clear();
  }

  // ── Internal ──────────────────────────────────────────────

  private startFSWatch(ww: WorkspaceWatcher): void {
    if (ww.watcher) return;

    try {
      if (!fs.existsSync(ww.hostDir)) {
        fs.mkdirSync(ww.hostDir, { recursive: true });
      }

      ww.watcher = fs.watch(ww.hostDir, { recursive: true }, (_eventType, filename) => {
        if (!filename) return;

        // Map host-relative path → /workspace-prefixed container path
        const changedRelative = path.dirname(filename);
        const containerDir = '/workspace' + (changedRelative === '.' ? '' : '/' + changedRelative);

        ww.pendingDirs.add(containerDir);
        this.scheduleSend(ww);
      });

      ww.watcher.on('error', (err) => {
        console.warn(`[file-watcher] Error for workspace ${ww.workspaceId}:`, err.message);
        this.stopFSWatch(ww);
        setTimeout(() => {
          if (this.watchers.has(ww.workspaceId)) {
            this.startFSWatch(ww);
          }
        }, 2000);
      });

      ww.active = true;
    } catch (err: any) {
      console.warn(`[file-watcher] Failed to start for ${ww.workspaceId}:`, err.message);
    }
  }

  private stopFSWatch(ww: WorkspaceWatcher): void {
    if (ww.watcher) {
      ww.watcher.close();
      ww.watcher = null;
    }
    if (ww.debounceTimer) {
      clearTimeout(ww.debounceTimer);
      ww.debounceTimer = null;
    }
    ww.pendingDirs.clear();
    ww.active = false;
  }

  private scheduleSend(ww: WorkspaceWatcher): void {
    if (ww.debounceTimer) return;

    ww.debounceTimer = setTimeout(() => {
      ww.debounceTimer = null;
      const dirs = Array.from(ww.pendingDirs);
      ww.pendingDirs.clear();

      if (dirs.length > 0 && this.window && !this.window.isDestroyed()) {
        this.window.webContents.send(IpcChannels.filetree.changed, {
          workspaceId: ww.workspaceId,
          directories: dirs,
        });
      }
    }, DEBOUNCE_MS);
  }
}
