import type { ChatAssistantMessage } from '@/types/ipc';
import type { AgentInstance } from '@/stores/agent-types';

export function patchAssistant(
  agents: Record<string, AgentInstance>,
  sessionId: string,
  messageId: string,
  patch: (message: ChatAssistantMessage) => ChatAssistantMessage,
) {
  return {
    ...agents,
    [sessionId]: {
      ...agents[sessionId],
      messages: agents[sessionId].messages.map((message) =>
        message.type === 'assistant' && message.id === messageId ? patch(message) : message,
      ),
    },
  };
}
