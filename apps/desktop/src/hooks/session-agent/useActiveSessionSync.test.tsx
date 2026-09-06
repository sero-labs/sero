// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type { SeroSessionInfo } from '@/types/ipc';
import { useAgentStore } from '@/stores/agent';
import { useSessionStore } from '@/stores/sessions';
import { useWorkspaceStore } from '@/stores/workspace';
import { useActiveSessionSync } from './useActiveSessionSync';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const initialAgentState = useAgentStore.getState();
const initialSessionState = useSessionStore.getState();
const initialWorkspaceState = useWorkspaceStore.getState();

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

function Harness() {
  useActiveSessionSync();
  return null;
}

describe('useActiveSessionSync', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const openSession = vi.fn(async () => {});
  const focusSession = vi.fn();
  const clearFocus = vi.fn();

  beforeEach(() => {
    openSession.mockClear();
    focusSession.mockClear();
    clearFocus.mockClear();

    useAgentStore.setState(initialAgentState, true);
    useSessionStore.setState(initialSessionState, true);
    useWorkspaceStore.setState(initialWorkspaceState, true);

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
    useAgentStore.setState(initialAgentState, true);
    useSessionStore.setState(initialSessionState, true);
    useWorkspaceStore.setState(initialWorkspaceState, true);
  });

  it('does not resync when session list refreshes metadata for the active session', async () => {
    const session = createSession();

    useSessionStore.setState({
      sessions: [session],
      activeSessionId: session.id,
    });
    useWorkspaceStore.setState({
      workspaces: [{
        id: session.workspaceId,
        name: 'Workspace 1',
        path: session.cwd,
        open: true,
        container: false,
        runtime: { backend: 'host' },
        references: [],
        mounts: [],
        roots: [],
      }],
    });
    useAgentStore.setState({
      agents: {
        [session.id]: {
          sessionId: session.id,
          sessionPath: session.path,
          workspaceId: session.workspaceId,
          runtimeBackend: 'host',
          messages: [],
          olderCursor: null,
          loadingOlderTurns: false,
          isStreaming: false,
          retry: null,
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

    await act(async () => {
      useSessionStore.setState({
        sessions: [
          createSession({
            modified: '2026-04-12T00:05:00.000Z',
            name: 'Session 1 (renamed)',
          }),
        ],
      });
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(focusSession).toHaveBeenCalledTimes(1);
    expect(openSession).not.toHaveBeenCalled();
  });

  it('reopens the active session when the workspace runtime backend changes', async () => {
    const session = createSession();

    useSessionStore.setState({
      sessions: [session],
      activeSessionId: session.id,
    });
    useWorkspaceStore.setState({
      workspaces: [{
        id: session.workspaceId,
        name: 'Workspace 1',
        path: session.cwd,
        open: true,
        container: false,
        runtime: { backend: 'host' },
        references: [],
        mounts: [],
        roots: [],
      }],
    });
    useAgentStore.setState({
      agents: {
        [session.id]: {
          sessionId: session.id,
          sessionPath: session.path,
          workspaceId: session.workspaceId,
          runtimeBackend: 'host',
          messages: [],
          olderCursor: null,
          loadingOlderTurns: false,
          isStreaming: false,
          retry: null,
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

    await act(async () => {
      useWorkspaceStore.setState({
        workspaces: [{
          id: session.workspaceId,
          name: 'Workspace 1',
          path: session.cwd,
          open: true,
          container: true,
          runtime: { backend: 'apple-container' },
          references: [],
          mounts: [],
          roots: [],
        }],
      });
    });

    await vi.waitFor(() => {
      expect(openSession).toHaveBeenCalledWith(
        session.id,
        session.path,
        session.workspaceId,
        'apple-container',
      );
    });
  });
});
