import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { GitActionResult, GitManagerRequest } from '@sero-ai/common';
import { getCurrentBranch, getFileChanges } from './git-commands';
import { getDefaultBranch } from './git-default-branch';
import { runGitAsync } from './git-exec';
import { getBranches } from './git-refs';
import {
  err,
  ok,
  pushWithUpstreamFallback,
  type GitActionContext,
  unstageChanges,
} from './git-service-core';

export async function runGitMutationAction(
  params: GitManagerRequest,
  context: GitActionContext,
): Promise<GitActionResult | null> {
  switch (params.action) {
    case 'stage': {
      if (params.all) await context.exec(['add', '-A']);
      else if (params.file) await context.exec(['add', '--', params.file]);
      else return err('file or all=true required');
      await context.refresh('auto');
      return ok(params.all ? 'Staged all changes.' : `Staged ${params.file}`);
    }

    case 'unstage': {
      if (params.all) await unstageChanges(context.cwd, context.exec);
      else if (params.file) await unstageChanges(context.cwd, context.exec, params.file);
      else return err('file or all=true required');
      await context.refresh('auto');
      return ok(params.all ? 'Unstaged all.' : `Unstaged ${params.file}`);
    }

    // Throwing away work, so it is deliberately narrow: one named file, never
    // an "all" sweep, and untracked files are left alone — `git checkout` does
    // not touch them and removing them is not what "discard changes" means.
    case 'discard': {
      if (!params.file) return err('file is required for discard');
      await context.exec(['checkout', 'HEAD', '--', params.file]);
      await context.refresh('auto');
      return ok(`Discarded changes in ${params.file}`);
    }

    case 'commit': {
      if (!params.message) return err('message is required for commit');
      if (params.all) await context.exec(['add', '-A']);
      await context.exec(['commit', '-m', params.message]);
      await context.refresh('full');
      return ok(`Committed: ${params.message}`);
    }

    case 'stash': {
      const args = ['stash', 'push'];
      if (params.message) args.push('-m', params.message);
      await context.exec(args);
      await context.refresh('auto');
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
      await context.exec(args);
      await context.refresh('auto');
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
      await context.exec(args);
      await context.refresh('auto');
      return ok(target ? `Applied ${target}.` : 'Stash applied.');
    }

    case 'fetch': {
      await context.exec(['fetch', '--all', '--prune']);
      await context.refresh('full');
      return ok('Fetched all remotes.');
    }

    case 'pull': {
      const result = await context.exec(['pull']);
      await context.refresh('full');
      return ok(`Pulled: ${result.split('\n')[0] ?? ''}`);
    }

    case 'push': {
      const result = await pushWithUpstreamFallback(context.cwd, context.exec);
      await context.refresh('full');
      return ok(`Pushed: ${result || 'up to date'}`);
    }

    case 'checkout': {
      if (!params.branch) return err('branch is required');
      const branch = (await getBranches(context.cwd)).find((entry) => entry.name === params.branch);
      if (branch?.checkedOutIn) {
        return err(`Branch ${params.branch} is already checked out in ${branch.checkedOutIn}`);
      }
      // `force` throws local modifications away as it switches. Plain `switch`
      // brings them along, and refuses rather than clobbering when it can't.
      await context.exec(['switch', ...(params.force ? ['--discard-changes'] : []), params.branch]);
      await context.refresh('full');
      return ok(`Switched to ${params.branch}`);
    }

    case 'create_branch': {
      if (!params.branch) return err('branch name is required');
      await context.exec(['switch', '-c', params.branch]);
      await context.refresh('full');
      return ok(`Created and switched to ${params.branch}`);
    }

    case 'delete_branch': {
      if (!params.branch) return err('branch name is required');

      const branchName = params.branch;
      const currentBranch = await getCurrentBranch(context.cwd);
      if (branchName === currentBranch) {
        return err(`Cannot delete the current branch ${branchName}. Switch to another branch first.`);
      }

      const defaultBranch = await getDefaultBranch(context.cwd);
      if (defaultBranch && branchName === defaultBranch) {
        return err(`Cannot delete the default branch ${branchName}.`);
      }

      const branch = (await getBranches(context.cwd)).find((entry) => entry.name === branchName);
      if (branch?.checkedOutIn) {
        return err(`Branch ${branchName} is already checked out in ${branch.checkedOutIn}`);
      }

      try {
        await context.exec(['branch', params.force ? '-D' : '-d', branchName]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!params.force && /not fully merged/i.test(message)) {
          return err(`${message} Use force delete to remove it anyway.`);
        }
        throw error;
      }

      await context.refresh('full');
      return ok(`${params.force ? 'Force deleted' : 'Deleted'} branch ${branchName}`);
    }

    case 'merge': {
      if (!params.branch) return err('branch is required');
      const result = await context.exec(['merge', params.branch]);
      await context.refresh('full');
      return ok(`Merged ${params.branch}: ${result.split('\n')[0] ?? ''}`);
    }

    // Leaving a merge, which is the one action that only applies mid-merge.
    case 'abort_merge': {
      await context.exec(['merge', '--abort']);
      await context.refresh('full');
      return ok('Merge aborted.');
    }

    case 'cherry_pick': {
      if (!params.hash) return err('hash is required');
      const fileChanges = await getFileChanges(context.cwd);
      if (fileChanges.length > 0) {
        if (!params.all) {
          return err('Working tree has uncommitted changes. Stash or commit them before cherry-picking.');
        }
        await context.exec(['stash', 'push', '-u', '-m', `Auto-stash before cherry-pick ${params.hash}`]);
      }
      await context.exec(['cherry-pick', params.hash]);
      await context.refresh('full');
      return ok(`Cherry-picked ${params.hash}`);
    }

    case 'remove_worktree': {
      if (!params.worktreePath) return err('worktreePath is required');

      const worktreePath = params.worktreePath;
      const repoRoot = (await runGitAsync(['rev-parse', '--show-toplevel'], context.cwd, { allowFailure: true })) || context.cwd;
      const resolvedWorktreePath = await fs.realpath(worktreePath).catch(() => path.resolve(worktreePath));
      const resolvedRepoRoot = await fs.realpath(repoRoot).catch(() => path.resolve(repoRoot));
      if (resolvedWorktreePath === resolvedRepoRoot) {
        return err('Cannot remove the main worktree.');
      }

      try {
        await context.exec([
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

      await context.refresh('full');
      return ok(`${params.force ? 'Force removed' : 'Removed'} worktree ${worktreePath}`);
    }

    default:
      return null;
  }
}
