import { describe, expect, it } from 'vitest';
import type { ChatMessage, ChatToolCallMessage } from '@/types/ipc';
import {
  applyToolInputDelta,
  applyToolInputEnd,
  applyToolStart,
  bufferToolInputDelta,
  createStreamingToolMessage,
  drainToolInputBuffer,
} from '@/stores/agent-tool-input';

function toolCall(overrides: Partial<ChatToolCallMessage> = {}): ChatToolCallMessage {
  return {
    type: 'tool',
    id: 'msg-1',
    toolCallId: 'call-1',
    toolName: 'write',
    input: { path: '/a.ts' },
    output: null,
    details: null,
    isError: false,
    state: 'running',
    ...overrides,
  };
}

describe('streaming tool input', () => {
  it('appends deltas and adopts the path once it parses', () => {
    let messages: ChatMessage[] = [createStreamingToolMessage('sk-1', 'write')];

    messages = applyToolInputDelta(messages, 'sk-1', { text: 'const', replace: false, path: null });
    messages = applyToolInputDelta(messages, 'sk-1', {
      text: ' a = 1;',
      replace: false,
      path: '/a.ts',
    });

    expect(messages[0]).toMatchObject({
      input: { path: '/a.ts', content: 'const a = 1;' },
      isStreamingInput: true,
      state: 'pending',
    });
  });

  it('replaces the buffer when the parse rewinds', () => {
    let messages: ChatMessage[] = [createStreamingToolMessage('sk-1', 'write')];
    messages = applyToolInputDelta(messages, 'sk-1', { text: 'lines', replace: false, path: null });
    messages = applyToolInputDelta(messages, 'sk-1', { text: 'line\n', replace: true, path: null });

    expect((messages[0] as ChatToolCallMessage).input.content).toBe('line\n');
  });

  it('lands the tool result on the card the stream created', () => {
    let messages: ChatMessage[] = [createStreamingToolMessage('sk-1', 'write')];
    messages = applyToolInputDelta(messages, 'sk-1', { text: 'x', replace: false, path: '/a.ts' });
    messages = applyToolInputEnd(messages, 'sk-1', 'call-1');
    messages = applyToolStart(messages, toolCall());

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      id: 'tin-sk-1',
      toolCallId: 'call-1',
      state: 'running',
      isStreamingInput: false,
    });
  });

  it('appends a card for a tool call that never streamed', () => {
    const messages = applyToolStart([], toolCall({ toolCallId: 'call-9' }));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ toolCallId: 'call-9', isPartialOutput: false });
  });

  it('coalesces buffered deltas per stream and clears on drain', () => {
    bufferToolInputDelta('s1', 'sk-1', 'a', false, null);
    bufferToolInputDelta('s1', 'sk-1', 'b', false, '/a.ts');
    bufferToolInputDelta('s1', 'sk-2', 'z', false, null);

    const drained = drainToolInputBuffer();
    expect(drained.get('s1')?.get('sk-1')).toEqual({ text: 'ab', replace: false, path: '/a.ts' });
    expect(drained.get('s1')?.get('sk-2')?.text).toBe('z');
    expect(drainToolInputBuffer().size).toBe(0);
  });

  it('keeps content written in earlier frames', () => {
    let messages: ChatMessage[] = [createStreamingToolMessage('sk-1', 'write')];

    bufferToolInputDelta('s1', 'sk-1', 'first ', false, '/a.ts');
    for (const [key, pending] of drainToolInputBuffer().get('s1') ?? []) {
      messages = applyToolInputDelta(messages, key, pending);
    }

    bufferToolInputDelta('s1', 'sk-1', 'second', false, null);
    for (const [key, pending] of drainToolInputBuffer().get('s1') ?? []) {
      messages = applyToolInputDelta(messages, key, pending);
    }

    expect((messages[0] as ChatToolCallMessage).input.content).toBe('first second');
  });

  it('drops earlier appends in the same frame when a replace arrives', () => {
    bufferToolInputDelta('s1', 'sk-1', 'stale', false, null);
    bufferToolInputDelta('s1', 'sk-1', 'fresh', true, null);

    expect(drainToolInputBuffer().get('s1')?.get('sk-1')).toEqual({
      text: 'fresh',
      replace: true,
      path: null,
    });
  });
});
