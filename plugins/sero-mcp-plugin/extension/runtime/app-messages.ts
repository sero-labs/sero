import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

export type SessionSend = ExtensionAPI['sendMessage'];

/**
 * The runtime is one object for all sessions. Each session registers its own
 * `pi.sendMessage` here, so an MCP app can reach the chat that shows it.
 */
export class SessionRegistry {
  private readonly sessions = new Map<string, SessionSend>();

  register(sessionId: string, send: SessionSend): () => void {
    this.sessions.set(sessionId, send);
    return () => {
      if (this.sessions.get(sessionId) === send) this.sessions.delete(sessionId);
    };
  }

  get(sessionId: string | undefined): SessionSend | undefined {
    return sessionId ? this.sessions.get(sessionId) : undefined;
  }
}

export type AppMessageKind = 'message' | 'context';

/**
 * Delivers `ui/message` as a visible message that starts a turn, and
 * `ui/update-model-context` as a hidden message for the next turn. Both carry
 * the app label, so the agent and the user know where the text comes from.
 */
export function deliverAppMessage(send: SessionSend, label: string, kind: AppMessageKind, params: Record<string, unknown>): void {
  const text = describeAppContent(params);
  if (!text) return;
  if (kind === 'message') {
    send({ customType: 'mcp-app-message', content: `${label}: ${text}`, display: true, details: { label } }, {
      triggerTurn: true,
      deliverAs: 'followUp',
    });
    return;
  }
  send({ customType: 'mcp-app-context', content: `Context from ${label}:\n${text}`, display: false, details: { label } }, {
    deliverAs: 'nextTurn',
  });
}

function describeAppContent(params: Record<string, unknown>): string {
  const blocks = Array.isArray(params.content) ? params.content : [];
  const texts = blocks
    .map((block) => (block && typeof block === 'object' && 'text' in block && typeof block.text === 'string' ? block.text : ''))
    .filter(Boolean);
  if (params.structuredContent && typeof params.structuredContent === 'object') {
    texts.push(JSON.stringify(params.structuredContent));
  }
  return texts.join('\n').trim();
}
