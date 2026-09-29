/**
 * A minimal Pi extension host for driving the memory extension in unit tests:
 * it records handlers and tools, and plays session events against them.
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import memoryExtension from '../index';

type Handler = (event: unknown, ctx: unknown) => unknown;

export interface BranchEntry {
  type: string;
  customType?: string;
  details?: unknown;
}

export interface SessionHarness {
  start(): Promise<void>;
  /** Plays `before_agent_start` for a new user message and returns what the extension added. */
  prompt(text: string): Promise<{ systemPrompt: string; message?: { customType: string; content: string; details?: unknown } }>;
  compact(): Promise<void>;
  shutdown(reason?: 'quit' | 'reload'): Promise<void>;
  tool(name: string, params: Record<string, unknown>): Promise<string>;
}

export function createSession(options: {
  sessionId: string;
  cwd: string;
  branch?: BranchEntry[];
  /** The tools the session has active. A chat has `sero-cli`; a cron job does not. */
  activeTools?: string[];
}): SessionHarness {
  const handlers = new Map<string, Handler[]>();
  const tools = new Map<string, { execute: (...args: unknown[]) => Promise<{ content: Array<{ text: string }> }> }>();
  const api = {
    on: (event: string, handler: Handler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    registerTool: (tool: { name: string; execute: (...args: unknown[]) => Promise<{ content: Array<{ text: string }> }> }) => {
      tools.set(tool.name, tool);
    },
    getActiveTools: () => options.activeTools ?? ['sero-cli'],
    registerCommand: () => undefined,
    sendMessage: () => undefined,
    sendUserMessage: () => undefined,
    events: { on: () => () => undefined, emit: () => undefined },
  } as unknown as ExtensionAPI;
  memoryExtension(api);

  const ctx = {
    cwd: options.cwd,
    model: undefined,
    sessionManager: {
      getSessionId: () => options.sessionId,
      getCwd: () => options.cwd,
      getBranch: () => options.branch ?? [],
    },
  };

  const emit = async (event: string, payload: Record<string, unknown>) => {
    let result: unknown;
    for (const handler of handlers.get(event) ?? []) result = await handler({ type: event, ...payload }, ctx);
    return result;
  };

  return {
    start: async () => { await emit('session_start', { reason: 'startup' }); },
    prompt: async (text) => {
      const result = await emit('before_agent_start', { prompt: text, systemPrompt: 'BASE' }) as {
        systemPrompt: string;
        message?: { customType: string; content: string; details?: unknown };
      };
      return result;
    },
    compact: async () => { await emit('session_compact', { reason: 'manual' }); },
    shutdown: async (reason = 'quit') => { await emit('session_shutdown', { reason }); },
    tool: async (name, params) => {
      const tool = tools.get(name);
      if (!tool) throw new Error(`no tool ${name}`);
      const result = await tool.execute('call-1', params, undefined, undefined, ctx);
      return result.content[0]!.text;
    },
  };
}
