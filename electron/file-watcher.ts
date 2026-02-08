/**
 * FileWatcher — watches project workspace directories on the host filesystem
 * and pushes change events to the renderer via IPC.
 *
 * Uses Node's native `fs.watch` with `recursive: true` which leverages macOS
 * FSEvents under the hood — no polling, no dependencies.
 *
 * Watchers are created per-project and can be paused/resumed when the user
 * switches tabs, so only the active project's watcher is running.
 */

import fs from 'fs';
import path from 'path';
import type { BrowserWindow } from 'electron';
import { hostWorkspacePath } from './container-manager/types';

const DEBOUNCE_MS = 150;

interface ProjectWatcher {
  /** The underlying FSWatcher (null when paused) */
  watcher: fs.FSWatcher | null;
  projectId: string;
  hostDir: string;
  /** Debounce timer for batching rapid changes */
  debounceTimer: ReturnType<typeof setTimeout> | null;
  /** Set of changed directory paths accumulated during debounce window */
  pendingDirs: Set<string>;
  /** Whether this watcher is logically active (not paused) */
  active: boolean;
}

export class FileWatcherManager {
  private watchers = new Map<string, ProjectWatcher>();
  private window: BrowserWindow | null = null;

  setWindow(win: BrowserWindow): void {
    this.window = win;
  }

  /**
   * Start watching a project's workspace directory.
   * If `paused` is true, the watcher is created in a paused state.
   */
  watch(projectId: string, paused = false): void {
    // Already watching this project
    if (this.watchers.has(projectId)) return;

    const hostDir = hostWorkspacePath(projectId);

    const pw: ProjectWatcher = {
      watcher: null,
      projectId,
      hostDir,
      debounceTimer: null,
      pendingDirs: new Set(),
      active: false,
    };

    this.watchers.set(projectId, pw);

    if (!paused) {
      this.startFSWatch(pw);
    }
  }

  /** Resume watching (when project tab becomes active) */
  resume(projectId: string): void {
    const pw = this.watchers.get(projectId);
    if (!pw || pw.active) return;
    this.startFSWatch(pw);
  }

  /** Pause watching (when project tab becomes inactive) */
  pause(projectId: string): void {
    const pw = this.watchers.get(projectId);
    if (!pw || !pw.active) return;
    this.stopFSWatch(pw);
  }

  /** Stop and remove the watcher entirely (project deleted/closed) */
  unwatch(projectId: string): void {
    const pw = this.watchers.get(projectId);
    if (!pw) return;
    this.stopFSWatch(pw);
    this.watchers.delete(projectId);
  }

  /** Pause all watchers except the given project */
  setActiveProject(activeProjectId: string | null): void {
    for (const [projectId, pw] of this.watchers) {
      if (projectId === activeProjectId) {
        if (!pw.active) this.startFSWatch(pw);
      } else {
        if (pw.active) this.stopFSWatch(pw);
      }
    }
  }

  /** Clean up everything */
  disposeAll(): void {
    for (const pw of this.watchers.values()) {
      this.stopFSWatch(pw);
    }
    this.watchers.clear();
  }

  // ── Internal ──────────────────────────────────────────────

  private startFSWatch(pw: ProjectWatcher): void {
    if (pw.watcher) return; // Already running

    try {
      // Ensure directory exists before watching
      if (!fs.existsSync(pw.hostDir)) {
        fs.mkdirSync(pw.hostDir, { recursive: true });
      }

      pw.watcher = fs.watch(pw.hostDir, { recursive: true }, (eventType, filename) => {
        if (!filename) return;

        // Compute the changed directory (parent of the changed file)
        // Map from host path to container path (/workspace/...)
        const changedRelative = path.dirname(filename);
        const containerDir = '/workspace' + (changedRelative === '.' ? '' : '/' + changedRelative);

        pw.pendingDirs.add(containerDir);
        this.scheduleSend(pw);
      });

      pw.watcher.on('error', (err) => {
        console.warn(`[file-watcher] Error for project ${pw.projectId}:`, err.message);
        // Try to restart the watcher
        this.stopFSWatch(pw);
        setTimeout(() => {
          if (this.watchers.has(pw.projectId) && pw.active) {
            this.startFSWatch(pw);
          }
        }, 2000);
      });

      pw.active = true;
    } catch (err: any) {
      console.warn(`[file-watcher] Failed to start watcher for ${pw.projectId}:`, err.message);
    }
  }

  private stopFSWatch(pw: ProjectWatcher): void {
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

  private scheduleSend(pw: ProjectWatcher): void {
    if (pw.debounceTimer) return; // Already scheduled

    pw.debounceTimer = setTimeout(() => {
      pw.debounceTimer = null;
      const dirs = Array.from(pw.pendingDirs);
      pw.pendingDirs.clear();

      if (dirs.length > 0 && this.window && !this.window.isDestroyed()) {
        this.window.webContents.send('filetree:changed', {
          projectId: pw.projectId,
          directories: dirs,
        });
      }
    }, DEBOUNCE_MS);
  }
}
