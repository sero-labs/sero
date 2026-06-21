/**
 * FileWatcherManager — watches workspace roots on the host filesystem
 * and pushes change events to the renderer via IPC.
 *
 * Uses Node's native `fs.watch` with `recursive: true` which leverages macOS
 * FSEvents under the hood — no polling, no dependencies.
 *
 * Each workspace can expose multiple virtual roots (`/workspace`, `/plugin-x`,
 * etc.). We watch every host root and translate changes back into the
 * renderer's virtual path space so the explorer and editor refresh correctly.
 */

import fs from 'fs';
import path from 'path';
import type { BrowserWindow } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';

const DEBOUNCE_MS = 150;

export interface WorkspaceWatchRoot {
  hostDir: string;
  virtualRoot: string;
}

interface RootWatcher {
  hostDir: string;
  virtualRoot: string;
  watcher: fs.FSWatcher | null;
}

interface WorkspaceWatcher {
  workspaceId: string;
  roots: RootWatcher[];
  debounceTimer: ReturnType<typeof setTimeout> | null;
  pendingDirs: Set<string>;
}

export class FileWatcherManager {
  private watchers = new Map<string, WorkspaceWatcher>();
  private window: BrowserWindow | null = null;
  /** In-process change subscribers per workspace (background runtimes / plugins). */
  private listeners = new Map<string, Set<(directories: string[]) => void>>();

  setWindow(win: BrowserWindow): void {
    this.window = win;
  }

  /**
   * Subscribe to debounced file-tree changes for a workspace in-process (the
   * renderer gets the same batch over IPC). Push-model — no extra watcher is
   * started; this taps the recursive `fs.watch` already running for the
   * workspace. Returns an unsubscribe function.
   */
  onChange(workspaceId: string, cb: (directories: string[]) => void): () => void {
    let set = this.listeners.get(workspaceId);
    if (!set) {
      set = new Set();
      this.listeners.set(workspaceId, set);
    }
    set.add(cb);
    return () => {
      const current = this.listeners.get(workspaceId);
      if (!current) return;
      current.delete(cb);
      if (current.size === 0) this.listeners.delete(workspaceId);
    };
  }

  /** Start or refresh watching all roots for a workspace. */
  watch(workspaceId: string, roots: WorkspaceWatchRoot[]): void {
    const nextRoots = normalizeRoots(roots);
    if (nextRoots.length === 0) return;

    const existing = this.watchers.get(workspaceId);
    if (existing) {
      if (sameRoots(existing.roots, nextRoots)) return;
      this.stopFSWatch(existing);
      existing.roots = nextRoots.map((root) => ({ ...root, watcher: null }));
      this.startFSWatch(existing);
      return;
    }

    const watcher: WorkspaceWatcher = {
      workspaceId,
      roots: nextRoots.map((root) => ({ ...root, watcher: null })),
      debounceTimer: null,
      pendingDirs: new Set(),
    };

    this.watchers.set(workspaceId, watcher);
    this.startFSWatch(watcher);
  }

  /** Stop and remove the watcher entirely. */
  unwatch(workspaceId: string): void {
    const watcher = this.watchers.get(workspaceId);
    if (!watcher) return;
    this.stopFSWatch(watcher);
    this.watchers.delete(workspaceId);
  }

  /** Clean up everything. */
  disposeAll(): void {
    for (const watcher of this.watchers.values()) {
      this.stopFSWatch(watcher);
    }
    this.watchers.clear();
  }

  private startFSWatch(workspace: WorkspaceWatcher): void {
    for (const root of workspace.roots) {
      this.startRootWatch(workspace, root);
    }
  }

  private startRootWatch(workspace: WorkspaceWatcher, root: RootWatcher): void {
    if (root.watcher) return;

    try {
      if (!fs.existsSync(root.hostDir)) {
        if (root.virtualRoot === '/workspace') {
          fs.mkdirSync(root.hostDir, { recursive: true });
        } else {
          console.warn(
            `[file-watcher] Skipping missing linked root for ${workspace.workspaceId}: ${root.hostDir}`,
          );
          return;
        }
      }

      root.watcher = fs.watch(root.hostDir, { recursive: true }, (_eventType, filename) => {
        const changedDir = toVirtualDirectory(root.virtualRoot, filename);
        if (!changedDir) return;
        workspace.pendingDirs.add(changedDir);
        this.scheduleSend(workspace);
      });

      root.watcher.on('error', (err) => {
        console.warn(
          `[file-watcher] Error for workspace ${workspace.workspaceId} (${root.virtualRoot}):`,
          err.message,
        );
        this.stopFSWatch(workspace);
        setTimeout(() => {
          const current = this.watchers.get(workspace.workspaceId);
          if (current) this.startFSWatch(current);
        }, 2000);
      });
    } catch (err: any) {
      console.warn(
        `[file-watcher] Failed to start for ${workspace.workspaceId} (${root.virtualRoot}):`,
        err.message,
      );
    }
  }

  private stopFSWatch(workspace: WorkspaceWatcher): void {
    for (const root of workspace.roots) {
      if (root.watcher) {
        root.watcher.close();
        root.watcher = null;
      }
    }
    if (workspace.debounceTimer) {
      clearTimeout(workspace.debounceTimer);
      workspace.debounceTimer = null;
    }
    workspace.pendingDirs.clear();
  }

  private scheduleSend(workspace: WorkspaceWatcher): void {
    if (workspace.debounceTimer) return;

    workspace.debounceTimer = setTimeout(() => {
      workspace.debounceTimer = null;
      const directories = Array.from(workspace.pendingDirs);
      workspace.pendingDirs.clear();
      if (directories.length === 0) return;

      // In-process subscribers (background runtimes) — independent of any window.
      const subscribers = this.listeners.get(workspace.workspaceId);
      if (subscribers) {
        for (const cb of [...subscribers]) cb(directories);
      }

      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send(IpcChannels.filetree.changed, {
          workspaceId: workspace.workspaceId,
          directories,
        });
      }
    }, DEBOUNCE_MS);
  }
}

function normalizeRoots(roots: WorkspaceWatchRoot[]): WorkspaceWatchRoot[] {
  const seen = new Set<string>();
  const normalized: WorkspaceWatchRoot[] = [];

  for (const root of roots) {
    const hostDir = path.resolve(root.hostDir);
    const virtualRoot = root.virtualRoot || '/workspace';
    const key = `${hostDir}::${virtualRoot}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ hostDir, virtualRoot });
  }

  return normalized;
}

function sameRoots(current: RootWatcher[], next: WorkspaceWatchRoot[]): boolean {
  if (current.length !== next.length) return false;
  return current.every((root, index) =>
    root.hostDir === next[index]?.hostDir && root.virtualRoot === next[index]?.virtualRoot,
  );
}

function toVirtualDirectory(virtualRoot: string, filename: string | Buffer | null): string | null {
  if (!filename) return null;
  const raw = typeof filename === 'string' ? filename : filename.toString('utf8');
  if (!raw) return null;

  const relativeDir = path.dirname(raw);
  if (relativeDir === '.') return virtualRoot;

  const normalizedDir = relativeDir.split(path.sep).join('/');
  return path.posix.join(virtualRoot, normalizedDir);
}
