import { readFileSync, statSync, watch, type FSWatcher } from 'node:fs';
import path from 'node:path';

import type { GitManagerAction, GitManagerRequest, GitSyncMode } from '@sero-ai/common';
import { workspaceManager } from '@electron/features/workspace/manager';
import { appStateManager } from '../state/manager';
import { resolveStatePath } from '@electron/features/git/git-service/state-io';
import {
  refreshGitState,
  runGitAction,
  type GitActionResult,
} from '@electron/features/git/git-service/git-service';
import {
  gitRefreshInvalidationCoordinator,
  type GitRefreshInvalidationOptions,
} from './refresh-invalidation';

const GIT_STATE_SUFFIX = path.join('.sero', 'apps', 'git', 'state.json');
/**
 * Sero's own directory, which git is told to ignore, so nothing written inside
 * it can change what `git status` reports. Refreshing because of it would be
 * pure waste — and it used to name only `.sero/apps/git/`, so another app
 * writing its state (the orchestrator, say) kicked off a git refresh.
 */
const IGNORED_RELATIVE_PREFIX = '.sero/';
const ACTION_REFRESH_FRESHNESS_MS = 1_000;
/**
 * How long to wait before trying to watch again, and the ceiling it backs off
 * to. A watch can fail for reasons that pass on their own — too many open file
 * handles, a directory that is briefly gone mid-rebase, a mounted volume that
 * blinks — so failing is a retry, never a verdict.
 */
const WATCH_RETRY_MS = 1_000;
const WATCH_RETRY_CEILING_MS = 30_000;

type WatcherSource = 'workspace' | 'git-dir' | 'git-refs';

interface GitWorkspaceWatchEntry {
  workspaceId: string;
  workspacePath: string;
  stateFilePath: string;
  refCount: number;
  syncMode: GitSyncMode;
  watchers: FSWatcher[];
  /** Pending re-arm, if watching is currently down. */
  retryTimer: ReturnType<typeof setTimeout> | null;
  retryDelayMs: number;
}

export class GitWorkspaceStateManager {
  private readonly watches = new Map<string, GitWorkspaceWatchEntry>();

  isGitStateFile(filePath: string): boolean {
    return path.normalize(filePath).endsWith(path.normalize(GIT_STATE_SUFFIX));
  }

  watchStateFile(filePath: string): void {
    if (!this.isGitStateFile(filePath)) return;

    const existing = this.watches.get(filePath);
    if (existing) {
      existing.refCount += 1;
      gitRefreshInvalidationCoordinator.invalidateWorkspace(existing.workspaceId, 'renderer-watch-resume', {
        delayMs: 0,
      });
      return;
    }

    const workspacePath = this.workspacePathFromStateFile(filePath);
    if (!workspacePath) return;

    const workspace = workspaceManager.findByPath(workspacePath);
    if (!workspace) return;

    const entry: GitWorkspaceWatchEntry = {
      workspaceId: workspace.id,
      workspacePath,
      stateFilePath: filePath,
      refCount: 1,
      syncMode: 'manual',
      watchers: [],
      retryTimer: null,
      retryDelayMs: WATCH_RETRY_MS,
    };

    this.watches.set(filePath, entry);
    gitRefreshInvalidationCoordinator.registerTarget({
      workspaceId: entry.workspaceId,
      stateFilePath: entry.stateFilePath,
      refresh: async () => this.refreshEntry(entry),
    });

    this.startLiveWatch(entry);
    gitRefreshInvalidationCoordinator.invalidateWorkspace(entry.workspaceId, 'initial-watch', { delayMs: 0 });
  }

  unwatchStateFile(filePath: string): void {
    const entry = this.watches.get(filePath);
    if (!entry) return;

    entry.refCount -= 1;
    if (entry.refCount > 0) return;

    this.stopLiveWatch(entry);
    this.watches.delete(filePath);
    gitRefreshInvalidationCoordinator.unregisterTarget(filePath);
  }

  invalidateWorkspace(
    workspaceId: string,
    reason: string,
    options?: GitRefreshInvalidationOptions,
  ): void {
    gitRefreshInvalidationCoordinator.invalidateWorkspace(workspaceId, reason, options);
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
    gitRefreshInvalidationCoordinator.markRefreshed(stateFilePath);
    return { ok: true, message: `Refreshed ${state.repoName || workspaceId}` };
  }

  async runWorkspaceAction(workspaceId: string, params: GitManagerRequest): Promise<GitActionResult> {
    const workspacePath = workspaceManager.getPath(workspaceId);
    if (!workspacePath) {
      return { ok: false, message: `Workspace not found: ${workspaceId}` };
    }

    const stateFilePath = resolveStatePath(workspacePath);
    const result = await runGitAction(params, workspacePath, stateFilePath, {
      syncMode: this.getSyncModeForStateFile(stateFilePath),
    });

    if (result.ok) {
      gitRefreshInvalidationCoordinator.markRefreshed(stateFilePath);
      if (shouldInvalidateAfterAction(params.action)) {
        this.invalidateWorkspace(workspaceId, `git-action:${params.action}`, {
          skipIfRefreshedWithinMs: ACTION_REFRESH_FRESHNESS_MS,
        });
      }
    }

    return result;
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

  private refreshEntry(entry: GitWorkspaceWatchEntry): Promise<void> {
    return refreshGitState(entry.workspacePath, entry.stateFilePath, {
      syncMode: entry.syncMode,
      scope: 'auto',
    })
      .then(() => {
        gitRefreshInvalidationCoordinator.markRefreshed(entry.stateFilePath);
      })
      .catch((error) => {
        console.error('[git-app] Failed to refresh git state:', error);
        return appStateManager.write(entry.stateFilePath, {
          repoPath: entry.workspacePath,
          repoName: path.basename(entry.workspacePath),
          currentBranch: '',
          headHash: '',
          branches: [],
          remoteBranches: [],
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
      });
  }

  /**
   * Start watching, and keep trying until it works.
   *
   * `.git/HEAD`, `.git/index` and `.git/packed-refs` are deliberately **not**
   * watched individually. Git never edits them in place — it writes a lock file
   * and renames it over the top — so a watch on the path is left holding the
   * replaced file and goes silent after the first commit. The non-recursive
   * watch on the git directory sees those same writes as directory entries
   * changing, which survives the rename and covers all three.
   */
  private startLiveWatch(entry: GitWorkspaceWatchEntry): void {
    this.stopLiveWatch(entry);

    try {
      this.watchWorkspace(entry);
      const gitDir = resolveGitDir(entry.workspacePath);
      if (!gitDir) {
        // A repository can arrive after the workspace does — `git init`, or a
        // clone finishing — so this is a "not yet", not a "no".
        this.scheduleWatchRetry(entry, 'no git directory yet');
        return;
      }

      this.watchGitPath(entry, gitDir, 'git-dir', { recursive: false });
      this.watchGitPath(entry, path.join(gitDir, 'refs'), 'git-refs', { recursive: true });

      entry.syncMode = 'watch';
      entry.retryDelayMs = WATCH_RETRY_MS;
    } catch (error) {
      this.scheduleWatchRetry(entry, String(error));
    }
  }

  /**
   * Watching stays down only until the next attempt. Giving up permanently is
   * what used to leave a workspace showing stale data for the rest of the
   * session, with a Refresh button as the only way back.
   */
  private scheduleWatchRetry(entry: GitWorkspaceWatchEntry, reason: string): void {
    this.stopLiveWatch(entry);
    entry.syncMode = 'manual';

    if (entry.retryTimer) return;
    const delay = entry.retryDelayMs;
    console.warn(`[git-app] Git watch unavailable (${reason}); retrying in ${delay}ms`);

    entry.retryTimer = setTimeout(() => {
      entry.retryTimer = null;
      // Dropped between scheduling and firing.
      if (!this.watches.has(entry.stateFilePath)) return;

      entry.retryDelayMs = Math.min(entry.retryDelayMs * 2, WATCH_RETRY_CEILING_MS);
      this.startLiveWatch(entry);
      // Whatever changed while nothing was watching is caught up here.
      if (entry.syncMode === 'watch') {
        this.invalidateWorkspace(entry.workspaceId, 'watch-recovered', { delayMs: 0 });
      }
    }, delay);
    entry.retryTimer.unref?.();
  }

  private stopLiveWatch(entry: GitWorkspaceWatchEntry): void {
    for (const watcher of entry.watchers) {
      watcher.close();
    }
    entry.watchers = [];
    if (entry.retryTimer) {
      clearTimeout(entry.retryTimer);
      entry.retryTimer = null;
    }
  }

  private watchWorkspace(entry: GitWorkspaceWatchEntry): void {
    this.watchPath(
      entry,
      entry.workspacePath,
      'workspace',
      { recursive: true },
      (_eventType, filename) => {
        if (this.shouldIgnoreFilename(filename)) return;
        this.invalidateWorkspace(entry.workspaceId, 'workspace-watch');
      },
      true,
    );
  }

  private watchGitPath(
    entry: GitWorkspaceWatchEntry,
    targetPath: string,
    source: Extract<WatcherSource, 'git-dir' | 'git-refs'>,
    options: { recursive: boolean },
  ): void {
    this.watchPath(
      entry,
      targetPath,
      source,
      { recursive: options.recursive },
      () => {
        this.invalidateWorkspace(entry.workspaceId, source);
      },
      true,
    );
  }

  private watchPath(
    entry: GitWorkspaceWatchEntry,
    targetPath: string,
    source: WatcherSource,
    options: { recursive: boolean },
    onChange: (eventType: string, filename: string | Buffer | null) => void,
    fatal: boolean,
  ): void {
    try {
      const watcher = watch(targetPath, { ...options, persistent: false }, onChange);
      watcher.on('error', (error) => {
        if (!fatal) {
          console.warn(`[git-app] Optional watcher ${source} failed for ${targetPath}:`, error);
          watcher.close();
          return;
        }
        this.invalidateWorkspace(entry.workspaceId, `watcher-failed:${source}`, { delayMs: 0 });
        this.scheduleWatchRetry(entry, `${source} failed for ${targetPath}: ${String(error)}`);
      });
      entry.watchers.push(watcher);
    } catch (error) {
      if (!fatal) {
        console.warn(`[git-app] Optional watcher ${source} unavailable for ${targetPath}:`, error);
        return;
      }
      throw error;
    }
  }

  private shouldIgnoreFilename(filename: string | Buffer | null | undefined): boolean {
    if (!filename) return false;
    const normalized = String(filename).replaceAll('\\', '/');
    return normalized.startsWith(IGNORED_RELATIVE_PREFIX);
  }
}

/**
 * Resolve the .git dir without spawning git (the watch path must stay sync):
 * a directory is the repo's own .git; a file is a worktree pointer
 * ("gitdir: <path>").
 */
function resolveGitDir(workspacePath: string): string | null {
  const dotGit = path.join(workspacePath, '.git');
  try {
    if (statSync(dotGit).isDirectory()) return dotGit;
    const pointer = readFileSync(dotGit, 'utf8').match(/^gitdir:\s*(.+)$/m)?.[1]?.trim();
    if (!pointer) return null;
    return path.isAbsolute(pointer) ? pointer : path.join(workspacePath, pointer);
  } catch {
    return null;
  }
}

function shouldInvalidateAfterAction(action: GitManagerAction): boolean {
  switch (action) {
    case 'stage':
    case 'unstage':
    case 'commit':
    case 'checkout':
    case 'stash':
    case 'stash_pop':
    case 'stash_apply':
    case 'fetch':
    case 'pull':
    case 'push':
    case 'create_branch':
    case 'delete_branch':
    case 'remove_worktree':
    case 'merge':
    case 'abort_merge':
    case 'cherry_pick':
    case 'refresh':
      return true;
    default:
      return false;
  }
}

export const gitWorkspaceStateManager = new GitWorkspaceStateManager();
