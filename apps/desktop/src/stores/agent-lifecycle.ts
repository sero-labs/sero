import type { AgentStreamEvent } from '@/types/ipc';
import { settleNestedTools } from '@/stores/agent-nested-tools';
import type { AgentInstance } from '@/stores/agent-types';

type LifecycleEvent = Extract<
  AgentStreamEvent,
  { type: 'agent_start' | 'agent_end' | 'retry_start' | 'retry_end' }
>;

export function applyAgentLifecycle(
  agents: Record<string, AgentInstance>,
  sessionId: string,
  event: LifecycleEvent,
): Record<string, AgentInstance> {
  const agent = agents[sessionId];
  if (!agent) return agents;
  if (event.type === 'agent_start') {
    return { ...agents, [sessionId]: { ...agent, error: null, isStreaming: true, retry: null } };
  }
  if (event.type === 'retry_start') {
    return {
      ...agents,
      [sessionId]: {
        ...agent,
        isStreaming: true,
        retry: {
          attempt: event.attempt,
          maxAttempts: event.maxAttempts,
          delayMs: event.delayMs,
          errorMessage: event.errorMessage,
        },
      },
    };
  }
  if (event.type === 'retry_end') {
    return { ...agents, [sessionId]: { ...agent, isStreaming: true, retry: null } };
  }
  const messages = agent.messages.map((message) => {
    if (message.type !== 'tool' || (message.state !== 'pending' && message.state !== 'running')) {
      return message;
    }
    const settled = event.outcome === 'cancelled'
      ? { ...message, state: 'cancelled' as const, isStreamingInput: false }
      : { ...message, state: 'error' as const, isError: true, isStreamingInput: false };
    return message.nested ? { ...settled, nested: settleNestedTools(message.nested) } : settled;
  });
  return { ...agents, [sessionId]: { ...agent, isStreaming: false, retry: null, messages } };
}
