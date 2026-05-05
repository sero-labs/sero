import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  workspaceManager: {
    getPath: vi.fn(),
    isContainerEnabled: vi.fn(),
    getRuntimeConfig: vi.fn(),
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
    mocks.workspaceManager.getRuntimeConfig.mockResolvedValue(undefined);
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
      providerId: 'host',
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
      providerId: 'apple-container',
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

  it('treats legacy container undefined as Apple container without runtime config', async () => {
    mocks.workspaceManager.isContainerEnabled.mockResolvedValue(true);

    const resolved = await resolveWorkspaceRuntime('ws-1');

    expect(resolved.providerId).toBe('apple-container');
    expect(resolved.actualRuntime).toBe('container');
  });

  it('resolves OpenShell Local from runtime config without inspecting Apple containers', async () => {
    mocks.workspaceManager.getRuntimeConfig.mockResolvedValue({
      providerId: 'openshell-local',
      gatewayName: 'sero-local',
      experimental: true,
    });

    const resolved = await resolveWorkspaceRuntime('ws-open');

    expect(resolved).toMatchObject({
      workspaceId: 'ws-open',
      providerId: 'openshell-local',
      desiredRuntime: 'openshell-local',
      actualRuntime: 'openshell-local',
      containerEnabled: false,
      runtimeConfig: { providerId: 'openshell-local', experimental: true },
    });
    expect(mocks.containerManager.inspect).not.toHaveBeenCalled();
    expect(resolved.capabilityAudit.find((entry) => entry.key === 'managedDevServers')).toMatchObject({
      available: true,
      containerOnly: false,
    });
    expect(resolved.capabilityAudit[0]?.detail).toContain('experimental');
    expect(resolved.capabilityAudit[0]?.detail).toContain('Selected policy profile: Dev');
    expect(resolved.capabilityAudit[0]?.detail).toContain('does not apply generated policy YAML');
  });

  it('uses selected OpenShell profile in capability audit copy', async () => {
    mocks.workspaceManager.getRuntimeConfig.mockResolvedValue({
      providerId: 'openshell-local',
      gatewayName: 'sero-local',
      experimental: true,
      policyProfileId: 'browser-agent',
    });

    const resolved = await resolveWorkspaceRuntime('ws-open');

    expect(resolved.capabilityAudit[0]?.detail).toContain('Selected policy profile: Browser Agent');
    expect(resolved.capabilityAudit[0]?.detail).toContain('persisted Sero policy intent');
    expect(resolved.capabilityAudit[0]?.detail).toContain('does not apply generated policy YAML');
  });

  it('resolves OpenShell Remote from runtime config with distinct capability copy', async () => {
    mocks.workspaceManager.getRuntimeConfig.mockResolvedValue({
      providerId: 'openshell-remote',
      remoteGatewayId: 'remote-1',
      gatewayName: 'sero-remote-dev',
      experimental: true,
    });

    const resolved = await resolveWorkspaceRuntime('ws-remote');

    expect(resolved).toMatchObject({
      workspaceId: 'ws-remote',
      providerId: 'openshell-remote',
      desiredRuntime: 'openshell-remote',
      actualRuntime: 'openshell-remote',
      containerEnabled: false,
      runtimeConfig: {
        providerId: 'openshell-remote',
        remoteGatewayId: 'remote-1',
        experimental: true,
      },
    });
    expect(mocks.containerManager.inspect).not.toHaveBeenCalled();
    expect(resolved.capabilityAudit.find((entry) => entry.key === 'managedDevServers')).toMatchObject({
      available: true,
      containerOnly: false,
    });
    expect(resolved.capabilityAudit[0]?.detail).toContain('OpenShell Remote');
    expect(resolved.capabilityAudit[0]?.detail).toContain('remote Docker');
    expect(resolved.capabilityAudit[0]?.detail).toContain('Policy diagnostics remain local-only');
  });

  it('uses explicit Apple container runtime config even when legacy container is false', async () => {
    mocks.workspaceManager.getRuntimeConfig.mockResolvedValue({ providerId: 'apple-container' });
    mocks.workspaceManager.isContainerEnabled.mockResolvedValue(false);

    const resolved = await resolveWorkspaceRuntime('ws-1');

    expect(resolved.providerId).toBe('apple-container');
    expect(resolved.actualRuntime).toBe('container');
    expect(mocks.containerManager.inspect).toHaveBeenCalledWith('ws-1');
  });

  it('throws when the workspace path cannot be resolved', async () => {
    mocks.workspaceManager.getPath.mockReturnValue(undefined);

    await expect(resolveWorkspaceRuntime('missing')).rejects.toThrow('Workspace not found: missing');
  });
});
