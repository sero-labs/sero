import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IpcChannels } from '@/types/ipc-channels';

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    handlers,
    ipcHandle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => handlers.set(channel, handler)),
    invoke: vi.fn(),
    getPath: vi.fn(() => '/trusted/workspace'),
    status: vi.fn(async () => ({ status: 'ok', pool: { slots: [] } })),
    plan: vi.fn(async () => ({ status: 'planned', plan: { planId: 'host-plan' } })),
    execute: vi.fn(async () => ({ status: 'executed', planId: 'host-plan', results: [] })),
  };
});

vi.mock('electron', () => ({
  ipcMain: { handle: mocks.ipcHandle },
  ipcRenderer: { invoke: mocks.invoke },
}));
vi.mock('@electron/features/workspace/manager', () => ({
  workspaceManager: { getPath: mocks.getPath },
}));
vi.mock('@electron/features/git/worktree/pool', () => ({
  getWorktreePoolStatus: mocks.status,
  createWorktreeCleanupPlan: mocks.plan,
  executeWorktreeCleanupPlan: mocks.execute,
}));

import { registerWorktreePoolHandlers } from '@electron/ipc/integrations/worktree-pool';
import { worktreePoolBridge } from '@electron/preload/integrations/worktree-pool';

describe('worktree pool IPC authority', () => {
  beforeEach(() => {
    mocks.handlers.clear();
    mocks.ipcHandle.mockClear();
    mocks.invoke.mockReset();
    mocks.getPath.mockClear();
    mocks.status.mockClear();
    mocks.plan.mockClear();
    mocks.execute.mockClear();
    registerWorktreePoolHandlers();
  });

  it('resolves the workspace path in main and ignores renderer-supplied path authority', async () => {
    const handler = mocks.handlers.get(IpcChannels.worktreePool.executeCleanupPlan);
    expect(handler).toBeTypeOf('function');

    await handler?.({}, 'workspace-1', 'host-plan', '/attacker/checkout', ['git', 'worktree', 'prune']);

    expect(mocks.getPath).toHaveBeenCalledWith('workspace-1');
    expect(mocks.execute).toHaveBeenCalledWith('/trusted/workspace', 'host-plan');
    expect(mocks.execute).not.toHaveBeenCalledWith('/attacker/checkout', expect.anything());
  });

  it('exposes only workspace identities and host-issued plan IDs through preload', async () => {
    await worktreePoolBridge.status('workspace-1');
    await worktreePoolBridge.createCleanupPlan('workspace-1');
    await worktreePoolBridge.executeCleanupPlan('workspace-1', 'host-plan');

    expect(mocks.invoke.mock.calls).toEqual([
      [IpcChannels.worktreePool.status, 'workspace-1'],
      [IpcChannels.worktreePool.createCleanupPlan, 'workspace-1'],
      [IpcChannels.worktreePool.executeCleanupPlan, 'workspace-1', 'host-plan'],
    ]);
  });
});
