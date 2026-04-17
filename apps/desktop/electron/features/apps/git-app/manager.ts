import { existsSync, watch, type FSWatcher } from 'node:fs';
import path from 'node:path';

import type { GitManagerRequest } from '@sero/common';
import { workspaceManager } from '@electron/features/workspace/manager';
import { appStateManager } from '../state/manager';
import { resolveStatePath } from '@plugins/sero-git-plugin/extension/state-io';
import { runGit } from '@plugins/sero-git-plugin/extension/git-exec';
import {
  refreshGitState,
  runGitAction,
  type GitActionResult,
} from '@plugins/sero-git-plugin/extension/git-service';
import type { GitManagerAction, GitSyncMode } from '@plugins/sero-git-plugin/shared/types';
import {
  gitRefreshInvalidationCoordinator,
  type GitRefreshInvalidationOptions,
} from './refresh-invalidation';

const GIT_STATE_SUFFIX = path.join('.sero', 'apps', 'git', 'state.json');
const IGNORED_RELATIVE_PREFIX = '.sero/apps/git/';
const ACTION_REFRESH_FRESHNESS_MS = 1_000;

type WatcherSource = 'workspace' | 'git-dir' | 'git-refs' | 'git-head' | 'git-index' | 'git-packed-refs';

interface GitWorkspaceWatchEntry {
  workspaceId: string;
  workspacePath: string;
  stateFilePath: string;
  refCount: number;
  syncMode: GitSyncMode;
  watchers: FSWatcher[];
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

  private startLiveWatch(entry: GitWorkspaceWatchEntry): void {
    this.stopLiveWatch(entry);

    try {
      this.watchWorkspace(entry);
      const gitDir = resolveGitDir(entry.workspacePath);
      if (!gitDir) {
        entry.syncMode = 'manual';
        return;
      }

      this.watchGitPath(entry, gitDir, 'git-dir', { recursive: false });
      this.watchGitPath(entry, path.join(gitDir, 'refs'), 'git-refs', { recursive: true });
      this.watchGitFile(entry, path.join(gitDir, 'HEAD'), 'git-head');
      this.watchGitFile(entry, path.join(gitDir, 'index'), 'git-index');
      this.watchGitFile(entry, path.join(gitDir, 'packed-refs'), 'git-packed-refs');

      entry.syncMode = 'watch';
    } catch (error) {
      console.warn('[git-app] Live Git watch setup failed; using manual refresh instead:', error);
      this.stopLiveWatch(entry);
      entry.syncMode = 'manual';
    }
  }

  private stopLiveWatch(entry: GitWorkspaceWatchEntry): void {
    for (const watcher of entry.watchers) {
      watcher.close();
    }
    entry.watchers = [];
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

  private watchGitFile(
    entry: GitWorkspaceWatchEntry,
    filePath: string,
    source: Extract<WatcherSource, 'git-head' | 'git-index' | 'git-packed-refs'>,
  ): void {
    const targetPath = existsSync(filePath) ? filePath : path.dirname(filePath);
    this.watchPath(
      entry,
      targetPath,
      source,
      { recursive: false },
      (_eventType, filename) => {
        if (targetPath !== filePath) {
          const changedName = typeof filename === 'string' ? filename : filename?.toString('utf8') ?? '';
          if (changedName && changedName !== path.basename(filePath)) return;
        }
        this.invalidateWorkspace(entry.workspaceId, source);
      },
      false,
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
        console.warn(`[git-app] Required watcher ${source} failed for ${targetPath}:`, error);
        this.stopLiveWatch(entry);
        entry.syncMode = 'manual';
        this.invalidateWorkspace(entry.workspaceId, `watcher-failed:${source}`, { delayMs: 0 });
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

function resolveGitDir(workspacePath: string): string | null {
  const gitDir = runGit(['rev-parse', '--git-dir'], workspacePath, { allowFailure: true });
  if (!gitDir) return null;
  return path.isAbsolute(gitDir) ? gitDir : path.join(workspacePath, gitDir);
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
    case 'cherry_pick':
    case 'refresh':
      return true;
    default:
      return false;
  }
}

export const gitWorkspaceStateManager = new GitWorkspaceStateManager();
