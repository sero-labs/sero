import type { ExtensionContext, ToolDefinition } from '@earendil-works/pi-coding-agent';

/**
 * Invoke a custom tool the way a session would.
 *
 * `execute` takes an `ExtensionContext` its callers inside a real session
 * always have. The reference tool never reads it, so tests pass a stand-in
 * rather than assembling a whole session context to satisfy the signature.
 */
const NO_CONTEXT = undefined as unknown as ExtensionContext;

export function invokeTool(tool: ToolDefinition, params: Record<string, unknown> = {}) {
  return tool.execute('test-call', params, new AbortController().signal, () => undefined, NO_CONTEXT);
}
