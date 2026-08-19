import { beforeEach, describe, expect, it } from 'vitest';
import type { AgentInstance, AgentState } from '@/stores/agent-types';
import type { ChatMessage, ChatToolCallMessage } from '@/types/ipc';
import { useWorkspaceStore } from '@/stores/workspace';
import { selectStreamingWriteContent } from '@/stores/streaming-writes';

function streamingWrite(overrides: Partial<ChatToolCallMessage> = {}): ChatMessage {
  return {
    type: 'tool',
    id: 'msg-1',
    toolCallId: 'sk-1',
    toolName: 'write',
    input: { path: '/home/me/proj/src/a.ts', content: 'const a = 1;' },
    output: null,
    details: null,
    isError: false,
    state: 'pending',
    isStreamingInput: true,
    ...overrides,
  };
}

function agentState(agent: Partial<AgentInstance>): AgentState {
  return {
    agents: {
      's1': {
        sessionId: 's1',
        sessionPath: '/sessions/s1',
        workspaceId: 'ws-1',
        messages: [streamingWrite()],
        isStreaming: true,
        error: null,
        commands: [],
        modelState: null,
        ...agent,
      },
    },
  } as unknown as AgentState;
}

const TAB = '/workspace/src/a.ts';

describe('selectStreamingWriteContent', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      workspaces: [{ id: 'ws-1', name: 'proj', path: '/home/me/proj', roots: [] }],
    } as never);
  });

  it('maps the tool path onto the editor tab and returns the live content', () => {
    expect(selectStreamingWriteContent(agentState({}), 'ws-1', TAB)).toBe('const a = 1;');
  });

  it.each(['src/a.ts', './src/a.ts'])(
    'maps the relative tool path %s onto the primary workspace root',
    (path) => {
      const state = agentState({ messages: [streamingWrite({ input: { path, content: 'live' } })] });
      expect(selectStreamingWriteContent(state, 'ws-1', TAB)).toBe('live');
    },
  );

  it('ignores a different tab, workspace, or an idle session', () => {
    const state = agentState({});
    expect(selectStreamingWriteContent(state, 'ws-1', '/workspace/src/other.ts')).toBeNull();
    expect(selectStreamingWriteContent(state, 'ws-2', TAB)).toBeNull();
    expect(selectStreamingWriteContent(agentState({ isStreaming: false }), 'ws-1', TAB)).toBeNull();
  });

  it('ignores edit, whose stream is a fragment rather than the file', () => {
    const state = agentState({
      messages: [
        streamingWrite({
          toolName: 'edit',
          input: { path: '/home/me/proj/src/a.ts', content: 'frag' },
        }),
      ],
    });
    expect(selectStreamingWriteContent(state, 'ws-1', TAB)).toBeNull();
  });

  it('holds the overlay after the arguments finish, until the tool runs', () => {
    // Between the last argument delta and the write landing on disk, dropping
    // the overlay would flash the pre-write file back onto the tab.
    const state = agentState({
      messages: [streamingWrite({ isStreamingInput: false, state: 'running' })],
    });
    expect(selectStreamingWriteContent(state, 'ws-1', TAB)).toBe('const a = 1;');
  });

  it('does not inspect writes before the current user turn', () => {
    const state = agentState({
      messages: [
        streamingWrite(),
        { type: 'user', id: 'user-2', text: 'Next task' },
        { type: 'assistant', id: 'assistant-2', text: '', isStreaming: true },
      ],
    });

    expect(selectStreamingWriteContent(state, 'ws-1', TAB)).toBeNull();
  });

  it('stops once the write has completed or was cancelled', () => {
    for (const state of ['completed', 'cancelled', 'error'] as const) {
      const agents = agentState({ messages: [streamingWrite({ state, isStreamingInput: false })] });
      expect(selectStreamingWriteContent(agents, 'ws-1', TAB)).toBeNull();
    }
  });
});
