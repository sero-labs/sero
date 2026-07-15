// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  connectOrigin,
  createGitHubOrigin,
  defaultRepoName,
  describeImportOutcome,
  fetchOriginInfo,
} from './workflow';
import { deriveRepoNameFromGitUrl } from '@sero-ai/common';

const seroBridge = {
  github: {
    status: vi.fn(),
    createRepo: vi.fn(),
  },
  vcs: {
    remotes: vi.fn(),
    addRemote: vi.fn(),
    setRemoteUrl: vi.fn(),
    checkoutRemote: vi.fn(),
  },
  editor: {
    listFiles: vi.fn(),
  },
};

const originalSeroDescriptor = Object.getOwnPropertyDescriptor(window, 'sero');

describe('git remote workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seroBridge.vcs.addRemote.mockResolvedValue(undefined);
    seroBridge.vcs.setRemoteUrl.mockResolvedValue(undefined);
    seroBridge.vcs.checkoutRemote.mockResolvedValue({ success: true, message: 'checked out origin/main' });
    seroBridge.editor.listFiles.mockResolvedValue([]);
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

  it('returns a structured auth failure before calling GitHub repo creation when disconnected', async () => {
    seroBridge.github.status.mockResolvedValue({ authenticated: false });

    const result = await createGitHubOrigin({
      workspaceId: 'workspace-1',
      name: 'my-workspace',
      visibility: 'private',
    });

    expect(result).toEqual({
      ok: false,
      authStatus: { authenticated: false },
      reason: 'auth',
    });
    expect(seroBridge.github.createRepo).not.toHaveBeenCalled();
  });

  it('falls back to the authenticated GitHub URL when repo creation omits url', async () => {
    seroBridge.github.status.mockResolvedValue({ authenticated: true, username: 'octocat' });
    seroBridge.github.createRepo.mockResolvedValue({ success: true, message: 'created' });

    const result = await createGitHubOrigin({
      workspaceId: 'workspace-1',
      name: 'my-workspace',
      visibility: 'private',
    });

    expect(result).toEqual({
      ok: true,
      authStatus: { authenticated: true, username: 'octocat' },
      url: 'https://github.com/octocat/my-workspace',
    });
    expect(seroBridge.github.createRepo).toHaveBeenCalledWith('workspace-1', {
      name: 'my-workspace',
      description: undefined,
      visibility: 'private',
      addRemote: true,
    });
  });

  it('updates an existing origin when addRemote reports that origin already exists', async () => {
    seroBridge.vcs.addRemote.mockRejectedValue(new Error('remote origin already exists'));
    seroBridge.vcs.setRemoteUrl.mockResolvedValue(undefined);

    const result = await connectOrigin({
      workspaceId: 'workspace-1',
      url: 'git@github.com:octocat/my-workspace.git',
    });

    expect(result).toEqual({
      ok: true,
      url: 'git@github.com:octocat/my-workspace.git',
      webUrl: 'https://github.com/octocat/my-workspace',
      updatedExisting: true,
      import: { imported: false, reason: 'link-only' },
    });
    expect(seroBridge.vcs.addRemote).toHaveBeenCalledWith('workspace-1', 'origin', 'git@github.com:octocat/my-workspace.git');
    expect(seroBridge.vcs.setRemoteUrl).toHaveBeenCalledWith('workspace-1', 'origin', 'git@github.com:octocat/my-workspace.git');
    // No import requested → checkout is never attempted.
    expect(seroBridge.vcs.checkoutRemote).not.toHaveBeenCalled();
  });

  it('imports repository files for an empty workspace with auto import', async () => {
    seroBridge.editor.listFiles.mockResolvedValue([
      { name: '.sero-workspace.json', type: 'file', size: 32 },
    ]);

    const result = await connectOrigin({
      workspaceId: 'workspace-1',
      url: 'https://github.com/octocat/my-workspace.git',
      importMode: 'auto',
    });

    expect(result).toEqual({
      ok: true,
      url: 'https://github.com/octocat/my-workspace.git',
      webUrl: 'https://github.com/octocat/my-workspace',
      updatedExisting: false,
      import: { imported: true },
    });
    expect(seroBridge.vcs.checkoutRemote).toHaveBeenCalledWith('workspace-1', 'origin');
  });

  it('reports a skipped import for non-empty workspaces under auto mode', async () => {
    seroBridge.editor.listFiles.mockResolvedValue([
      { name: 'package.json', type: 'file', size: 128 },
    ]);

    const result = await connectOrigin({
      workspaceId: 'workspace-1',
      url: 'https://github.com/octocat/my-workspace.git',
      importMode: 'auto',
    });

    expect(result).toEqual({
      ok: true,
      url: 'https://github.com/octocat/my-workspace.git',
      webUrl: 'https://github.com/octocat/my-workspace',
      updatedExisting: false,
      import: { imported: false, reason: 'workspace-not-empty' },
    });
    expect(seroBridge.vcs.checkoutRemote).not.toHaveBeenCalled();
  });

  it('imports into a non-empty workspace when import is forced', async () => {
    seroBridge.editor.listFiles.mockResolvedValue([
      { name: 'notes.md', type: 'file', size: 12 },
    ]);

    const result = await connectOrigin({
      workspaceId: 'workspace-1',
      url: 'https://github.com/octocat/my-workspace.git',
      importMode: 'force',
    });

    expect(result).toEqual({
      ok: true,
      url: 'https://github.com/octocat/my-workspace.git',
      webUrl: 'https://github.com/octocat/my-workspace',
      updatedExisting: false,
      import: { imported: true },
    });
    // Forced import skips the emptiness probe entirely.
    expect(seroBridge.editor.listFiles).not.toHaveBeenCalled();
    expect(seroBridge.vcs.checkoutRemote).toHaveBeenCalledWith('workspace-1', 'origin');
  });

  it('reports an import failure while keeping the remote linked', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    seroBridge.editor.listFiles.mockResolvedValue([]);
    seroBridge.vcs.checkoutRemote.mockResolvedValue({ success: false, message: 'checkout failed' });

    const result = await connectOrigin({
      workspaceId: 'workspace-1',
      url: 'https://github.com/octocat/my-workspace.git',
      importMode: 'auto',
    });

    expect(result).toEqual({
      ok: true,
      url: 'https://github.com/octocat/my-workspace.git',
      webUrl: 'https://github.com/octocat/my-workspace',
      updatedExisting: false,
      import: { imported: false, reason: 'import-failed', message: 'checkout failed' },
    });
    expect(warn).toHaveBeenCalledWith(
      '[git-remote] Remote connected, but import failed:',
      'checkout failed',
    );
    warn.mockRestore();
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
    seroBridge.vcs.remotes.mockRejectedValue(new Error('jj remotes unavailable'));

    await expect(fetchOriginInfo('workspace-1')).resolves.toEqual({
      ok: false,
      message: 'jj remotes unavailable',
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
