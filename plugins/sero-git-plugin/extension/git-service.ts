/**
 * Shared Git service logic used by both the Pi extension and the desktop host.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { GitAppState, GitManagerRequest, GitSyncMode } from '../shared/types';
import { createDefaultGitState } from '../shared/types';
import {
  getCommitCount,
  getCommitDiff,
  getCommits,
  getCurrentBranch,
  getFileChanges,
  getFileDiff,
  getHeadHash,
  getRemotes,
  getRepoName,
  getStashes,
  isGitRepo,
} from './git-commands';
import { getBranches, getRemoteBranches } from './git-refs';
import { getDefaultBranch } from './git-default-branch';
import { runGit, runGitAsync } from './git-exec';
import { readState, writeState } from './state-io';

// Match the Git app state directory anywhere in the repo so nested workspaces
// (e.g. repo/subdir/.sero/apps/git/state.json) do not show up as untracked.
const GIT_STATE_IGNORE_RULE = '**/.sero/apps/git/';

export type GitActionResult = {
  ok: boolean;
  message: string;
};

type GitRefreshScope = 'auto' | 'full';

interface GitRefreshOptions {
  syncMode?: GitSyncMode;
  scope?: GitRefreshScope;
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

async function pushWithUpstreamFallback(cwd: string, exec: (args: string[]) => Promise<string>): Promise<string> {
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

function hasHeadCommit(cwd: string): boolean {
  return runGit(['rev-parse', '--verify', 'HEAD'], cwd, { allowFailure: true }).length > 0;
}

async function unstageChanges(cwd: string, exec: (args: string[]) => Promise<string>, file?: string): Promise<void> {
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

function canUseQuickRefresh(previousState: GitAppState, currentBranch: string, headHash: string): boolean {
  if (!previousState.repoPath) return false;
  if (!previousState.commits.length) return false;
  if (!previousState.branches.length && !previousState.remoteBranches.length) return false;
  return previousState.currentBranch === currentBranch && previousState.headHash === headHash;
}

function createQuickRefreshState(
  cwd: string,
  syncMode: GitSyncMode,
  previousState: GitAppState,
  currentBranch: string,
  headHash: string,
): GitAppState {
  return {
    ...previousState,
    repoPath: cwd,
    repoName: getRepoName(cwd),
    currentBranch,
    headHash,
    defaultBranch: previousState.defaultBranch,
    fileChanges: getFileChanges(cwd),
    stashes: getStashes(cwd),
    lastRefresh: new Date().toISOString(),
    loading: false,
    syncMode,
    error: undefined,
  };
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

function formatActionError(action: GitManagerRequest['action'], message: string): string {
  if ((action === 'cherry_pick' || action === 'merge') && /after resolving the conflicts|conflict/i.test(message)) {
    return `${message} Resolve the conflicts in your workspace, stage the files, and continue from the command line if needed.`;
  }
  return message;
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
    const currentBranch = getCurrentBranch(cwd);
    const headHash = getHeadHash(cwd);

    if (canUseQuickRefresh(previousState, currentBranch, headHash)) {
      const state = createQuickRefreshState(cwd, syncMode, previousState, currentBranch, headHash);
      await writeState(statePath, state);
      return state;
    }
  }

  const state = createFullRefreshState(cwd, syncMode);
  await writeState(statePath, state);
  return state;
}

export async function runGitAction(
  params: GitManagerRequest,
  cwd: string,
  statePath: string,
  options: GitRefreshOptions = {},
): Promise<GitActionResult> {
  const ok = (message: string): GitActionResult => ({ ok: true, message });
  const err = (message: string): GitActionResult => ({ ok: false, message });
  const exec = (args: string[]) => runGitAsync(args, cwd, { timeout: 30_000 });
  const refresh = (scope: GitRefreshScope = 'full') => refreshGitState(cwd, statePath, { ...options, scope });

  try {
    switch (params.action) {
      case 'refresh': {
        const state = await refresh('full');
        const staged = state.fileChanges.filter((file) => file.staged).length;
        const unstaged = state.fileChanges.filter((file) => !file.staged).length;
        return ok(
          `Refreshed. Branch: ${state.currentBranch}, ` +
          `${state.branches.length} branches, ${state.commitCount} commits, ` +
          `${staged} staged, ${unstaged} unstaged files.`,
        );
      }

      case 'status': {
        const state = await refresh('auto');
        const staged = state.fileChanges.filter((file) => file.staged);
        const unstaged = state.fileChanges.filter((file) => !file.staged);
        let message = `On branch ${state.currentBranch}\n`;
        if (staged.length) {
          message += `\nStaged (${staged.length}):\n${staged
            .map((file) => `  ${file.status[0].toUpperCase()} ${file.path}`)
            .join('\n')}`;
        }
        if (unstaged.length) {
          message += `\nUnstaged (${unstaged.length}):\n${unstaged
            .map((file) => `  ${file.status[0].toUpperCase()} ${file.path}`)
            .join('\n')}`;
        }
        if (!staged.length && !unstaged.length) message += '\nWorking tree clean.';
        return ok(message);
      }

      case 'log': {
        const state = await readState(statePath);
        const recent = state.commits.slice(0, 20);
        if (!recent.length) return ok('No commits found.');
        return ok(recent.map((commit) => `${commit.shortHash} ${commit.subject} (${commit.authorName})`).join('\n'));
      }

      case 'branches': {
        const state = await readState(statePath);
        const localBranchLines = state.branches.map((branch) => {
          return `${branch.current ? '* ' : '  '}${branch.name}` +
            `${branch.remote ? ` -> ${branch.remote}` : ''}` +
            `${branch.ahead ? ` +${branch.ahead}` : ''}` +
            `${branch.behind ? ` -${branch.behind}` : ''}` +
            `${branch.checkedOutIn ? ` [worktree: ${branch.checkedOutIn}]` : ''}`;
        });
        const remoteBranchLines = state.remoteBranches.map((branch) => `  ${branch.name}`);
        const sections = [];
        if (localBranchLines.length) sections.push(`Local:\n${localBranchLines.join('\n')}`);
        if (remoteBranchLines.length) sections.push(`\nRemote:\n${remoteBranchLines.join('\n')}`);
        return ok(sections.join('\n') || 'No branches.');
      }

      case 'diff': {
        if (!params.file) return err('file is required for diff');
        const state = await readState(statePath);
        const diff = getFileDiff(cwd, params.file, params.staged ?? false);

        state.activeDiff = diff ?? undefined;
        state.lastRefresh = new Date().toISOString();
        await writeState(statePath, state);

        if (!diff) return ok('No diff for this file.');
        return ok(`Diff for ${params.file}: +${diff.additions} -${diff.deletions} (${diff.hunks.length} hunks)`);
      }

      case 'stage': {
        if (params.all) await exec(['add', '-A']);
        else if (params.file) await exec(['add', '--', params.file]);
        else return err('file or all=true required');
        await refresh('auto');
        return ok(params.all ? 'Staged all changes.' : `Staged ${params.file}`);
      }

      case 'unstage': {
        if (params.all) await unstageChanges(cwd, exec);
        else if (params.file) await unstageChanges(cwd, exec, params.file);
        else return err('file or all=true required');
        await refresh('auto');
        return ok(params.all ? 'Unstaged all.' : `Unstaged ${params.file}`);
      }

      case 'commit': {
        if (!params.message) return err('message is required for commit');
        if (params.all) await exec(['add', '-A']);
        await exec(['commit', '-m', params.message]);
        await refresh('full');
        return ok(`Committed: ${params.message}`);
      }

      case 'checkout': {
        if (!params.branch) return err('branch is required');
        const branch = getBranches(cwd).find((entry) => entry.name === params.branch);
        if (branch?.checkedOutIn) {
          return err(`Branch ${params.branch} is already checked out in ${branch.checkedOutIn}`);
        }
        await exec(['switch', params.branch]);
        await refresh('full');
        return ok(`Switched to ${params.branch}`);
      }

      case 'create_branch': {
        if (!params.branch) return err('branch name is required');
        await exec(['switch', '-c', params.branch]);
        await refresh('full');
        return ok(`Created and switched to ${params.branch}`);
      }

      case 'delete_branch': {
        if (!params.branch) return err('branch name is required');

        const branchName = params.branch;
        const currentBranch = getCurrentBranch(cwd);
        if (branchName === currentBranch) {
          return err(`Cannot delete the current branch ${branchName}. Switch to another branch first.`);
        }

        const defaultBranch = getDefaultBranch(cwd);
        if (defaultBranch && branchName === defaultBranch) {
          return err(`Cannot delete the default branch ${branchName}.`);
        }

        const branch = getBranches(cwd).find((entry) => entry.name === branchName);
        if (branch?.checkedOutIn) {
          return err(`Branch ${branchName} is already checked out in ${branch.checkedOutIn}`);
        }

        try {
          await exec(['branch', params.force ? '-D' : '-d', branchName]);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!params.force && /not fully merged/i.test(message)) {
            return err(`${message} Use force delete to remove it anyway.`);
          }
          throw error;
        }

        await refresh('full');
        return ok(`${params.force ? 'Force deleted' : 'Deleted'} branch ${branchName}`);
      }

      case 'remove_worktree': {
        if (!params.worktreePath) return err('worktreePath is required');

        const worktreePath = params.worktreePath;
        const repoRoot = runGit(['rev-parse', '--show-toplevel'], cwd, { allowFailure: true }) || cwd;
        const resolvedWorktreePath = await fs.realpath(worktreePath).catch(() => path.resolve(worktreePath));
        const resolvedRepoRoot = await fs.realpath(repoRoot).catch(() => path.resolve(repoRoot));
        if (resolvedWorktreePath === resolvedRepoRoot) {
          return err('Cannot remove the main worktree.');
        }

        try {
          await exec([
            'worktree',
            'remove',
            ...(params.force ? ['--force', '--force'] : []),
            worktreePath,
          ]);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!params.force && /(dirty|modified|untracked|locked)/i.test(message)) {
            return err(`${message} Use force remove to remove it anyway.`);
          }
          throw error;
        }

        await refresh('full');
        return ok(`${params.force ? 'Force removed' : 'Removed'} worktree ${worktreePath}`);
      }

      case 'merge': {
        if (!params.branch) return err('branch is required');
        const result = await exec(['merge', params.branch]);
        await refresh('full');
        return ok(`Merged ${params.branch}: ${result.split('\n')[0]}`);
      }

      case 'cherry_pick': {
        if (!params.hash) return err('hash is required');
        const fileChanges = getFileChanges(cwd);
        if (fileChanges.length > 0) {
          if (!params.all) {
            return err('Working tree has uncommitted changes. Stash or commit them before cherry-picking.');
          }
          await exec(['stash', 'push', '-u', '-m', `Auto-stash before cherry-pick ${params.hash}`]);
        }
        await exec(['cherry-pick', params.hash]);
        await refresh('full');
        return ok(`Cherry-picked ${params.hash}`);
      }

      case 'stash': {
        const args = ['stash', 'push'];
        if (params.message) args.push('-m', params.message);
        await exec(args);
        await refresh('auto');
        return ok('Changes stashed.');
      }

      case 'stash_pop': {
        if (
          params.stashIndex !== undefined &&
          (!Number.isInteger(params.stashIndex) || params.stashIndex < 0)
        ) {
          return err('stashIndex must be a non-negative integer');
        }

        const target = params.stashIndex !== undefined
          ? `stash@{${params.stashIndex}}`
          : undefined;
        const args = target ? ['stash', 'pop', target] : ['stash', 'pop'];
        await exec(args);
        await refresh('auto');
        return ok(target ? `Popped ${target}.` : 'Stash popped.');
      }

      case 'stash_apply': {
        if (
          params.stashIndex !== undefined &&
          (!Number.isInteger(params.stashIndex) || params.stashIndex < 0)
        ) {
          return err('stashIndex must be a non-negative integer');
        }

        const target = params.stashIndex !== undefined
          ? `stash@{${params.stashIndex}}`
          : undefined;
        const args = target ? ['stash', 'apply', target] : ['stash', 'apply'];
        await exec(args);
        await refresh('auto');
        return ok(target ? `Applied ${target}.` : 'Stash applied.');
      }

      case 'fetch': {
        await exec(['fetch', '--all', '--prune']);
        await refresh('full');
        return ok('Fetched all remotes.');
      }

      case 'pull': {
        const result = await exec(['pull']);
        await refresh('full');
        return ok(`Pulled: ${result.split('\n')[0]}`);
      }

      case 'push': {
        const result = await pushWithUpstreamFallback(cwd, exec);
        await refresh('full');
        return ok(`Pushed: ${result || 'up to date'}`);
      }

      case 'show_commit': {
        if (!params.hash) return err('hash is required');
        const diffs = getCommitDiff(cwd, params.hash);
        const state = await readState(statePath);
        state.commitDiffs = diffs;
        state.selectedCommitHash = params.hash;
        await writeState(statePath, state);
        const totalAdd = diffs.reduce((sum, diff) => sum + diff.additions, 0);
        const totalDel = diffs.reduce((sum, diff) => sum + diff.deletions, 0);
        return ok(`Commit ${params.hash}: ${diffs.length} files, +${totalAdd} -${totalDel}`);
      }

      default:
        return err(`Unknown action: ${params.action}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return err(formatActionError(params.action, message));
  }
}
