import type { IPty } from 'node-pty';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContainerManager } from '@electron/features/container';
import type { WorkspaceManager } from '@electron/features/workspace/manager';

const mocks = vi.hoisted(() => ({
  buildWorkspaceContainerConfig: vi.fn(),
  toWorkspaceContainerPath: vi.fn(),
}));

vi.mock('@electron/features/container/core/workspace-container-config', () => ({
  buildWorkspaceContainerConfig: mocks.buildWorkspaceContainerConfig,
}));
vi.mock('@electron/features/workspace/runtime/container-path', () => ({
  toWorkspaceContainerPath: mocks.toWorkspaceContainerPath,
}));

import { createContainerRuntimeAdapter } from '@electron/features/workspace/runtime/adapters/container-runtime-adapter';

describe('createContainerRuntimeAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buildWorkspaceContainerConfig.mockResolvedValue({
      workspaceId: 'ws-1',
      hostPath: '/tmp/ws',
    });
    mocks.toWorkspaceContainerPath.mockReturnValue('/workspace/src');
  });

  it('builds config, ensures the container, maps cwd, and executes inside the container', async () => {
    const containerManager = createContainerManagerMock();
    containerManager.exec.mockResolvedValue({ stdout: 'container ok', stderr: '', exitCode: 0 });
    const workspaceManager = createWorkspaceManagerMock();
    const adapter = createContainerRuntimeAdapter({
      workspaceId: 'ws-1',
      workspacePath: '/tmp/ws',
      containerManager: containerManager as unknown as ContainerManager,
      workspaceManager: workspaceManager as unknown as WorkspaceManager,
    });

    const result = await adapter.exec('pnpm test', {
      cwd: '/tmp/ws/src',
      timeoutMs: 5000,
      isolated: true,
    });

    expect(mocks.buildWorkspaceContainerConfig).toHaveBeenCalledWith(
      workspaceManager,
      'ws-1',
      '/tmp/ws',
      { isolated: true },
    );
    expect(containerManager.ensure).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      hostPath: '/tmp/ws',
    });
    expect(mocks.toWorkspaceContainerPath).toHaveBeenCalledWith('/tmp/ws', '/tmp/ws/src');
    expect(containerManager.exec).toHaveBeenCalledWith('ws-1', 'pnpm test', '/workspace/src', 5000);
    expect(containerManager.ensure.mock.invocationCallOrder[0]).toBeLessThan(
      containerManager.exec.mock.invocationCallOrder[0],
    );
    expect(result).toEqual({ stdout: 'container ok', stderr: '', exitCode: 0 });
  });

  it('still ensures the container before returning an outside-workspace cwd error', async () => {
    const containerManager = createContainerManagerMock();
    mocks.toWorkspaceContainerPath.mockReturnValue(null);
    const adapter = createContainerRuntimeAdapter({
      workspaceId: 'ws-1',
      workspacePath: '/tmp/ws',
      containerManager: containerManager as unknown as ContainerManager,
      workspaceManager: createWorkspaceManagerMock() as unknown as WorkspaceManager,
    });

    const result = await adapter.exec('pwd', { cwd: '/other' });

    expect(containerManager.ensure).toHaveBeenCalledOnce();
    expect(containerManager.exec).not.toHaveBeenCalled();
    expect(result).toEqual({
      stdout: '',
      stderr: 'Cannot run command outside workspace root in container mode: /other',
      exitCode: 1,
    });
  });

  it('normalizes config or ensure failures to ExecResult', async () => {
    const containerManager = createContainerManagerMock();
    containerManager.ensure.mockRejectedValue(new Error('container unavailable'));
    const adapter = createContainerRuntimeAdapter({
      workspaceId: 'ws-1',
      workspacePath: '/tmp/ws',
      containerManager: containerManager as unknown as ContainerManager,
      workspaceManager: createWorkspaceManagerMock() as unknown as WorkspaceManager,
    });

    const result = await adapter.exec('pwd', { cwd: '/tmp/ws' });

    expect(result).toEqual({ stdout: '', stderr: 'container unavailable', exitCode: 1 });
    expect(containerManager.exec).not.toHaveBeenCalled();
  });

  it('delegates terminal creation to containerManager.terminals.createTerminal', async () => {
    const pty = createPtyMock();
    const containerManager = createContainerManagerMock(pty);
    const adapter = createContainerRuntimeAdapter({
      workspaceId: 'ws-1',
      workspacePath: '/tmp/ws',
      containerManager: containerManager as unknown as ContainerManager,
      workspaceManager: createWorkspaceManagerMock() as unknown as WorkspaceManager,
    });

    const result = await adapter.createTerminal({ terminalId: 'term-1', cols: 120, rows: 32 });

    expect(containerManager.terminals.createTerminal).toHaveBeenCalledWith(
      'ws-1',
      'term-1',
      120,
      32,
    );
    expect(result).toEqual({ pty, runtime: 'container' });
  });

  it('reports health from container inspection without ensuring the container', async () => {
    const containerManager = createContainerManagerMock();
    containerManager.inspect.mockResolvedValue({
      id: 'sero-ws-1',
      image: 'sero-node',
      state: 'running',
      cpus: 2,
      memoryBytes: 1024,
    });
    const adapter = createContainerRuntimeAdapter({
      workspaceId: 'ws-1',
      workspacePath: '/tmp/ws',
      containerManager: containerManager as unknown as ContainerManager,
      workspaceManager: createWorkspaceManagerMock() as unknown as WorkspaceManager,
    });

    await expect(adapter.health()).resolves.toEqual({
      providerId: 'apple-container',
      status: 'ready',
    });
    expect(containerManager.ensure).not.toHaveBeenCalled();
    expect(adapter.providerId).toBe('apple-container');
    expect(adapter.actualRuntime).toBe('container');
    expect(adapter.capabilities.portDiscovery).toBe(true);
  });

  it('reports unavailable health when the container is not running', async () => {
    const containerManager = createContainerManagerMock();
    containerManager.inspect.mockResolvedValue({
      id: 'sero-ws-1',
      image: 'sero-node',
      state: 'stopped',
      cpus: 2,
      memoryBytes: 1024,
    });
    const adapter = createContainerRuntimeAdapter({
      workspaceId: 'ws-1',
      workspacePath: '/tmp/ws',
      containerManager: containerManager as unknown as ContainerManager,
      workspaceManager: createWorkspaceManagerMock() as unknown as WorkspaceManager,
    });

    await expect(adapter.health()).resolves.toEqual({
      providerId: 'apple-container',
      status: 'unavailable',
      message: 'Container is not running.',
    });
  });
});

function createContainerManagerMock(pty: IPty = createPtyMock()) {
  return {
    ensure: vi.fn().mockResolvedValue({
      id: 'sero-ws-1',
      image: 'sero-node',
      state: 'running',
      cpus: 2,
      memoryBytes: 1024,
    }),
    exec: vi.fn(),
    inspect: vi.fn(),
    terminals: {
      createTerminal: vi.fn(() => pty),
    },
  };
}

function createWorkspaceManagerMock() {
  return {
    getReferences: vi.fn(),
    getMounts: vi.fn(),
    getRoots: vi.fn(),
  };
}

function createPtyMock(): IPty {
  return { pid: 123 } as unknown as IPty;
}
