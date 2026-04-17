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
    describeChange: vi.fn(),
    listBookmarks: vi.fn(),
    createBookmark: vi.fn(),
    deleteBookmark: vi.fn(),
    moveBookmark: vi.fn(),
    listRemotes: vi.fn(),
    addRemote: vi.fn(),
    setRemoteUrl: vi.fn(),
    removeRemote: vi.fn(),
    fetch: vi.fn(),
    push: vi.fn(),
    pushDryRun: vi.fn(),
    undo: vi.fn(),
    abandon: vi.fn(),
    squash: vi.fn(),
    getOperationLog: vi.fn(),
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
});
