// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type { SeroSessionInfo } from '@/types/ipc';
import { useAgentStore } from '@/stores/agent';
import { useSessionStore } from '@/stores/sessions';
import { useActiveSessionSync } from './useActiveSessionSync';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const initialAgentState = useAgentStore.getState();
const initialSessionState = useSessionStore.getState();

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

  const getState = vi.fn(async () => null);
  const openSession = vi.fn(async () => {});
  const focusSession = vi.fn();
  const clearFocus = vi.fn();
  const hydrateCollaborationState = vi.fn();

  beforeEach(() => {
    getState.mockClear();
    openSession.mockClear();
    focusSession.mockClear();
    clearFocus.mockClear();
    hydrateCollaborationState.mockClear();

    useAgentStore.setState(initialAgentState, true);
    useSessionStore.setState(initialSessionState, true);

    Object.defineProperty(window, 'sero', {
      configurable: true,
      writable: true,
      value: {
        collaboration: {
          prompt: vi.fn(async () => ({
            finalResponse: '',
            specialistOutputs: [],
            totalDurationMs: 0,
            hasErrors: false,
          })),
          getState,
          onEvent: vi.fn(() => () => {}),
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
  });

  it('does not resync when session list refreshes metadata for the active session', async () => {
    const session = createSession();

    useSessionStore.setState({
      sessions: [session],
      activeSessionId: session.id,
    });
    useAgentStore.setState({
      agents: {
        [session.id]: {
          sessionId: session.id,
          sessionPath: session.path,
          workspaceId: session.workspaceId,
          messages: [],
          isStreaming: false,
          error: null,
          commands: [],
          modelState: null,
        },
      },
      openSession,
      focusSession,
      clearFocus,
      hydrateCollaborationState,
    });

    await act(async () => {
      root?.render(<Harness />);
    });

    await vi.waitFor(() => {
      expect(getState).toHaveBeenCalledTimes(1);
    });
    expect(focusSession).toHaveBeenCalledTimes(1);
    expect(openSession).not.toHaveBeenCalled();
    expect(hydrateCollaborationState).toHaveBeenCalledTimes(1);

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

    expect(getState).toHaveBeenCalledTimes(1);
    expect(focusSession).toHaveBeenCalledTimes(1);
    expect(hydrateCollaborationState).toHaveBeenCalledTimes(1);
  });
});
