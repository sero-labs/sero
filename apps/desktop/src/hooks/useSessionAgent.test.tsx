// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type { SeroSessionInfo, WorkspaceInfo } from '@/types/ipc';
import { useAgentStore } from '@/stores/agent';
import { useContainerStore } from '@/stores/container';
import { useSessionStore } from '@/stores/sessions';
import { useWorkspaceStore } from '@/stores/workspace';
import { useSessionAgent } from './useSessionAgent';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const initialAgentState = useAgentStore.getState();
const initialSessionState = useSessionStore.getState();
const initialWorkspaceState = useWorkspaceStore.getState();
const initialContainerState = useContainerStore.getState();

function createSession(overrides: Partial<SeroSessionInfo> = {}): SeroSessionInfo {
  return {
    id: 'session-1',
    path: '/tmp/session-1.jsonl',
    cwd: '/tmp/workspace-1',
    workspaceId: 'workspace-1',
    name: 'Session 1',
    created: '2026-04-12T00:00:00.000Z',
    modified: '2026-04-12T00:00:00.000Z',
    messageCount: 1,
    firstMessage: 'hello',
    ...overrides,
  };
}

function createWorkspace(overrides: Partial<WorkspaceInfo> = {}): WorkspaceInfo {
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
  return { ...workspace, ...overrides, runtime: overrides.runtime ?? workspace.runtime };
}

function Harness() {
  useSessionAgent();
  return null;
}

describe('useSessionAgent', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const ensureContainer = vi.fn(async () => null);
  const openSession = vi.fn(async () => {});
  const focusSession = vi.fn();
  const clearFocus = vi.fn();
  const loadSessions = vi.fn(async () => {});

  beforeEach(() => {
    vi.useFakeTimers();
    ensureContainer.mockClear();
    openSession.mockClear();
    focusSession.mockClear();
    clearFocus.mockClear();
    loadSessions.mockClear();

    useAgentStore.setState(initialAgentState, true);
    useSessionStore.setState(initialSessionState, true);
    useWorkspaceStore.setState(initialWorkspaceState, true);
    useContainerStore.setState(initialContainerState, true);

    Object.defineProperty(window, 'sero', {
      configurable: true,
      writable: true,
      value: {
        container: {
          ensure: ensureContainer,
        },
      } as unknown as typeof window.sero,
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
    useAgentStore.setState(initialAgentState, true);
    useSessionStore.setState(initialSessionState, true);
    useWorkspaceStore.setState(initialWorkspaceState, true);
    useContainerStore.setState(initialContainerState, true);
    await vi.runOnlyPendingTimersAsync();
    vi.useRealTimers();
  });

  it('does not resync the active session after idle-triggered session list refreshes', async () => {
    const initialSession = createSession();
    const refreshedSession = createSession({
      modified: '2026-04-12T00:05:00.000Z',
      name: 'Session 1 (renamed)',
    });

    loadSessions.mockImplementation(async () => {
      useSessionStore.setState({ sessions: [refreshedSession] });
    });

    useWorkspaceStore.setState({
      workspaces: [createWorkspace()],
      activeWorkspaceId: 'workspace-1',
    });
    useSessionStore.setState({
      sessions: [initialSession],
      activeSessionId: initialSession.id,
      loadSessions,
    });
    useAgentStore.setState({
      agents: {
        [initialSession.id]: {
          sessionId: initialSession.id,
          sessionPath: initialSession.path,
          workspaceId: initialSession.workspaceId,
          runtimeBackend: 'host',
          messages: [],
          isStreaming: true,
          error: null,
          commands: [],
          modelState: null,
        },
      },
      openSession,
      focusSession,
      clearFocus,
    });

    await act(async () => {
      root?.render(<Harness />);
    });

    await vi.waitFor(() => {
      expect(focusSession).toHaveBeenCalledTimes(1);
    });
    expect(openSession).not.toHaveBeenCalled();
    expect(ensureContainer).not.toHaveBeenCalled();

    await act(async () => {
      useAgentStore.setState((state) => ({
        agents: {
          ...state.agents,
          [initialSession.id]: {
            ...state.agents[initialSession.id],
            isStreaming: false,
          },
        },
      }));
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(220);
    });

    expect(loadSessions).toHaveBeenCalledTimes(1);
    expect(focusSession).toHaveBeenCalledTimes(1);
    expect(openSession).not.toHaveBeenCalled();
  });
});
