import { describe, expect, it, vi } from 'vitest';
import { handleAgentStreamEvent } from './agent-utils';
import type { AgentState } from './agent-types';

vi.mock('@/stores/container', () => ({
  useContainerStore: {
    getState: () => ({
      setStarting: vi.fn(),
      setRunning: vi.fn(),
      setError: vi.fn(),
    }),
  },
}));

vi.mock('@/stores/sessions', () => ({
  useSessionStore: {
    getState: () => ({
      updateSessionName: vi.fn(),
    }),
  },
}));

describe('handleAgentStreamEvent', () => {
  it('stores main-process composer prefills even before chat messages change', () => {
    let state: AgentState = {
      agents: {},
      composerPrefills: {},
      focusedSessionId: null,
      showThinkingBlocks: true,
      showMemoryBlocks: true,
      openSession: vi.fn(),
      closeSession: vi.fn(),
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

    const set = (updater: (current: AgentState) => AgentState | Partial<AgentState>) => {
      state = { ...state, ...updater(state) };
    };
    const get = () => state;

    handleAgentStreamEvent(
      {
        type: 'composer_prefill',
        sessionId: 'session-1',
        prefill: {
          requestId: 'prefill-1',
          text: 'Try again with more detail',
          source: 'turn-undo',
        },
      },
      set,
      get,
      vi.fn(),
    );

    expect(state.composerPrefills['session-1']).toEqual({
      requestId: 'prefill-1',
      text: 'Try again with more detail',
      source: 'turn-undo',
    });
  });

  it('appends a visible assistant message for runtime notices', () => {
    let state: AgentState = {
      agents: {
        'session-1': {
          sessionId: 'session-1',
          sessionPath: '/tmp/session-1.json',
          workspaceId: 'ws-1',
          messages: [],
          isStreaming: false,
          retry: null,
          error: null,
          commands: [],
          modelState: null,
        },
      },
      composerPrefills: {},
      focusedSessionId: 'session-1',
      showThinkingBlocks: true,
      showMemoryBlocks: true,
      openSession: vi.fn(),
      closeSession: vi.fn(),
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

    const set = (updater: (current: AgentState) => AgentState | Partial<AgentState>) => {
      state = { ...state, ...updater(state) };
    };
    const get = () => state;

    handleAgentStreamEvent(
      {
        type: 'runtime_notice',
        sessionId: 'session-1',
        workspaceId: 'ws-1',
        runtime: 'host',
        message: 'This session is continuing in host mode.',
      },
      set,
      get,
      vi.fn(),
    );

    expect(state.agents['session-1']?.messages).toHaveLength(1);
    expect(state.agents['session-1']?.messages[0]).toMatchObject({
      type: 'assistant',
      text: 'System notice: This session is continuing in host mode.',
      isStreaming: false,
    });
  });

  it('refreshes slash commands when session resources change', () => {
    let state: AgentState = {
      agents: {
        'session-1': {
          sessionId: 'session-1',
          sessionPath: '/tmp/session-1.json',
          workspaceId: 'ws-1',
          messages: [],
          isStreaming: false,
          retry: null,
          error: null,
          commands: [],
          modelState: null,
        },
      },
      composerPrefills: {},
      focusedSessionId: 'session-1',
      showThinkingBlocks: true,
      showMemoryBlocks: true,
      openSession: vi.fn(),
      closeSession: vi.fn(),
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
    const set = (updater: (current: AgentState) => AgentState | Partial<AgentState>) => {
      state = { ...state, ...updater(state) };
    };

    handleAgentStreamEvent(
      {
        type: 'resources_change',
        sessionId: 'session-1',
        commands: [{ name: 'migrate-agent-plugin', source: 'skill' }],
        state: {
          model: { provider: 'test', modelId: 'model', name: 'Model', reasoning: false },
          thinkingLevel: 'off',
          availableThinkingLevels: [],
          supportsXhigh: false,
          supportsMax: false,
          availableModels: [],
        },
      },
      set,
      () => state,
      vi.fn(),
    );

    expect(state.agents['session-1']?.commands).toEqual([
      { name: 'migrate-agent-plugin', source: 'skill' },
    ]);
    expect(state.agents['session-1']?.modelState?.model.name).toBe('Model');
  });

  it('clears live input state when a user abort cancels an in-flight tool', () => {
    let state: AgentState = {
      agents: {
        'session-1': {
          sessionId: 'session-1',
          sessionPath: '/tmp/session-1.json',
          workspaceId: 'ws-1',
          messages: [{
            type: 'tool' as const,
            id: 'tool-1',
            toolCallId: 'call-1',
            toolName: 'write',
            input: { path: 'a.ts', content: 'partial' },
            output: null,
            details: null,
            isError: false,
            state: 'pending' as const,
            isStreamingInput: true,
          }],
          isStreaming: true,
          retry: null,
          error: null,
          commands: [],
          modelState: null,
        },
      },
      composerPrefills: {},
      focusedSessionId: 'session-1',
      showThinkingBlocks: true,
      showMemoryBlocks: true,
      openSession: vi.fn(),
      closeSession: vi.fn(),
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
    const set = (updater: (current: AgentState) => AgentState | Partial<AgentState>) => {
      state = { ...state, ...updater(state) };
    };

    handleAgentStreamEvent(
      { type: 'agent_end', sessionId: 'session-1', outcome: 'cancelled' },
      set,
      () => state,
      vi.fn(),
    );

    expect(state.agents['session-1']?.messages[0]).toMatchObject({
      state: 'cancelled',
      isStreamingInput: false,
    });
  });
});
