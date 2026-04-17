// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WorkspaceInfo } from '@/types/ipc';
import { useContainerStore } from '@/stores/container';
import { useWorkspaceStore } from '@/stores/workspace';
import { WorkspaceReferencesMenu } from './WorkspaceReferencesMenu';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const initialWorkspaceState = useWorkspaceStore.getState();
const initialContainerState = useContainerStore.getState();

const workspace: WorkspaceInfo = {
  id: 'workspace-1',
  name: 'Workspace 1',
  path: '/tmp/workspace-1',
  open: true,
  container: true,
  references: [],
  mounts: [],
  roots: [],
};

async function openMountMenu() {
  const trigger = document.querySelector('[title="Manage container mounts"]');
  if (!(trigger instanceof HTMLElement)) {
    throw new Error('Expected mount menu trigger');
  }

  await act(async () => {
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('WorkspaceReferencesMenu', () => {
  let containerEl: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    useWorkspaceStore.setState({
      ...initialWorkspaceState,
      workspaces: [workspace],
      activeWorkspaceId: workspace.id,
    }, true);
    useContainerStore.setState({
      ...initialContainerState,
      containers: {
        [workspace.id]: { status: 'stopped' },
      },
    }, true);

    containerEl = document.createElement('div');
    document.body.appendChild(containerEl);
    root = createRoot(containerEl);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = null;
    containerEl.remove();
    useWorkspaceStore.setState(initialWorkspaceState, true);
    useContainerStore.setState(initialContainerState, true);
  });

  it('shows an explicit fallback note when a container workspace is temporarily on the host', async () => {
    await act(async () => {
      root?.render(<WorkspaceReferencesMenu workspace={workspace} />);
    });

    await openMountMenu();

    expect(document.body.textContent).toContain('Container mounts are a container-only feature.');
    expect(document.body.textContent).toContain('will not take effect until its container is healthy again');
  });

  it('shows a different note when the workspace is explicitly configured for host mode', async () => {
    await act(async () => {
      root?.render(<WorkspaceReferencesMenu workspace={{ ...workspace, container: false }} />);
    });

    await openMountMenu();

    expect(document.body.textContent).toContain('Container mounts are a container-only feature.');
    expect(document.body.textContent).toContain('explicitly set to host mode');
    expect(document.body.textContent).toContain('until container mode is re-enabled');
  });
});
