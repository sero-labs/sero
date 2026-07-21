import { describe, expect, it, vi } from 'vitest';

import type { WorktreeGitRunner as GitRunner } from '@electron/features/git/worktree/default-branch';
import { syncWorktreeBranchWithDefaultBranch } from '@electron/features/git/worktree/sync';

type RunResult = { stdout?: string; stderr?: string };
type RunHandler = RunResult | Error | ((args: string[]) => Promise<RunResult> | RunResult);

function createRunner(handlers: Record<string, RunHandler>): GitRunner {
  return {
    async run(_worktreePath, args) {
      const key = args.join(' ');
      const handler = handlers[key];
      if (typeof handler === 'function') {
        const result = await handler(args);
        return {
          stdout: result.stdout ?? '',
          stderr: result.stderr ?? '',
        };
      }
      if (handler instanceof Error) throw handler;
      if (!handler) throw new Error(`Unexpected git command: ${key}`);
      return {
        stdout: handler.stdout ?? '',
        stderr: handler.stderr ?? '',
      };
    },
  };
}

describe('syncWorktreeBranchWithDefaultBranch', () => {
  it('does nothing when the branch already contains the latest default branch', async () => {
    const runner = createRunner({
      'config rerere.enabled true': {},
      'fetch origin': {},
      'symbolic-ref refs/remotes/origin/HEAD': { stdout: 'refs/remotes/origin/main\n' },
      'rev-parse --verify refs/remotes/origin/main': { stdout: 'abc123\n' },
      'merge-base --is-ancestor origin/main HEAD': {},
    });

    const result = await syncWorktreeBranchWithDefaultBranch('/tmp/worktree', { runner });

    expect(result).toMatchObject({
      success: true,
      baseBranch: 'main',
      upstreamRef: 'origin/main',
      updated: false,
      resolvedConflicts: false,
    });
  });

  it('rebases cleanly when the default branch has advanced', async () => {
    const runner = createRunner({
      'config rerere.enabled true': {},
      'fetch origin': {},
      'symbolic-ref refs/remotes/origin/HEAD': { stdout: 'refs/remotes/origin/main\n' },
      'rev-parse --verify refs/remotes/origin/main': { stdout: 'abc123\n' },
      'merge-base --is-ancestor origin/main HEAD': new Error('not ancestor'),
      'rebase origin/main': {},
    });

    const result = await syncWorktreeBranchWithDefaultBranch('/tmp/worktree', { runner });

    expect(result).toMatchObject({
      success: true,
      baseBranch: 'main',
      upstreamRef: 'origin/main',
      updated: true,
      resolvedConflicts: false,
    });
  });

  it('uses the resolver callback to finish a conflicted rebase', async () => {
    const resolver = vi.fn().mockResolvedValue(true);
    let diffCallCount = 0;
    const runner = createRunner({
      'config rerere.enabled true': {},
      'fetch origin': {},
      'symbolic-ref refs/remotes/origin/HEAD': { stdout: 'refs/remotes/origin/main\n' },
      'rev-parse --verify refs/remotes/origin/main': { stdout: 'abc123\n' },
      'merge-base --is-ancestor origin/main HEAD': new Error('not ancestor'),
      'rebase origin/main': new Error('conflict'),
      'diff --name-only --diff-filter=U': () => {
        diffCallCount += 1;
        return { stdout: diffCallCount <= 2 ? 'src/App.tsx\n' : '' };
      },
      'add -A': {},
      '-c core.editor=true rebase --continue': {},
    });

    const result = await syncWorktreeBranchWithDefaultBranch('/tmp/worktree', {
      runner,
      resolveConflicts: resolver,
    });

    expect(result).toMatchObject({
      success: true,
      baseBranch: 'main',
      upstreamRef: 'origin/main',
      updated: true,
      resolvedConflicts: true,
    });
    expect(resolver).toHaveBeenCalledWith({
      attempt: 1,
      baseBranch: 'main',
      upstreamRef: 'origin/main',
      conflictFiles: ['src/App.tsx'],
    });
  });
});
