// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SeroSessionInfo, WorkspaceInfo } from '@/types/ipc';
import { useAgentStore } from '@/stores/agent';
import { useAppStore } from '@/stores/app';
import { useSessionStore } from '@/stores/sessions';
import { useWorkspaceStore } from '@/stores/workspace';
import { useWorkspaceTreeRuntime } from './useWorkspaceTreeRuntime';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const initialWorkspaceState = useWorkspaceStore.getState();
const initialSessionState = useSessionStore.getState();
const initialAppState = useAppStore.getState();
const initialAgentState = useAgentStore.getState();

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

function createSession(overrides: Partial<SeroSessionInfo> = {}): SeroSessionInfo {
  return {
    id: 'session-1',
    path: '/tmp/session-1.jsonl',
    cwd: '/tmp/workspace-1',
    workspaceId: 'workspace-1',
    name: 'Session 1',
    created: '2026-04-14T00:00:00.000Z',
    modified: '2026-04-14T00:00:00.000Z',
    messageCount: 1,
    firstMessage: 'hello',
    ...overrides,
  };
}

function Harness() {
  useWorkspaceTreeRuntime();
  return null;
}

describe('useWorkspaceTreeRuntime', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const loadWorkspaces = vi.fn(async () => {});
  const loadSessions = vi.fn(async () => {});
  const clearSelection = vi.fn();
  const setActiveSession = vi.fn();
  const setChatPanelOpen = vi.fn();
  const openSession = vi.fn(async () => {});
  const openWorkspace = vi.fn(async () => {});

  beforeEach(() => {
    loadWorkspaces.mockClear();
    loadSessions.mockClear();
    clearSelection.mockClear();
    setActiveSession.mockClear();
    setChatPanelOpen.mockClear();
    openSession.mockClear();
    openWorkspace.mockClear();

    useWorkspaceStore.setState(initialWorkspaceState, true);
    useSessionStore.setState(initialSessionState, true);
    useAppStore.setState(initialAppState, true);
    useAgentStore.setState(initialAgentState, true);

    useWorkspaceStore.setState({
      workspaces: [createWorkspace()],
      loadWorkspaces,
      isLoading: false,
    });
    useSessionStore.setState({
      sessions: [createSession()],
      loadSessions,
      clearSelection,
      setActiveSession,
      selectedSessionIds: new Set(),
    });
    useAppStore.setState({ setChatPanelOpen });
    useAgentStore.setState({ openSession });

    Object.defineProperty(window, 'sero', {
      configurable: true,
      writable: true,
      value: {
        workspace: {
          open: openWorkspace,
        },
      },
    });

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
    Reflect.deleteProperty(window, 'sero');
    useWorkspaceStore.setState(initialWorkspaceState, true);
    useSessionStore.setState(initialSessionState, true);
    useAppStore.setState(initialAppState, true);
    useAgentStore.setState(initialAgentState, true);
  });

  it('loads on mount and refreshes when the workspace list changes', async () => {
    await act(async () => {
      root?.render(<Harness />);
    });

    expect(loadWorkspaces).toHaveBeenCalledTimes(1);
    expect(loadSessions).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event('sero:workspace-changed'));
      await Promise.resolve();
    });

    expect(loadWorkspaces).toHaveBeenCalledTimes(2);
    expect(loadSessions).toHaveBeenCalledTimes(2);
  });

  it('clears selection on Escape when sessions are selected', async () => {
    useSessionStore.setState({ selectedSessionIds: new Set(['session-1']) });

    await act(async () => {
      root?.render(<Harness />);
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(clearSelection).toHaveBeenCalledTimes(1);
  });

  it('opens the workspace, focuses the session, and opens chat on open-session events', async () => {
    await act(async () => {
      root?.render(<Harness />);
    });

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('sero:open-session', {
          detail: {
            sessionId: 'session-1',
            sessionPath: '/tmp/session-1.jsonl',
            workspaceId: 'workspace-1',
          },
        }),
      );
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(openWorkspace).toHaveBeenCalledWith('workspace-1');
      expect(openSession).toHaveBeenCalledWith('session-1', '/tmp/session-1.jsonl', 'workspace-1');
      expect(setActiveSession).toHaveBeenCalledWith('session-1');
      expect(setChatPanelOpen).toHaveBeenCalledWith(true);
    });
  });
});
