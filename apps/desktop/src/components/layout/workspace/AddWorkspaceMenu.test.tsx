// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppToolResult } from '@sero-ai/common';
import type { SeroAppManifest, WorkspaceInfo } from '@/types/ipc';
import { useSessionStore } from '@/stores/sessions';
import { useWorkspaceStore } from '@/stores/workspace';
import { useAppStore } from '@/stores/app';
import { AddWorkspaceMenu } from './AddWorkspaceMenu';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const initialAppState = useAppStore.getState();
const initialSessionState = useSessionStore.getState();
const initialWorkspaceState = useWorkspaceStore.getState();
const originalSeroDescriptor = Object.getOwnPropertyDescriptor(window, 'sero');
const seroBridge = {
  appAgent: {
    invokeTool: vi.fn(),
  },
  vcs: {
    remotes: vi.fn(),
  },
};

const createdWorkspace: WorkspaceInfo = {
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

const graphifyManifest: SeroAppManifest = {
  id: 'graphify',
  name: 'Graphify',
  description: null,
  version: '1.0.0',
  packageName: '@sero-ai/sero-graphify-plugin',
  icon: 'network',
  stateFile: '.sero/apps/graphify/state.json',
  scope: 'global',
  globalStatePath: '/tmp/graphify-state.json',
  uiEntry: null,
  runtimeEntry: null,
  component: null,
  devPort: undefined,
  remoteEntryOverride: null,
  packagePath: '/tmp/graphify',
  isPlugin: true,
  widgets: [],
  workspaceCreation: {
    label: 'Enable Graphify indexing',
    defaultEnabled: true,
    tool: 'graphify_index',
  },
};

function getButton(label: string): HTMLButtonElement {
  const button = [...document.querySelectorAll('button')]
    .find((candidate) => candidate.textContent?.trim() === label);
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Expected button "${label}"`);
  }
  return button;
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

async function setInputValue(input: HTMLInputElement, value: string): Promise<void> {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!valueSetter) throw new Error('Expected HTMLInputElement value setter');
  await act(async () => {
    valueSetter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function openCreateView(): Promise<void> {
  const trigger = document.querySelector('[title="Add workspace"]');
  if (!(trigger instanceof HTMLElement)) throw new Error('Expected add workspace trigger');
  await click(trigger);
  await click(getButton('Create New'));
  const input = document.querySelector('#new-workspace-name');
  if (!(input instanceof HTMLInputElement)) throw new Error('Expected workspace name input');
  await setInputValue(input, createdWorkspace.name);
}

describe('AddWorkspaceMenu', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    seroBridge.appAgent.invokeTool.mockReset();
    seroBridge.vcs.remotes.mockResolvedValue([]);
    Object.defineProperty(window, 'sero', {
      configurable: true,
      value: seroBridge,
    });
    useAppStore.setState({
      ...initialAppState,
      apps: [
        ...initialAppState.apps,
        {
          id: 'graphify',
          label: 'Graphify',
          icon: 'network',
          builtin: false,
          manifest: graphifyManifest,
        },
      ],
    }, true);
    useWorkspaceStore.setState({
      ...initialWorkspaceState,
      createWorkspace: vi.fn().mockResolvedValue(createdWorkspace),
    }, true);
    useSessionStore.setState({
      ...initialSessionState,
      loadSessions: vi.fn().mockResolvedValue(undefined),
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
    useAppStore.setState(initialAppState, true);
    useWorkspaceStore.setState(initialWorkspaceState, true);
    useSessionStore.setState(initialSessionState, true);
    if (originalSeroDescriptor) {
      Object.defineProperty(window, 'sero', originalSeroDescriptor);
    } else {
      Reflect.deleteProperty(window, 'sero');
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('restores contribution defaults after leaving the create view', async () => {
    await act(async () => {
      root?.render(<AddWorkspaceMenu />);
    });

    await openCreateView();

    const switchId = '#workspace-create-option-graphify';
    const option = document.querySelector(switchId);
    if (!(option instanceof HTMLButtonElement)) throw new Error('Expected Graphify option');
    expect(option.getAttribute('aria-checked')).toBe('true');

    await click(option);
    expect(option.getAttribute('aria-checked')).toBe('false');
    await click(getButton('Back'));
    await click(getButton('Create New'));

    expect(document.querySelector(switchId)?.getAttribute('aria-checked')).toBe('true');
  });

  it('opens the remote prompt before contribution setup finishes', async () => {
    const pendingTool = Promise.race<AppToolResult>([]);
    vi.spyOn(window.sero.appAgent, 'invokeTool').mockReturnValue(pendingTool);

    await act(async () => {
      root?.render(<AddWorkspaceMenu />);
    });
    await openCreateView();
    await click(getButton('Create'));

    expect(document.body.textContent).toContain('Git Repository');
  });

  it('shows a fulfilled contribution tool error', async () => {
    vi.spyOn(window.sero.appAgent, 'invokeTool').mockResolvedValue({
      text: 'State file is read-only',
      content: [],
      details: null,
      isError: true,
    });

    await act(async () => {
      root?.render(<AddWorkspaceMenu />);
    });
    await openCreateView();
    await click(getButton('Create'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(document.querySelector('[role="alert"]')?.textContent)
      .toContain('Graphify: State file is read-only');
  });
});
