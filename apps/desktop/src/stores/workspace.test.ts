// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceInfo } from '@/types/ipc';

const workflowMocks = vi.hoisted(() => ({
  connectOrigin: vi.fn(),
}));

vi.mock('@/components/layout/git-remote/origin-utils', () => ({
  connectOrigin: workflowMocks.connectOrigin,
}));

import { useWorkspaceStore } from './workspace';
import { useAppStore } from '@/stores/app';
import { useNavigationStore } from '@/stores/navigation';

const workspaceBridge = {
  create: vi.fn(),
  close: vi.fn(),
};

const originalSeroDescriptor = Object.getOwnPropertyDescriptor(window, 'sero');
const initialState = useWorkspaceStore.getInitialState();
const initialAppState = useAppStore.getState();
const initialNavigationState = useNavigationStore.getState();

function workspace(id: string): WorkspaceInfo {
  return {
    id,
    name: id,
    path: `/workspaces/${id}`,
    open: true,
    runtime: { backend: 'host' },
    container: false,
    references: [],
    mounts: [],
    roots: [],
  };
}

describe('workspace clone action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.setState(initialState, true);
    workspaceBridge.create.mockResolvedValue(workspace('new-repo'));
    workspaceBridge.close.mockResolvedValue(undefined);
    Object.defineProperty(window, 'sero', {
      configurable: true,
      value: { workspace: workspaceBridge },
    });
  });

  afterEach(() => {
    useWorkspaceStore.setState(initialState, true);
    useAppStore.setState(initialAppState, true);
    useNavigationStore.setState(initialNavigationState, true);
    if (originalSeroDescriptor) {
      Object.defineProperty(window, 'sero', originalSeroDescriptor);
    } else {
      Reflect.deleteProperty(window, 'sero');
    }
  });

  it('requires an empty destination and restores the previous selection when import is skipped', async () => {
    const existing = workspace('existing');
    useWorkspaceStore.setState({
      workspaces: [existing],
      activeWorkspaceId: existing.id,
    });
    workflowMocks.connectOrigin.mockResolvedValue({
      ok: true,
      url: 'https://github.com/example/new-repo.git',
      updatedExisting: false,
      import: { imported: false, reason: 'workspace-not-empty' },
    });

    await expect(
      useWorkspaceStore.getState().cloneWorkspace('https://github.com/example/new-repo.git'),
    ).rejects.toThrow('Clone destination is not empty');

    expect(workspaceBridge.create).toHaveBeenCalledWith('new-repo', undefined, { requireEmpty: true });
    expect(workspaceBridge.close).toHaveBeenCalledWith('new-repo');
    expect(useWorkspaceStore.getState().workspaces).toEqual([existing]);
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe(existing.id);
  });

  it('rolls the temporary workspace back when the import throws', async () => {
    useWorkspaceStore.setState({ activeWorkspaceId: 'existing' });
    workflowMocks.connectOrigin.mockRejectedValue(new Error('runtime unavailable'));

    await expect(
      useWorkspaceStore.getState().cloneWorkspace('https://github.com/example/new-repo.git'),
    ).rejects.toThrow('runtime unavailable');

    expect(workspaceBridge.close).toHaveBeenCalledWith('new-repo');
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('existing');
  });

  it('records the move to a created workspace as a step in history', async () => {
    useWorkspaceStore.setState({ activeWorkspaceId: 'existing' });
    useAppStore.setState({
      ...initialAppState,
      activeApp: 'kanban',
      apps: [{ id: 'kanban', label: 'Kanban', icon: 'box', builtin: false, manifest: null }],
      appViewIds: { kanban: { 'new-repo': 'board/card-1' } },
    }, true);
    useNavigationStore.setState({
      entries: [{ appId: 'kanban', viewId: 'board/card-0', workspaceId: 'existing' }],
      index: 0,
    });

    await useWorkspaceStore.getState().createWorkspace('New Repo');

    // The active app stays open, so one Back must reach the page it left.
    expect(useNavigationStore.getState()).toMatchObject({
      entries: [
        { appId: 'kanban', viewId: 'board/card-0', workspaceId: 'existing' },
        { appId: 'kanban', viewId: 'board/card-1', workspaceId: 'new-repo' },
      ],
      index: 1,
    });
  });
});
