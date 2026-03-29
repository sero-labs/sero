import type {
  ChatAssistantMessage,
  ChatMessage,
  ChatToolCallMessage,
  AgentStreamEvent,
} from '@/types/ipc';
import type { AgentInstance } from '@/stores/agent-types';
import type { AgentState } from '@/stores/agent-types';
import { useSessionStore } from '@/stores/sessions';
import { useContainerStore } from '@/stores/container';

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
export function bufferTextDelta(
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
export function bufferThinkingDelta(
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

// ── Agent stream event handler ─────────────────────────────────
// Extracted from agent.ts to keep it under 500 LOC.

type SetFn = (fn: (s: AgentState) => Partial<AgentState>) => void;
type GetFn = () => AgentState;

export function handleAgentStreamEvent(
  event: AgentStreamEvent,
  set: SetFn,
  get: GetFn,
  flushDeltas: () => void,
) {
  const { agents } = get();
  const sid = event.sessionId;

  // Ignore events for sessions we don't track (already closed).
  if (!agents[sid] && event.type !== 'agent_start' && event.type !== 'message_start') {
    return;
  }

  switch (event.type) {
    case 'agent_start':
      set((s) => ({
        agents: { ...s.agents, [sid]: { ...s.agents[sid], isStreaming: true } },
      }));
      break;

    case 'agent_end':
      set((s) => {
        const agent = s.agents[sid];
        if (!agent) return s;
        const messages = agent.messages.map((m) =>
          m.type === 'tool' && (m.state === 'pending' || m.state === 'running')
            ? { ...m, state: 'cancelled' as const }
            : m,
        );
        return { agents: { ...s.agents, [sid]: { ...agent, isStreaming: false, messages } } };
      });
      break;

    case 'messages_loaded':
      set((s) => ({
        agents: { ...s.agents, [sid]: { ...s.agents[sid], messages: event.messages } },
      }));
      break;

    case 'memory_context':
      // Stash for the next assistant message in this session
      pendingMemoryContext.set(sid, event.context);
      break;

    case 'message_start':
      if (event.message.type === 'user') break;
      {
        // Attach any pending memory context to the new assistant message
        let msg = event.message;
        const pending = pendingMemoryContext.get(sid);
        if (pending && msg.type === 'assistant') {
          msg = { ...msg, memoryContext: pending };
          pendingMemoryContext.delete(sid);
        }
        set((s) => ({
          agents: {
            ...s.agents,
            [sid]: { ...s.agents[sid], messages: [...(s.agents[sid]?.messages ?? []), msg] },
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
      set((s) => ({
        agents: patchAssistant(s.agents, sid, event.messageId, (m) => ({
          ...m, text: event.text, thinking: event.thinking, isStreaming: false,
        })),
      }));
      break;

    case 'user_checkpoint': {
      const { userMessageId, checkpoint } = event;
      set((s) => ({
        agents: { ...s.agents, [sid]: { ...s.agents[sid],
          messages: s.agents[sid].messages.map((m) =>
            m.type === 'user' && m.id === userMessageId
              ? ({ ...m, checkpoint } as ChatMessage) : m),
        } },
      }));
      break;
    }

    case 'tool_start':
      set((s) => ({
        agents: { ...s.agents, [sid]: { ...s.agents[sid],
          messages: [...s.agents[sid].messages, { ...event.tool, isPartialOutput: false }],
        } },
      }));
      break;

    case 'tool_update':
      set((s) => ({
        agents: { ...s.agents, [sid]: { ...s.agents[sid],
          messages: s.agents[sid].messages.map((m) =>
            m.type === 'tool' && m.toolCallId === event.toolCallId
              ? {
                  ...m,
                  output: event.output,
                  state: 'running',
                  isPartialOutput: true,
                  images: event.images ?? m.images,
                } as ChatToolCallMessage
              : m),
        } },
      }));
      break;

    case 'tool_end':
      set((s) => ({
        agents: { ...s.agents, [sid]: { ...s.agents[sid],
          messages: s.agents[sid].messages.map((m) =>
            m.type === 'tool' && m.toolCallId === event.toolCallId
              ? { ...m, output: event.output, isError: event.isError,
                  state: event.isError ? 'error' : 'completed',
                  isPartialOutput: false,
                  images: event.images } as ChatToolCallMessage
              : m),
        } },
      }));
      break;

    case 'session_name':
      useSessionStore.getState().updateSessionName(sid, event.name);
      break;

    case 'model_change':
      set((s) => ({
        agents: { ...s.agents, [sid]: { ...s.agents[sid], modelState: event.state } },
      }));
      break;

    case 'error':
      set((s) => ({
        agents: {
          ...s.agents,
          [sid]: { ...s.agents[sid], error: event.error, isStreaming: false },
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
  }
}
