import type { AgentStreamEvent, ChatMessage } from '@/types/agent';
import type { AgentNodeArtifact, AgentNodeMessageInput } from '@/types/ipc-agent-node';
import { SERO_QUEUE_MODE_METADATA_KEY } from '@sero-ai/a2a';
import { isRecord } from './types';

export function remoteSessionKey(nodeId: string, contextId: string): string {
  return `node:${encodeURIComponent(nodeId)}:${encodeURIComponent(contextId)}`;
}

export function remoteA2aMessage(input: AgentNodeMessageInput, messageId: string): Record<string, unknown> {
  const parts: Array<Record<string, unknown>> = [{ text: input.text }];
  if (input.approval) {
    parts.push({ data: {
      type: 'approval_response', approvalId: input.approval.id,
      approved: input.approval.approved, scope: input.approval.scope ?? 'once',
    } });
  }
  for (const attachment of input.attachments ?? []) {
    parts.push({ url: attachment.url, filename: attachment.filename, mediaType: attachment.mediaType });
  }
  return {
    role: 'ROLE_USER',
    messageId,
    contextId: input.contextId,
    parts,
    ...(input.taskId ? { taskId: input.taskId } : {}),
    ...(input.mode ? { metadata: { [SERO_QUEUE_MODE_METADATA_KEY]: input.mode } } : {}),
  };
}

export function remoteArtifacts(value: unknown): AgentNodeArtifact[] {
  const wire = unwrap(value);
  if (!wire) return [];
  const artifacts = Array.isArray(wire.artifacts)
    ? wire.artifacts.filter(isRecord)
    : isRecord(wire.artifact) ? [wire.artifact] : [];
  return artifacts.flatMap(parseArtifact).filter((artifact) => !isInternalToolArtifact(artifact));
}

function isInternalToolArtifact(artifact: AgentNodeArtifact): boolean {
  return artifact.mediaType === 'application/json'
    && /^(?:bash|edit|find|grep|read|write)-call_.*\.json$/u.test(artifact.name);
}

export function remoteArtifact(value: unknown): AgentNodeArtifact | null {
  return remoteArtifacts(value)[0] ?? null;
}

function parseArtifact(artifact: Record<string, unknown>): AgentNodeArtifact[] {
  if (typeof artifact.artifactId !== 'string') return [];
  const part = Array.isArray(artifact.parts) ? artifact.parts.find(isRecord) : undefined;
  if (!part) return [];
  const content = isRecord(part.content) ? part.content : part;
  const mediaType = typeof part.mediaType === 'string' ? part.mediaType : 'application/octet-stream';
  const name = typeof artifact.name === 'string' && artifact.name ? artifact.name
    : typeof part.filename === 'string' ? part.filename : 'Artifact';
  const raw = content.$case === 'raw' ? content.value : part.raw;
  if (typeof raw === 'string') return [{ id: artifact.artifactId, name, mediaType, inlineBase64: raw }];
  const url = content.$case === 'url' ? content.value : part.url;
  if (typeof url !== 'string') return [];
  const match = URL.parse(url)?.pathname.match(/\/blob\/([^/]+)$/);
  return match ? [{ id: artifact.artifactId, name, mediaType, blobId: decodeURIComponent(match[1]) }] : [];
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

function textFromContent(content: unknown): string {
  return typeof content === 'string' ? content : textFromParts(content);
}

function unwrap(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  if (isRecord(value.result)) return unwrap(value.result);
  for (const key of ['task', 'message', 'statusUpdate', 'artifactUpdate']) {
    if (isRecord(value[key])) return value[key];
  }
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
    const live = this.acceptLive(item);
    if (live) return live;
    const message = isRecord(item.message) ? item.message : item;
    const role = message.role === 'ROLE_USER' ? 'user'
      : message.role === 'ROLE_AGENT' ? 'assistant' : message.role;
    const id = typeof message.messageId === 'string'
      ? message.messageId
      : typeof message.id === 'string' ? message.id : entryId;
    const durableTools = id ? this.acceptDurableTools(message, id) : null;
    if (durableTools) return durableTools;
    if ((role === 'user' || role === 'assistant') && id) {
      const text = typeof message.text === 'string'
        ? message.text
        : textFromContent(message.content) || textFromParts(message.parts);
      const chat: ChatMessage = role === 'user'
        ? { type: 'user', id, text }
        : {
            type: 'assistant', id, text, isStreaming: message.partial === true,
            thinking: thinkingFromContent(message.content) || undefined,
          };
      const existing = this.messageIndex(chat);
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
    if (delta && messageId && !this.messages.some((message) => message.id === messageId)) {
      this.streamingMessageId = messageId;
      const chat: ChatMessage = { type: 'assistant', id: messageId, text: delta, isStreaming: true };
      this.messages.push(chat);
      return [{ type: 'message_start', sessionId: this.sessionKey, message: chat }];
    }
    if (delta && messageId) {
      const current = this.messages.find((message) => message.id === messageId);
      if (current?.type === 'assistant') current.text += delta;
      return [{ type: item.kind === 'thinking' ? 'thinking_delta' : 'text_delta', sessionId: this.sessionKey, messageId, delta }];
    }
    const stateValue = isRecord(item.status) && typeof item.status.state === 'string' ? item.status.state : null;
    const state = stateValue?.replace(/^TASK_STATE_/, '').toLowerCase();
    if (state === 'working' || state === 'submitted') return [{ type: 'agent_start', sessionId: this.sessionKey }];
    if (state === 'completed' || state === 'canceled' || state === 'failed' || state === 'auth_required') {
      this.streamingMessageId = null;
      return [{ type: 'agent_end', sessionId: this.sessionKey }];
    }
    return [];
  }

  private acceptDurableTools(message: Record<string, unknown>, entryId: string): AgentStreamEvent[] | null {
    const content = Array.isArray(message.content) ? message.content.filter(isRecord) : [];
    const toolCalls = content.filter((part) => part.type === 'toolCall' && typeof part.id === 'string' && typeof part.name === 'string');
    if (message.role === 'assistant' && toolCalls.length > 0) {
      const events: AgentStreamEvent[] = [];
      const text = textFromContent(content);
      const thinking = thinkingFromContent(content) || undefined;
      if (text || thinking) {
        const assistant: ChatMessage = { type: 'assistant', id: entryId, text, thinking, isStreaming: false };
        const existing = this.messageIndex(assistant);
        if (existing === -1) this.messages.push(assistant);
        else this.messages[existing] = assistant;
        events.push({ type: 'message_start', sessionId: this.sessionKey, message: assistant });
      }
      for (const call of toolCalls) {
        const toolCallId = String(call.id);
        const tool: ChatMessage = {
          type: 'tool', id: `tool:${toolCallId}`, toolCallId, toolName: String(call.name),
          input: isRecord(call.arguments) ? call.arguments : {}, output: null, isError: false, state: 'running',
        };
        const existing = this.messageIndex(tool);
        if (existing === -1) this.messages.push(tool);
        else this.messages[existing] = { ...tool, id: this.messages[existing].id };
        events.push({ type: 'tool_start', sessionId: this.sessionKey, tool });
      }
      return events;
    }
    if (message.role === 'toolResult' && typeof message.toolCallId === 'string') {
      const toolCallId = message.toolCallId;
      const output = textFromContent(message.content) || null;
      const isError = message.isError === true;
      const existing = this.messages.findIndex((item) => item.type === 'tool' && item.toolCallId === toolCallId);
      if (existing >= 0 && this.messages[existing].type === 'tool') {
        this.messages[existing] = { ...this.messages[existing], output, isError, state: isError ? 'error' : 'completed' };
      }
      return [{ type: 'tool_end', sessionId: this.sessionKey, toolCallId, output, isError }];
    }
    return null;
  }

  private messageIndex(message: ChatMessage): number {
    const exact = this.messages.findIndex((candidate) => candidate.id === message.id);
    if (exact >= 0) return exact;
    if (message.type === 'assistant' && !message.id.startsWith('live:')) {
      return this.messages.findIndex((candidate) => candidate.type === 'assistant' && candidate.id.startsWith('live:'));
    }
    if (message.type === 'tool') {
      return this.messages.findIndex((candidate) => candidate.type === 'tool' && candidate.toolCallId === message.toolCallId);
    }
    return -1;
  }

  private acceptLive(item: Record<string, unknown>): AgentStreamEvent[] | null {
    const kind = typeof item.kind === 'string' ? item.kind : null;
    const messageId = typeof item.messageId === 'string' ? item.messageId : null;
    if (kind === 'assistant_start' && messageId) {
      this.streamingMessageId = messageId;
      const message: ChatMessage = { type: 'assistant', id: messageId, text: '', isStreaming: true };
      this.messages.push(message);
      return [{ type: 'message_start', sessionId: this.sessionKey, message }];
    }
    if (kind === 'assistant_end' && messageId) {
      const text = typeof item.text === 'string' ? item.text : '';
      const thinking = typeof item.thinking === 'string' ? item.thinking : undefined;
      const current = this.messages.find((message) => message.id === messageId);
      if (current?.type === 'assistant') Object.assign(current, { text, thinking, isStreaming: false });
      this.streamingMessageId = null;
      return [{ type: 'message_end', sessionId: this.sessionKey, messageId, text, thinking }];
    }
    const delta = typeof item.delta === 'string' ? item.delta : null;
    if ((kind === 'text' || kind === 'thinking') && messageId && delta !== null) {
      const current = this.messages.find((message) => message.id === messageId);
      if (current?.type === 'assistant') {
        if (kind === 'text') current.text += delta;
        else current.thinking = (current.thinking ?? '') + delta;
      }
      return [{ type: kind === 'text' ? 'text_delta' : 'thinking_delta', sessionId: this.sessionKey, messageId, delta }];
    }
    const streamKey = typeof item.streamKey === 'string' ? item.streamKey : null;
    if (kind === 'tool_input_start' && streamKey && typeof item.toolName === 'string') {
      const tool: ChatMessage = {
        type: 'tool', id: `tin-${streamKey}`, toolCallId: streamKey, toolName: item.toolName,
        input: {}, output: null, isError: false, state: 'pending', isStreamingInput: true,
      };
      this.messages.push(tool);
      return [{ type: 'tool_input_start', sessionId: this.sessionKey, streamKey, toolName: item.toolName }];
    }
    if (kind === 'tool_input_delta' && streamKey && delta !== null) {
      const tool = this.messages.find((message) => message.type === 'tool' && message.toolCallId === streamKey);
      const path = typeof item.path === 'string' ? item.path : null;
      if (tool?.type === 'tool') {
        const previous = typeof tool.input.content === 'string' ? tool.input.content : '';
        tool.input = {
          ...tool.input,
          ...(path ? { path } : {}),
          content: item.replace === true ? delta : previous + delta,
        };
      }
      return [{
        type: 'tool_input_delta', sessionId: this.sessionKey, streamKey,
        delta, replace: item.replace === true, path,
      }];
    }
    const toolCallId = typeof item.toolCallId === 'string' ? item.toolCallId : null;
    if (kind === 'tool_input_end' && streamKey && toolCallId) {
      const tool = this.messages.find((message) => message.type === 'tool' && message.toolCallId === streamKey);
      if (tool?.type === 'tool') Object.assign(tool, { toolCallId, isStreamingInput: false });
      return [{ type: 'tool_input_end', sessionId: this.sessionKey, streamKey, toolCallId }];
    }
    if (kind === 'tool_start' && toolCallId && typeof item.toolName === 'string') {
      const tool: ChatMessage = {
        type: 'tool', id: `tool:${toolCallId}`, toolCallId, toolName: item.toolName,
        input: isRecord(item.input) ? item.input : {}, output: null, isError: false, state: 'running',
      };
      const existing = this.messages.find((message) => message.type === 'tool' && message.toolCallId === toolCallId);
      if (existing?.type === 'tool') {
        const id = existing.id;
        Object.assign(existing, tool, { id });
      } else this.messages.push(tool);
      return [{ type: 'tool_start', sessionId: this.sessionKey, tool }];
    }
    if ((kind === 'tool_update' || kind === 'tool_end') && toolCallId) {
      const output = typeof item.output === 'string' ? item.output : null;
      const tool = this.messages.find((message) => message.type === 'tool' && message.toolCallId === toolCallId);
      if (tool?.type === 'tool') Object.assign(tool, {
        output, isError: item.isError === true,
        state: kind === 'tool_update' ? 'running' : item.isError === true ? 'error' : 'completed',
      });
      return kind === 'tool_update'
        ? [{ type: 'tool_update', sessionId: this.sessionKey, toolCallId, output }]
        : [{ type: 'tool_end', sessionId: this.sessionKey, toolCallId, output, isError: item.isError === true }];
    }
    return null;
  }
}

function thinkingFromContent(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content.flatMap((part) => isRecord(part) && part.type === 'thinking' && typeof part.thinking === 'string' ? [part.thinking] : []).join('');
}
