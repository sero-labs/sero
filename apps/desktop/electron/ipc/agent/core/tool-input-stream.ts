/**
 * Tool-call argument streaming.
 *
 * File content written by the model never appears in a tool *result* — it is a
 * tool *argument* (`write` takes `{ path, content }`), and the tool only runs
 * once every argument has arrived. The content does stream, though: providers
 * emit `toolcall_delta` events carrying partial argument JSON, and the SDK
 * re-parses that JSON on every delta (`parseStreamingJson`), so the parsed
 * `arguments` object grows in place as the model writes.
 *
 * This module turns those growing arguments into append-only tails the renderer
 * can show live.
 */

import type { AssistantMessage, ToolCall } from '@earendil-works/pi-ai';

/** Pulls the streamable text out of a tool call's partially parsed arguments. */
type FieldExtractor = (args: Record<string, unknown>) => string | null;

/**
 * Tools whose arguments are worth streaming, and where their text lives.
 *
 * `write` streams the whole file. `edit` streams only the newest replacement,
 * so it is useful in the tool card but must not drive a whole-file view.
 */
const STREAMED_TOOLS: Record<string, FieldExtractor> = {
  write: (args) => (typeof args.content === 'string' ? args.content : null),
  edit: (args) => {
    if (!Array.isArray(args.edits) || args.edits.length === 0) return null;
    const last: unknown = args.edits[args.edits.length - 1];
    const newText = (last as { newText?: unknown } | null)?.newText;
    return typeof newText === 'string' ? newText : null;
  },
};

export interface ToolInputChunk {
  /** Text to append, or to replace the whole buffer with when `replace` is set. */
  delta: string;
  /**
   * True when the re-parsed arguments diverged from what was already sent, which
   * a partial-JSON parse can do mid-escape. The renderer replaces instead of
   * appending so the buffer cannot drift from the final arguments.
   */
  replace: boolean;
  /** The target path, once enough JSON has arrived to parse it. */
  path: string | null;
}

interface StreamState {
  streamKey: string;
  toolName: string;
  extract: FieldExtractor;
  /** Text already handed to the renderer. */
  sent: string;
  path: string | null;
}

/**
 * Tracks in-flight tool-call argument streams for one session.
 *
 * Keyed by `contentIndex` because a tool call has no id until `toolcall_end` on
 * some providers — the OpenAI adapter only registers one `if (toolCall.id)`.
 * Indices are scoped to a single assistant message, so `reset()` must run at
 * every `message_start`.
 */
export class ToolInputStreams {
  private readonly streams = new Map<number, StreamState>();
  private sequence = 0;

  /** Begin tracking a tool call, or return null when the tool is not streamable. */
  start(message: AssistantMessage, contentIndex: number): { streamKey: string; toolName: string } | null {
    const block = toolCallAt(message, contentIndex);
    if (!block) return null;

    const extract = STREAMED_TOOLS[block.name];
    if (!extract) return null;

    this.sequence += 1;
    const streamKey = `tis-${this.sequence}-${contentIndex}`;
    this.streams.set(contentIndex, {
      streamKey,
      toolName: block.name,
      extract,
      sent: '',
      path: null,
    });
    return { streamKey, toolName: block.name };
  }

  /**
   * Read the current argument text and return what changed since the last read.
   *
   * The caller must consume this synchronously: `agent-loop` forwards a shallow
   * copy of the assistant message, so these content blocks are the same objects
   * the provider adapter keeps mutating.
   */
  advance(message: AssistantMessage, contentIndex: number): (ToolInputChunk & { streamKey: string }) | null {
    const stream = this.streams.get(contentIndex);
    if (!stream) return null;

    const block = toolCallAt(message, contentIndex);
    if (!block) return null;

    const path = typeof block.arguments.path === 'string' ? block.arguments.path : stream.path;
    const pathChanged = path !== stream.path;
    stream.path = path;

    const text = stream.extract(block.arguments);
    if (text === null || text === stream.sent) {
      return pathChanged ? { streamKey: stream.streamKey, delta: '', replace: false, path } : null;
    }

    const replace = !text.startsWith(stream.sent);
    const delta = replace ? text : text.slice(stream.sent.length);
    stream.sent = text;
    return { streamKey: stream.streamKey, delta, replace, path };
  }

  /** Finish a tool call, reconciling against its final arguments. */
  end(
    toolCall: ToolCall,
    contentIndex: number,
  ): { streamKey: string; toolCallId: string; final: ToolInputChunk } | null {
    const stream = this.streams.get(contentIndex);
    if (!stream) return null;
    this.streams.delete(contentIndex);

    const path = typeof toolCall.arguments.path === 'string' ? toolCall.arguments.path : stream.path;
    const text = stream.extract(toolCall.arguments) ?? stream.sent;
    const replace = !text.startsWith(stream.sent);

    return {
      streamKey: stream.streamKey,
      toolCallId: toolCall.id,
      final: { delta: replace ? text : text.slice(stream.sent.length), replace, path },
    };
  }

  /** Drop every tracked stream. Call when an assistant message starts or ends. */
  reset(): void {
    this.streams.clear();
  }
}

function toolCallAt(message: AssistantMessage, contentIndex: number): ToolCall | null {
  const block = message.content[contentIndex];
  return block?.type === 'toolCall' ? block : null;
}
