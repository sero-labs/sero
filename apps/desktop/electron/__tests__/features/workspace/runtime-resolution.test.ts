import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  workspaceManager: {
    getPath: vi.fn(),
    getRuntimeConfig: vi.fn(),
  },
  runtimeManager: {
    getHealth: vi.fn(),
  },
}));

vi.mock('@electron/features/workspace/manager', () => ({
  workspaceManager: mocks.workspaceManager,
}));

vi.mock('@electron/features/workspace/runtime/runtime-manager', () => ({
  runtimeManager: mocks.runtimeManager,
}));

import { resolveWorkspaceRuntime } from '@electron/features/workspace/runtime-resolution';

describe('resolveWorkspaceRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspaceManager.getPath.mockReturnValue('/tmp/workspace');
    mocks.workspaceManager.getRuntimeConfig.mockResolvedValue({ backend: 'docker' });
    mocks.runtimeManager.getHealth.mockResolvedValue({
      backend: 'docker',
      status: 'ready',
      message: 'Docker runtime ready',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns host runtime when the workspace disables containers without probing health', async () => {
    mocks.workspaceManager.getRuntimeConfig.mockResolvedValue({ backend: 'host' });

    const resolved = await resolveWorkspaceRuntime('ws-1');

    expect(resolved).toMatchObject({
      workspaceId: 'ws-1',
      workspacePath: '/tmp/workspace',
      desiredRuntime: 'host',
      actualRuntime: 'host',
      desiredBackend: 'host',
      actualBackend: 'host',
      containerEnabled: false,
    });
    expect(resolved.capabilityAudit.every((entry) => !entry.available)).toBe(true);
    expect(resolved.capabilityAudit.find((entry) => entry.key === 'containerMounts')?.detail).toContain('explicitly set to host mode');
    expect(mocks.runtimeManager.getHealth).not.toHaveBeenCalled();
  });

  it('returns container runtime when runtime health is ready', async () => {
    mocks.runtimeManager.getHealth.mockResolvedValue({
      backend: 'docker',
      status: 'ready',
      message: 'Docker runtime ready',
    });

    const resolved = await resolveWorkspaceRuntime('ws-1');

    expect(resolved).toMatchObject({
      desiredRuntime: 'container',
      actualRuntime: 'container',
      desiredBackend: 'docker',
      actualBackend: 'docker',
      containerEnabled: true,
    });
    expect(resolved.capabilityAudit.every((entry) => entry.available)).toBe(true);
    expect(mocks.runtimeManager.getHealth).toHaveBeenCalledWith('ws-1');
  });

  it('returns host fallback details when container mode is enabled but unavailable', async () => {
    mocks.runtimeManager.getHealth.mockResolvedValue({
      backend: 'docker',
      status: 'missing',
      message: 'Docker container missing',
      detail: 'Create the runtime before using container-only features.',
    });

    const resolved = await resolveWorkspaceRuntime('ws-1');

    expect(resolved).toMatchObject({
      desiredRuntime: 'container',
      actualRuntime: 'host',
      desiredBackend: 'docker',
      actualBackend: 'host',
      fallbackCode: 'container_unavailable',
    });
    expect(resolved.fallbackReason).toContain('falling back to host mode');
    expect(resolved.fallbackReason).toContain('Docker container missing');
    expect(resolved.fallbackReason).toContain('Create the runtime before using container-only features.');
    expect(resolved.capabilityAudit.find((entry) => entry.key === 'managedDevServers')).toMatchObject({
      available: false,
    });
  });

  it.each(['stopped', 'error'] as const)(
    'returns host fallback details when runtime health is %s',
    async (status) => {
      mocks.runtimeManager.getHealth.mockResolvedValue({
        backend: 'docker',
        status,
        message: status === 'error' ? 'Docker daemon unavailable' : 'Docker container stopped',
      });

      const resolved = await resolveWorkspaceRuntime('ws-1');

      expect(resolved).toMatchObject({
        desiredRuntime: 'container',
        actualRuntime: 'host',
        desiredBackend: 'docker',
        actualBackend: 'host',
        fallbackCode: 'container_unavailable',
      });
      expect(resolved.fallbackReason).toContain('falling back to host mode');
      expect(resolved.capabilityAudit.find((entry) => entry.key === 'containerizedLanguageServers')?.detail).toContain('Containerized LSP remains unavailable');
    },
  );

  it('falls back when the desired backend is unsupported on the current platform without probing health', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    mocks.workspaceManager.getRuntimeConfig.mockResolvedValue({ backend: 'apple-container' });

    const resolved = await resolveWorkspaceRuntime('ws-1');

    expect(resolved).toMatchObject({
      desiredRuntime: 'container',
      actualRuntime: 'host',
      desiredBackend: 'apple-container',
      actualBackend: 'host',
      fallbackCode: 'backend-unsupported-on-platform',
      containerEnabled: false,
    });
    expect(resolved.fallbackReason).toContain('apple-container is not supported on linux');
    expect(mocks.runtimeManager.getHealth).not.toHaveBeenCalled();
  });

  it('throws when the workspace path cannot be resolved', async () => {
    mocks.workspaceManager.getPath.mockReturnValue(undefined);

    await expect(resolveWorkspaceRuntime('missing')).rejects.toThrow('Workspace not found: missing');
  });
});
