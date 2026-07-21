import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getPullRequestMergeStateMock } = vi.hoisted(() => ({
  getPullRequestMergeStateMock: vi.fn(),
}));

vi.mock('@electron/features/vcs/github/merge-state', () => ({
  getPullRequestMergeState: getPullRequestMergeStateMock,
}));

import type { GhInvoker } from '@electron/features/vcs/github/invoker';
import {
  createPullRequest,
  listOpenPullRequests,
  mergePullRequest,
} from '@electron/features/vcs/github/pull-requests';

const ghMock = vi.fn();
const gh = ghMock as unknown as GhInvoker;

describe('mergePullRequest', () => {
  beforeEach(() => {
    ghMock.mockReset();
    getPullRequestMergeStateMock.mockReset();
  });

  it('merges the PR immediately when GitHub accepts a direct merge', async () => {
    ghMock.mockResolvedValue({ stdout: '', stderr: '' });
    getPullRequestMergeStateMock.mockResolvedValue('merged');

    const result = await mergePullRequest(gh, 17);

    expect(result).toEqual({ success: true, state: 'merged' });
    expect(ghMock).toHaveBeenCalledWith(
      ['pr', 'merge', '17', '--delete-branch', '--squash'],
      120_000,
    );
  });

  it('falls back to GitHub auto-merge when an immediate merge is not available', async () => {
    ghMock
      .mockRejectedValueOnce({ stderr: 'checks pending', message: 'merge blocked' })
      .mockResolvedValueOnce({ stdout: 'auto-merge enabled', stderr: '' });
    getPullRequestMergeStateMock.mockResolvedValue('open');

    const result = await mergePullRequest(gh, 18);

    expect(result).toEqual({ success: true, state: 'scheduled' });
    expect(ghMock).toHaveBeenNthCalledWith(
      2,
      ['pr', 'merge', '18', '--delete-branch', '--auto', '--squash'],
      120_000,
    );
  });

  it('treats a PR merged elsewhere while both attempts fail as success', async () => {
    ghMock
      .mockRejectedValueOnce({ stderr: 'already merged', message: 'failed' })
      .mockRejectedValueOnce({ stderr: 'already merged', message: 'failed' });
    getPullRequestMergeStateMock.mockResolvedValue('merged');

    const result = await mergePullRequest(gh, 20);

    expect(result).toEqual({ success: true, state: 'merged' });
  });

  it('returns the GitHub error when both merge attempts fail', async () => {
    ghMock
      .mockRejectedValueOnce({ stderr: 'checks pending', message: 'merge blocked' })
      .mockRejectedValueOnce({ stderr: 'auto-merge is not enabled for this repository', message: 'no auto-merge' });
    getPullRequestMergeStateMock.mockResolvedValue('open');

    const result = await mergePullRequest(gh, 19);

    expect(result).toEqual({
      success: false,
      error: 'auto-merge is not enabled for this repository',
    });
  });
});

describe('listOpenPullRequests', () => {
  beforeEach(() => {
    ghMock.mockReset();
  });

  it('parses the gh JSON list of open PRs', async () => {
    const prs = [
      { number: 7, url: 'https://github.com/o/r/pull/7', title: 'Fix bug', headRefName: 'fix/bug-loop_1', updatedAt: '2026-06-27T00:00:00Z' },
    ];
    ghMock.mockResolvedValue({ stdout: JSON.stringify(prs), stderr: '' });

    const result = await listOpenPullRequests(gh);

    expect(result).toEqual(prs);
    expect(ghMock).toHaveBeenCalledWith(
      ['pr', 'list', '--state', 'open', '--json', 'number,url,title,headRefName,updatedAt,body'],
      30_000,
    );
  });

  it('adds an author filter when provided', async () => {
    ghMock.mockResolvedValue({ stdout: '[]', stderr: '' });

    await listOpenPullRequests(gh, { author: '@me' });

    expect(ghMock).toHaveBeenCalledWith(
      ['pr', 'list', '--state', 'open', '--json', 'number,url,title,headRefName,updatedAt,body', '--author', '@me'],
      30_000,
    );
  });

  it('fails soft to [] when gh fails', async () => {
    ghMock.mockRejectedValue({ stderr: 'gh: not found', message: 'command failed' });
    expect(await listOpenPullRequests(gh)).toEqual([]);
  });

  it('fails soft to [] on invalid JSON', async () => {
    ghMock.mockResolvedValue({ stdout: 'not json', stderr: '' });
    expect(await listOpenPullRequests(gh)).toEqual([]);
  });
});

describe('createPullRequest', () => {
  beforeEach(() => {
    ghMock.mockReset();
  });

  it('passes head only when provided and extracts the PR url and number', async () => {
    ghMock.mockResolvedValue({
      stdout: 'https://github.com/o/r/pull/42\n',
      stderr: '',
    });

    const result = await createPullRequest(gh, {
      head: 'feat/x', base: 'main', title: 't', body: 'b', draft: true,
    });

    expect(ghMock).toHaveBeenCalledWith(
      ['pr', 'create', '--head', 'feat/x', '--base', 'main', '--title', 't', '--body', 'b', '--draft'],
      120_000,
    );
    expect(result).toEqual({
      success: true,
      message: 'Pull request created: https://github.com/o/r/pull/42',
      url: 'https://github.com/o/r/pull/42',
      number: 42,
    });
  });

  it('omits --head when not provided (current-branch inference)', async () => {
    ghMock.mockResolvedValue({ stdout: '', stderr: '' });

    await createPullRequest(gh, { base: 'main', title: 't', body: 'b' });

    expect(ghMock).toHaveBeenCalledWith(
      ['pr', 'create', '--base', 'main', '--title', 't', '--body', 'b'],
      120_000,
    );
  });

  it('maps a missing gh binary to an actionable message', async () => {
    ghMock.mockRejectedValue({ stderr: 'spawn gh ENOENT', message: 'ENOENT' });

    const result = await createPullRequest(gh, { base: 'main', title: 't', body: 'b' });

    expect(result.success).toBe(false);
    expect(result.message).toContain('GitHub CLI');
  });
});
