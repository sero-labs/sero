import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { GitActionResult, GitAppState, GitManagerRequest, GitSyncMode } from '@sero-ai/common';
import { createDefaultGitState } from '@sero-ai/common';
import {
  getCommitCount,
  getCommits,
  getCurrentBranch,
  getHeadHash,
  getFileChanges,
  getRemotes,
  getRepoName,
  getStashes,
  isGitRepo,
} from './git-commands';
import { getBranches, getRemoteBranches } from './git-refs';
import { getDefaultBranch } from './git-default-branch';
import { canUseQuickRefresh, createGitRefSnapshot, createQuickRefreshState } from './git-refresh';
import { runGit, runGitAsync } from './git-exec';
import { readState, writeState } from './state-io';

// Match the Git app state directory anywhere in the repo so nested workspaces
// (e.g. repo/subdir/.sero/apps/git/state.json) do not show up as untracked.
const GIT_STATE_IGNORE_RULE = '**/.sero/apps/git/';

export type GitRefreshScope = 'auto' | 'full';

export interface GitRefreshOptions {
  syncMode?: GitSyncMode;
  scope?: GitRefreshScope;
}

export interface GitActionContext {
  cwd: string;
  statePath: string;
  exec: (args: string[]) => Promise<string>;
  refresh: (scope?: GitRefreshScope) => Promise<GitAppState>;
}

export function ok(message: string): GitActionResult {
  return { ok: true, message };
}

export function err(message: string): GitActionResult {
  return { ok: false, message };
}

async function ensureGitStateIgnored(cwd: string): Promise<void> {
  const gitDir = runGit(['rev-parse', '--git-dir'], cwd, { allowFailure: true });
  if (!gitDir) return;

  const resolvedGitDir = path.isAbsolute(gitDir)
    ? gitDir
    : path.join(cwd, gitDir);
  const excludePath = path.join(resolvedGitDir, 'info', 'exclude');

  let current = '';
  try {
    current = await fs.readFile(excludePath, 'utf8');
  } catch {
    current = '';
  }

  const existingRules = current
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (existingRules.includes(GIT_STATE_IGNORE_RULE)) return;

  const next = `${current.replace(/\s*$/, '')}${current.trim() ? '\n' : ''}${GIT_STATE_IGNORE_RULE}\n`;
  await fs.mkdir(path.dirname(excludePath), { recursive: true });
  await fs.writeFile(excludePath, next, 'utf8');
}

function createFullRefreshState(cwd: string, syncMode: GitSyncMode): GitAppState {
  return {
    repoPath: cwd,
    repoName: getRepoName(cwd),
    currentBranch: getCurrentBranch(cwd),
    headHash: getHeadHash(cwd),
    defaultBranch: getDefaultBranch(cwd),
    branches: getBranches(cwd),
    remoteBranches: getRemoteBranches(cwd),
    remotes: getRemotes(cwd),
    commits: getCommits(cwd, 150),
    stashes: getStashes(cwd),
    fileChanges: getFileChanges(cwd),
    commitCount: getCommitCount(cwd),
    lastRefresh: new Date().toISOString(),
    loading: false,
    syncMode,
  };
}

export async function refreshGitState(
  cwd: string,
  statePath: string,
  options: GitRefreshOptions = {},
): Promise<GitAppState> {
  const syncMode = options.syncMode ?? 'manual';
  const scope = options.scope ?? 'full';

  if (!isGitRepo(cwd)) {
    const state: GitAppState = {
      ...createDefaultGitState(),
      repoPath: cwd,
      error: 'Not a git repository',
      lastRefresh: new Date().toISOString(),
      syncMode,
    };
    await writeState(statePath, state);
    return state;
  }

  await ensureGitStateIgnored(cwd);

  if (scope === 'auto') {
    const previousState = await readState(statePath);
    const snapshot = createGitRefSnapshot(cwd);

    if (canUseQuickRefresh(previousState, snapshot)) {
      const state = createQuickRefreshState(cwd, syncMode, previousState, snapshot);
      await writeState(statePath, state);
      return state;
    }
  }

  const state = createFullRefreshState(cwd, syncMode);
  await writeState(statePath, state);
  return state;
}

export function createGitActionContext(
  cwd: string,
  statePath: string,
  options: GitRefreshOptions = {},
): GitActionContext {
  return {
    cwd,
    statePath,
    exec: (args) => runGitAsync(args, cwd, { timeout: 30_000 }),
    refresh: (scope = 'full') => refreshGitState(cwd, statePath, { ...options, scope }),
  };
}

function hasHeadCommit(cwd: string): boolean {
  return runGit(['rev-parse', '--verify', 'HEAD'], cwd, { allowFailure: true }).length > 0;
}

export async function unstageChanges(
  cwd: string,
  exec: (args: string[]) => Promise<string>,
  file?: string,
): Promise<void> {
  if (hasHeadCommit(cwd)) {
    if (file) await exec(['reset', 'HEAD', '--', file]);
    else await exec(['reset', 'HEAD']);
    return;
  }

  if (file) {
    await exec(['rm', '--cached', '--', file]);
    return;
  }

  await exec(['rm', '-r', '--cached', '--', '.']);
}

export async function pushWithUpstreamFallback(
  cwd: string,
  exec: (args: string[]) => Promise<string>,
): Promise<string> {
  try {
    return await exec(['push']);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const upstreamMissing = /upstream branch|has no upstream branch|set the remote as upstream/i.test(message);
    if (!upstreamMissing) throw error;

    const branch = getCurrentBranch(cwd);
    const remotes = getRemotes(cwd);
    const remote = remotes.find((entry) => entry.name === 'origin')?.name ?? remotes[0]?.name;
    if (!branch || !remote) throw error;

    return exec(['push', '--set-upstream', remote, branch]);
  }
}

export function formatActionError(action: GitManagerRequest['action'], message: string): string {
  if ((action === 'cherry_pick' || action === 'merge') && /after resolving the conflicts|conflict/i.test(message)) {
    return `${message} Resolve the conflicts in your workspace, stage the files, and continue from the command line if needed.`;
  }
  return message;
}
