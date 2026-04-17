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
  it('appends a visible assistant message for runtime notices', () => {
    let state: AgentState = {
      agents: {
        'session-1': {
          sessionId: 'session-1',
          sessionPath: '/tmp/session-1.json',
          workspaceId: 'ws-1',
          messages: [],
          isStreaming: false,
          error: null,
          commands: [],
          modelState: null,
        },
      },
      focusedSessionId: 'session-1',
      showThinkingBlocks: true,
      showMemoryBlocks: true,
      collaborations: {},
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
      toggleCollaborationMode: vi.fn(),
      setCollaborationStrategy: vi.fn(),
      setDebateConfig: vi.fn(),
      sendCollaborationPrompt: vi.fn(),
      hydrateCollaborationState: vi.fn(),
      initEventListener: vi.fn(),
      initCollaborationListener: vi.fn(),
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
});
