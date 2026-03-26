import { watch, type FSWatcher } from 'node:fs';
import path from 'node:path';

import type { GitManagerRequest, GitSyncMode } from '../../../../packages/pi-git-extension/shared/types';
import { resolveStatePath } from '../../../../packages/pi-git-extension/extension/state-io';
import { refreshGitState, runGitAction, type GitActionResult } from '../../../../packages/pi-git-extension/extension/git-service';
import { appStateManager } from '../workspace/app-state';
import { workspaceManager } from '../workspace/manager';

const GIT_STATE_SUFFIX = path.join('.sero', 'apps', 'git', 'state.json');
const IGNORED_RELATIVE_PREFIX = '.sero/apps/git/';
const REFRESH_DEBOUNCE_MS = 200;
const POLL_INTERVAL_MS = 5_000;

interface GitWorkspaceWatchEntry {
  workspacePath: string;
  stateFilePath: string;
  refCount: number;
  syncMode: GitSyncMode;
  watcher: FSWatcher | null;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  pollTimer: ReturnType<typeof setInterval> | null;
  refreshInFlight: Promise<void> | null;
  refreshQueued: boolean;
  ignoreEventsUntil: number;
}

class GitWorkspaceStateManager {
  private readonly watches = new Map<string, GitWorkspaceWatchEntry>();

  isGitStateFile(filePath: string): boolean {
    return path.normalize(filePath).endsWith(path.normalize(GIT_STATE_SUFFIX));
  }

  watchStateFile(filePath: string): void {
    if (!this.isGitStateFile(filePath)) return;

    const existing = this.watches.get(filePath);
    if (existing) {
      existing.refCount += 1;
      this.scheduleRefresh(existing);
      return;
    }

    const workspacePath = this.workspacePathFromStateFile(filePath);
    if (!workspacePath) return;

    const entry: GitWorkspaceWatchEntry = {
      workspacePath,
      stateFilePath: filePath,
      refCount: 1,
      syncMode: 'watch',
      watcher: null,
      debounceTimer: null,
      pollTimer: null,
      refreshInFlight: null,
      refreshQueued: false,
      ignoreEventsUntil: 0,
    };

    this.watches.set(filePath, entry);
    this.startFsWatch(entry);
    this.scheduleRefresh(entry, 0);
  }

  unwatchStateFile(filePath: string): void {
    const entry = this.watches.get(filePath);
    if (!entry) return;

    entry.refCount -= 1;
    if (entry.refCount > 0) return;

    if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
    if (entry.pollTimer) clearInterval(entry.pollTimer);
    entry.watcher?.close();
    this.watches.delete(filePath);
  }

  async refreshWorkspace(workspaceId: string): Promise<GitActionResult> {
    const workspacePath = workspaceManager.getPath(workspaceId);
    if (!workspacePath) {
      return { ok: false, message: `Workspace not found: ${workspaceId}` };
    }

    const stateFilePath = resolveStatePath(workspacePath);
    const state = await refreshGitState(workspacePath, stateFilePath, {
      syncMode: this.getSyncModeForStateFile(stateFilePath),
    });
    return { ok: true, message: `Refreshed ${state.repoName || workspaceId}` };
  }

  async runWorkspaceAction(workspaceId: string, params: GitManagerRequest): Promise<GitActionResult> {
    const workspacePath = workspaceManager.getPath(workspaceId);
    if (!workspacePath) {
      return { ok: false, message: `Workspace not found: ${workspaceId}` };
    }

    const stateFilePath = resolveStatePath(workspacePath);
    return runGitAction(params, workspacePath, stateFilePath, {
      syncMode: this.getSyncModeForStateFile(stateFilePath),
    });
  }

  private getSyncModeForStateFile(filePath: string): GitSyncMode {
    return this.watches.get(filePath)?.syncMode ?? 'manual';
  }

  private workspacePathFromStateFile(filePath: string): string | null {
    const normalized = path.normalize(filePath);
    const suffix = path.normalize(path.join(path.sep, GIT_STATE_SUFFIX));
    if (!normalized.endsWith(suffix)) return null;
    return normalized.slice(0, -suffix.length);
  }

  private startFsWatch(entry: GitWorkspaceWatchEntry): void {
    entry.syncMode = 'watch';

    try {
      entry.watcher = watch(
        entry.workspacePath,
        { recursive: true, persistent: false },
        (_eventType, filename) => {
          if (Date.now() < entry.ignoreEventsUntil) return;
          if (this.shouldIgnoreFilename(filename)) return;
          this.scheduleRefresh(entry);
        },
      );

      entry.watcher.on('error', (error) => {
        console.warn('[git-app] Recursive workspace watch failed, falling back to polling:', error);
        entry.watcher?.close();
        entry.watcher = null;
        this.startPolling(entry);
      });
    } catch (error) {
      console.warn('[git-app] Failed to start recursive workspace watch, falling back to polling:', error);
      this.startPolling(entry);
    }
  }

  private startPolling(entry: GitWorkspaceWatchEntry): void {
    entry.syncMode = 'poll';
    if (entry.pollTimer) return;
    entry.pollTimer = setInterval(() => {
      this.scheduleRefresh(entry);
    }, POLL_INTERVAL_MS);
  }

  private shouldIgnoreFilename(filename: string | Buffer | null | undefined): boolean {
    if (!filename) return false;
    const normalized = String(filename).replaceAll('\\', '/');
    return normalized.startsWith(IGNORED_RELATIVE_PREFIX);
  }

  private scheduleRefresh(entry: GitWorkspaceWatchEntry, delayMs = REFRESH_DEBOUNCE_MS): void {
    if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
    entry.debounceTimer = setTimeout(() => {
      entry.debounceTimer = null;
      void this.refreshEntry(entry);
    }, delayMs);
  }

  private async refreshEntry(entry: GitWorkspaceWatchEntry): Promise<void> {
    if (entry.refreshInFlight) {
      entry.refreshQueued = true;
      return entry.refreshInFlight;
    }

    entry.ignoreEventsUntil = Date.now() + 1_000;
    entry.refreshInFlight = refreshGitState(entry.workspacePath, entry.stateFilePath, {
      syncMode: entry.syncMode,
    })
      .then(() => {
        // no-op; the state file watcher notifies renderers
      })
      .catch((error) => {
        console.error('[git-app] Failed to refresh git state:', error);
        return appStateManager.write(entry.stateFilePath, {
          repoPath: entry.workspacePath,
          repoName: path.basename(entry.workspacePath),
          currentBranch: '',
          headHash: '',
          branches: [],
          remotes: [],
          commits: [],
          stashes: [],
          fileChanges: [],
          commitCount: 0,
          lastRefresh: new Date().toISOString(),
          loading: false,
          syncMode: entry.syncMode,
          error: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        entry.refreshInFlight = null;
        if (entry.refreshQueued) {
          entry.refreshQueued = false;
          this.scheduleRefresh(entry, 0);
        }
      });

    return entry.refreshInFlight;
  }
}

export const gitWorkspaceStateManager = new GitWorkspaceStateManager();
