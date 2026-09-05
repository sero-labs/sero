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
 *
 * A workspace can have more than one owner: the desktop window and the
 * gateway both ask for the same tree. The watcher counts its owners, so
 * one of them leaving never blinds the other.
 */

import fs from 'fs';
import path from 'path';
import type { BrowserWindow } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';

const DEBOUNCE_MS = 150;

/** What a change event carries: the directories that changed. */
export interface WorkspaceChangeEvent {
  workspaceId: string;
  /** Virtual directories, such as `/workspace/src`. */
  directories: string[];
}

/** Who asked for a workspace to be watched. */
export type WatchOwner = string;

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
  owners: Set<WatchOwner>;
}

/** The owner the desktop window watches under. */
export const RENDERER_OWNER = 'renderer';

export class FileWatcherManager {
  private watchers = new Map<string, WorkspaceWatcher>();
  private window: BrowserWindow | null = null;
  private listeners = new Set<(event: WorkspaceChangeEvent) => void>();

  setWindow(win: BrowserWindow): void {
    this.window = win;
  }

  /**
   * Hear about every change, alongside the desktop window.
   *
   * The gateway uses this to push changes to a browser, which cannot
   * watch a filesystem of its own.
   */
  onChange(listener: (event: WorkspaceChangeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Start or refresh watching all roots for a workspace, for one owner. */
  watch(workspaceId: string, roots: WorkspaceWatchRoot[], owner: WatchOwner = RENDERER_OWNER): void {
    const nextRoots = normalizeRoots(roots);
    if (nextRoots.length === 0) return;

    const existing = this.watchers.get(workspaceId);
    if (existing) {
      existing.owners.add(owner);
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
      owners: new Set([owner]),
    };

    this.watchers.set(workspaceId, watcher);
    this.startFSWatch(watcher);
  }

  /**
   * Drop one owner. The watcher stops only when the last owner leaves.
   */
  unwatch(workspaceId: string, owner: WatchOwner = RENDERER_OWNER): void {
    const watcher = this.watchers.get(workspaceId);
    if (!watcher) return;

    watcher.owners.delete(owner);
    if (watcher.owners.size > 0) return;

    this.stopFSWatch(watcher);
    this.watchers.delete(workspaceId);
  }

  /** Clean up everything. */
  disposeAll(): void {
    for (const watcher of this.watchers.values()) {
      this.stopFSWatch(watcher);
    }
    this.watchers.clear();
    this.listeners.clear();
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

      const event: WorkspaceChangeEvent = {
        workspaceId: workspace.workspaceId,
        directories,
      };

      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send(IpcChannels.filetree.changed, event);
      }
      for (const listener of this.listeners) {
        listener(event);
      }
    }, DEBOUNCE_MS);
  }
}

/**
 * The one watcher every owner shares.
 *
 * It lives here, not with the other singletons, so a gateway bridge can
 * reach it without importing the whole application graph.
 */
export const fileWatcherManager = new FileWatcherManager();

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
