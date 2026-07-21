import type { GitActionResult, GitManagerRequest } from '@sero-ai/common';
import { getCommitDiff, getFileChanges, getFileDiff } from './git-commands';
import {
  err,
  ok,
  type GitActionContext,
} from './git-service-core';
import { readState, writeState } from './state-io';

export async function runGitQueryAction(
  params: GitManagerRequest,
  context: GitActionContext,
): Promise<GitActionResult | null> {
  switch (params.action) {
    case 'refresh': {
      const state = await context.refresh('full');
      const staged = state.fileChanges.filter((file) => file.staged).length;
      const unstaged = state.fileChanges.filter((file) => !file.staged).length;
      return ok(
        `Refreshed. Branch: ${state.currentBranch}, ` +
        `${state.branches.length} branches, ${state.commitCount} commits, ` +
        `${staged} staged, ${unstaged} unstaged files.`,
      );
    }

    case 'status': {
      const state = await context.refresh('auto');
      const staged = state.fileChanges.filter((file) => file.staged);
      const unstaged = state.fileChanges.filter((file) => !file.staged);
      let message = `On branch ${state.currentBranch}\n`;
      if (staged.length) {
        message += `\nStaged (${staged.length}):\n${staged
          .map((file) => `  ${file.status[0]?.toUpperCase() ?? '?'} ${file.path}`)
          .join('\n')}`;
      }
      if (unstaged.length) {
        message += `\nUnstaged (${unstaged.length}):\n${unstaged
          .map((file) => `  ${file.status[0]?.toUpperCase() ?? '?'} ${file.path}`)
          .join('\n')}`;
      }
      if (!staged.length && !unstaged.length) message += '\nWorking tree clean.';
      return ok(message);
    }

    case 'log': {
      const state = await context.refresh('auto');
      const recent = state.commits.slice(0, 20);
      if (!recent.length) return ok('No commits found.');
      return ok(recent.map((commit) => `${commit.shortHash} ${commit.subject} (${commit.authorName})`).join('\n'));
    }

    case 'branches': {
      const state = await context.refresh('auto');
      const localBranchLines = state.branches.map((branch) => {
        return `${branch.current ? '* ' : '  '}${branch.name}` +
          `${branch.remote ? ` -> ${branch.remote}` : ''}` +
          `${branch.ahead ? ` +${branch.ahead}` : ''}` +
          `${branch.behind ? ` -${branch.behind}` : ''}` +
          `${branch.checkedOutIn ? ` [worktree: ${branch.checkedOutIn}]` : ''}`;
      });
      const remoteBranchLines = state.remoteBranches.map((branch) => `  ${branch.name}`);
      const sections: string[] = [];
      if (localBranchLines.length) sections.push(`Local:\n${localBranchLines.join('\n')}`);
      if (remoteBranchLines.length) sections.push(`\nRemote:\n${remoteBranchLines.join('\n')}`);
      return ok(sections.join('\n') || 'No branches.');
    }

    case 'diff': {
      if (!params.file) return err('file is required for diff');
      const state = await readState(context.statePath);
      const diff = await getFileDiff(context.cwd, params.file, params.staged ?? false);

      state.activeDiff = diff ?? undefined;
      state.lastRefresh = new Date().toISOString();
      await writeState(context.statePath, state);

      if (!diff) return ok('No diff for this file.');
      return ok(`Diff for ${params.file}: +${diff.additions} -${diff.deletions} (${diff.hunks.length} hunks)`);
    }

    case 'show_commit': {
      if (!params.hash) return err('hash is required');
      const diffs = await getCommitDiff(context.cwd, params.hash);
      const state = await readState(context.statePath);
      state.commitDiffs = diffs;
      state.selectedCommitHash = params.hash;
      await writeState(context.statePath, state);
      const totalAdd = diffs.reduce((sum, diff) => sum + diff.additions, 0);
      const totalDel = diffs.reduce((sum, diff) => sum + diff.deletions, 0);
      return ok(`Commit ${params.hash}: ${diffs.length} files, +${totalAdd} -${totalDel}`);
    }

    default:
      return null;
  }
}
