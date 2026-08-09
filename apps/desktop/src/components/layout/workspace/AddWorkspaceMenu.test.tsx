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
    connectRemote: vi.fn(),
  },
  workspace: {
    pickFolder: vi.fn(),
  },
};

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

// The test runtime supports ES2024 Promise.withResolvers, but the renderer
// TypeScript library target does not declare it yet.
const promiseRuntime = Promise as PromiseConstructor & {
  withResolvers<T>(): Deferred<T>;
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

const secondWorkspace: WorkspaceInfo = {
  ...createdWorkspace,
  id: 'workspace-2',
  name: 'Workspace 2',
  path: '/tmp/workspace-2',
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

function getButtonContaining(text: string): HTMLButtonElement {
  const button = [...document.querySelectorAll('button')]
    .find((candidate) => candidate.textContent?.includes(text));
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Expected button containing "${text}"`);
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

async function openWorkspacePicker(): Promise<void> {
  const trigger = document.querySelector('[title="Add workspace"]');
  if (!(trigger instanceof HTMLElement)) throw new Error('Expected add workspace trigger');
  await click(trigger);
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
    seroBridge.vcs.connectRemote.mockResolvedValue({
      ok: true,
      url: 'https://github.com/sero-labs/sero.git',
      updatedExisting: false,
      import: { imported: true },
    });
    seroBridge.workspace.pickFolder.mockReset();
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
      cloneWorkspace: vi.fn().mockResolvedValue(createdWorkspace),
      addFolder: vi.fn().mockResolvedValue(createdWorkspace),
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

  async function renderMenu(): Promise<void> {
    const mountedRoot = root;
    if (!mountedRoot) throw new Error('Expected mounted test root');
    await act(async () => {
      mountedRoot.render(<AddWorkspaceMenu />);
    });
  }

  it('restores contribution defaults after leaving the create view', async () => {
    await renderMenu();

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

  it('waits to run contribution setup until the remote prompt finishes', async () => {
    vi.spyOn(window.sero.appAgent, 'invokeTool').mockResolvedValue({
      text: 'Queued',
      content: [],
      details: null,
      isError: false,
    });

    await renderMenu();
    await openCreateView();
    await click(getButton('Create'));

    expect(document.body.textContent).toContain('Git Repository');
    expect(window.sero.appAgent.invokeTool).not.toHaveBeenCalled();

    await click(getButton('Close'));
    expect(window.sero.appAgent.invokeTool).toHaveBeenCalledOnce();
  });

  it('shows a fulfilled contribution tool error', async () => {
    vi.spyOn(window.sero.appAgent, 'invokeTool').mockResolvedValue({
      text: 'State file is read-only',
      content: [],
      details: null,
      isError: true,
    });

    await renderMenu();
    await openCreateView();
    await click(getButton('Create'));
    await click(getButton('Close'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(document.querySelector('[role="alert"]')?.textContent)
      .toContain('Graphify: State file is read-only');
  });

  it('shows a contribution failure after the remote prompt closes', async () => {
    const { promise, resolve } = promiseRuntime.withResolvers<AppToolResult>();
    vi.spyOn(window.sero.appAgent, 'invokeTool').mockReturnValue(promise);

    await renderMenu();
    await openCreateView();
    await click(getButton('Create'));
    await click(getButton('Close'));
    await act(async () => {
      resolve({
        text: 'State file is read-only',
        content: [],
        details: null,
        isError: true,
      });
      await promise;
    });

    expect(document.body.textContent).toContain('Workspace setup failed');
    expect(document.querySelector('[role="alert"]')?.textContent)
      .toContain('Graphify: State file is read-only');
    expect(document.querySelector('[role="alert"]')?.classList.contains('fixed')).toBe(true);
  });

  it('keeps the remote form open when contribution setup fails', async () => {
    const { promise, resolve } = promiseRuntime.withResolvers<AppToolResult>();
    vi.spyOn(window.sero.appAgent, 'invokeTool').mockReturnValue(promise);

    await renderMenu();
    await openCreateView();
    await click(getButton('Create'));
    await act(async () => {
      await vi.waitFor(() => {
        expect(document.body.textContent).toContain('Connect existing repository');
      });
    });
    await click(getButtonContaining('Connect existing repository'));
    const remoteUrl = document.querySelector('#remote-url');
    if (!(remoteUrl instanceof HTMLInputElement)) throw new Error('Expected remote URL input');
    expect(window.sero.appAgent.invokeTool).not.toHaveBeenCalled();
    await setInputValue(remoteUrl, 'https://github.com/sero-labs/sero.git');
    await click(getButton('Connect Repository'));
    expect(window.sero.appAgent.invokeTool).toHaveBeenCalledOnce();

    await act(async () => {
      resolve({
        text: 'State file is read-only',
        content: [],
        details: null,
        isError: true,
      });
      await promise;
    });

    expect(document.body.textContent).toContain('Git Repository');
    expect(document.querySelector('[role="alert"]')?.textContent)
      .toContain('Graphify: State file is read-only');
    const dialog = document.querySelector('[role="dialog"]');
    const alert = document.querySelector('[role="alert"]');
    expect(dialog?.contains(alert)).toBe(true);
    expect(alert?.classList.contains('fixed')).toBe(false);
    await click(getButton('Dismiss'));
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows the current remote prompt while an earlier setup failure remains', async () => {
    vi.spyOn(window.sero.appAgent, 'invokeTool').mockResolvedValue({
      text: 'First setup failed',
      content: [],
      details: null,
      isError: true,
    });
    useWorkspaceStore.setState({
      createWorkspace: vi.fn()
        .mockResolvedValueOnce(createdWorkspace)
        .mockResolvedValueOnce(secondWorkspace),
    });

    await renderMenu();
    await openCreateView();
    await click(getButton('Create'));
    await click(getButton('Close'));
    await vi.waitFor(() => {
      expect(document.querySelector('[role="alert"]')?.textContent)
        .toContain('Graphify: First setup failed');
    });

    await openWorkspacePicker();
    await click(getButton('Create New'));
    const nameInput = document.querySelector('#new-workspace-name');
    if (!(nameInput instanceof HTMLInputElement)) throw new Error('Expected workspace name input');
    await setInputValue(nameInput, secondWorkspace.name);
    await click(getButton('Create'));

    expect(document.body.textContent).toContain('Link "Workspace 2" to a Git repository.');
    expect(document.querySelector('[role="alert"]')?.textContent)
      .toContain('Graphify: First setup failed');
  });

  it('runs enabled contributions after cloning a workspace', async () => {
    const cloneWorkspace = vi.fn().mockResolvedValue(createdWorkspace);
    useWorkspaceStore.setState({ cloneWorkspace });
    vi.spyOn(window.sero.appAgent, 'invokeTool').mockResolvedValue({
      text: 'Queued',
      content: [],
      details: null,
      isError: false,
    });

    await renderMenu();
    await openWorkspacePicker();
    await click(getButton('Clone Repository'));
    expect(document.querySelector('#workspace-create-option-graphify')).not.toBeNull();
    const cloneUrl = document.querySelector('#clone-url');
    if (!(cloneUrl instanceof HTMLInputElement)) throw new Error('Expected clone URL input');
    await setInputValue(cloneUrl, 'https://github.com/sero-labs/sero.git');
    await click(getButton('Clone'));

    expect(cloneWorkspace).toHaveBeenCalled();
    expect(window.sero.appAgent.invokeTool).toHaveBeenCalledWith(
      'graphify',
      createdWorkspace.id,
      'graphify_index',
      expect.objectContaining({
        workspaceId: createdWorkspace.id,
        workspaceName: createdWorkspace.name,
        workspacePath: createdWorkspace.path,
      }),
    );
  });

  it('runs enabled contributions after importing a workspace', async () => {
    const addFolder = vi.fn().mockResolvedValue(createdWorkspace);
    useWorkspaceStore.setState({ addFolder });
    seroBridge.workspace.pickFolder.mockResolvedValue(createdWorkspace.path);
    vi.spyOn(window.sero.appAgent, 'invokeTool').mockResolvedValue({
      text: 'Queued',
      content: [],
      details: null,
      isError: false,
    });

    await renderMenu();
    await openWorkspacePicker();
    await click(getButton('Import Existing'));
    expect(document.querySelector('#workspace-create-option-graphify')).not.toBeNull();
    await click(getButton('Choose Folder'));

    expect(addFolder).toHaveBeenCalledWith(createdWorkspace.path);
    expect(window.sero.appAgent.invokeTool).toHaveBeenCalledWith(
      'graphify',
      createdWorkspace.id,
      'graphify_index',
      expect.objectContaining({
        workspaceId: createdWorkspace.id,
        workspaceName: createdWorkspace.name,
        workspacePath: createdWorkspace.path,
      }),
    );
  });

  it('imports directly without options and shows folder errors', async () => {
    const addFolder = vi.fn().mockRejectedValue(new Error('Folder is unavailable'));
    useAppStore.setState({ ...initialAppState, apps: [] }, true);
    useWorkspaceStore.setState({ addFolder });
    seroBridge.workspace.pickFolder.mockResolvedValue('/tmp/unavailable');

    await renderMenu();
    await openWorkspacePicker();
    await click(getButton('Import Existing'));

    await vi.waitFor(() => expect(addFolder).toHaveBeenCalledWith('/tmp/unavailable'));
    expect(document.body.textContent).toContain('Folder is unavailable');
  });

  it('keeps setup failures for each workspace until dismissed', async () => {
    const first = promiseRuntime.withResolvers<AppToolResult>();
    const second = promiseRuntime.withResolvers<AppToolResult>();
    vi.spyOn(window.sero.appAgent, 'invokeTool')
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    useWorkspaceStore.setState({
      createWorkspace: vi.fn()
        .mockResolvedValueOnce(createdWorkspace)
        .mockResolvedValueOnce(secondWorkspace),
    });

    await renderMenu();
    await openCreateView();
    await click(getButton('Create'));
    await click(getButton('Close'));
    const trigger = document.querySelector('[title="Add workspace"]');
    if (!(trigger instanceof HTMLElement)) throw new Error('Expected add workspace trigger');
    await click(trigger);
    await click(getButton('Create New'));
    const secondNameInput = document.querySelector('#new-workspace-name');
    if (!(secondNameInput instanceof HTMLInputElement)) throw new Error('Expected workspace name input');
    await setInputValue(secondNameInput, secondWorkspace.name);
    await click(getButton('Create'));
    await click(getButton('Close'));

    await act(async () => {
      first.resolve({
        text: 'First setup failed',
        content: [],
        details: null,
        isError: true,
      });
      await first.promise;
    });
    await act(async () => {
      second.resolve({
        text: 'Second setup failed',
        content: [],
        details: null,
        isError: true,
      });
      await second.promise;
    });

    expect(document.querySelector('[role="alert"]')?.textContent)
      .toContain('Graphify: First setup failed');
    await click(getButton('Dismiss'));
    expect(document.querySelector('[role="alert"]')?.textContent)
      .toContain('Graphify: Second setup failed');
  });
});
