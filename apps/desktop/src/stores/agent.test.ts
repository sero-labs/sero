// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CollaborationEvent,
  CollaborationStateSnapshot,
} from '@/types/collaboration';
import { useAgentStore } from './agent';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createSnapshot(
  overrides: Partial<CollaborationStateSnapshot> = {},
): CollaborationStateSnapshot {
  return {
    mode: false,
    strategy: 'standard',
    status: 'research',
    result: null,
    specialists: [],
    debate: null,
    debateConfig: { maxRounds: 1, timeLimitSec: 120 },
    pendingUserQuery: 'repeat question',
    error: null,
    ...overrides,
  };
}

describe('useAgentStore', () => {
  const initialState = useAgentStore.getState();
  const open = vi.fn<
    (sessionId: string, sessionPath: string, workspaceId: string) => Promise<[]>
  >();
  const getCommands = vi.fn<() => Promise<[]>>();
  const getModelState = vi.fn<() => Promise<null>>();
  const prompt = vi.fn<
    (sessionId: string, text: string, attachments?: unknown, clientMessageId?: string) => Promise<void>
  >();
  const collaborationPrompt = vi.fn<
    (sessionId: string, workspaceId: string, text: string, config?: unknown) => Promise<void>
  >();
  const onCollaborationEvent = vi.fn<
    (callback: (event: CollaborationEvent) => void) => () => void
  >();
  let collaborationListener: ((event: CollaborationEvent) => void) | null = null;

  beforeEach(() => {
    open.mockReset();
    getCommands.mockReset();
    getModelState.mockReset();
    prompt.mockReset();
    collaborationPrompt.mockReset();
    onCollaborationEvent.mockReset();
    collaborationListener = null;

    getCommands.mockResolvedValue([]);
    getModelState.mockResolvedValue(null);
    collaborationPrompt.mockResolvedValue();
    onCollaborationEvent.mockImplementation((callback) => {
      collaborationListener = callback;
      return () => {
        collaborationListener = null;
      };
    });

    (window as Window & { sero: any }).sero = {
      agent: {
        open,
        getCommands,
        getModelState,
        prompt,
      },
      collaboration: {
        prompt: collaborationPrompt,
        onEvent: onCollaborationEvent,
      },
    };

    useAgentStore.setState(initialState, true);
  });

  afterEach(() => {
    useAgentStore.setState(initialState, true);
  });

  it('waits for an in-flight open before a second caller prompts', async () => {
    const deferred = createDeferred<[]>();
    let openCompleted = false;

    open.mockImplementation(async () => {
      const history = await deferred.promise;
      openCompleted = true;
      return history;
    });

    prompt.mockImplementation(async () => {
      if (!openCompleted) {
        throw new Error('No active session: session-1');
      }
    });

    const firstOpen = useAgentStore.getState().openSession(
      'session-1',
      '/tmp/session-1.jsonl',
      'workspace-1',
    );

    await Promise.resolve();

    const promptAfterSecondOpen = (async () => {
      await useAgentStore.getState().openSession(
        'session-1',
        '/tmp/session-1.jsonl',
        'workspace-1',
      );
      await useAgentStore.getState().sendPrompt(
        'session-1',
        'Using the kanban tool: brainstorm',
      );
    })();

    await Promise.resolve();

    expect(open).toHaveBeenCalledTimes(1);
    expect(prompt).not.toHaveBeenCalled();

    deferred.resolve([]);

    await Promise.all([firstOpen, promptAfterSecondOpen]);

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(prompt).toHaveBeenCalledWith(
      'session-1',
      'Using the kanban tool: brainstorm',
      undefined,
      expect.any(String),
    );

    const agent = useAgentStore.getState().agents['session-1'];
    expect(agent?.error).toBeNull();
    expect(agent?.messages).toEqual([
      expect.objectContaining({
        type: 'user',
        text: 'Using the kanban tool: brainstorm',
      }),
    ]);
  });

  it('keeps pending collaboration queries in collaboration state instead of chat history', async () => {
    useAgentStore.setState((state) => ({
      ...state,
      focusedSessionId: 'session-1',
      agents: {
        'session-1': {
          sessionId: 'session-1',
          sessionPath: '/tmp/session-1.jsonl',
          workspaceId: 'workspace-1',
          messages: [
            { type: 'user', id: 'old-user', text: 'older question' },
          ],
          isStreaming: false,
          error: null,
          commands: [],
          modelState: null,
        },
      },
    }));

    await useAgentStore.getState().sendCollaborationPrompt('session-1', 'repeat question');

    const agent = useAgentStore.getState().agents['session-1'];
    expect(agent?.messages).toEqual([
      expect.objectContaining({ type: 'user', text: 'older question' }),
    ]);
    expect(agent?.isStreaming).toBe(true);
    expect(useAgentStore.getState().collaborations['session-1']?.pendingUserQuery).toBe(
      'repeat question',
    );
    expect(collaborationPrompt).toHaveBeenCalledWith(
      'session-1',
      'workspace-1',
      'repeat question',
      {
        strategy: 'standard',
        debate: undefined,
      },
    );
  });

  it('rehydrates collaboration snapshots without synthetic placeholder messages', () => {
    useAgentStore.setState((state) => ({
      ...state,
      focusedSessionId: 'session-1',
      agents: {
        'session-1': {
          sessionId: 'session-1',
          sessionPath: '/tmp/session-1.jsonl',
          workspaceId: 'workspace-1',
          messages: [
            { type: 'user', id: 'old-user', text: 'repeat question' },
            {
              type: 'assistant',
              id: 'old-assistant',
              text: 'Older answer',
              isStreaming: false,
            },
          ],
          isStreaming: false,
          error: null,
          commands: [],
          modelState: null,
        },
      },
    }));

    const snapshot = createSnapshot();
    useAgentStore.getState().hydrateCollaborationState('session-1', snapshot);
    useAgentStore.getState().hydrateCollaborationState('session-1', snapshot);

    const agent = useAgentStore.getState().agents['session-1'];
    expect(agent?.messages).toHaveLength(2);
    expect(useAgentStore.getState().collaborations['session-1']?.pendingUserQuery).toBe(
      'repeat question',
    );
  });

  it('drops pending collaboration queries once a completed snapshot arrives', () => {
    useAgentStore.setState((state) => ({
      ...state,
      focusedSessionId: 'session-1',
      agents: {
        'session-1': {
          sessionId: 'session-1',
          sessionPath: '/tmp/session-1.jsonl',
          workspaceId: 'workspace-1',
          messages: [],
          isStreaming: true,
          error: null,
          commands: [],
          modelState: null,
        },
      },
    }));

    useAgentStore.getState().hydrateCollaborationState(
      'session-1',
      createSnapshot({ status: 'complete', pendingUserQuery: null }),
    );

    expect(useAgentStore.getState().collaborations['session-1']?.pendingUserQuery).toBeNull();
  });

  it('restores collaboration errors from snapshots and live events', () => {
    useAgentStore.setState((state) => ({
      ...state,
      agents: {
        'session-1': {
          sessionId: 'session-1',
          sessionPath: '/tmp/session-1.jsonl',
          workspaceId: 'workspace-1',
          messages: [],
          isStreaming: true,
          error: null,
          commands: [],
          modelState: null,
        },
      },
    }));

    useAgentStore.getState().hydrateCollaborationState(
      'session-1',
      createSnapshot({ status: 'error', error: 'Persisted collaboration failure' }),
    );
    expect(useAgentStore.getState().agents['session-1']?.error).toBe(
      'Persisted collaboration failure',
    );

    const unsubscribe = useAgentStore.getState().initCollaborationListener();
    collaborationListener?.({
      type: 'collab_error',
      sessionId: 'session-1',
      error: 'Live collaboration failure',
    });

    const agent = useAgentStore.getState().agents['session-1'];
    expect(agent?.error).toBe('Live collaboration failure');
    expect(agent?.isStreaming).toBe(false);
    expect(useAgentStore.getState().collaborations['session-1']?.error).toBe(
      'Live collaboration failure',
    );

    unsubscribe();
  });
});
