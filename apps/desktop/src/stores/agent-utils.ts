import type {
  AgentStreamEvent,
  ChatAssistantMessage,
  ChatAttachment,
  ChatMessage,
  ChatToolCallMessage,
} from '@/types/ipc';
import type { AgentInstance, AgentState } from '@/stores/agent-types';
import {
  bufferToolInputDelta,
  clearBufferedSessionToolInput,
  createStreamingToolMessage,
  applyToolInputDelta,
  applyToolInputEnd,
  applyToolStart,
  drainToolInputBuffer,
  hasBufferedToolInput,
} from '@/stores/agent-tool-input';
import {
  bufferTextDelta,
  bufferThinkingDelta,
  bufferToolOutput,
  clearBufferedSessionDeltas,
  discardBufferedToolOutput,
  drainDeltaBuffer,
  scheduleDeltaFlush,
  setExternalDeltaWork,
  type BufferedToolOutput,
} from '@/stores/agent-delta-buffer';
import { useContainerStore } from '@/stores/container';
import { useSessionStore } from '@/stores/sessions';
import { applyAgentLifecycle } from '@/stores/agent-lifecycle';

// Streaming tool input shares the animation frame with the delta buffer.
setExternalDeltaWork(hasBufferedToolInput);

/**
 * Replace the last message matching `predicate`. Live messages sit at the tail,
 * so the search is short however long the thread is, and the copy keeps every
 * other message by reference for memoized rows.
 */
export function patchLastMessage(
  messages: ChatMessage[],
  predicate: (message: ChatMessage) => boolean,
  patch: (message: ChatMessage) => ChatMessage,
): ChatMessage[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (!predicate(messages[index])) continue;
    const next = messages.slice();
    next[index] = patch(messages[index]);
    return next;
  }
  return messages;
}

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
      messages: patchLastMessage(
        agents[sessionId].messages,
        (message) => message.type === 'assistant' && message.id === messageId,
        (message) => patch(message as ChatAssistantMessage),
      ),
    },
  };
}

export function patchToolOutput(
  messages: ChatMessage[],
  toolCallId: string,
  update: BufferedToolOutput,
): ChatMessage[] {
  return patchLastMessage(
    messages,
    (message) => message.type === 'tool' && message.toolCallId === toolCallId,
    (message) => ({
      ...(message as ChatToolCallMessage),
      output: update.output,
      details: update.details ?? (message as ChatToolCallMessage).details,
      state: 'running',
      isPartialOutput: true,
      images: update.images ?? (message as ChatToolCallMessage).images,
    }),
  );
}

type SetFn = (
  fn: (state: AgentState) => Partial<AgentState> | AgentState,
) => void;
type GetFn = () => AgentState;

/** Apply every buffered delta to the store in one update. */
export function applyBufferedDeltas(set: SetFn): void {
  const { text, thinking, toolOutput } = drainDeltaBuffer();
  const toolInput = drainToolInputBuffer();
  if (text.size === 0 && thinking.size === 0 && toolOutput.size === 0 && toolInput.size === 0) return;
  set((state) => {
    let agents = state.agents;
    for (const [sessionId, messageMap] of text) {
      for (const [messageId, delta] of messageMap) {
        agents = patchAssistant(agents, sessionId, messageId, (m) => ({ ...m, text: m.text + delta }));
      }
    }
    for (const [sessionId, messageMap] of thinking) {
      for (const [messageId, delta] of messageMap) {
        agents = patchAssistant(agents, sessionId, messageId, (m) => ({
          ...m, thinking: (m.thinking ?? '') + delta,
        }));
      }
    }
    for (const [sessionId, streamMap] of toolInput) {
      const agent = agents[sessionId];
      if (!agent) continue;
      let messages = agent.messages;
      for (const [streamKey, pending] of streamMap) {
        messages = applyToolInputDelta(messages, streamKey, pending);
      }
      agents = { ...agents, [sessionId]: { ...agent, messages } };
    }
    for (const [sessionId, outputMap] of toolOutput) {
      const agent = agents[sessionId];
      if (!agent) continue;
      let messages = agent.messages;
      for (const [toolCallId, update] of outputMap) {
        messages = patchToolOutput(messages, toolCallId, update);
      }
      agents = { ...agents, [sessionId]: { ...agent, messages } };
    }
    return { agents };
  });
}

// ── Pending memory context (per-session) ────────────────────────
// Holds the memory context emitted before the assistant message starts,
// so we can attach it to the next assistant message in that session.

const pendingMemoryContext = new Map<string, string>();

export function clearAgentSessionBuffers(sessionId: string): void {
  pendingMemoryContext.delete(sessionId);
  // Tool input first: the delta clear cancels the pending frame only once every
  // buffer is empty.
  clearBufferedSessionToolInput(sessionId);
  clearBufferedSessionDeltas(sessionId);
}

// ── Shared optimistic user-message helper ───────────────────────

function createOptimisticUserMessageId(): string {
  return `usr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface OptimisticUserMessageOptions {
  attachments?: ChatAttachment[];
  isStreaming?: boolean;
}

export function appendOptimisticUserMessage(
  set: SetFn,
  sessionId: string,
  text: string,
  options: OptimisticUserMessageOptions = {},
): string {
  const messageId = createOptimisticUserMessageId();
  const message: ChatMessage = {
    type: 'user',
    id: messageId,
    text,
    ...(options.attachments ? { attachments: options.attachments } : {}),
  };

  set((state) => {
    const agent = state.agents[sessionId];
    if (!agent) return state;

    return {
      agents: {
        ...state.agents,
        [sessionId]: {
          ...agent,
          error: null,
          ...(options.isStreaming !== undefined
            ? { isStreaming: options.isStreaming }
            : {}),
          messages: [...agent.messages, message],
        },
      },
    };
  });

  return messageId;
}

// ── Agent stream event handler ─────────────────────────────────
// Extracted from agent.ts to keep it under 500 LOC.

export function handleAgentStreamEvent(
  event: AgentStreamEvent,
  set: SetFn,
  get: GetFn,
  flushDeltas: () => void,
) {
  const { agents } = get();
  const sid = event.sessionId;

  // Ignore events for sessions we don't track (already closed).
  if (
    !agents[sid] &&
    event.type !== 'agent_start' &&
    event.type !== 'message_start' &&
    event.type !== 'composer_prefill'
  ) {
    if (event.type === 'agent_end') {
      clearAgentSessionBuffers(sid);
    }
    return;
  }

  switch (event.type) {
    case 'agent_start':
    case 'retry_start':
    case 'retry_end':
    case 'agent_end':
      if (event.type === 'agent_end') clearAgentSessionBuffers(sid);
      set((state) => ({ agents: applyAgentLifecycle(state.agents, sid, event) }));
      break;

    case 'messages_loaded':
      set((state) => ({
        agents: {
          ...state.agents,
          [sid]: {
            ...state.agents[sid],
            messages: event.messages,
            olderCursor: event.olderCursor ?? null,
            loadingOlderTurns: false,
          },
        },
      }));
      break;

    case 'memory_context':
      // Stash for the next assistant message in this session
      pendingMemoryContext.set(sid, event.context);
      break;

    case 'message_start':
      if (event.message.type === 'user') {
        set((state) => {
          const agent = state.agents[sid];
          if (!agent) return state;
          const alreadyPresent = agent.messages.some(
            (message) => message.type === 'user' && message.id === event.message.id,
          );
          if (alreadyPresent) return state;
          return {
            agents: {
              ...state.agents,
              [sid]: {
                ...agent,
                messages: [...agent.messages, event.message],
              },
            },
          };
        });
        break;
      }
      {
        // Attach any pending memory context to the new assistant message
        let message = event.message;
        const pending = pendingMemoryContext.get(sid);
        if (pending && message.type === 'assistant') {
          message = { ...message, memoryContext: pending };
          pendingMemoryContext.delete(sid);
        }
        set((state) => ({
          agents: {
            ...state.agents,
            [sid]: {
              ...state.agents[sid],
              messages: [...(state.agents[sid]?.messages ?? []), message],
            },
          },
        }));
      }
      break;

    case 'text_delta':
      bufferTextDelta(sid, event.messageId, event.delta, flushDeltas);
      break;

    case 'thinking_delta':
      bufferThinkingDelta(sid, event.messageId, event.delta, flushDeltas);
      break;

    case 'message_end':
      flushDeltas();
      set((state) => ({
        agents: patchAssistant(state.agents, sid, event.messageId, (message) => ({
          ...message,
          text: event.text,
          thinking: event.thinking,
          isStreaming: false,
        })),
      }));
      break;

    case 'user_turn_undo': {
      const { turnUndo, userMessageId } = event;
      set((state) => ({
        agents: {
          ...state.agents,
          [sid]: {
            ...state.agents[sid],
            messages: patchLastMessage(
              state.agents[sid].messages,
              (message) => message.type === 'user' && message.id === userMessageId,
              (message) => ({ ...message, turnUndo } as ChatMessage),
            ),
          },
        },
      }));
      break;
    }

    case 'composer_prefill':
      set((state) => ({
        composerPrefills: {
          ...state.composerPrefills,
          [sid]: event.prefill,
        },
      }));
      break;

    case 'tool_input_start':
      set((state) => ({
        agents: {
          ...state.agents,
          [sid]: {
            ...state.agents[sid],
            messages: [
              ...state.agents[sid].messages,
              createStreamingToolMessage(event.streamKey, event.toolName),
            ],
          },
        },
      }));
      break;

    case 'tool_input_delta':
      bufferToolInputDelta(sid, event.streamKey, event.delta, event.replace, event.path);
      scheduleDeltaFlush(flushDeltas);
      break;

    case 'tool_input_end':
      // Flush first so the trailing deltas land before the key is rewritten.
      flushDeltas();
      set((state) => ({
        agents: {
          ...state.agents,
          [sid]: {
            ...state.agents[sid],
            messages: applyToolInputEnd(
              state.agents[sid].messages,
              event.streamKey,
              event.toolCallId,
            ),
          },
        },
      }));
      break;

    case 'tool_start':
      set((state) => ({
        agents: {
          ...state.agents,
          [sid]: {
            ...state.agents[sid],
            messages: applyToolStart(state.agents[sid].messages, event.tool),
          },
        },
      }));
      break;

    case 'tool_update':
      bufferToolOutput(
        sid,
        event.toolCallId,
        { output: event.output, details: event.details, images: event.images },
        flushDeltas,
      );
      break;

    case 'tool_end':
      // A partial update still in the buffer would flush after this final
      // result and put the call back into "running".
      discardBufferedToolOutput(sid, event.toolCallId);
      set((state) => ({
        agents: {
          ...state.agents,
          [sid]: {
            ...state.agents[sid],
            messages: patchLastMessage(
              state.agents[sid].messages,
              (message) => message.type === 'tool' && message.toolCallId === event.toolCallId,
              (message) => ({
                ...(message as ChatToolCallMessage),
                output: event.output,
                details: event.details ?? (message as ChatToolCallMessage).details,
                isError: event.isError,
                state: event.isError ? 'error' : 'completed',
                isPartialOutput: false,
                isStreamingInput: false,
                images: event.images,
              }),
            ),
          },
        },
      }));
      break;

    case 'session_name':
      useSessionStore.getState().updateSessionName(sid, event.name);
      break;

    case 'model_change':
      set((state) => ({
        agents: { ...state.agents, [sid]: { ...state.agents[sid], modelState: event.state } },
      }));
      break;

    case 'resources_change':
      set((state) => ({
        agents: {
          ...state.agents,
          [sid]: {
            ...state.agents[sid],
            commands: event.commands,
            modelState: event.state,
          },
        },
      }));
      break;

    case 'error':
      clearAgentSessionBuffers(sid);
      set((state) => ({
        agents: {
          ...state.agents,
          [sid]: { ...state.agents[sid], error: event.error, isStreaming: false, retry: null },
        },
      }));
      break;

    case 'container_starting':
      useContainerStore.getState().setStarting(event.workspaceId);
      break;
    case 'container_ready':
      useContainerStore.getState().setRunning(event.workspaceId, event.ipAddress);
      break;
    case 'container_error':
      useContainerStore.getState().setError(event.workspaceId, event.error);
      break;
    case 'runtime_notice':
      set((state) => {
        const agent = state.agents[sid];
        if (!agent) return state;
        return {
          agents: {
            ...state.agents,
            [sid]: {
              ...agent,
              messages: [
                ...agent.messages,
                {
                  type: 'assistant' as const,
                  id: `runtime-notice-${sid}-${agent.messages.length + 1}`,
                  text: `System notice: ${event.message}`,
                  isStreaming: false,
                },
              ],
            },
          },
        };
      });
      break;
  }
}
