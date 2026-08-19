/**
 * Streaming tool-call arguments in the renderer.
 *
 * The main process forwards the model's argument deltas (see
 * `electron/ipc/agent/core/tool-input-stream.ts`) so a `write` shows its file
 * filling in rather than appearing finished. Deltas arrive per token, so they
 * are coalesced onto an animation frame the same way text deltas are.
 */

import type { ChatMessage, ChatToolCallMessage } from '@/types/ipc';

export interface PendingToolInput {
  /** Text to append this frame, or the whole buffer when `replace` is set. */
  text: string;
  replace: boolean;
  path: string | null;
}

/** sessionId → streamKey → pending update */
type ToolInputBuffer = Map<string, Map<string, PendingToolInput>>;

let buffer: ToolInputBuffer = new Map();

export function bufferToolInputDelta(
  sessionId: string,
  streamKey: string,
  delta: string,
  replace: boolean,
  path: string | null,
): void {
  let session = buffer.get(sessionId);
  if (!session) {
    session = new Map();
    buffer.set(sessionId, session);
  }

  // `replace` means the main process rewound the stream, never just "first
  // delta this frame" — a frame's opening delta still extends whatever the
  // message already holds from earlier frames.
  const pending = session.get(streamKey);
  if (!pending) {
    session.set(streamKey, { text: delta, replace, path });
    return;
  }
  if (replace) {
    session.set(streamKey, { text: delta, replace: true, path: path ?? pending.path });
    return;
  }

  pending.text += delta;
  if (path) pending.path = path;
}

export function drainToolInputBuffer(): ToolInputBuffer {
  const drained = buffer;
  buffer = new Map();
  return drained;
}

export function hasBufferedToolInput(): boolean {
  return buffer.size > 0;
}

export function clearBufferedSessionToolInput(sessionId: string): void {
  buffer.delete(sessionId);
}

// ── Message patching ───────────────────────────────────────────

/**
 * Placeholder card for a tool call whose arguments are still streaming.
 *
 * `toolCallId` holds the stream key until the real id arrives at
 * `tool_input_end`, so the later `tool_start` patches this card instead of
 * appending a second one.
 */
export function createStreamingToolMessage(
  streamKey: string,
  toolName: string,
): ChatToolCallMessage {
  return {
    type: 'tool',
    id: `tin-${streamKey}`,
    toolCallId: streamKey,
    toolName,
    input: {},
    output: null,
    details: null,
    isError: false,
    state: 'pending',
    isStreamingInput: true,
  };
}

export function applyToolInputDelta(
  messages: ChatMessage[],
  streamKey: string,
  pending: PendingToolInput,
): ChatMessage[] {
  return patchStreamingTool(messages, streamKey, (tool) => {
    const previous = typeof tool.input.content === 'string' ? tool.input.content : '';
    return {
      ...tool,
      input: {
        ...tool.input,
        ...(pending.path ? { path: pending.path } : {}),
        content: pending.replace ? pending.text : previous + pending.text,
      },
    };
  });
}

/** Swap the placeholder key for the real tool call id and stop the streaming state. */
export function applyToolInputEnd(
  messages: ChatMessage[],
  streamKey: string,
  toolCallId: string,
): ChatMessage[] {
  return patchStreamingTool(messages, streamKey, (tool) => ({
    ...tool,
    toolCallId,
    isStreamingInput: false,
  }));
}

function patchStreamingTool(
  messages: ChatMessage[],
  streamKey: string,
  patch: (tool: ChatToolCallMessage) => ChatToolCallMessage,
): ChatMessage[] {
  return messages.map((message) =>
    message.type === 'tool' && message.toolCallId === streamKey ? patch(message) : message,
  );
}

/**
 * Land a real tool call on the card its argument stream already created,
 * appending a fresh card only when nothing streamed.
 */
export function applyToolStart(
  messages: ChatMessage[],
  tool: ChatToolCallMessage,
): ChatMessage[] {
  const streamed = messages.some(
    (message) => message.type === 'tool' && message.toolCallId === tool.toolCallId,
  );
  if (!streamed) return [...messages, { ...tool, isPartialOutput: false }];

  return messages.map((message) =>
    message.type === 'tool' && message.toolCallId === tool.toolCallId
      ? {
          ...message,
          ...tool,
          // The placeholder id is also the React key. Keep it stable when the
          // SDK's real tool message arrives so an open details pane stays open.
          id: message.id,
          isPartialOutput: false,
          isStreamingInput: false,
        }
      : message,
  );
}
