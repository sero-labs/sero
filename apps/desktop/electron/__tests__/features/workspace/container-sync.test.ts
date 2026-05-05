import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceRuntimeConfig } from '@/types/ipc';

const mocks = vi.hoisted(() => ({
  buildContainerConfig: vi.fn(async (workspaceId: string, workspacePath: string) => ({
    id: workspaceId,
    workspacePath,
  })),
  containerManager: {
    hasContainer: vi.fn(() => true),
    inspect: vi.fn(async () => ({ state: 'running' })),
    remove: vi.fn(async () => undefined),
    ensure: vi.fn(async () => undefined),
    terminals: {
      getWorkspaceTerminalIds: vi.fn((): string[] => []),
    },
  },
  workspaceManager: {
    getRuntimeConfig: vi.fn(async (): Promise<WorkspaceRuntimeConfig | undefined> => undefined),
    isContainerEnabled: vi.fn(async () => true),
    getPath: vi.fn(() => '/repo-1'),
  },
  showNotification: vi.fn(),
}));

vi.mock('@electron/shared/infra/shared-infra', () => ({
  buildContainerConfig: mocks.buildContainerConfig,
  containerManager: mocks.containerManager,
  workspaceManager: mocks.workspaceManager,
}));

vi.mock('@electron/platform/desktop/notifications', () => ({
  showNotification: mocks.showNotification,
}));

import { recreateContainerIfRunning } from '@electron/features/workspace/container-sync';

describe('recreateContainerIfRunning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buildContainerConfig.mockImplementation(async (workspaceId: string, workspacePath: string) => ({
      id: workspaceId,
      workspacePath,
    }));
    mocks.containerManager.hasContainer.mockReturnValue(true);
    mocks.containerManager.inspect.mockResolvedValue({ state: 'running' });
    mocks.containerManager.terminals.getWorkspaceTerminalIds.mockReturnValue([]);
    mocks.workspaceManager.getRuntimeConfig.mockResolvedValue(undefined);
    mocks.workspaceManager.isContainerEnabled.mockResolvedValue(true);
    mocks.workspaceManager.getPath.mockReturnValue('/repo-1');
  });

  it('does not touch Apple containers for OpenShell Local workspaces', async () => {
    mocks.workspaceManager.getRuntimeConfig.mockResolvedValue({
      providerId: 'openshell-local',
      experimental: true,
    });

    await recreateContainerIfRunning('ws-open');

    expect(mocks.containerManager.hasContainer).not.toHaveBeenCalled();
    expect(mocks.containerManager.inspect).not.toHaveBeenCalled();
    expect(mocks.containerManager.remove).not.toHaveBeenCalled();
    expect(mocks.containerManager.ensure).not.toHaveBeenCalled();
  });

  it('does not touch Apple containers for host workspaces', async () => {
    mocks.workspaceManager.getRuntimeConfig.mockResolvedValue({ providerId: 'host' });

    await recreateContainerIfRunning('ws-host');

    expect(mocks.containerManager.hasContainer).not.toHaveBeenCalled();
    expect(mocks.containerManager.inspect).not.toHaveBeenCalled();
    expect(mocks.containerManager.remove).not.toHaveBeenCalled();
    expect(mocks.containerManager.ensure).not.toHaveBeenCalled();
  });

  it('preserves Apple container recreation for Apple container workspaces', async () => {
    mocks.workspaceManager.getRuntimeConfig.mockResolvedValue({ providerId: 'apple-container' });

    await recreateContainerIfRunning('ws-apple');

    expect(mocks.containerManager.hasContainer).toHaveBeenCalledWith('ws-apple');
    expect(mocks.containerManager.inspect).toHaveBeenCalledWith('ws-apple');
    expect(mocks.containerManager.remove).toHaveBeenCalledWith('ws-apple');
    expect(mocks.buildContainerConfig).toHaveBeenCalledWith('ws-apple', '/repo-1');
    expect(mocks.containerManager.ensure).toHaveBeenCalledWith({
      id: 'ws-apple',
      workspacePath: '/repo-1',
    });
  });

  it('preserves legacy container-enabled Apple behavior without runtime config', async () => {
    await recreateContainerIfRunning('ws-legacy');

    expect(mocks.workspaceManager.isContainerEnabled).toHaveBeenCalledWith('ws-legacy');
    expect(mocks.containerManager.remove).toHaveBeenCalledWith('ws-legacy');
    expect(mocks.containerManager.ensure).toHaveBeenCalledTimes(1);
  });
});
