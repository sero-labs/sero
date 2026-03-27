import { beforeEach, describe, expect, it, vi } from 'vitest';

const { execFileMock, getPullRequestMergeStateMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  getPullRequestMergeStateMock: vi.fn(),
}));

vi.mock('child_process', () => ({
  execFile: execFileMock,
}));

vi.mock('util', () => ({
  promisify: () => execFileMock,
}));

vi.mock('../../../features/kanban/quality/pr-merge-status', () => ({
  getPullRequestMergeState: getPullRequestMergeStateMock,
}));

import { mergePrFromWorktree } from '../../../features/kanban/worktree/worktree-pr';

describe('mergePrFromWorktree', () => {
  beforeEach(() => {
    execFileMock.mockReset();
    getPullRequestMergeStateMock.mockReset();
  });

  it('merges the PR immediately when GitHub accepts a direct merge', async () => {
    execFileMock.mockResolvedValue({ stdout: '', stderr: '' });
    getPullRequestMergeStateMock.mockResolvedValue('merged');

    const result = await mergePrFromWorktree('/tmp/worktree', 17);

    expect(result).toEqual({ success: true, state: 'merged' });
    expect(execFileMock).toHaveBeenCalledWith(
      'gh',
      ['pr', 'merge', '17', '--delete-branch', '--squash'],
      expect.objectContaining({ cwd: '/tmp/worktree', timeout: 120_000 }),
    );
  });

  it('falls back to GitHub auto-merge when an immediate merge is not available', async () => {
    execFileMock
      .mockRejectedValueOnce({ stderr: 'checks pending', message: 'merge blocked' })
      .mockResolvedValueOnce({ stdout: 'auto-merge enabled', stderr: '' });
    getPullRequestMergeStateMock.mockResolvedValue('open');

    const result = await mergePrFromWorktree('/tmp/worktree', 18);

    expect(result).toEqual({ success: true, state: 'scheduled' });
    expect(execFileMock).toHaveBeenNthCalledWith(
      2,
      'gh',
      ['pr', 'merge', '18', '--delete-branch', '--auto', '--squash'],
      expect.objectContaining({ cwd: '/tmp/worktree', timeout: 120_000 }),
    );
  });

  it('returns the GitHub error when both merge attempts fail', async () => {
    execFileMock
      .mockRejectedValueOnce({ stderr: 'checks pending', message: 'merge blocked' })
      .mockRejectedValueOnce({ stderr: 'auto-merge is not enabled for this repository', message: 'no auto-merge' });
    getPullRequestMergeStateMock.mockResolvedValue('open');

    const result = await mergePrFromWorktree('/tmp/worktree', 19);

    expect(result).toEqual({
      success: false,
      error: 'auto-merge is not enabled for this repository',
    });
  });
});
