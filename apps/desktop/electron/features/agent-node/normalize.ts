import type { AgentStreamEvent, ChatMessage } from '@/types/agent';
import { isRecord } from './types';

export function remoteSessionKey(nodeId: string, contextId: string): string {
  return `remote:${Buffer.from(JSON.stringify([nodeId, contextId])).toString('base64url')}`;
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
    const role = message.role;
    const id = typeof message.messageId === 'string'
      ? message.messageId
      : typeof message.id === 'string' ? message.id : entryId;
    if ((role === 'user' || role === 'assistant') && id) {
      const text = typeof message.text === 'string' ? message.text : textFromParts(message.parts);
      const chat: ChatMessage = role === 'user'
        ? { type: 'user', id, text }
        : { type: 'assistant', id, text, isStreaming: message.partial === true };
      const existing = this.messages.findIndex((candidate) => candidate.id === id);
      if (existing === -1) this.messages.push(chat);
      else this.messages[existing] = chat;
      return existing === -1
        ? [{ type: 'message_start', sessionId: this.sessionKey, message: chat }]
        : [{ type: 'message_end', sessionId: this.sessionKey, messageId: id, text }];
    }
    const delta = typeof item.delta === 'string' ? item.delta : undefined;
    const messageId = typeof item.messageId === 'string' ? item.messageId : undefined;
    if (delta && messageId) {
      return [{ type: item.kind === 'thinking' ? 'thinking_delta' : 'text_delta', sessionId: this.sessionKey, messageId, delta }];
    }
    const state = isRecord(item.status) && typeof item.status.state === 'string' ? item.status.state : null;
    if (state === 'working' || state === 'submitted') return [{ type: 'agent_start', sessionId: this.sessionKey }];
    if (state === 'completed' || state === 'canceled' || state === 'failed') {
      return [{ type: 'agent_end', sessionId: this.sessionKey }];
    }
    return [];
  }
}
