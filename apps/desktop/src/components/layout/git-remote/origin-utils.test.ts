// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  defaultRepoName,
  describeImportOutcome,
  fetchOriginInfo,
} from './origin-utils';
import { deriveRepoNameFromGitUrl } from '@sero-ai/common';

const seroBridge = {
  vcs: {
    remotes: vi.fn(),
  },
};

const originalSeroDescriptor = Object.getOwnPropertyDescriptor(window, 'sero');

describe('git remote origin utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'sero', {
      configurable: true,
      value: seroBridge,
    });
  });

  afterEach(() => {
    if (originalSeroDescriptor) {
      Object.defineProperty(window, 'sero', originalSeroDescriptor);
      return;
    }

    Reflect.deleteProperty(window, 'sero');
  });

  it('derives one shared default repo name from workspace display names', () => {
    expect(defaultRepoName('My Workspace!', 'workspace-1')).toBe('my-workspace');
    expect(defaultRepoName('   ', 'workspace-1')).toBe('workspace-1');
  });

  it('reads and parses the current origin from vcs remotes', async () => {
    seroBridge.vcs.remotes.mockResolvedValue([
      { name: 'upstream', url: 'https://example.com/upstream.git' },
      { name: 'origin', url: 'https://github.com/octocat/my-workspace.git' },
    ]);

    await expect(fetchOriginInfo('workspace-1')).resolves.toEqual({
      ok: true,
      origin: {
        url: 'https://github.com/octocat/my-workspace.git',
        owner: 'octocat',
        repo: 'my-workspace',
      },
    });
  });

  it('surfaces remote lookup failures instead of treating them as no origin', async () => {
    seroBridge.vcs.remotes.mockRejectedValue(new Error('git remotes unavailable'));

    await expect(fetchOriginInfo('workspace-1')).resolves.toEqual({
      ok: false,
      message: 'git remotes unavailable',
    });
  });

  it('describes import outcomes for the user only when there is something to say', () => {
    expect(describeImportOutcome({ imported: true })).toBeNull();
    expect(describeImportOutcome({ imported: false, reason: 'link-only' })).toBeNull();
    expect(describeImportOutcome({ imported: false, reason: 'workspace-not-empty' })).toMatch(
      /nothing was imported/i,
    );
    expect(
      describeImportOutcome({ imported: false, reason: 'import-failed', message: 'boom' }),
    ).toMatch(/boom/);
  });
});

describe('deriveRepoNameFromGitUrl', () => {
  it.each([
    ['https://github.com/octocat/Hello-World.git', 'Hello-World'],
    ['https://github.com/octocat/Hello-World', 'Hello-World'],
    ['git@github.com:octocat/my-workspace.git', 'my-workspace'],
    ['git@gitlab.com:group/sub/app.git', 'app'],
    ['ssh://git@host:2222/team/repo', 'repo'],
    ['https://example.com/scm/repo.git/', 'repo'],
  ])('derives %s → %s', (url, expected) => {
    expect(deriveRepoNameFromGitUrl(url)).toBe(expected);
  });

  it('returns undefined for empty input', () => {
    expect(deriveRepoNameFromGitUrl('')).toBeUndefined();
    expect(deriveRepoNameFromGitUrl(null)).toBeUndefined();
  });
});
