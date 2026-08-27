/**
 * Session event subscription — maps Pi SDK session events to Sero
 * IPC stream events for the renderer.
 *
 * Extracted from agent.ts to keep it under 500 LOC.
 */

import type { AgentSession } from '@earendil-works/pi-coding-agent';
import type { AssistantMessage } from '@earendil-works/pi-ai';
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
import { ToolInputStreams } from './tool-input-stream';
import { logRawEvent, logTurnContext } from '@electron/ipc/editor/debug';
import { emitTurnComplete, getCliActiveTurnId, noteCliTurnEnd, noteCliTurnStart } from '@electron/cli/bridges';

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
  // Argument streams are scoped to one assistant message, so this tracker is
  // reset at every message boundary.
  const toolInputStreams = new ToolInputStreams();
  let finalAssistant: Pick<AssistantMessage, 'stopReason' | 'errorMessage'> | null = null;

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
        finalAssistant = null;
        sendEvent({ type: 'agent_start', sessionId });
        break;

      case 'agent_end':
        break;

      case 'auto_retry_start':
        sendEvent({
          type: 'retry_start',
          sessionId,
          attempt: event.attempt,
          maxAttempts: event.maxAttempts,
          delayMs: event.delayMs,
          errorMessage: event.errorMessage,
        });
        break;

      case 'auto_retry_end':
        sendEvent({
          type: 'retry_end',
          sessionId,
          success: event.success,
          attempt: event.attempt,
          finalError: event.finalError,
        });
        break;

      case 'agent_settled': {
        const outcome = finalAssistant?.stopReason === 'aborted'
          ? 'cancelled'
          : finalAssistant?.stopReason === 'error'
            ? 'error'
            : 'completed';
        const completedTurnId = getCliActiveTurnId(sessionId);
        noteCliTurnEnd(sessionId);
        if (completedTurnId) {
          emitTurnComplete(sessionId, {
            turnId: completedTurnId,
            status: outcome === 'cancelled' ? 'aborted' : outcome,
          });
        }
        if (outcome === 'error') {
          sendEvent({
            type: 'error',
            sessionId,
            error: finalAssistant?.errorMessage ?? 'The model response failed.',
          });
        }
        sendEvent({ type: 'agent_end', sessionId, outcome });
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
      }

      case 'message_start': {
        toolInputStreams.reset();
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
        } else if (ame.type === 'toolcall_start') {
          const started = toolInputStreams.start(ame.partial, ame.contentIndex);
          if (started) sendEvent({ type: 'tool_input_start', sessionId, ...started });
        } else if (ame.type === 'toolcall_delta') {
          const chunk = toolInputStreams.advance(ame.partial, ame.contentIndex);
          if (chunk) sendEvent({ type: 'tool_input_delta', sessionId, ...chunk });
        } else if (ame.type === 'toolcall_end') {
          const finished = toolInputStreams.end(ame.toolCall, ame.contentIndex);
          if (finished) {
            sendEvent({
              type: 'tool_input_delta',
              sessionId,
              streamKey: finished.streamKey,
              ...finished.final,
            });
            sendEvent({
              type: 'tool_input_end',
              sessionId,
              streamKey: finished.streamKey,
              toolCallId: finished.toolCallId,
            });
          }
        }
        break;
      }

      case 'message_end': {
        toolInputStreams.reset();
        if (event.message.role === 'assistant' && entry.currentAssistantId) {
          finalAssistant = {
            stopReason: event.message.stopReason,
            errorMessage: event.message.errorMessage,
          };
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
