import type { ChatMessage, ChatToolCallMessage } from '@/types/ipc';

function patchParent(
  messages: ChatMessage[],
  parentToolCallId: string,
  patch: (nested: ChatToolCallMessage[]) => ChatToolCallMessage[],
): ChatMessage[] {
  return messages.map((message) =>
    message.type === 'tool' && message.toolCallId === parentToolCallId
      ? { ...message, nested: patch(message.nested ?? []) }
      : message,
  );
}

/** A call a tool made while it ran joins its parent's list. It never becomes a message of its own. */
export function applyNestedToolStart(messages: ChatMessage[], tool: ChatToolCallMessage): ChatMessage[] {
  const parentToolCallId = tool.parentToolCallId;
  if (!parentToolCallId) return messages;
  return patchParent(messages, parentToolCallId, (nested) => [...nested, tool]);
}

export function applyNestedToolEnd(
  messages: ChatMessage[],
  parentToolCallId: string,
  toolCallId: string,
  result: Pick<ChatToolCallMessage, 'output' | 'isError'>,
): ChatMessage[] {
  return patchParent(messages, parentToolCallId, (nested) =>
    nested.map((call) =>
      call.toolCallId === toolCallId
        ? { ...call, ...result, state: result.isError ? 'error' : 'completed' }
        : call,
    ),
  );
}

/**
 * The turn ended while these calls were open. Each one is shown as cancelled,
 * which is how a reopened session shows a call that never finished.
 */
export function settleNestedTools(nested: ChatToolCallMessage[]): ChatToolCallMessage[] {
  return nested.map((call) =>
    call.state === 'pending' || call.state === 'running' ? { ...call, state: 'cancelled' } : call,
  );
}
