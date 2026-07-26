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
import { isDetachedHead, readMergeState } from './git-merge-state';
import { runGitAsync } from './git-exec';
import { readState, writeState } from './state-io';

/**
 * Sero's own footprint inside a user's repository, kept out of their way.
 *
 * These are ours, not theirs: per-machine app state and the workspace's local
 * config. Left alone they show up as untracked changes and get swept into a
 * "stage all", so the user commits our bookkeeping into their project.
 *
 * Matched anywhere in the tree so nested workspaces (`repo/subdir/.sero/…`)
 * are covered too. Only `.sero/apps/git/` used to be listed, which meant any
 * *other* app writing state — the orchestrator, say — dragged the whole
 * `.sero/` directory back into the untracked list.
 *
 * This goes in `.git/info/exclude`, never the project's `.gitignore`: it is a
 * local preference, not a fact about the project, and it is not ours to commit.
 * It also only affects *untracked* files, so anyone who deliberately tracks
 * their `.sero-workspace.json` keeps it — git still reports changes to files it
 * already knows about.
 */
const SERO_IGNORE_RULES = [
  '**/.sero/',
  '**/.sero-workspace.json',
];

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
  // `--git-path` rather than `--git-dir`: in a linked worktree the git dir is
  // `.git/worktrees/<name>`, but the exclude file git actually reads lives in
  // the shared parent. Joining it onto `--git-dir` would write a file in the
  // worktree that git never looks at, so our own state would keep showing up
  // as untracked changes there.
  const excludePath = await runGitAsync(
    ['rev-parse', '--git-path', 'info/exclude'],
    cwd,
    { allowFailure: true },
  );
  if (!excludePath) return;

  const resolvedExcludePath = path.isAbsolute(excludePath)
    ? excludePath
    : path.join(cwd, excludePath);

  let current = '';
  try {
    current = await fs.readFile(resolvedExcludePath, 'utf8');
  } catch {
    current = '';
  }

  const existingRules = new Set(
    current.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
  );
  const missing = SERO_IGNORE_RULES.filter((rule) => !existingRules.has(rule));
  if (missing.length === 0) return;

  const next = `${current.replace(/\s*$/, '')}${current.trim() ? '\n' : ''}${missing.join('\n')}\n`;
  await fs.mkdir(path.dirname(resolvedExcludePath), { recursive: true });
  await fs.writeFile(resolvedExcludePath, next, 'utf8');
}

async function createFullRefreshState(
  cwd: string,
  syncMode: GitSyncMode,
  previousState: GitAppState,
): Promise<GitAppState> {
  return {
    repoPath: cwd,
    repoName: await getRepoName(cwd),
    currentBranch: await getCurrentBranch(cwd),
    headHash: await getHeadHash(cwd),
    defaultBranch: await getDefaultBranch(cwd),
    branches: await getBranches(cwd),
    remoteBranches: await getRemoteBranches(cwd),
    remotes: await getRemotes(cwd),
    commits: await getCommits(cwd, 150),
    stashes: await getStashes(cwd),
    fileChanges: await getFileChanges(cwd),
    commitCount: await getCommitCount(cwd),
    detached: await isDetachedHead(cwd),
    merge: await readMergeState(cwd, previousState.merge),
    lastRefresh: new Date().toISOString(),
    loading: false,
    syncMode,
    // What the user has open, carried across the refresh. These are answers to
    // a question they asked — "show me this commit", "show me this file" — and
    // rebuilding the repository's state is no reason to take them away. A
    // commit's diff cannot change, so the carried copy stays correct.
    //
    // Dropping them meant any background refresh landing after a commit was
    // opened emptied its file list, and the panel sat there with nothing in it.
    commitDiffs: previousState.commitDiffs,
    selectedCommitHash: previousState.selectedCommitHash,
    activeDiff: previousState.activeDiff,
  };
}

export async function refreshGitState(
  cwd: string,
  statePath: string,
  options: GitRefreshOptions = {},
): Promise<GitAppState> {
  const syncMode = options.syncMode ?? 'manual';
  const scope = options.scope ?? 'full';

  if (!(await isGitRepo(cwd))) {
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

  // The previous state is read on every refresh, not just the quick path: a
  // merge's conflicted-path set is carried forward from it (see
  // `readMergeState`), and a full refresh must not lose it.
  const previousState = await readState(statePath);

  if (scope === 'auto') {
    const snapshot = await createGitRefSnapshot(cwd);

    if (canUseQuickRefresh(previousState, snapshot)) {
      const state = await createQuickRefreshState(cwd, syncMode, previousState, snapshot);
      await writeState(statePath, state);
      return state;
    }
  }

  const state = await createFullRefreshState(cwd, syncMode, previousState);
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

async function hasHeadCommit(cwd: string): Promise<boolean> {
  return (await runGitAsync(['rev-parse', '--verify', 'HEAD'], cwd, { allowFailure: true })).length > 0;
}

export async function unstageChanges(
  cwd: string,
  exec: (args: string[]) => Promise<string>,
  file?: string,
): Promise<void> {
  if (await hasHeadCommit(cwd)) {
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

    const branch = await getCurrentBranch(cwd);
    const remotes = await getRemotes(cwd);
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
