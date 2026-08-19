import { beforeEach, describe, expect, it } from 'vitest';
import { useChatStore } from './chat';

describe('chat tool input lifecycle', () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: [],
      toolCalls: [],
      renderItems: [],
      isStreaming: false,
      isLoadingHistory: false,
      composerPrefill: null,
    });
  });

  it('keeps a stable render key when the real tool call id arrives', () => {
    const { handleMessage } = useChatStore.getState();
    handleMessage({
      type: 'tool_input_start',
      sessionId: 'session-1',
      streamKey: 'stream-1',
      toolName: 'write',
    });
    handleMessage({
      type: 'tool_input_end',
      sessionId: 'session-1',
      streamKey: 'stream-1',
      toolCallId: 'call-1',
    });
    handleMessage({
      type: 'tool_start',
      sessionId: 'session-1',
      toolCallId: 'call-1',
      toolName: 'write',
      input: { path: 'a.ts', content: 'done' },
    });

    expect(useChatStore.getState().toolCalls[0]).toMatchObject({
      toolCallId: 'call-1',
      renderKey: 'stream-1',
      state: 'running',
    });
  });

  it('marks an interrupted tool as cancelled in permanent history', () => {
    const { handleMessage } = useChatStore.getState();
    handleMessage({ type: 'agent_start', sessionId: 'session-1' });
    handleMessage({ type: 'text_delta', sessionId: 'session-1', delta: 'Working' });
    handleMessage({
      type: 'tool_input_start',
      sessionId: 'session-1',
      streamKey: 'stream-1',
      toolName: 'write',
    });
    handleMessage({ type: 'agent_end', sessionId: 'session-1' });

    expect(useChatStore.getState().messages.at(-1)?.toolCalls?.[0]).toMatchObject({
      state: 'cancelled',
      isStreamingInput: false,
    });
    expect(useChatStore.getState().toolCalls).toEqual([]);
  });
});
