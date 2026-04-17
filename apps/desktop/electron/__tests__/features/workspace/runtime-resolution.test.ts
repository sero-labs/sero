import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  workspaceManager: {
    getPath: vi.fn(),
    isContainerEnabled: vi.fn(),
  },
  containerManager: {
    hasContainer: vi.fn(),
    inspect: vi.fn(),
  },
}));

vi.mock('@electron/features/workspace/manager', () => ({
  workspaceManager: mocks.workspaceManager,
}));

vi.mock('@electron/features/container/core/singleton', () => ({
  containerManager: mocks.containerManager,
}));

import { resolveWorkspaceRuntime } from '@electron/features/workspace/runtime-resolution';

describe('resolveWorkspaceRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspaceManager.getPath.mockReturnValue('/tmp/workspace');
    mocks.workspaceManager.isContainerEnabled.mockResolvedValue(true);
    mocks.containerManager.hasContainer.mockReturnValue(false);
    mocks.containerManager.inspect.mockResolvedValue({ state: 'running' });
  });

  it('returns host runtime when the workspace disables containers', async () => {
    mocks.workspaceManager.isContainerEnabled.mockResolvedValue(false);

    await expect(resolveWorkspaceRuntime('ws-1')).resolves.toMatchObject({
      workspaceId: 'ws-1',
      workspacePath: '/tmp/workspace',
      desiredRuntime: 'host',
      actualRuntime: 'host',
      containerEnabled: false,
    });
  });

  it('returns container runtime when a running container is available', async () => {
    mocks.containerManager.hasContainer.mockReturnValue(true);
    mocks.containerManager.inspect.mockResolvedValue({ state: 'running' });

    await expect(resolveWorkspaceRuntime('ws-1')).resolves.toMatchObject({
      desiredRuntime: 'container',
      actualRuntime: 'container',
      containerEnabled: true,
    });
  });

  it('returns host fallback details when container mode is enabled but unavailable', async () => {
    const resolved = await resolveWorkspaceRuntime('ws-1');

    expect(resolved).toMatchObject({
      desiredRuntime: 'container',
      actualRuntime: 'host',
      fallbackCode: 'container_unavailable',
    });
    expect(resolved.fallbackReason).toContain('falling back to host mode');
  });

  it('returns host fallback details when the container exists but is stopped', async () => {
    mocks.containerManager.hasContainer.mockReturnValue(true);
    mocks.containerManager.inspect.mockResolvedValue({ state: 'stopped' });

    const resolved = await resolveWorkspaceRuntime('ws-1');

    expect(resolved).toMatchObject({
      desiredRuntime: 'container',
      actualRuntime: 'host',
      fallbackCode: 'container_unavailable',
    });
    expect(resolved.fallbackReason).toContain('falling back to host mode');
  });

  it('throws when the workspace path cannot be resolved', async () => {
    mocks.workspaceManager.getPath.mockReturnValue(undefined);

    await expect(resolveWorkspaceRuntime('missing')).rejects.toThrow('Workspace not found: missing');
  });
});
