import type { AgentSession } from '@mariozechner/pi-coding-agent';
import type { ImageContent } from '@mariozechner/pi-ai';
import type {
  ChatAttachment,
  ChatAssistantMessage,
  ChatMessage,
  ChatToolCallMessage,
  ToolResultImage,
} from '@/types/ipc';
import type { ChatTurnUndoRef } from '@/types/ipc';
import { prepareToolImage } from '@electron/shared/media/image-resize';
import { extractOriginalCollaborationQuery } from '@electron/ipc/collaboration/collaboration-message';
import { extractImageFilePath, tryParseImageJson } from './tool-result-images';
import { nextId } from './agent-ids';

const CHECKPOINT_ENTRY = 'git-checkpoint';
const TURN_UNDO_ENTRY = 'turn-undo';

interface DisplayableCustomMessage {
  display?: boolean;
  customType?: string;
  content?: unknown;
}

/**
 * Extract display text from a custom SDK message.
 * Returns null if the message should not be displayed.
 */
export function formatCustomMessage(message: unknown): string | null {
  if (!message || typeof message !== 'object') return null;

  const msg = message as DisplayableCustomMessage;
  const display = msg.display ?? true;
  if (!display) return null;

  const customType = String(msg.customType ?? '').trim();
  const content = msg.content;
  const text =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content
            .filter((entry): entry is { type: 'text'; text: string } => entry?.type === 'text')
            .map((entry) => entry.text)
            .join('\n')
        : '';
  const prefixed = customType ? `[${customType}] ${text}` : text;
  return prefixed.trim() ? prefixed : null;
}

/**
 * Find the session entry ID of a `git-checkpoint` custom entry by changeId.
 *
 * With the shifted checkpoint mapping (user message N displays the checkpoint
 * from turn N-1), branching to the checkpoint entry itself keeps turns 0..N-1
 * visible in the chat and hides turn N onward.
 *
 * Returns `null` if no matching checkpoint entry exists.
 */
export function findLegacyTurnUndoEntryId(
  session: AgentSession,
  changeId: string,
): string | null {
  const entries = session.sessionManager.getEntries();
  for (const entry of entries) {
    if (entry.type === 'custom' && entry.customType === CHECKPOINT_ENTRY) {
      const data = entry.data as Record<string, unknown> | undefined;
      if (data?.changeId === changeId) {
        return entry.id;
      }
    }
  }
  return null;
}

function asTurnUndoRef(data: unknown): ChatTurnUndoRef | null {
  if (!data || typeof data !== 'object') return null;

  const value = data as Record<string, unknown>;
  const workspaceId = typeof value.workspaceId === 'string' ? value.workspaceId.trim() : '';
  const snapshotId = typeof value.snapshotId === 'string' ? value.snapshotId.trim() : '';
  const targetUserEntryId =
    typeof value.targetUserEntryId === 'string' ? value.targetUserEntryId.trim() : '';
  if (!workspaceId || !snapshotId || !targetUserEntryId) return null;

  return {
    kind: 'turn-undo',
    workspaceId,
    snapshotId,
    targetUserEntryId,
    label: typeof value.label === 'string' ? value.label : 'Undo point',
    createdAt: typeof value.recordedAt === 'string' ? value.recordedAt : new Date().toISOString(),
  };
}

/** Build mapping: user turn index -> turn-undo metadata from session custom entries. */
export function buildTurnUndoMapByTurn(
  session: AgentSession,
  workspaceId?: string,
): Map<number, ChatTurnUndoRef> {
  const result = new Map<number, ChatTurnUndoRef>();
  const branch = session.sessionManager.getBranch();
  const userTurnIndexByEntryId = new Map<string, number>();
  let currentTurn = -1;

  for (const entry of branch) {
    if (entry.type === 'message' && entry.message.role === 'user') {
      currentTurn += 1;
      userTurnIndexByEntryId.set(entry.id, currentTurn);
      continue;
    }

    if (entry.type !== 'custom' || entry.customType !== TURN_UNDO_ENTRY) continue;

    const turnUndo = asTurnUndoRef(entry.data);
    if (!turnUndo) continue;
    if (workspaceId && turnUndo.workspaceId !== workspaceId) continue;

    const targetTurn = userTurnIndexByEntryId.get(turnUndo.targetUserEntryId);
    if (typeof targetTurn !== 'number') continue;
    result.set(targetTurn, turnUndo);
  }

  return result;
}

export function convertSessionMessages(
  messages: ReturnType<AgentSession['agent']['state']['messages']['slice']>,
  turnUndoByTurn?: Map<number, ChatTurnUndoRef>,
): ChatMessage[] {
  const result: ChatMessage[] = [];
  let userTurn = -1;

  for (const message of messages) {
    if (message.role === 'user') {
      userTurn += 1;
      const rawText =
        typeof message.content === 'string'
          ? message.content
          : message.content
              .filter((content): content is { type: 'text'; text: string } => content.type === 'text')
              .map((content) => content.text)
              .join('\n');
      const text = extractOriginalCollaborationQuery(rawText);

      let attachments: ChatAttachment[] | undefined;
      if (typeof message.content !== 'string') {
        for (const block of message.content) {
          if (block.type !== 'image') continue;
          if (!attachments) attachments = [];
          const mime = block.mimeType ?? 'image/png';
          attachments.push({
            id: `att-${nextId()}`,
            filename: 'Image',
            mediaType: mime,
            url: `data:${mime};base64,${block.data}`,
          });
        }
      }

      const turnUndo = turnUndoByTurn?.get(userTurn);
      result.push({
        type: 'user',
        id: nextId(),
        text,
        attachments,
        turnUndo,
      } as ChatMessage);
      continue;
    }

    if (message.role === 'assistant') {
      const textParts = message.content.filter(
        (content): content is { type: 'text'; text: string } => content.type === 'text',
      );
      const text = textParts.map((content) => content.text).join('');
      const thinkingParts = message.content.filter(
        (content): content is { type: 'thinking'; thinking: string } => content.type === 'thinking',
      );
      const thinking = thinkingParts.map((content) => content.thinking).join('') || undefined;

      if (text) {
        result.push({ type: 'assistant', id: nextId(), text, isStreaming: false, thinking });
      }

      const toolCalls = message.content.filter(
        (content): content is { type: 'toolCall'; id: string; name: string; arguments: Record<string, unknown> } =>
          content.type === 'toolCall',
      );
      for (const toolCall of toolCalls) {
        if (toolCall.name === 'set_session_title') continue;

        const toolResult = messages.find(
          (candidate) => candidate.role === 'toolResult' && 'toolCallId' in candidate && candidate.toolCallId === toolCall.id,
        );
        let output: string | null = null;
        let isError = false;
        let details: Record<string, unknown> | null = null;
        let images: ToolResultImage[] | undefined;

        if (toolResult && toolResult.role === 'toolResult') {
          const textResultParts = toolResult.content.filter(
            (content): content is { type: 'text'; text: string } => content.type === 'text',
          );
          output = textResultParts.map((content) => content.text).join('\n') || null;
          isError = toolResult.isError;
          if (toolResult.details && typeof toolResult.details === 'object') {
            details = toolResult.details as Record<string, unknown>;
          }

          const filePath = extractImageFilePath(details);
          for (const block of toolResult.content) {
            if (block.type !== 'image') continue;
            if (!images) images = [];
            images.push({
              data: block.data,
              mimeType: block.mimeType ?? 'image/png',
              description: output || undefined,
              ...(filePath ? { filePath } : {}),
            });
          }

          if (!images && output) {
            const parsed = tryParseImageJson(output);
            if (parsed) {
              images = [parsed];
              output = parsed.description ?? null;
            }
          }
        }

        result.push({
          type: 'tool',
          id: nextId(),
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          input: toolCall.arguments,
          output,
          isError,
          details,
          state: output !== null || images ? (isError ? 'error' : 'completed') : 'completed',
          images,
        } satisfies ChatToolCallMessage);
      }
      continue;
    }

    if (message.role === 'custom') {
      const prefixed = formatCustomMessage(message);
      if (!prefixed) continue;
      result.push({ type: 'assistant', id: nextId(), text: prefixed, isStreaming: false } satisfies ChatAssistantMessage);
    }
  }

  return result;
}

/**
 * Convert ChatAttachments to ImageContent for the Pi SDK.
 *
 * Images go through the same prepareToolImage path as tool screenshots so
 * pasted screenshots stay within API limits (max 2000×2000, max 4.5MB with
 * progressive JPEG compression).
 */
export function attachmentsToImages(attachments?: ChatAttachment[]): ImageContent[] | undefined {
  if (!attachments?.length) return undefined;

  const images: ImageContent[] = [];
  for (const attachment of attachments) {
    const mime = attachment.mediaType ?? '';
    if (!mime.startsWith('image/')) continue;

    const match = attachment.url.match(/^data:[^;]+;base64,(.+)$/);
    if (!match) {
      console.warn(`[agent] attachment skipped: url is not a data URI (${attachment.filename})`);
      continue;
    }

    const prepared = prepareToolImage(match[1], mime);
    images.push({ type: 'image', data: prepared.data, mimeType: prepared.mimeType });
  }

  return images.length > 0 ? images : undefined;
}
