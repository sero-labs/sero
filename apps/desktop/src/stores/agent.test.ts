// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentStore } from './agent';
import type { ChatHistoryPage } from '@/types/ipc';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useAgentStore', () => {
  const initialState = useAgentStore.getState();
  const open = vi.fn<
    (sessionId: string, sessionPath: string, workspaceId: string) => Promise<ChatHistoryPage>
  >();
  const getCommands = vi.fn<() => Promise<[]>>();
  const getModelState = vi.fn<() => Promise<null>>();
  const prompt = vi.fn<
    (sessionId: string, text: string, attachments?: unknown, clientMessageId?: string) => Promise<void>
  >();

  beforeEach(() => {
    open.mockReset();
    getCommands.mockReset();
    getModelState.mockReset();
    prompt.mockReset();

    getCommands.mockResolvedValue([]);
    getModelState.mockResolvedValue(null);

    (window as Window & { sero: any }).sero = {
      agent: {
        open,
        getCommands,
        getModelState,
        prompt,
      },
    };

    useAgentStore.setState(initialState, true);
  });

  afterEach(() => {
    useAgentStore.setState(initialState, true);
  });

  it('waits for an in-flight open before a second caller prompts', async () => {
    const deferred = createDeferred<ChatHistoryPage>();
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

    deferred.resolve({ messages: [], olderCursor: null });

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
});
