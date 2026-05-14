import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@/types/ipc-channels';

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const runtime = {
    stopDevServer: vi.fn(async () => {}),
    restartDevServer: vi.fn(async () => ({ id: 'workspace-a:workspace:root:5173' })),
  };
  const registry = {
    onChange: vi.fn(),
    list: vi.fn(() => []),
    get: vi.fn((_serverId?: string): unknown => undefined),
    stop: vi.fn(async () => true),
    restart: vi.fn(async () => true),
    unregister: vi.fn(),
  };

  return {
    handlers,
    runtime,
    registry,
    ipcHandle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    }),
    runtimeManager: {
      getRuntime: vi.fn(async () => runtime),
      listDevServersSync: vi.fn(() => []),
      onDevServerChange: vi.fn(),
    },
    openExternal: vi.fn(async () => {}),
    broadcastToWindows: vi.fn(),
  };
});

vi.mock('electron', () => ({
  ipcMain: { handle: mocks.ipcHandle },
  shell: { openExternal: mocks.openExternal },
}));

vi.mock('@electron/shared/infra/shared-infra', () => ({
  containerManager: { devServers: mocks.registry },
}));

vi.mock('@electron/features/workspace/runtime/runtime-manager', () => ({
  runtimeManager: mocks.runtimeManager,
}));

vi.mock('@electron/ipc/lib/window-broadcast', () => ({
  broadcastToWindows: mocks.broadcastToWindows,
}));

describe('dev server IPC handlers', () => {
  beforeEach(async () => {
    vi.resetModules();
    mocks.handlers.clear();
    mocks.ipcHandle.mockClear();
    mocks.runtime.stopDevServer.mockReset().mockResolvedValue(undefined);
    mocks.runtime.restartDevServer.mockReset().mockResolvedValue({ id: 'workspace-a:workspace:root:5173' });
    mocks.registry.onChange.mockClear();
    mocks.registry.list.mockReset().mockReturnValue([]);
    mocks.registry.get.mockReset().mockReturnValue(undefined);
    mocks.registry.stop.mockReset().mockResolvedValue(true);
    mocks.registry.restart.mockReset().mockResolvedValue(true);
    mocks.registry.unregister.mockClear();
    mocks.runtimeManager.getRuntime.mockReset().mockResolvedValue(mocks.runtime);
    mocks.runtimeManager.listDevServersSync.mockReset().mockReturnValue([]);
    mocks.runtimeManager.onDevServerChange.mockClear();
    mocks.broadcastToWindows.mockClear();

    const { registerDevServerHandlers } = await import('@electron/ipc/container/dev-server');
    registerDevServerHandlers();
  });

  it('subscribes to RuntimeManager only for dev-server broadcasts', () => {
    expect(mocks.registry.onChange).not.toHaveBeenCalled();
    expect(mocks.runtimeManager.onDevServerChange).toHaveBeenCalledTimes(1);
  });

  it('broadcasts normalized runtime dev-server events once', () => {
    const callback = mocks.runtimeManager.onDevServerChange.mock.calls[0]?.[0] as ((event: {
      type: 'registered';
      workspaceId: string;
      serverId: string;
      server: {
        id: string;
        workspaceId: string;
        port: number;
        url: string;
        command: string;
        cwd: string;
        status: 'running';
      };
      status: 'running';
    }) => void) | undefined;
    if (!callback) throw new Error('Expected dev-server change subscription');

    callback({
      type: 'registered',
      workspaceId: 'workspace-a',
      serverId: 'workspace-a:workspace:root:5173',
      server: {
        id: 'workspace-a:workspace:root:5173',
        workspaceId: 'workspace-a',
        port: 5173,
        url: 'http://127.0.0.1:5173',
        command: 'pnpm dev',
        cwd: '/workspace',
        status: 'running',
      },
      status: 'running',
    });

    expect(mocks.broadcastToWindows).toHaveBeenCalledTimes(1);
    expect(mocks.broadcastToWindows).toHaveBeenCalledWith(
      IpcChannels.devServer.event,
      expect.objectContaining({ type: 'registered' }),
    );
  });

  it('stop calls only runtime when runtime succeeds for workspace-prefixed IDs', async () => {
    const stopHandler = mocks.handlers.get(IpcChannels.devServer.stop) as (event: unknown, serverId: string) => Promise<void>;

    await stopHandler({}, 'workspace-a:workspace:root:5173');

    expect(mocks.runtimeManager.getRuntime).toHaveBeenCalledWith('workspace-a');
    expect(mocks.runtime.stopDevServer).toHaveBeenCalledWith({ serverId: 'workspace-a:workspace:root:5173' });
    expect(mocks.registry.get).not.toHaveBeenCalled();
    expect(mocks.registry.stop).not.toHaveBeenCalled();
  });

  it('stop falls back to legacy registry when runtime fails and legacy server exists', async () => {
    const runtimeError = new Error('runtime stop failed');
    mocks.runtime.stopDevServer.mockRejectedValueOnce(runtimeError);
    mocks.registry.get.mockReturnValueOnce({ id: 'workspace-a:workspace:root:5173' });
    const stopHandler = mocks.handlers.get(IpcChannels.devServer.stop) as (event: unknown, serverId: string) => Promise<void>;

    await stopHandler({}, 'workspace-a:workspace:root:5173');

    expect(mocks.registry.get).toHaveBeenCalledWith('workspace-a:workspace:root:5173');
    expect(mocks.registry.stop).toHaveBeenCalledWith('workspace-a:workspace:root:5173');
  });

  it('restart falls back to legacy registry when runtime fails and legacy server exists', async () => {
    const runtimeError = new Error('runtime restart failed');
    mocks.runtime.restartDevServer.mockRejectedValueOnce(runtimeError);
    mocks.registry.get.mockReturnValueOnce({ id: 'workspace-a:workspace:root:5173' });
    const restartHandler = mocks.handlers.get(IpcChannels.devServer.restart) as (event: unknown, serverId: string) => Promise<void>;

    await restartHandler({}, 'workspace-a:workspace:root:5173');

    expect(mocks.registry.get).toHaveBeenCalledWith('workspace-a:workspace:root:5173');
    expect(mocks.registry.restart).toHaveBeenCalledWith('workspace-a:workspace:root:5173');
  });

  it('rethrows runtime errors when no legacy server exists', async () => {
    const runtimeError = new Error('runtime stop failed');
    mocks.runtime.stopDevServer.mockRejectedValueOnce(runtimeError);
    mocks.registry.get.mockReturnValueOnce(undefined);
    const stopHandler = mocks.handlers.get(IpcChannels.devServer.stop) as (event: unknown, serverId: string) => Promise<void>;

    await expect(stopHandler({}, 'workspace-a:workspace:root:5173')).rejects.toThrow(runtimeError);
    expect(mocks.registry.stop).not.toHaveBeenCalled();
  });

  it('uses the legacy registry directly for non-workspace-prefixed IDs', async () => {
    const stopHandler = mocks.handlers.get(IpcChannels.devServer.stop) as (event: unknown, serverId: string) => Promise<void>;

    await stopHandler({}, 'legacy-server-1');

    expect(mocks.runtimeManager.getRuntime).not.toHaveBeenCalled();
    expect(mocks.registry.get).not.toHaveBeenCalled();
    expect(mocks.registry.stop).toHaveBeenCalledWith('legacy-server-1');
  });
});
