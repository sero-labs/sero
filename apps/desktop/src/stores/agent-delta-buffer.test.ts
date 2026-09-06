// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleAgentStreamEvent, patchToolOutput } from './agent-utils';
import { drainDeltaBuffer } from './agent-delta-buffer';
import type { AgentState } from './agent-types';
import type { ChatMessage } from '@/types/ipc';

vi.mock('@/stores/container', () => ({
  useContainerStore: { getState: () => ({ setStarting: vi.fn(), setRunning: vi.fn(), setError: vi.fn() }) },
}));
vi.mock('@/stores/sessions', () => ({
  useSessionStore: { getState: () => ({ updateSessionName: vi.fn() }) },
}));

function createState(messages: ChatMessage[]): AgentState {
  return {
    agents: {
      'session-1': {
        sessionId: 'session-1',
        sessionPath: '/tmp/session-1.jsonl',
        workspaceId: 'ws-1',
        messages,
        olderCursor: null,
        loadingOlderTurns: false,
        isStreaming: true,
        retry: null,
        error: null,
        commands: [],
        modelState: null,
      },
    },
    composerPrefills: {},
    focusedSessionId: 'session-1',
    showThinkingBlocks: false,
    showMemoryBlocks: false,
    openSession: vi.fn(),
    closeSession: vi.fn(),
    loadOlderTurns: vi.fn(),
    sendPrompt: vi.fn(),
    steerAgent: vi.fn(),
    abort: vi.fn(),
    focusSession: vi.fn(),
    clearFocus: vi.fn(),
    reloadResources: vi.fn(),
    setModel: vi.fn(),
    setThinkingLevel: vi.fn(),
    fetchModelState: vi.fn(),
    toggleThinkingBlocks: vi.fn(),
    toggleMemoryBlocks: vi.fn(),
    setComposerPrefill: vi.fn(),
    clearComposerPrefill: vi.fn(),
    initEventListener: vi.fn(),
  };
}

const runningTool: ChatMessage = {
  type: 'tool',
  id: 'tool-1',
  toolCallId: 'call-1',
  toolName: 'bash',
  input: { command: 'yes' },
  output: null,
  isError: false,
  state: 'running',
};

describe('tool output batching', () => {
  let frame: (() => void) | null = null;

  beforeEach(() => {
    frame = null;
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
      frame = callback;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => { frame = null; });
    drainDeltaBuffer();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('collapses a burst of tool_update events into one store update with the newest output', () => {
    let state = createState([{ type: 'user', id: 'u1', text: 'run it' }, runningTool]);
    const set = vi.fn((updater: (current: AgentState) => AgentState | Partial<AgentState>) => {
      state = { ...state, ...updater(state) };
    });
    const flush = () => {
      const { toolOutput } = drainDeltaBuffer();
      for (const [sessionId, updates] of toolOutput) {
        for (const [toolCallId, update] of updates) {
          set((current) => ({
            agents: {
              ...current.agents,
              [sessionId]: {
                ...current.agents[sessionId],
                messages: patchToolOutput(current.agents[sessionId].messages, toolCallId, update),
              },
            },
          }));
        }
      }
    };

    for (let line = 1; line <= 2000; line += 1) {
      handleAgentStreamEvent(
        { type: 'tool_update', sessionId: 'session-1', toolCallId: 'call-1', output: `lines so far: ${line}` },
        set,
        () => state,
        flush,
      );
    }

    expect(set).not.toHaveBeenCalled();
    expect(frame).not.toBeNull();
    frame?.();
    expect(set).toHaveBeenCalledTimes(1);
    expect(state.agents['session-1'].messages[1]).toMatchObject({
      output: 'lines so far: 2000',
      state: 'running',
      isPartialOutput: true,
    });
  });

  it('drops a buffered partial output once the final tool result arrives', () => {
    let state = createState([runningTool]);
    const set = vi.fn((updater: (current: AgentState) => AgentState | Partial<AgentState>) => {
      state = { ...state, ...updater(state) };
    });

    handleAgentStreamEvent(
      { type: 'tool_update', sessionId: 'session-1', toolCallId: 'call-1', output: 'partial' },
      set,
      () => state,
      vi.fn(),
    );
    handleAgentStreamEvent(
      { type: 'tool_end', sessionId: 'session-1', toolCallId: 'call-1', output: 'final', isError: false },
      set,
      () => state,
      vi.fn(),
    );

    expect(drainDeltaBuffer().toolOutput.get('session-1')?.size ?? 0).toBe(0);
    expect(state.agents['session-1'].messages[0]).toMatchObject({ output: 'final', state: 'completed' });
  });

  it('keeps every other message by reference when patching the streaming one', () => {
    const settled: ChatMessage = { type: 'assistant', id: 'a0', text: 'done', isStreaming: false };
    const messages: ChatMessage[] = [settled, runningTool];

    const next = patchToolOutput(messages, 'call-1', { output: 'more' });

    expect(next).not.toBe(messages);
    expect(next[0]).toBe(settled);
    expect(next[1]).not.toBe(runningTool);
  });
});
