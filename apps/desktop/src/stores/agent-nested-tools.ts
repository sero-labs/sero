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
