import type { AgentStreamEvent, ChatMessage } from '@/types/agent';
import type { AgentNodeArtifact, AgentNodeMessageInput } from '@/types/ipc-agent-node';
import { isRecord } from './types';

export function remoteSessionKey(nodeId: string, contextId: string): string {
  return `node:${encodeURIComponent(nodeId)}:${encodeURIComponent(contextId)}`;
}

export function remoteA2aMessage(input: AgentNodeMessageInput, messageId: string): Record<string, unknown> {
  const parts: Array<Record<string, unknown>> = [{ kind: 'text', text: input.text }];
  for (const attachment of input.attachments ?? []) {
    parts.push({ kind: 'file', file: { name: attachment.filename, mimeType: attachment.mediaType, uri: attachment.url } });
  }
  return {
    kind: 'message',
    role: 'user',
    messageId,
    contextId: input.contextId,
    parts,
    ...(input.taskId ? { taskId: input.taskId } : {}),
    ...(input.mode ? { metadata: { behavior: input.mode } } : {}),
  };
}

export function remoteArtifact(value: unknown): AgentNodeArtifact | null {
  const wire = unwrap(value);
  if (!wire) return null;
  const artifact = isRecord(wire.artifact) ? wire.artifact : null;
  if (!artifact || typeof artifact.artifactId !== 'string') return null;
  const part = Array.isArray(artifact.parts) ? artifact.parts.find(isRecord) : undefined;
  if (!part) return null;
  const content = isRecord(part.content) ? part.content : part;
  const mediaType = typeof part.mediaType === 'string' ? part.mediaType : 'application/octet-stream';
  const name = typeof artifact.name === 'string' && artifact.name ? artifact.name
    : typeof part.filename === 'string' ? part.filename : 'Artifact';
  const raw = content.$case === 'raw' ? content.value : part.raw;
  if (typeof raw === 'string') return { id: artifact.artifactId, name, mediaType, inlineBase64: raw };
  const url = content.$case === 'url' ? content.value : part.url;
  if (typeof url !== 'string') return null;
  const match = new URL(url).pathname.match(/\/blob\/([^/]+)$/);
  return match ? { id: artifact.artifactId, name, mediaType, blobId: decodeURIComponent(match[1]) } : null;
}

function textFromParts(parts: unknown): string {
  if (!Array.isArray(parts)) return '';
  return parts.map((part) => {
    if (!isRecord(part)) return '';
    if (typeof part.text === 'string') return part.text;
    if (isRecord(part.data)) return JSON.stringify(part.data);
    return '';
  }).filter(Boolean).join('\n');
}

function unwrap(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  if (isRecord(value.result)) return value.result;
  return value;
}

/** One conversion point from remote A2A/Pi wire events to renderer chat events. */
export class RemoteConversationBoundary {
  private readonly messages: ChatMessage[] = [];
  private cursor: string | null = null;
  private streamingMessageId: string | null = null;

  constructor(private readonly sessionKey: string) {}

  snapshot(): { messages: ChatMessage[]; cursor: string | null } {
    return { messages: [...this.messages], cursor: this.cursor };
  }

  accept(value: unknown, eventId: string | null = null): AgentStreamEvent[] {
    const wire = unwrap(value);
    if (!wire) return [];
    const entry = wire.type === 'entry' && isRecord(wire.entry) ? wire.entry : null;
    const entryId = entry && typeof entry.id === 'string'
      ? entry.id
      : typeof wire.id === 'string' ? wire.id : eventId;
    if (entryId) this.cursor = entryId;
    if (wire.type === 'resync' || wire.kind === 'resync') {
      this.messages.length = 0;
      return [{ type: 'messages_loaded', sessionId: this.sessionKey, messages: [] }];
    }
    const item = entry && isRecord(entry.data)
      ? entry.data
      : wire.type === 'snapshot' && isRecord(wire.message)
        ? { ...wire.message, partial: true }
        : wire.type === 'delta' && isRecord(wire.delta) ? wire.delta : wire;
    const message = isRecord(item.message) ? item.message : item;
    const role = message.role === 'ROLE_USER' ? 'user'
      : message.role === 'ROLE_AGENT' ? 'assistant' : message.role;
    const id = typeof message.messageId === 'string'
      ? message.messageId
      : typeof message.id === 'string' ? message.id : entryId;
    if ((role === 'user' || role === 'assistant') && id) {
      const text = typeof message.text === 'string' ? message.text : textFromParts(message.parts);
      const chat: ChatMessage = role === 'user'
        ? { type: 'user', id, text }
        : { type: 'assistant', id, text, isStreaming: message.partial === true };
      const existing = this.messages.findIndex((candidate) => candidate.id === id);
      if (role === 'assistant' && message.partial === true) this.streamingMessageId = id;
      if (existing === -1) this.messages.push(chat);
      else this.messages[existing] = chat;
      return existing === -1
        ? [{ type: 'message_start', sessionId: this.sessionKey, message: chat }]
        : [{ type: 'message_end', sessionId: this.sessionKey, messageId: id, text }];
    }
    const delta = typeof item.delta === 'string' ? item.delta
      : wire.type === 'delta' && typeof wire.text === 'string' ? wire.text : undefined;
    const messageId = typeof item.messageId === 'string' ? item.messageId : this.streamingMessageId ?? undefined;
    if (delta && !messageId) {
      const id = `assistant:${entryId ?? 'live'}`;
      this.streamingMessageId = id;
      const chat: ChatMessage = { type: 'assistant', id, text: delta, isStreaming: true };
      this.messages.push(chat);
      return [{ type: 'message_start', sessionId: this.sessionKey, message: chat }];
    }
    if (delta && messageId) {
      return [{ type: item.kind === 'thinking' ? 'thinking_delta' : 'text_delta', sessionId: this.sessionKey, messageId, delta }];
    }
    const stateValue = isRecord(item.status) && typeof item.status.state === 'string' ? item.status.state : null;
    const state = stateValue?.replace(/^TASK_STATE_/, '').toLowerCase();
    if (state === 'working' || state === 'submitted') return [{ type: 'agent_start', sessionId: this.sessionKey }];
    if (state === 'completed' || state === 'canceled' || state === 'failed') {
      this.streamingMessageId = null;
      return [{ type: 'agent_end', sessionId: this.sessionKey }];
    }
    return [];
  }
}
