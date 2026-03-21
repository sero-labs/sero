/**
 * Shared Git service logic used by both the Pi extension and the desktop host.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { GitAppState, GitManagerRequest, GitSyncMode } from '../shared/types';
import { DEFAULT_GIT_STATE } from '../shared/types';
import {
  getBranches,
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
import { runGit } from './git-exec';
import { readState, writeState } from './state-io';

const GIT_STATE_IGNORE_RULE = '.sero/apps/git/';

export type GitActionResult = {
  ok: boolean;
  message: string;
};

interface GitRefreshOptions {
  syncMode?: GitSyncMode;
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

function pushWithUpstreamFallback(cwd: string, exec: (args: string[]) => string): string {
  try {
    return exec(['push']);
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

export async function refreshGitState(
  cwd: string,
  statePath: string,
  options: GitRefreshOptions = {},
): Promise<GitAppState> {
  const syncMode = options.syncMode ?? 'manual';

  if (!isGitRepo(cwd)) {
    const state: GitAppState = {
      ...DEFAULT_GIT_STATE,
      repoPath: cwd,
      error: 'Not a git repository',
      lastRefresh: new Date().toISOString(),
      syncMode,
    };
    await writeState(statePath, state);
    return state;
  }

  await ensureGitStateIgnored(cwd);

  const state: GitAppState = {
    repoPath: cwd,
    repoName: getRepoName(cwd),
    currentBranch: getCurrentBranch(cwd),
    headHash: getHeadHash(cwd),
    branches: getBranches(cwd),
    remotes: getRemotes(cwd),
    commits: getCommits(cwd, 150),
    stashes: getStashes(cwd),
    fileChanges: getFileChanges(cwd),
    commitCount: getCommitCount(cwd),
    lastRefresh: new Date().toISOString(),
    loading: false,
    syncMode,
  };

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
  const exec = (args: string[]) => runGit(args, cwd, { timeout: 30_000 });
  const refresh = () => refreshGitState(cwd, statePath, options);

  try {
    switch (params.action) {
      case 'refresh': {
        const state = await refresh();
        const staged = state.fileChanges.filter((file) => file.staged).length;
        const unstaged = state.fileChanges.filter((file) => !file.staged).length;
        return ok(
          `Refreshed. Branch: ${state.currentBranch}, ` +
          `${state.branches.length} branches, ${state.commitCount} commits, ` +
          `${staged} staged, ${unstaged} unstaged files.`,
        );
      }

      case 'status': {
        const state = await refresh();
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
        return ok(
          state.branches
            .map((branch) => {
              return `${branch.current ? '* ' : '  '}${branch.name}` +
                `${branch.remote ? ` -> ${branch.remote}` : ''}` +
                `${branch.ahead ? ` +${branch.ahead}` : ''}` +
                `${branch.behind ? ` -${branch.behind}` : ''}`;
            })
            .join('\n') || 'No branches.',
        );
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
        if (params.all) exec(['add', '-A']);
        else if (params.file) exec(['add', '--', params.file]);
        else return err('file or all=true required');
        await refresh();
        return ok(params.all ? 'Staged all changes.' : `Staged ${params.file}`);
      }

      case 'unstage': {
        if (params.all) exec(['reset', 'HEAD']);
        else if (params.file) exec(['reset', 'HEAD', '--', params.file]);
        else return err('file or all=true required');
        await refresh();
        return ok(params.all ? 'Unstaged all.' : `Unstaged ${params.file}`);
      }

      case 'commit': {
        if (!params.message) return err('message is required for commit');
        if (params.all) exec(['add', '-A']);
        exec(['commit', '-m', params.message]);
        await refresh();
        return ok(`Committed: ${params.message}`);
      }

      case 'checkout': {
        if (!params.branch) return err('branch is required');
        exec(['checkout', params.branch]);
        await refresh();
        return ok(`Switched to ${params.branch}`);
      }

      case 'create_branch': {
        if (!params.branch) return err('branch name is required');
        exec(['checkout', '-b', params.branch]);
        await refresh();
        return ok(`Created and switched to ${params.branch}`);
      }

      case 'delete_branch': {
        if (!params.branch) return err('branch name is required');
        exec(['branch', '-d', params.branch]);
        await refresh();
        return ok(`Deleted branch ${params.branch}`);
      }

      case 'merge': {
        if (!params.branch) return err('branch is required');
        const result = exec(['merge', params.branch]);
        await refresh();
        return ok(`Merged ${params.branch}: ${result.split('\n')[0]}`);
      }

      case 'cherry_pick': {
        if (!params.hash) return err('hash is required');
        exec(['cherry-pick', params.hash]);
        await refresh();
        return ok(`Cherry-picked ${params.hash}`);
      }

      case 'stash': {
        const args = ['stash', 'push'];
        if (params.message) args.push('-m', params.message);
        exec(args);
        await refresh();
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
        exec(args);
        await refresh();
        return ok(target ? `Popped ${target}.` : 'Stash popped.');
      }

      case 'fetch': {
        exec(['fetch', '--all', '--prune']);
        await refresh();
        return ok('Fetched all remotes.');
      }

      case 'pull': {
        const result = exec(['pull']);
        await refresh();
        return ok(`Pulled: ${result.split('\n')[0]}`);
      }

      case 'push': {
        const result = pushWithUpstreamFallback(cwd, exec);
        await refresh();
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
    return err(message.split('\n')[0] ?? message);
  }
}
