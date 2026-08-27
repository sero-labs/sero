import type { AssistantMessage, ToolCall } from "@earendil-works/pi-ai";

type FieldExtractor = (args: Record<string, unknown>) => string | null;

const STREAMED_TOOLS: Record<string, FieldExtractor> = {
  write: (args) => typeof args.content === "string" ? args.content : null,
  edit: (args) => {
    if (!Array.isArray(args.edits) || args.edits.length === 0) return null;
    const last: unknown = args.edits.at(-1);
    const newText = (last as { newText?: unknown } | null)?.newText;
    return typeof newText === "string" ? newText : null;
  },
};

export interface ToolInputChunk {
  delta: string;
  replace: boolean;
  path: string | null;
}

interface StreamState {
  streamKey: string;
  extract: FieldExtractor;
  sent: string;
  path: string | null;
}

/** Converts the SDK's growing parsed tool arguments into append-only UI updates. */
export class ToolInputStreams {
  private readonly streams = new Map<number, StreamState>();
  private sequence = 0;

  start(message: AssistantMessage, contentIndex: number): { streamKey: string; toolName: string } | null {
    const block = toolCallAt(message, contentIndex);
    if (!block) return null;
    const extract = STREAMED_TOOLS[block.name];
    if (!extract) return null;

    this.sequence += 1;
    const streamKey = `tis-${this.sequence}-${contentIndex}`;
    this.streams.set(contentIndex, { streamKey, extract, sent: "", path: null });
    return { streamKey, toolName: block.name };
  }

  advance(message: AssistantMessage, contentIndex: number): (ToolInputChunk & { streamKey: string }) | null {
    const stream = this.streams.get(contentIndex);
    const block = toolCallAt(message, contentIndex);
    if (!stream || !block) return null;

    const path = typeof block.arguments.path === "string" ? block.arguments.path : stream.path;
    const pathChanged = path !== stream.path;
    stream.path = path;
    const text = stream.extract(block.arguments);
    if (text === null || text === stream.sent) {
      return pathChanged ? { streamKey: stream.streamKey, delta: "", replace: false, path } : null;
    }

    const replace = !text.startsWith(stream.sent);
    const delta = replace ? text : text.slice(stream.sent.length);
    stream.sent = text;
    return { streamKey: stream.streamKey, delta, replace, path };
  }

  end(toolCall: ToolCall, contentIndex: number): {
    streamKey: string;
    toolCallId: string;
    final: ToolInputChunk;
  } | null {
    const stream = this.streams.get(contentIndex);
    if (!stream) return null;
    this.streams.delete(contentIndex);

    const path = typeof toolCall.arguments.path === "string" ? toolCall.arguments.path : stream.path;
    const text = stream.extract(toolCall.arguments) ?? stream.sent;
    const replace = !text.startsWith(stream.sent);
    return {
      streamKey: stream.streamKey,
      toolCallId: toolCall.id,
      final: { delta: replace ? text : text.slice(stream.sent.length), replace, path },
    };
  }

  reset(): void {
    this.streams.clear();
  }
}

function toolCallAt(message: AssistantMessage, contentIndex: number): ToolCall | null {
  const block = message.content[contentIndex];
  return block?.type === "toolCall" ? block : null;
}
