// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceInfo } from '@/types/ipc';
import { useSessionStore } from '@/stores/sessions';
import { useWorkspaceStore } from '@/stores/workspace';
import { WorkspaceNode } from './WorkspaceNode';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const initialWorkspaceState = useWorkspaceStore.getState();
const initialSessionState = useSessionStore.getState();

function createWorkspace(overrides: Partial<WorkspaceInfo> = {}): WorkspaceInfo {
  return {
    id: 'workspace-1',
    name: 'Workspace 1',
    path: '/tmp/workspace-1',
    open: true,
    container: false,
    references: [],
    mounts: [],
    roots: [],
    ...overrides,
  };
}

describe('WorkspaceNode OpenShell actions', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    useWorkspaceStore.setState({
      ...initialWorkspaceState,
      workspaces: [],
      toggleCollapsed: vi.fn(),
      setActiveWorkspace: vi.fn(),
      closeWorkspace: vi.fn(async () => {}),
      toggleContainer: vi.fn(async () => {}),
    }, true);
    useSessionStore.setState({
      ...initialSessionState,
      createSession: vi.fn(async () => ({
        id: 'session-1',
        path: '/tmp/session-1.jsonl',
        cwd: '/tmp/workspace-1',
        workspaceId: 'workspace-1',
        created: '2026-05-05T00:00:00.000Z',
        modified: '2026-05-05T00:00:00.000Z',
        messageCount: 0,
        firstMessage: '',
      })),
      deleteSelectedSessions: vi.fn(async () => 0),
      clearSelection: vi.fn(),
      selectedSessionIds: new Set(),
    }, true);

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = null;
    container.remove();
    useWorkspaceStore.setState(initialWorkspaceState, true);
    useSessionStore.setState(initialSessionState, true);
  });

  it('renders the policy action only for OpenShell Local workspaces', async () => {
    const openShellWorkspace = createWorkspace({
      runtime: { providerId: 'openshell-local', policyProfileId: 'dev' },
    });
    useWorkspaceStore.setState({ workspaces: [openShellWorkspace] });

    await act(async () => {
      root?.render(<WorkspaceNode workspace={openShellWorkspace} sessions={[]} />);
    });

    expect(container.querySelector('[title="OpenShell policy: Dev"]')).not.toBeNull();
    expect(container.querySelector('[title="OpenShell Remote status"]')).toBeNull();

    const hostWorkspace = createWorkspace({ runtime: { providerId: 'host' } });

    await act(async () => {
      useWorkspaceStore.setState({ workspaces: [hostWorkspace] });
      root?.render(<WorkspaceNode workspace={hostWorkspace} sessions={[]} />);
    });

    expect(container.querySelector('[title^="OpenShell policy"]')).toBeNull();
    expect(container.querySelector('[title="OpenShell Remote status"]')).toBeNull();
  });

  it('renders a distinct remote status action only for OpenShell Remote workspaces', async () => {
    const remoteWorkspace = createWorkspace({
      runtime: { providerId: 'openshell-remote', gatewayName: 'sero-remote-dev' },
    });
    useWorkspaceStore.setState({ workspaces: [remoteWorkspace] });

    await act(async () => {
      root?.render(<WorkspaceNode workspace={remoteWorkspace} sessions={[]} />);
    });

    expect(container.querySelector('[title="OpenShell Remote status"]')).not.toBeNull();
    expect(container.querySelector('[title^="OpenShell policy"]')).toBeNull();
  });
});
