/**
 * Session event subscription — maps Pi SDK session events to Sero
 * IPC stream events for the renderer.
 *
 * Extracted from agent.ts to keep it under 500 LOC.
 */

import type { AgentSession } from '@mariozechner/pi-coding-agent';
import type {
  ChatAssistantMessage,
  ChatToolCallMessage,
  AgentStreamEvent,
  ToolResultImage,
} from '../../src/types/ipc';
import type { ChatCheckpointRef } from '../../src/types/checkpoints';

import {
  nextId,
  formatCustomMessage,
  buildCheckpointMapByTurn,
} from './agent-helpers';
import { logRawEvent, logTurnContext } from './debug';
import { noteCliTurnEnd, noteCliTurnStart } from '../cli/agent-bridge';

export interface SubscriptionPoolEntry {
  session: AgentSession;
  workspaceId: string;
  currentAssistantId: string | null;
  lastCompletedCheckpoint: ChatCheckpointRef | null;
}

/**
 * Subscribe to a Pi SDK AgentSession and forward events as Sero IPC events.
 *
 * @param sessionId - The session identifier
 * @param session - The Pi SDK session to subscribe to
 * @param getEntry - Getter for the pool entry (closure over the pool map)
 * @param sendEvent - IPC event sender function
 * @returns Unsubscribe function
 */
export function subscribeToSession(
  sessionId: string,
  session: AgentSession,
  getEntry: () => SubscriptionPoolEntry | undefined,
  sendEvent: (event: AgentStreamEvent) => void,
): () => void {
  return session.subscribe((event) => {
    const entry = getEntry();
    if (!entry) return;

    logRawEvent(sessionId, event);

    if (event.type === 'turn_start') {
      noteCliTurnStart(sessionId);
      logTurnContext(sessionId, session);
    }

    switch (event.type) {
      case 'agent_start':
        sendEvent({ type: 'agent_start', sessionId });
        break;

      case 'agent_end':
        noteCliTurnEnd(sessionId);
        sendEvent({ type: 'agent_end', sessionId });
        {
          const checkpoints = buildCheckpointMapByTurn(entry.session, entry.workspaceId);
          const userCount = entry.session.messages.filter((m) => m.role === 'user').length;
          const lastTurnIdx = userCount - 1;
          const checkpoint = checkpoints.get(lastTurnIdx);
          if (checkpoint) {
            entry.lastCompletedCheckpoint = checkpoint;
          }
        }
        break;

      case 'message_start': {
        if (event.message.role === 'assistant') {
          const chatMsg: ChatAssistantMessage = {
            type: 'assistant',
            id: nextId(),
            text: '',
            isStreaming: true,
          };
          entry.currentAssistantId = chatMsg.id;
          sendEvent({ type: 'message_start', sessionId, message: chatMsg });
        } else if (event.message.role === 'custom') {
          // Intercept memory-context custom messages and emit as a
          // dedicated event so the renderer can display them separately.
          const customMsg = event.message as { customType?: string; content?: unknown; display?: boolean };
          if (customMsg.customType === 'memory-context') {
            const context = typeof customMsg.content === 'string' ? customMsg.content : '';
            if (context) {
              sendEvent({ type: 'memory_context', sessionId, context });
            }
            break;
          }

          const prefixed = formatCustomMessage(event.message as any);
          if (!prefixed) break;

          const chatMsg: ChatAssistantMessage = {
            type: 'assistant',
            id: nextId(),
            text: prefixed,
            isStreaming: false,
          };
          sendEvent({ type: 'message_start', sessionId, message: chatMsg });
        }
        break;
      }

      case 'message_update': {
        const ame = event.assistantMessageEvent;
        if (ame.type === 'text_delta' && entry.currentAssistantId) {
          sendEvent({
            type: 'text_delta',
            sessionId,
            messageId: entry.currentAssistantId,
            delta: ame.delta,
          });
        } else if (ame.type === 'thinking_delta' && entry.currentAssistantId) {
          sendEvent({
            type: 'thinking_delta',
            sessionId,
            messageId: entry.currentAssistantId,
            delta: ame.delta,
          });
        }
        break;
      }

      case 'message_end': {
        if (event.message.role === 'assistant' && entry.currentAssistantId) {
          const textParts = event.message.content.filter(
            (c): c is { type: 'text'; text: string } => c.type === 'text',
          );
          const thinkingParts = event.message.content.filter(
            (c): c is { type: 'thinking'; thinking: string } => c.type === 'thinking',
          );
          const thinking = thinkingParts.map((c) => c.thinking).join('') || undefined;
          sendEvent({
            type: 'message_end',
            sessionId,
            messageId: entry.currentAssistantId,
            text: textParts.map((c) => c.text).join(''),
            thinking,
          });
          entry.currentAssistantId = null;
        }
        break;
      }

      case 'tool_execution_start': {
        const toolMsg: ChatToolCallMessage = {
          type: 'tool',
          id: nextId(),
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          input: event.args ?? {},
          output: null,
          isError: false,
          state: 'running',
        };
        sendEvent({ type: 'tool_start', sessionId, tool: toolMsg });
        break;
      }

      case 'tool_execution_end': {
        const result = event.result;
        let text: string | null = null;
        let images: ToolResultImage[] | undefined;

        if (result?.content && Array.isArray(result.content)) {
          const textParts = result.content.filter(
            (c: { type: string }) => c.type === 'text',
          );
          const imageParts = result.content.filter(
            (c: { type: string }) => c.type === 'image',
          ) as { type: 'image'; data: string; mimeType?: string }[];

          text = textParts.map((c: { text: string }) => c.text).join('\n') || null;

          if (imageParts.length > 0) {
            const description = text || undefined;
            images = imageParts.map((img) => ({
              data: img.data,
              mimeType: img.mimeType ?? 'image/png',
              description,
            }));
          }
        } else if (typeof result === 'string') {
          // Check if result is a JSON-encoded image (sero-cli screenshot output)
          const parsed = tryParseImageJson(result);
          if (parsed) {
            images = [parsed];
            text = parsed.description ?? null;
          } else {
            text = result;
          }
        }

        sendEvent({
          type: 'tool_end',
          sessionId,
          toolCallId: event.toolCallId,
          output: text,
          isError: event.isError,
          images,
        });
        break;
      }
    }
  });
}

// ── Helpers ───────────────────────────────────────────────────

/**
 * Try to parse a JSON string as a CLI-encoded image
 * (e.g. `{ type: 'image', format: 'png', base64: '...' }`).
 * Also used by agent-helpers.ts for history replay.
 */
export function tryParseImageJson(text: string): ToolResultImage | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed?.type === 'image' && typeof parsed.base64 === 'string') {
      const mimeType = parsed.format
        ? `image/${parsed.format}`
        : 'image/png';
      return {
        data: parsed.base64,
        mimeType,
        description: parsed.description ?? parsed.message,
      };
    }
  } catch {
    /* not JSON — ignore */
  }
  return null;
}
