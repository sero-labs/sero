/**
 * Gateway history conversion — converts internal ChatMessage[] to the
 * simplified format used by the gateway protocol.
 *
 * Extracted from agent.ts to keep file sizes under 500 LOC.
 */

import type { ChatMessage } from '../../src/types/ipc';

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
  }>;
  timestamp: number;
}

/** Convert internal ChatMessage[] to the gateway history format. */
export function convertToGatewayHistory(chatMsgs: ChatMessage[]): GatewayHistoryMessage[] {
  const result: GatewayHistoryMessage[] = [];
  let pendingToolCalls: GatewayHistoryMessage['toolCalls'] & Array<unknown> = [];

  for (const msg of chatMsgs) {
    if (msg.type === 'tool') {
      pendingToolCalls.push({
        toolCallId: (msg as any).toolCallId ?? msg.id,
        toolName: (msg as any).toolName ?? 'unknown',
        state: (msg as any).isError ? 'error' : 'done',
        output: (msg as any).output ?? undefined,
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
    if (msg.type === 'user' || msg.type === 'assistant') {
      result.push({
        id: msg.id,
        type: msg.type,
        text: msg.text,
        thinking: msg.type === 'assistant' ? (msg as any).thinking : undefined,
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
