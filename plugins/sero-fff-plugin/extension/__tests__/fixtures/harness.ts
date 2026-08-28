/** A minimal Pi extension host: enough of `ExtensionAPI` to register and call tools. */

import type { ExtensionAPI, ExtensionContext, ToolDefinition } from '@earendil-works/pi-coding-agent';

export interface RegisteredTool {
  definition: ToolDefinition;
  call(params: Record<string, unknown>, cwd: string): Promise<{ text: string; details: Record<string, unknown> }>;
}

export interface ToolHost {
  pi: ExtensionAPI;
  tools: Map<string, RegisteredTool>;
  fire(event: 'session_start' | 'session_shutdown', cwd: string): Promise<void>;
}

export function createToolHost(): ToolHost {
  const tools = new Map<string, RegisteredTool>();
  const handlers = new Map<string, ((event: unknown, ctx: ExtensionContext) => unknown)[]>();

  const pi = {
    registerTool(definition: ToolDefinition) {
      tools.set(definition.name, {
        definition,
        async call(params, cwd) {
          const ctx = { cwd } as ExtensionContext;
          const result = await definition.execute('call-1', params, undefined, undefined, ctx);
          const text = (result.content ?? [])
            .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
            .map((part) => part.text)
            .join('\n');
          return { text, details: (result.details ?? {}) as Record<string, unknown> };
        },
      });
    },
    on(event: string, handler: (event: unknown, ctx: ExtensionContext) => unknown) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
  } as unknown as ExtensionAPI;

  return {
    pi,
    tools,
    async fire(event, cwd) {
      const ctx = { cwd } as ExtensionContext;
      for (const handler of handlers.get(event) ?? []) {
        await handler({ type: event }, ctx);
      }
    },
  };
}
