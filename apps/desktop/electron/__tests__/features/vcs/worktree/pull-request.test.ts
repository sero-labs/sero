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

vi.mock('@electron/features/vcs/worktree/merge-status', () => ({
  getPullRequestMergeState: getPullRequestMergeStateMock,
}));

import { listOpenPullRequests, mergePrFromWorktree } from '@electron/features/vcs/worktree/pull-request';

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

describe('listOpenPullRequests', () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  it('parses the gh JSON list of open PRs', async () => {
    const prs = [
      { number: 7, url: 'https://github.com/o/r/pull/7', title: 'Fix bug', headRefName: 'fix/bug-loop_1', updatedAt: '2026-06-27T00:00:00Z' },
    ];
    execFileMock.mockResolvedValue({ stdout: JSON.stringify(prs), stderr: '' });

    const result = await listOpenPullRequests('/tmp/repo');

    expect(result).toEqual(prs);
    expect(execFileMock).toHaveBeenCalledWith(
      'gh',
      ['pr', 'list', '--state', 'open', '--json', 'number,url,title,headRefName,updatedAt,body'],
      expect.objectContaining({ cwd: '/tmp/repo', timeout: 30_000 }),
    );
  });

  it('adds an author filter when provided', async () => {
    execFileMock.mockResolvedValue({ stdout: '[]', stderr: '' });

    await listOpenPullRequests('/tmp/repo', { author: '@me' });

    expect(execFileMock).toHaveBeenCalledWith(
      'gh',
      ['pr', 'list', '--state', 'open', '--json', 'number,url,title,headRefName,updatedAt,body', '--author', '@me'],
      expect.objectContaining({ cwd: '/tmp/repo' }),
    );
  });

  it('fails soft to [] when gh exits non-zero', async () => {
    execFileMock.mockRejectedValue({ stderr: 'gh: not found', message: 'command failed' });
    expect(await listOpenPullRequests('/tmp/repo')).toEqual([]);
  });

  it('fails soft to [] on invalid JSON', async () => {
    execFileMock.mockResolvedValue({ stdout: 'not json', stderr: '' });
    expect(await listOpenPullRequests('/tmp/repo')).toEqual([]);
  });
});
