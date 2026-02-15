/**
 * FileWatcher — watches workspace directories on the host filesystem
 * and pushes change events to the renderer via IPC.
 *
 * Uses Node's native `fs.watch` with `recursive: true` which leverages
 * macOS FSEvents under the hood — no polling, no dependencies.
 *
 * Since workspace files are bind-mounted into containers, changes made
 * inside the container appear on the host filesystem and are detected
 * by this watcher.
 *
 * Watchers are created per-workspace and can be paused/resumed when
 * the user switches workspaces, so only the active workspace's watcher
 * is running.
 */

import fs from 'fs';
import path from 'path';
import type { BrowserWindow } from 'electron';
import { IpcChannels } from '../../src/types/ipc';

const DEBOUNCE_MS = 150;

interface WorkspaceWatcher {
  /** The underlying FSWatcher (null when paused). */
  watcher: fs.FSWatcher | null;
  workspaceId: string;
  hostDir: string;
  /** Debounce timer for batching rapid changes. */
  debounceTimer: ReturnType<typeof setTimeout> | null;
  /** Set of changed directory paths accumulated during debounce window. */
  pendingDirs: Set<string>;
  /** Whether this watcher is logically active (not paused). */
  active: boolean;
}

export class FileWatcherManager {
  private watchers = new Map<string, WorkspaceWatcher>();
  private window: BrowserWindow | null = null;

  setWindow(win: BrowserWindow): void {
    this.window = win;
  }

  /**
   * Start watching a workspace's directory.
   * If `paused` is true, the watcher is created in a paused state.
   */
  watch(workspaceId: string, hostDir: string, paused = false): void {
    if (this.watchers.has(workspaceId)) return;

    const pw: WorkspaceWatcher = {
      watcher: null,
      workspaceId,
      hostDir,
      debounceTimer: null,
      pendingDirs: new Set(),
      active: false,
    };

    this.watchers.set(workspaceId, pw);

    if (!paused) {
      this.startFSWatch(pw);
    }
  }

  /** Resume watching (when workspace becomes active). */
  resume(workspaceId: string): void {
    const pw = this.watchers.get(workspaceId);
    if (!pw || pw.active) return;
    this.startFSWatch(pw);
  }

  /** Pause watching (when workspace becomes inactive). */
  pause(workspaceId: string): void {
    const pw = this.watchers.get(workspaceId);
    if (!pw || !pw.active) return;
    this.stopFSWatch(pw);
  }

  /** Stop and remove the watcher entirely. */
  unwatch(workspaceId: string): void {
    const pw = this.watchers.get(workspaceId);
    if (!pw) return;
    this.stopFSWatch(pw);
    this.watchers.delete(workspaceId);
  }

  /** Pause all watchers except the given workspace. */
  setActiveWorkspace(activeWorkspaceId: string | null): void {
    for (const [workspaceId, pw] of this.watchers) {
      if (workspaceId === activeWorkspaceId) {
        if (!pw.active) this.startFSWatch(pw);
      } else {
        if (pw.active) this.stopFSWatch(pw);
      }
    }
  }

  /** Clean up everything. */
  disposeAll(): void {
    for (const pw of this.watchers.values()) {
      this.stopFSWatch(pw);
    }
    this.watchers.clear();
  }

  // ── Internal ──────────────────────────────────────────────

  private startFSWatch(pw: WorkspaceWatcher): void {
    if (pw.watcher) return;

    try {
      // Ensure directory exists before watching
      if (!fs.existsSync(pw.hostDir)) {
        fs.mkdirSync(pw.hostDir, { recursive: true });
      }

      pw.watcher = fs.watch(pw.hostDir, { recursive: true }, (_eventType, filename) => {
        if (!filename) return;

        // Map from host path to container path (/workspace/...)
        const changedRelative = path.dirname(filename);
        const containerDir =
          '/workspace' + (changedRelative === '.' ? '' : '/' + changedRelative);

        pw.pendingDirs.add(containerDir);
        this.scheduleSend(pw);
      });

      pw.watcher.on('error', (err) => {
        console.warn(`[file-watcher] Error for ${pw.workspaceId}:`, err.message);
        this.stopFSWatch(pw);
        // Try to restart after a delay
        setTimeout(() => {
          if (this.watchers.has(pw.workspaceId) && pw.active) {
            this.startFSWatch(pw);
          }
        }, 2000);
      });

      pw.active = true;
    } catch (err: any) {
      console.warn(`[file-watcher] Failed to start for ${pw.workspaceId}:`, err.message);
    }
  }

  private stopFSWatch(pw: WorkspaceWatcher): void {
    if (pw.watcher) {
      pw.watcher.close();
      pw.watcher = null;
    }
    if (pw.debounceTimer) {
      clearTimeout(pw.debounceTimer);
      pw.debounceTimer = null;
    }
    pw.pendingDirs.clear();
    pw.active = false;
  }

  private scheduleSend(pw: WorkspaceWatcher): void {
    if (pw.debounceTimer) return;

    pw.debounceTimer = setTimeout(() => {
      pw.debounceTimer = null;
      const dirs = Array.from(pw.pendingDirs);
      pw.pendingDirs.clear();

      if (dirs.length > 0 && this.window && !this.window.isDestroyed()) {
        this.window.webContents.send(IpcChannels.filetree.changed, {
          workspaceId: pw.workspaceId,
          directories: dirs,
        });
      }
    }, DEBOUNCE_MS);
  }
}
