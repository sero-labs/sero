import { describe, expect, it } from 'vitest';
import type { ChatAssistantMessage, ChatToolCallMessage } from '@/types/ipc';
import { groupMessages, isToolGroupFinalized } from './ToolCallGroup';

function makeTool(overrides: Partial<ChatToolCallMessage>): ChatToolCallMessage {
  return {
    type: 'tool',
    id: 'tool-1',
    toolCallId: 'call-1',
    toolName: 'read',
    input: {},
    output: '',
    isError: false,
    state: 'completed',
    details: null,
    isPartialOutput: false,
    ...overrides,
  };
}

function makeAssistant(overrides: Partial<ChatAssistantMessage>): ChatAssistantMessage {
  return {
    type: 'assistant',
    id: 'assistant-1',
    text: '',
    isStreaming: false,
    ...overrides,
  };
}

describe('isToolGroupFinalized', () => {
  it('keeps a trailing tool group live while only streaming thinking follows it', () => {
    const items = groupMessages([
      makeTool({ id: 'tool-a', toolCallId: 'call-a' }),
      makeAssistant({
        id: 'assistant-thinking-live',
        thinking: 'Checking one more file',
        isStreaming: true,
      }),
    ]);

    expect(isToolGroupFinalized(items, 0)).toBe(false);
  });

  it('keeps the latest tool group live when no durable response follows it yet', () => {
    const items = groupMessages([
      makeTool({ id: 'tool-a', toolCallId: 'call-a' }),
      makeTool({ id: 'tool-b', toolCallId: 'call-b', toolName: 'bash' }),
    ]);

    expect(isToolGroupFinalized(items, 0)).toBe(false);
  });

  it('finalizes a tool group once a durable assistant response follows it', () => {
    const items = groupMessages([
      makeTool({ id: 'tool-a', toolCallId: 'call-a' }),
      makeAssistant({
        id: 'assistant-response',
        text: 'Done.',
      }),
    ]);

    expect(isToolGroupFinalized(items, 0)).toBe(true);
  });
});
