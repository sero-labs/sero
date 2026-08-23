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

  it('returns host runtime with install-state-aware capabilities when the workspace disables containers', async () => {
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
    const findEntry = (key: string) => resolved.capabilityAudit.find((entry) => entry.key === key);
    expect(resolved.capabilityState.support.browserAutomation).toBe(true);
    expect(resolved.capabilityState.available.browserAutomation).toBe(false);
    expect(resolved.capabilityState.installState).toMatchObject({
      coreTools: 'ready',
      browserAutomation: 'installable',
      nativeBuildTools: 'unknown',
    });
    expect(findEntry('browserAutomation')).toMatchObject({
      support: true,
      available: false,
      containerOnly: false,
      installState: 'installable',
    });
    expect(findEntry('browserAutomation')?.detail).toContain('installable as a large add-on');
    expect(findEntry('containerMounts')).toMatchObject({ support: false, available: false, containerOnly: true });
    expect(findEntry('containerizedLanguageServers')).toMatchObject({ support: true, available: true, containerOnly: false });
    expect(findEntry('managedDevServers')).toMatchObject({ support: true, available: true, containerOnly: false });
    expect(findEntry('containerMounts')?.detail).toContain('explicitly set to host mode');
    expect(mocks.runtimeManager.getHealth).toHaveBeenCalledWith('ws-1');
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
    expect(resolved.capabilityState.installState).toMatchObject({
      coreTools: 'ready',
      browserAutomation: 'ready',
      nativeBuildTools: 'available',
    });
    expect(resolved.capabilityAudit.every((entry) => entry.available)).toBe(true);
    expect(mocks.runtimeManager.getHealth).toHaveBeenCalledWith('ws-1');
  });

  it('returns unavailable container details without falling back to host when selected runtime is unavailable', async () => {
    mocks.runtimeManager.getHealth.mockResolvedValue({
      backend: 'docker',
      status: 'missing',
      message: 'Docker container missing',
      detail: 'Create the runtime before using container-only features.',
    });

    const resolved = await resolveWorkspaceRuntime('ws-1');

    expect(resolved).toMatchObject({
      desiredRuntime: 'container',
      actualRuntime: 'container',
      desiredBackend: 'docker',
      actualBackend: 'docker',
      fallbackCode: 'container_unavailable',
    });
    expect(resolved.fallbackReason).toContain('will not fall back to host execution');
    expect(resolved.fallbackReason).toContain('Docker container missing');
    expect(resolved.fallbackReason).toContain('Create the runtime before using container-only features.');
    expect(resolved.capabilityState.available.browserAutomation).toBe(false);
    expect(resolved.capabilityState.installState.browserAutomation).toBe('failed');
    expect(resolved.capabilityAudit.every((entry) => entry.available === false)).toBe(true);
  });

  it.each(['stopped', 'error'] as const)(
    'returns unavailable container details without host fallback when runtime health is %s',
    async (status) => {
      mocks.runtimeManager.getHealth.mockResolvedValue({
        backend: 'docker',
        status,
        message: status === 'error' ? 'Docker daemon unavailable' : 'Docker container stopped',
      });

      const resolved = await resolveWorkspaceRuntime('ws-1');

      expect(resolved).toMatchObject({
        desiredRuntime: 'container',
        actualRuntime: 'container',
        desiredBackend: 'docker',
        actualBackend: 'docker',
        fallbackCode: 'container_unavailable',
      });
      expect(resolved.fallbackReason).toContain('will not fall back to host execution');
      expect(resolved.capabilityAudit.find((entry) => entry.key === 'containerizedLanguageServers'))
        .toMatchObject({ available: false, containerOnly: false });
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

  it('uses host Doctor checks to report browser and native build install state separately', async () => {
    mocks.workspaceManager.getRuntimeBackendDetails.mockResolvedValue({ backend: 'host', configuredBackend: 'host' });
    mocks.runtimeManager.getHealth.mockResolvedValue({
      backend: 'host',
      status: 'ready',
      message: 'Host runtime ready',
      checks: [
        {
          id: 'runtime.host.core-tools',
          category: 'runtime',
          status: 'pass',
          message: 'Core tools ready',
          details: { installState: 'ready' },
          durationMs: 1,
        },
        {
          id: 'runtime.host.browser',
          category: 'runtime',
          status: 'fail',
          message: 'Browser launch failed',
          details: { installState: 'failed' },
          durationMs: 1,
        },
        {
          id: 'runtime.host.native-build-tools',
          category: 'runtime',
          status: 'warn',
          message: 'Native build tools missing',
          details: { installState: 'missing' },
          durationMs: 1,
        },
      ],
    });

    const resolved = await resolveWorkspaceRuntime('ws-1');

    expect(resolved.capabilityState.installState).toMatchObject({
      coreTools: 'ready',
      browserAutomation: 'failed',
      nativeBuildTools: 'missing',
    });
    expect(resolved.capabilityState.available.browserAutomation).toBe(false);
    expect(resolved.capabilityAudit.find((entry) => entry.key === 'browserAutomation')).toMatchObject({
      support: true,
      available: false,
      installState: 'failed',
    });
  });

  it('preserves unavailable host browser pack state as missing rather than installable', async () => {
    mocks.workspaceManager.getRuntimeBackendDetails.mockResolvedValue({ backend: 'host', configuredBackend: 'host' });
    mocks.runtimeManager.getHealth.mockResolvedValue({
      backend: 'host',
      status: 'ready',
      message: 'Host runtime ready',
      checks: [
        {
          id: 'runtime.host.browser',
          category: 'runtime',
          status: 'warn',
          message: 'Browser pack unavailable',
          details: { installState: 'missing', installable: false },
          durationMs: 1,
        },
      ],
    });

    const resolved = await resolveWorkspaceRuntime('ws-1');

    expect(resolved.capabilityState.installState.browserAutomation).toBe('missing');
    expect(resolved.capabilityState.available.browserAutomation).toBe(false);
    const browserEntry = resolved.capabilityAudit.find((entry) => entry.key === 'browserAutomation');
    expect(browserEntry).toMatchObject({ available: false, installState: 'missing' });
    expect(browserEntry?.detail).toContain('unavailable for this machine');
  });

  it('marks host browser automation available after the browser pack Doctor check passes', async () => {
    mocks.workspaceManager.getRuntimeBackendDetails.mockResolvedValue({ backend: 'host', configuredBackend: 'host' });
    mocks.runtimeManager.getHealth.mockResolvedValue({
      backend: 'host',
      status: 'ready',
      message: 'Host runtime ready',
      checks: [
        {
          id: 'runtime.host.browser',
          category: 'runtime',
          status: 'pass',
          message: 'Browser ready',
          details: { installState: 'ready' },
          durationMs: 1,
        },
      ],
    });

    const resolved = await resolveWorkspaceRuntime('ws-1');

    expect(resolved.capabilityState.installState.browserAutomation).toBe('ready');
    expect(resolved.capabilityState.available.browserAutomation).toBe(true);
    expect(resolved.capabilityAudit.find((entry) => entry.key === 'browserAutomation')).toMatchObject({
      available: true,
      installState: 'ready',
    });
  });

  it('throws when the workspace path cannot be resolved', async () => {
    mocks.workspaceManager.getPath.mockReturnValue(undefined);

    await expect(resolveWorkspaceRuntime('missing')).rejects.toThrow('Workspace not found: missing');
  });
});
