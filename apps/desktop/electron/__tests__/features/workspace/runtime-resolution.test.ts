import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  workspaceManager: {
    getPath: vi.fn(),
    getRuntimeBackendDetails: vi.fn(),
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
    mocks.workspaceManager.getRuntimeBackendDetails.mockResolvedValue({
      backend: 'docker',
      configuredBackend: 'docker',
    });
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
    mocks.workspaceManager.getRuntimeBackendDetails.mockResolvedValue({ backend: 'host', configuredBackend: 'host' });

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
    // Browser automation and container mounts are container-only; LSP and managed dev servers run on host too.
    const findEntry = (key: string) => resolved.capabilityAudit.find((entry) => entry.key === key);
    expect(findEntry('browserAutomation')).toMatchObject({ available: false, containerOnly: true });
    expect(findEntry('containerMounts')).toMatchObject({ available: false, containerOnly: true });
    expect(findEntry('containerizedLanguageServers')).toMatchObject({ available: true, containerOnly: false });
    expect(findEntry('managedDevServers')).toMatchObject({ available: true, containerOnly: false });
    expect(findEntry('containerMounts')?.detail).toContain('explicitly set to host mode');
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
      actualBackend: 'docker',
      fallbackCode: 'container_unavailable',
    });
    expect(resolved.fallbackReason).toContain('falling back to host mode');
    expect(resolved.fallbackReason).toContain('Docker container missing');
    expect(resolved.fallbackReason).toContain('Create the runtime before using container-only features.');
    // Browser/mounts stay unavailable when the container falls back to host; LSP and dev servers remain usable on host.
    expect(resolved.capabilityAudit.find((entry) => entry.key === 'browserAutomation')).toMatchObject({ available: false });
    expect(resolved.capabilityAudit.find((entry) => entry.key === 'containerMounts')).toMatchObject({ available: false });
    expect(resolved.capabilityAudit.find((entry) => entry.key === 'managedDevServers')).toMatchObject({ available: true });
    expect(resolved.capabilityAudit.find((entry) => entry.key === 'containerizedLanguageServers')).toMatchObject({ available: true });
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
        actualBackend: 'docker',
        fallbackCode: 'container_unavailable',
      });
      expect(resolved.fallbackReason).toContain('falling back to host mode');
      // Host runtime supports language servers now (cross-platform host runtime workstream);
      // the audit must reflect that rather than claiming LSP is container-only.
      expect(resolved.capabilityAudit.find((entry) => entry.key === 'containerizedLanguageServers'))
        .toMatchObject({ available: true, containerOnly: false });
    },
  );

  it('falls back to the platform default when the desired backend is unsupported on the current platform', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    mocks.workspaceManager.getRuntimeBackendDetails.mockResolvedValue({
      backend: 'docker',
      configuredBackend: 'apple-container',
      fallbackCode: 'backend-unsupported-on-platform',
      fallbackReason: 'apple-container is not supported on linux. Sero is falling back to docker.',
    });
    mocks.runtimeManager.getHealth.mockResolvedValue({
      backend: 'docker',
      status: 'ready',
      message: 'Docker runtime ready',
    });

    const resolved = await resolveWorkspaceRuntime('ws-1');

    // The runtime manager will execute Docker; the audit surfaces the original
    // configuration intent plus the fallback metadata so renderers can explain it.
    expect(resolved).toMatchObject({
      desiredRuntime: 'container',
      actualRuntime: 'container',
      desiredBackend: 'apple-container',
      actualBackend: 'docker',
      fallbackCode: 'backend-unsupported-on-platform',
      containerEnabled: true,
    });
    expect(resolved.fallbackReason).toContain('apple-container is not supported on linux');
    expect(resolved.fallbackReason).toContain('falling back to docker');
    expect(mocks.runtimeManager.getHealth).toHaveBeenCalledWith('ws-1');
  });

  it('throws when the workspace path cannot be resolved', async () => {
    mocks.workspaceManager.getPath.mockReturnValue(undefined);

    await expect(resolveWorkspaceRuntime('missing')).rejects.toThrow('Workspace not found: missing');
  });
});
