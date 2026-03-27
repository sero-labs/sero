/**
 * Gateway history conversion — converts internal ChatMessage[] to the
 * simplified format used by the gateway protocol.
 *
 * Extracted from agent.ts to keep file sizes under 500 LOC.
 */

import type {
  ChatMessage,
  ChatToolCallMessage,
  ChatAssistantMessage,
  ToolResultImage,
} from '../../../src/types/ipc';

export interface GatewayHistoryMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  text: string;
  thinking?: string;
  images?: Array<{ base64: string; mimeType: string }>;
  toolCalls?: Array<{
    toolCallId: string;
    toolName: string;
    state: 'done' | 'error';
    output?: string;
    images?: Array<{ data: string; mimeType: string; description?: string }>;
  }>;
  timestamp: number;
}

/** Type guard: check if a ChatMessage is a tool call message. */
function isToolCallMessage(msg: ChatMessage): msg is ChatToolCallMessage {
  return msg.type === 'tool';
}

/** Type guard: check if a ChatMessage is an assistant message. */
function isAssistantMessage(msg: ChatMessage): msg is ChatAssistantMessage {
  return msg.type === 'assistant';
}

/** Convert ToolResultImage[] to the gateway image format. */
function convertToolImages(
  images: ToolResultImage[] | undefined,
): Array<{ data: string; mimeType: string; description?: string }> | undefined {
  if (!images || images.length === 0) return undefined;
  return images.map((img) => ({
    data: img.data,
    mimeType: img.mimeType,
    description: img.description,
  }));
}

/** Convert internal ChatMessage[] to the gateway history format. */
export function convertToGatewayHistory(chatMsgs: ChatMessage[]): GatewayHistoryMessage[] {
  const result: GatewayHistoryMessage[] = [];
  let pendingToolCalls: NonNullable<GatewayHistoryMessage['toolCalls']> = [];

  for (const msg of chatMsgs) {
    if (isToolCallMessage(msg)) {
      pendingToolCalls.push({
        toolCallId: msg.toolCallId,
        toolName: msg.toolName,
        state: msg.isError ? 'error' : 'done',
        output: msg.output ?? undefined,
        images: convertToolImages(msg.images),
      });
      continue;
    }
    // Flush pending tool calls onto the previous assistant message
    if (pendingToolCalls.length > 0 && result.length > 0) {
      const prev = result[result.length - 1];
      if (prev.type === 'assistant') {
        prev.toolCalls = pendingToolCalls;
      }
      pendingToolCalls = [];
    }
    if (msg.type === 'user' || isAssistantMessage(msg)) {
      result.push({
        id: msg.id,
        type: msg.type,
        text: msg.text,
        thinking: isAssistantMessage(msg) ? msg.thinking : undefined,
        timestamp: Date.now(),
      });
    }
  }
  // Flush any remaining tool calls
  if (pendingToolCalls.length > 0 && result.length > 0) {
    const prev = result[result.length - 1];
    if (prev.type === 'assistant') {
      prev.toolCalls = pendingToolCalls;
    }
  }
  return result;
}
