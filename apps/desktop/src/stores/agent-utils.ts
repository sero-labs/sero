import type {
  AgentStreamEvent,
  ChatAssistantMessage,
  ChatAttachment,
  ChatMessage,
  ChatToolCallMessage,
} from '@/types/ipc';
import type { AgentInstance, AgentState } from '@/stores/agent-types';
import { useContainerStore } from '@/stores/container';
import { useSessionStore } from '@/stores/sessions';

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

// ── RAF-batched text / thinking delta buffer ───────────────────
// Accumulates high-frequency deltas and flushes once per animation
// frame so the store (and React) sees at most ~60 updates/s.

interface DeltaBuffer {
  /** sessionId → messageId → accumulated text delta */
  text: Map<string, Map<string, string>>;
  /** sessionId → messageId → accumulated thinking delta */
  thinking: Map<string, Map<string, string>>;
  rafId: number | null;
}

const buf: DeltaBuffer = { text: new Map(), thinking: new Map(), rafId: null };

function appendToBuf(
  target: Map<string, Map<string, string>>,
  sessionId: string,
  messageId: string,
  delta: string,
) {
  let sessionMap = target.get(sessionId);
  if (!sessionMap) {
    sessionMap = new Map();
    target.set(sessionId, sessionMap);
  }
  sessionMap.set(messageId, (sessionMap.get(messageId) ?? '') + delta);
}

/**
 * Queue a text delta for the next animation-frame flush.
 * `flushFn` is called with the buffered deltas once per frame.
 */
function bufferTextDelta(
  sessionId: string,
  messageId: string,
  delta: string,
  flushFn: () => void,
) {
  appendToBuf(buf.text, sessionId, messageId, delta);
  scheduleDeltaFlush(flushFn);
}

/**
 * Queue a thinking delta for the next animation-frame flush.
 */
function bufferThinkingDelta(
  sessionId: string,
  messageId: string,
  delta: string,
  flushFn: () => void,
) {
  appendToBuf(buf.thinking, sessionId, messageId, delta);
  scheduleDeltaFlush(flushFn);
}

function scheduleDeltaFlush(flushFn: () => void) {
  if (buf.rafId !== null) return;
  buf.rafId = requestAnimationFrame(() => {
    buf.rafId = null;
    flushFn();
  });
}

function clearBufferedSessionDeltas(sessionId: string): void {
  buf.text.delete(sessionId);
  buf.thinking.delete(sessionId);
  if (buf.rafId !== null && buf.text.size === 0 && buf.thinking.size === 0) {
    cancelAnimationFrame(buf.rafId);
    buf.rafId = null;
  }
}

/**
 * Drain all buffered deltas. Returns `{ text, thinking }` maps
 * (sessionId → messageId → accumulated delta) and clears the buffer.
 */
export function drainDeltaBuffer() {
  const text = buf.text;
  const thinking = buf.thinking;
  buf.text = new Map();
  buf.thinking = new Map();
  return { text, thinking };
}

// ── Pending memory context (per-session) ────────────────────────
// Holds the memory context emitted before the assistant message starts,
// so we can attach it to the next assistant message in that session.

const pendingMemoryContext = new Map<string, string>();

export function clearAgentSessionBuffers(sessionId: string): void {
  pendingMemoryContext.delete(sessionId);
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

type SetFn = (
  fn: (state: AgentState) => Partial<AgentState> | AgentState,
) => void;
type GetFn = () => AgentState;

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
      set((state) => ({
        agents: { ...state.agents, [sid]: { ...state.agents[sid], isStreaming: true } },
      }));
      break;

    case 'agent_end':
      clearAgentSessionBuffers(sid);
      set((state) => {
        const agent = state.agents[sid];
        if (!agent) return state;
        const messages = agent.messages.map((message) =>
          message.type === 'tool' && (message.state === 'pending' || message.state === 'running')
            ? { ...message, state: 'cancelled' as const }
            : message,
        );
        return {
          agents: { ...state.agents, [sid]: { ...agent, isStreaming: false, messages } },
        };
      });
      break;

    case 'messages_loaded':
      set((state) => ({
        agents: { ...state.agents, [sid]: { ...state.agents[sid], messages: event.messages } },
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
            messages: state.agents[sid].messages.map((message) =>
              message.type === 'user' && message.id === userMessageId
                ? ({ ...message, turnUndo } as ChatMessage)
                : message,
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

    case 'tool_start':
      set((state) => ({
        agents: {
          ...state.agents,
          [sid]: {
            ...state.agents[sid],
            messages: [...state.agents[sid].messages, { ...event.tool, isPartialOutput: false }],
          },
        },
      }));
      break;

    case 'tool_update':
      set((state) => ({
        agents: {
          ...state.agents,
          [sid]: {
            ...state.agents[sid],
            messages: state.agents[sid].messages.map((message) =>
              message.type === 'tool' && message.toolCallId === event.toolCallId
                ? ({
                    ...message,
                    output: event.output,
                    details: event.details ?? message.details,
                    state: 'running',
                    isPartialOutput: true,
                    images: event.images ?? message.images,
                  } as ChatToolCallMessage)
                : message,
            ),
          },
        },
      }));
      break;

    case 'tool_end':
      set((state) => ({
        agents: {
          ...state.agents,
          [sid]: {
            ...state.agents[sid],
            messages: state.agents[sid].messages.map((message) =>
              message.type === 'tool' && message.toolCallId === event.toolCallId
                ? ({
                    ...message,
                    output: event.output,
                    details: event.details ?? message.details,
                    isError: event.isError,
                    state: event.isError ? 'error' : 'completed',
                    isPartialOutput: false,
                    images: event.images,
                  } as ChatToolCallMessage)
                : message,
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
          [sid]: { ...state.agents[sid], error: event.error, isStreaming: false },
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
