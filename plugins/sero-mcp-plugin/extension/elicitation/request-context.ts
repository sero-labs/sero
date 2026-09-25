import { AsyncLocalStorage } from 'node:async_hooks';

/** The Sero call that an MCP request belongs to. */
export interface McpRequestContext {
  serverLabel: string;
  toolName?: string;
  /** Shows a short message in the chat that made the call. */
  notify?: (text: string) => void;
}

const storage = new AsyncLocalStorage<McpRequestContext>();
const inFlight = new Map<string, McpRequestContext[]>();

/** Runs an MCP call with its context, so that a server request during the call can name its owner. */
export async function runWithRequestContext<T>(context: McpRequestContext, run: () => Promise<T>): Promise<T> {
  const active = inFlight.get(context.serverLabel) ?? [];
  active.push(context);
  inFlight.set(context.serverLabel, active);
  try {
    return await storage.run(context, run);
  } finally {
    active.splice(active.indexOf(context), 1);
    if (active.length === 0) inFlight.delete(context.serverLabel);
  }
}

/**
 * Finds the call that a server request belongs to. A legacy server sends its
 * request outside the call's async context, so Sero falls back to the newest
 * call in flight on that server.
 */
export function findRequestContext(serverLabel: string): McpRequestContext {
  const current = storage.getStore();
  if (current?.serverLabel === serverLabel) return current;
  return inFlight.get(serverLabel)?.at(-1) ?? { serverLabel };
}
