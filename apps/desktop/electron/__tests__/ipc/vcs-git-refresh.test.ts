import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  let eventListener: ((event: unknown) => void) | null = null;
  return {
    on: vi.fn((_name: string, listener: (event: unknown) => void) => {
      eventListener = listener;
    }),
    emitEvent: (event: unknown) => eventListener?.(event),
    ipcHandle: vi.fn(),
    invalidateWorkspace: vi.fn(),
    broadcastToWindows: vi.fn(),
  };
});

vi.mock('electron', () => ({
  ipcMain: {
    handle: mocks.ipcHandle,
  },
}));

vi.mock('@electron/shared/infra/shared-infra', () => ({
  vcsManager: {
    on: mocks.on,
    listCheckpoints: vi.fn(),
    getWorkspaceState: vi.fn(),
    createCheckpoint: vi.fn(),
    restoreCheckpoint: vi.fn(),
    diff: vi.fn(),
    watchWorkspace: vi.fn(),
    unwatchWorkspace: vi.fn(),
  },
  vcsOps: {
    getLogEntries: vi.fn(),
    getStatus: vi.fn(),
    getFileDiffSummary: vi.fn(),
    getFileContent: vi.fn(),
    amendCommitMessage: vi.fn(),
    createBranch: vi.fn(),
    deleteBranch: vi.fn(),
    moveBranch: vi.fn(),
    listRemotes: vi.fn(),
    addRemote: vi.fn(),
    setRemoteUrl: vi.fn(),
    removeRemote: vi.fn(),
    checkoutRemote: vi.fn(),
    fetch: vi.fn(),
    push: vi.fn(),
    undoLastCommit: vi.fn(),
    discardCommit: vi.fn(),
  },
  vcsPrOps: {
    getState: vi.fn(),
    preview: vi.fn(),
    buildDraftContext: vi.fn(),
    create: vi.fn(),
  },
  workspaceManager: {
    getPath: vi.fn(),
  },
}));

vi.mock('@electron/features/apps/git-app/manager', () => ({
  gitWorkspaceStateManager: {
    invalidateWorkspace: mocks.invalidateWorkspace,
    refreshWorkspace: vi.fn(),
  },
}));

vi.mock('@electron/ipc/lib/window-broadcast', () => ({
  broadcastToWindows: mocks.broadcastToWindows,
}));

vi.mock('@electron/features/agent/assistants/adhoc-agent', () => ({
  runAdhocAgent: vi.fn(),
}));

vi.mock('@electron/features/agent/assistants/pr-draft', () => ({
  buildPrDraftPrompt: vi.fn(),
  parseDraft: vi.fn(),
}));

describe('vcs git refresh invalidation', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.on.mockClear();
    mocks.ipcHandle.mockClear();
    mocks.invalidateWorkspace.mockClear();
    mocks.broadcastToWindows.mockClear();
  });

  it('invalidates Git refresh for checkpoint create and restore events', async () => {
    const { registerVcsHandlers } = await import('@electron/ipc/integrations/vcs');

    registerVcsHandlers();

    mocks.emitEvent({ type: 'checkpoint_created', workspaceId: 'ws-1' });
    mocks.emitEvent({ type: 'restored', workspaceId: 'ws-1' });

    expect(mocks.invalidateWorkspace).toHaveBeenNthCalledWith(1, 'ws-1', 'vcs:checkpoint_created');
    expect(mocks.invalidateWorkspace).toHaveBeenNthCalledWith(2, 'ws-1', 'vcs:restored');
  });

  it('invalidates the repo-state cache after successful mutations', async () => {
    const { registerVcsHandlers } = await import('@electron/ipc/integrations/vcs');
    const { IpcChannels } = await import('@/types/ipc-channels');

    registerVcsHandlers();

    const handlerFor = (channel: string) => {
      const call = mocks.ipcHandle.mock.calls.find(([name]) => name === channel);
      if (!call) throw new Error(`No handler registered for ${channel}`);
      return call[1] as (...args: unknown[]) => Promise<unknown>;
    };

    await handlerFor(IpcChannels.vcs.createBranch)({}, 'ws-1', 'feat');
    expect(mocks.invalidateWorkspace).toHaveBeenLastCalledWith('ws-1', 'vcs:create-branch');

    await handlerFor(IpcChannels.vcs.amendMessage)({}, 'ws-1', 'abc123', 'better message');
    expect(mocks.invalidateWorkspace).toHaveBeenLastCalledWith('ws-1', 'vcs:amend-message');

    await handlerFor(IpcChannels.vcs.removeRemote)({}, 'ws-1', 'origin');
    expect(mocks.invalidateWorkspace).toHaveBeenLastCalledWith('ws-1', 'vcs:remove-remote');
  });

  it('invalidates after push only when the push succeeds', async () => {
    const { registerVcsHandlers } = await import('@electron/ipc/integrations/vcs');
    const { IpcChannels } = await import('@/types/ipc-channels');
    const { vcsOps } = await import('@electron/shared/infra/shared-infra');

    registerVcsHandlers();

    const pushCall = mocks.ipcHandle.mock.calls.find(([name]) => name === IpcChannels.vcs.push);
    const pushHandler = pushCall?.[1] as (...args: unknown[]) => Promise<unknown>;

    vi.mocked(vcsOps.push).mockResolvedValueOnce({ success: false, message: 'rejected' });
    await pushHandler({}, 'ws-1', 'feat');
    expect(mocks.invalidateWorkspace).not.toHaveBeenCalled();

    vi.mocked(vcsOps.push).mockResolvedValueOnce({ success: true, message: 'ok' });
    await pushHandler({}, 'ws-1', 'feat');
    expect(mocks.invalidateWorkspace).toHaveBeenCalledWith('ws-1', 'vcs:push');
  });
});
