import { beforeEach, describe, expect, it, vi } from 'vitest';

import { connectRemote, publishRepo, type RemoteConnectDeps } from '@electron/features/git/remote-connect';

const vcsOps = {
  listRemotes: vi.fn(),
  addRemote: vi.fn(),
  setRemoteUrl: vi.fn(),
  checkoutRemote: vi.fn(),
};
const githubRepoOps = { createRepo: vi.fn() };
const githubAuth = { getToken: vi.fn() };
const listFiles = vi.fn();
const runtimeManager = {
  getRuntime: vi.fn().mockResolvedValue({ runtimeWorkspacePath: '/workspace', listFiles }),
};

const deps = { vcsOps, githubRepoOps, githubAuth, runtimeManager } as unknown as RemoteConnectDeps;
const URL = 'https://github.com/o/r.git';

beforeEach(() => {
  vi.clearAllMocks();
  runtimeManager.getRuntime.mockResolvedValue({ runtimeWorkspacePath: '/workspace', listFiles });
});

describe('connectRemote', () => {
  it('adds origin when none exists (no error-string matching)', async () => {
    vcsOps.listRemotes.mockResolvedValue([]);

    const result = await connectRemote(deps, 'ws-1', URL);

    expect(vcsOps.addRemote).toHaveBeenCalledWith('ws-1', 'origin', URL);
    expect(vcsOps.setRemoteUrl).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: true, url: URL, updatedExisting: false, import: { imported: false, reason: 'link-only' },
    });
  });

  it('re-points an existing origin instead of failing', async () => {
    vcsOps.listRemotes.mockResolvedValue([{ name: 'origin', url: 'https://old' }]);

    const result = await connectRemote(deps, 'ws-1', URL);

    expect(vcsOps.setRemoteUrl).toHaveBeenCalledWith('ws-1', 'origin', URL);
    expect(vcsOps.addRemote).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, updatedExisting: true });
  });

  it('imports into an empty workspace under auto mode', async () => {
    vcsOps.listRemotes.mockResolvedValue([]);
    listFiles.mockResolvedValue([{ name: '.git' }, { name: '.sero-workspace.json' }]);
    vcsOps.checkoutRemote.mockResolvedValue({ success: true, message: 'ok' });

    const result = await connectRemote(deps, 'ws-1', URL, 'auto');

    expect(vcsOps.checkoutRemote).toHaveBeenCalledWith('ws-1', 'origin');
    expect(result).toMatchObject({ ok: true, import: { imported: true } });
  });

  it('skips auto import when the workspace already has files', async () => {
    vcsOps.listRemotes.mockResolvedValue([]);
    listFiles.mockResolvedValue([{ name: 'src' }]);

    const result = await connectRemote(deps, 'ws-1', URL, 'auto');

    expect(vcsOps.checkoutRemote).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true, import: { imported: false, reason: 'workspace-not-empty' },
    });
  });

  it('imports into a non-empty workspace when forced', async () => {
    vcsOps.listRemotes.mockResolvedValue([]);
    listFiles.mockResolvedValue([{ name: 'src' }]);
    vcsOps.checkoutRemote.mockResolvedValue({ success: true, message: 'ok' });

    const result = await connectRemote(deps, 'ws-1', URL, 'force');

    expect(vcsOps.checkoutRemote).toHaveBeenCalledWith('ws-1', 'origin');
    expect(result).toMatchObject({ ok: true, import: { imported: true } });
  });

  it('keeps the remote linked when the import itself fails', async () => {
    vcsOps.listRemotes.mockResolvedValue([]);
    listFiles.mockResolvedValue([]);
    vcsOps.checkoutRemote.mockResolvedValue({ success: false, message: 'path conflict' });

    const result = await connectRemote(deps, 'ws-1', URL, 'auto');

    expect(result).toMatchObject({
      ok: true,
      import: { imported: false, reason: 'import-failed', message: 'path conflict' },
    });
  });
});

describe('publishRepo', () => {
  it('returns a structured auth failure before touching GitHub', async () => {
    githubAuth.getToken.mockReturnValue(null);

    const result = await publishRepo(deps, 'ws-1', { name: 'r', visibility: 'private' });

    expect(result).toEqual({ ok: false, reason: 'auth' });
    expect(githubRepoOps.createRepo).not.toHaveBeenCalled();
  });

  it('returns the created repo url on success', async () => {
    githubAuth.getToken.mockReturnValue('tok');
    githubRepoOps.createRepo.mockResolvedValue({ success: true, url: 'https://github.com/o/r', message: 'ok' });

    const result = await publishRepo(deps, 'ws-1', { name: 'r', visibility: 'public' });

    expect(result).toEqual({ ok: true, url: 'https://github.com/o/r' });
  });

  it('propagates API failures with the partial url', async () => {
    githubAuth.getToken.mockReturnValue('tok');
    githubRepoOps.createRepo.mockResolvedValue({ success: false, message: 'nope', url: 'https://github.com/o/r' });

    const result = await publishRepo(deps, 'ws-1', { name: 'r', visibility: 'public' });

    expect(result).toEqual({ ok: false, reason: 'api', message: 'nope', url: 'https://github.com/o/r' });
  });
});
