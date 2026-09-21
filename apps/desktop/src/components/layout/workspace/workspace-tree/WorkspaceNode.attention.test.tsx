// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TooltipProvider } from '@sero-ai/ui/components/ui/tooltip';
import type { ArchitectIndexView } from '@sero-ai/common';
import type { WorkspaceInfo } from '@/types/ipc';
import { useAgentBoardStore } from '@/stores/agent-board';
import { useAppStore } from '@/stores/app';
import { useContainerStore } from '@/stores/container';
import { useWorkspaceStore } from '@/stores/workspace';
import { WorkspaceNode } from './WorkspaceNode';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverMock implements ResizeObserver {
  disconnect() {}
  observe(_target: Element) {}
  unobserve(_target: Element) {}
}

globalThis.ResizeObserver = ResizeObserverMock;

const workspace: WorkspaceInfo = {
  id: 'workspace-1',
  name: 'Workspace 1',
  path: '/tmp/workspace-1',
  open: true,
  runtime: { backend: 'host' },
  container: false,
  references: [],
  mounts: [],
  roots: [],
};

const stoppedProject: ArchitectIndexView = {
  projects: [
    {
      id: 'p1',
      name: 'Sero docs',
      workspaceId: workspace.id,
      activity: {
        state: 'stopped',
        headline: 'Stopped by the spend cap',
        owner: 'No paid work can start until the cap is raised',
        action: 'Raise the cap',
      },
    },
  ],
};

const initialWorkspaceState = useWorkspaceStore.getState();
const initialContainerState = useContainerStore.getState();
const initialBoardState = useAgentBoardStore.getState();
const initialAppState = useAppStore.getState();

describe('the workspace row when work needs the user', () => {
  let containerEl: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    // The row's other controls read the bridge; the icon itself reads the store.
    window.sero = { platform: 'darwin', arch: 'arm64' } as never;
    useWorkspaceStore.setState({
      ...initialWorkspaceState,
      workspaces: [workspace],
      activeWorkspaceId: workspace.id,
    }, true);
    useContainerStore.setState({ ...initialContainerState, containers: {} }, true);
    useAgentBoardStore.setState({ ...initialBoardState, slices: {}, architect: null }, true);

    containerEl = document.createElement('div');
    document.body.appendChild(containerEl);
    root = createRoot(containerEl);
  });

  afterEach(async () => {
    if (root) await act(async () => { root?.unmount(); });
    root = null;
    containerEl.remove();
    useWorkspaceStore.setState(initialWorkspaceState, true);
    useContainerStore.setState(initialContainerState, true);
    useAgentBoardStore.setState(initialBoardState, true);
    useAppStore.setState(initialAppState, true);
  });

  async function renderNode() {
    await act(async () => {
      root?.render(
        <TooltipProvider delayDuration={0}>
          <WorkspaceNode workspace={workspace} sessions={[]} />
        </TooltipProvider>,
      );
    });
  }

  function icon(): HTMLElement | null {
    const found = containerEl.querySelector(`[data-testid="workspace-attention-${workspace.id}"]`);
    return found instanceof HTMLElement ? found : null;
  }

  it('shows no icon when nothing needs the user', async () => {
    await renderNode();
    expect(icon()).toBeNull();
  });

  it('shows one icon when a project in the workspace has stopped', async () => {
    useAgentBoardStore.setState({ architect: stoppedProject });
    await renderNode();

    expect(containerEl.querySelectorAll(`[data-testid="workspace-attention-${workspace.id}"]`)).toHaveLength(1);
    expect(icon()?.getAttribute('aria-label')).toBe('Sero docs: Stopped by the spend cap. Raise the cap.');
  });

  it('gives the reason to a keyboard user, in the Architect words', async () => {
    useAgentBoardStore.setState({ architect: stoppedProject });
    await renderNode();

    const target = icon();
    expect(target?.tabIndex).toBe(0);

    await act(async () => {
      target?.focus();
      target?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(document.body.textContent).toContain('Stopped by the spend cap. Raise the cap.');
  });

  it('opens the project page, not the projects list, and leaves the row alone', async () => {
    useAppStore.setState({
      apps: [{ id: 'architect', label: 'Architect', icon: 'box', builtin: true, manifest: null }],
      activeApp: 'explorer',
      pendingApp: null,
      appViewIds: {},
    });
    useAgentBoardStore.setState({ architect: stoppedProject });
    await renderNode();
    const expandedBefore = containerEl.innerHTML;

    await act(async () => { icon()?.click(); });

    expect(useAppStore.getState().activeApp).toBe('architect');
    expect(useAppStore.getState().appViewIds.architect?.global).toBe('projects/p1');
    expect(containerEl.innerHTML).toBe(expandedBefore);
  });

  it('cancels a switch to another app that is still loading', async () => {
    // Architect is showing and another plugin is loading. Its preload
    // activates only while it is still pending, so clearing it here is what
    // stops it landing after the project opens.
    useAppStore.setState({
      apps: [{ id: 'architect', label: 'Architect', icon: 'box', builtin: true, manifest: null }],
      activeApp: 'architect',
      pendingApp: 'explorer',
      appViewIds: {},
    });
    useAgentBoardStore.setState({ architect: stoppedProject });
    await renderNode();

    await act(async () => { icon()?.click(); });

    expect(useAppStore.getState().pendingApp).toBeNull();
    expect(useAppStore.getState().activeApp).toBe('architect');
    expect(useAppStore.getState().appViewIds.architect?.global).toBe('projects/p1');
  });
});
