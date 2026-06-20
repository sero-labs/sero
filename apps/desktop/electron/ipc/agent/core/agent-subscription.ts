/**
 * Session event subscription — maps Pi SDK session events to Sero
 * IPC stream events for the renderer.
 *
 * Extracted from agent.ts to keep it under 500 LOC.
 */

import type { AgentSession } from '@earendil-works/pi-coding-agent';
import type {
  ChatAssistantMessage,
  ChatToolCallMessage,
  AgentStreamEvent,
  ToolResultImage,
} from '@/types/ipc';

import {
  nextId,
  formatCustomMessage,
  buildTurnUndoMapByTurn,
} from './agent-helpers';
import { extractImageFilePath, tryParseImageJson } from './tool-result-images';
import { logRawEvent, logTurnContext } from '@electron/ipc/editor/debug';
import { noteCliTurnEnd, noteCliTurnStart } from '@electron/cli/bridges';

export interface SubscriptionPoolEntry {
  session: AgentSession;
  workspaceId: string;
  currentAssistantId: string | null;
  pendingTurnUndoUserMessageId: string | null;
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
        noteCliTurnEnd(sessionId, turnEndStatus(entry.session));
        sendEvent({ type: 'agent_end', sessionId });
        {
          const pendingUserMessageId = entry.pendingTurnUndoUserMessageId;
          entry.pendingTurnUndoUserMessageId = null;
          if (!pendingUserMessageId) break;

          const turnUndoRefs = buildTurnUndoMapByTurn(entry.session, entry.workspaceId);
          const userCount = entry.session.messages.filter((m) => m.role === 'user').length;
          const lastTurnIdx = userCount - 1;
          const turnUndo = turnUndoRefs.get(lastTurnIdx);
          if (turnUndo) {
            sendEvent({
              type: 'user_turn_undo',
              sessionId,
              userMessageId: pendingUserMessageId,
              turnUndo,
            });
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

          const prefixed = formatCustomMessage(event.message);
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
          details: null,
          isError: false,
          state: 'running',
        };
        sendEvent({ type: 'tool_start', sessionId, tool: toolMsg });
        break;
      }

      case 'tool_execution_update': {
        const { text, images, details } = extractToolOutput(event.partialResult);
        sendEvent({
          type: 'tool_update',
          sessionId,
          toolCallId: event.toolCallId,
          output: text,
          details,
          images,
        });
        break;
      }

      case 'tool_execution_end': {
        const { text, images, details } = extractToolOutput(event.result);
        sendEvent({
          type: 'tool_end',
          sessionId,
          toolCallId: event.toolCallId,
          output: text,
          details,
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
 * Classify how a finished agent loop ended, from the final assistant message's
 * stop reason, for the orchestrator turn-completion seam (see agent-bridge.ts).
 */
function turnEndStatus(session: AgentSession): 'completed' | 'aborted' | 'error' {
  const messages = session.state.messages;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role !== 'assistant') continue;
    if (message.stopReason === 'aborted') return 'aborted';
    if (message.stopReason === 'error') return 'error';
    return 'completed';
  }
  return 'completed';
}

function extractToolOutput(result: unknown): {
  text: string | null;
  details?: Record<string, unknown> | null;
  images?: ToolResultImage[];
} {
  let text: string | null = null;
  let details: Record<string, unknown> | null = null;
  let images: ToolResultImage[] | undefined;

  if ((result as { details?: unknown })?.details && typeof (result as { details?: unknown }).details === 'object') {
    details = (result as { details: Record<string, unknown> }).details;
  }

  if ((result as { content?: unknown })?.content && Array.isArray((result as { content: unknown[] }).content)) {
    const content = (result as { content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> }).content;
    const textParts = content.filter((c) => c.type === 'text');
    const imageParts = content.filter((c) => c.type === 'image');

    text = textParts.map((c) => c.text ?? '').filter(Boolean).join('\n') || null;

    if (imageParts.length > 0) {
      const description = text || undefined;
      const filePath = extractImageFilePath(details);
      images = imageParts
        .filter((img): img is { type: 'image'; data: string; mimeType?: string } => typeof img.data === 'string')
        .map((img) => ({
          data: img.data,
          mimeType: img.mimeType ?? 'image/png',
          description,
          ...(filePath ? { filePath } : {}),
        }));
    }

    if (!images && text) {
      const parsed = tryParseImageJson(text);
      if (parsed) {
        images = [parsed];
        text = parsed.description ?? null;
      }
    }
  } else if (typeof result === 'string') {
    const parsed = tryParseImageJson(result);
    if (parsed) {
      images = [parsed];
      text = parsed.description ?? null;
    } else {
      text = result;
    }
  }

  return { text, details, images };
}
