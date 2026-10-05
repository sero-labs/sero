import { describe, expect, it } from 'vitest';
import type { ChatMessage, ChatToolCallMessage } from '@/types/ipc';
import { applyNestedToolEnd, applyNestedToolStart, settleNestedTools } from './agent-nested-tools';

function call(toolCallId: string, extra: Partial<ChatToolCallMessage> = {}): ChatToolCallMessage {
  return { type: 'tool', id: toolCallId, toolCallId, toolName: 'read', input: {}, output: null, isError: false, state: 'running', ...extra };
}

describe('calls a tool made while it ran', () => {
  it('join their parent and never become messages of their own', () => {
    const start: ChatMessage[] = [call('parent', { toolName: 'codemode' })];

    const withFirst = applyNestedToolStart(start, call('parent/1', { parentToolCallId: 'parent' }));
    const withBoth = applyNestedToolStart(withFirst, call('parent/2', { parentToolCallId: 'parent' }));
    const settled = applyNestedToolEnd(withBoth, 'parent', 'parent/1', { output: 'done', isError: false });
    const failed = applyNestedToolEnd(settled, 'parent', 'parent/2', { output: 'no such file', isError: true });

    expect(failed).toHaveLength(1);
    const parent = failed[0] as ChatToolCallMessage;
    expect(parent.nested?.map((nested) => [nested.toolCallId, nested.state])).toEqual([
      ['parent/1', 'completed'],
      ['parent/2', 'error'],
    ]);
  });

  it('are shown as cancelled when the turn ends while they are open', () => {
    const settled = settleNestedTools([call('parent/1', { state: 'completed' }), call('parent/2')]);

    expect(settled.map((nested) => nested.state)).toEqual(['completed', 'cancelled']);
  });
});
