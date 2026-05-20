// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TooltipProvider } from '@sero-ai/ui/components/ui/tooltip';
import type { WorkspaceInfo } from '@/types/ipc';
import { useContainerStore } from '@/stores/container';
import { useWorkspaceStore } from '@/stores/workspace';
import { WorkspaceReferencesMenu } from './WorkspaceReferencesMenu';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverMock implements ResizeObserver {
  disconnect() {}
  observe(_target: Element) {}
  unobserve(_target: Element) {}
}

globalThis.ResizeObserver = ResizeObserverMock;

const initialWorkspaceState = useWorkspaceStore.getState();
const initialContainerState = useContainerStore.getState();

const workspace: WorkspaceInfo = {
  id: 'workspace-1',
  name: 'Workspace 1',
  path: '/tmp/workspace-1',
  open: true,
  runtime: { backend: 'apple-container' },
  container: true,
  references: [],
  mounts: [],
  roots: [],
};

async function openMountMenu() {
  const trigger = document.querySelector('[title="Manage runtime mounts"]');
  if (!(trigger instanceof HTMLElement)) {
    throw new Error('Expected mount menu trigger');
  }

  await act(async () => {
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

async function showRuntimeMountsNotice() {
  const trigger = document.querySelector('[aria-label="Runtime mounts notice"]');
  if (!(trigger instanceof HTMLElement)) {
    throw new Error('Expected runtime mounts notice trigger');
  }

  await act(async () => {
    trigger.focus();
    trigger.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
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

  async function renderMenu(workspaceForRender = workspace) {
    await act(async () => {
      root?.render(
        <TooltipProvider delayDuration={0}>
          <WorkspaceReferencesMenu workspace={workspaceForRender} />
        </TooltipProvider>,
      );
    });
  }

  it('shows an explicit note when runtime mounts need recreation or repair', async () => {
    await renderMenu();

    await openMountMenu();

    expect(document.querySelector('[aria-label="Runtime mounts notice"]')).toBeTruthy();

    await showRuntimeMountsNotice();

    expect(document.body.textContent).toContain(
      'Sero restarts the container to apply changes. If work is running, changes apply next time it restarts.',
    );
  });

  it('shows a different note when the workspace is explicitly configured for Host', async () => {
    await renderMenu({ ...workspace, runtime: { backend: 'host' }, container: false });

    await openMountMenu();

    expect(document.querySelector('[aria-label="Runtime mounts notice"]')).toBeTruthy();

    await showRuntimeMountsNotice();

    expect(document.body.textContent).toContain(
      'References and folder mounts take effect after switching this workspace to Docker or Apple Container.',
    );
  });
});
