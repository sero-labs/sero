// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TooltipProvider } from '@sero-ai/ui/components/ui/tooltip';
import type { WorkspaceInfo } from '@/types/ipc';
import { useAppStore, type AppEntry } from '@/stores/app';
import { useNavigationStore } from '@/stores/navigation';
import { useWorkspaceStore } from '@/stores/workspace';
import { NavButtons } from './NavButtons';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createApp(id: string, label: string, builtin = false): AppEntry {
  return { id, label, icon: 'box', builtin, manifest: null };
}

function workspace(id: string, name: string): WorkspaceInfo {
  return {
    id,
    name,
    path: `/${id}`,
    open: true,
    runtime: { backend: 'host' },
    container: false,
    references: [],
    mounts: [],
    roots: [],
  };
}

const initialAppState = useAppStore.getState();
const initialNavigationState = useNavigationStore.getState();
const initialWorkspaceState = useWorkspaceStore.getState();

describe('the Back and Forward labels', () => {
  let containerEl: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    useAppStore.setState({
      ...initialAppState,
      apps: [
        createApp('architect', 'Architect', true),
        createApp('orchestrator', 'Sero Orchestrator'),
      ],
    }, true);
    useWorkspaceStore.setState({
      ...initialWorkspaceState,
      workspaces: [
        workspace('ws-dungeon', 'DungeonExplorer'),
        workspace('ws-frogger', 'FroggerNeon'),
        workspace('ws-reading', 'reading-tracker-resilience-01'),
      ],
      activeWorkspaceId: 'ws-dungeon',
    }, true);
    containerEl = document.createElement('div');
    document.body.appendChild(containerEl);
    root = createRoot(containerEl);
  });

  afterEach(async () => {
    if (root) await act(async () => { root?.unmount(); });
    root = null;
    containerEl.remove();
    useAppStore.setState(initialAppState, true);
    useNavigationStore.setState(initialNavigationState, true);
    useWorkspaceStore.setState(initialWorkspaceState, true);
  });

  async function renderButtons() {
    await act(async () => {
      root?.render(
        <TooltipProvider delayDuration={0}>
          <NavButtons />
        </TooltipProvider>,
      );
    });
  }

  const backLabel = () => containerEl.querySelector('button[aria-label^="Back"]')?.getAttribute('aria-label');
  const forwardLabel = () => containerEl.querySelector('button[aria-label^="Forward"]')?.getAttribute('aria-label');

  it('names the active workspace when Back reaches a global app', async () => {
    useNavigationStore.setState({
      entries: [
        { appId: 'architect' },
        { appId: 'orchestrator', workspaceId: 'ws-dungeon' },
      ],
      index: 1,
    });

    await renderButtons();

    expect(backLabel()).toBe('Back to Architect · DungeonExplorer');
  });

  it('names the other workspace when Back crosses into it', async () => {
    useWorkspaceStore.setState({ activeWorkspaceId: 'ws-reading' });
    useNavigationStore.setState({
      entries: [
        { appId: 'orchestrator', workspaceId: 'ws-frogger' },
        { appId: 'orchestrator', workspaceId: 'ws-reading', viewId: 'workflows/loop-1' },
      ],
      index: 1,
    });

    await renderButtons();

    expect(backLabel()).toBe('Back to Sero Orchestrator · FroggerNeon');
  });

  it('names the workspace Back stays in', async () => {
    useNavigationStore.setState({
      entries: [
        { appId: 'architect' },
        { appId: 'orchestrator', workspaceId: 'ws-dungeon', viewId: 'workflows/loop-1' },
        { appId: 'orchestrator', workspaceId: 'ws-dungeon', viewId: 'workflows/loop-2' },
      ],
      index: 2,
    });

    await renderButtons();

    expect(backLabel()).toBe('Back to Sero Orchestrator · DungeonExplorer');
    // Forward reaches the global Architect app, which names no workspace.
    expect(forwardLabel()).toBe('Forward');
  });
});
