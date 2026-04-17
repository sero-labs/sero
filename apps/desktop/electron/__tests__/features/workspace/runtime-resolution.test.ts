import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  workspaceManager: {
    getPath: vi.fn(),
    isContainerEnabled: vi.fn(),
  },
  containerManager: {
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
    mocks.containerManager.inspect.mockResolvedValue({ state: 'running' });
  });

  it('returns host runtime when the workspace disables containers', async () => {
    mocks.workspaceManager.isContainerEnabled.mockResolvedValue(false);

    const resolved = await resolveWorkspaceRuntime('ws-1');

    expect(resolved).toMatchObject({
      workspaceId: 'ws-1',
      workspacePath: '/tmp/workspace',
      desiredRuntime: 'host',
      actualRuntime: 'host',
      containerEnabled: false,
    });
    expect(resolved.capabilityAudit.every((entry) => !entry.available)).toBe(true);
    expect(resolved.capabilityAudit.find((entry) => entry.key === 'containerMounts')?.detail).toContain('explicitly set to host mode');
  });

  it('returns container runtime when inspect succeeds even without cached container state', async () => {
    mocks.containerManager.inspect.mockResolvedValue({ state: 'running' });

    const resolved = await resolveWorkspaceRuntime('ws-1');

    expect(resolved).toMatchObject({
      desiredRuntime: 'container',
      actualRuntime: 'container',
      containerEnabled: true,
    });
    expect(resolved.capabilityAudit.every((entry) => entry.available)).toBe(true);
  });

  it('returns host fallback details when container mode is enabled but unavailable', async () => {
    mocks.containerManager.inspect.mockRejectedValue(new Error('not found'));

    const resolved = await resolveWorkspaceRuntime('ws-1');

    expect(resolved).toMatchObject({
      desiredRuntime: 'container',
      actualRuntime: 'host',
      fallbackCode: 'container_unavailable',
    });
    expect(resolved.fallbackReason).toContain('falling back to host mode');
    expect(resolved.capabilityAudit.find((entry) => entry.key === 'managedDevServers')).toMatchObject({
      available: false,
    });
  });

  it('returns host fallback details when the container exists but is stopped', async () => {
    mocks.containerManager.inspect.mockResolvedValue({ state: 'stopped' });

    const resolved = await resolveWorkspaceRuntime('ws-1');

    expect(resolved).toMatchObject({
      desiredRuntime: 'container',
      actualRuntime: 'host',
      fallbackCode: 'container_unavailable',
    });
    expect(resolved.fallbackReason).toContain('falling back to host mode');
    expect(resolved.capabilityAudit.find((entry) => entry.key === 'containerizedLanguageServers')?.detail).toContain('Containerized LSP remains unavailable');
  });

  it('throws when the workspace path cannot be resolved', async () => {
    mocks.workspaceManager.getPath.mockReturnValue(undefined);

    await expect(resolveWorkspaceRuntime('missing')).rejects.toThrow('Workspace not found: missing');
  });
});
