// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  connectOrigin,
  createGitHubOrigin,
  defaultRepoName,
  fetchOriginInfo,
} from './workflow';

const seroBridge = {
  github: {
    status: vi.fn(),
    createRepo: vi.fn(),
  },
  vcs: {
    remotes: vi.fn(),
    addRemote: vi.fn(),
    setRemoteUrl: vi.fn(),
  },
};

const originalSeroDescriptor = Object.getOwnPropertyDescriptor(window, 'sero');

describe('git remote workflow', () => {
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
    });
    expect(seroBridge.vcs.addRemote).toHaveBeenCalledWith('workspace-1', 'origin', 'git@github.com:octocat/my-workspace.git');
    expect(seroBridge.vcs.setRemoteUrl).toHaveBeenCalledWith('workspace-1', 'origin', 'git@github.com:octocat/my-workspace.git');
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
});
