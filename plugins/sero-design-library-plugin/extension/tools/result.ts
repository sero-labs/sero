import { isSafeId } from '../../shared/paths';

/**
 * Tool result helpers.
 *
 * `details` rides alongside the text so the UI can consume structured data
 * from the same call the agent reads as prose — one tool, two audiences.
 */

export interface ToolResult {
  content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>;
  details: Record<string, unknown>;
}

export function text(message: string, details: Record<string, unknown> = {}): ToolResult {
  return { content: [{ type: 'text', text: message }], details };
}

export function image(data: string, mimeType: string, caption: string): ToolResult {
  return {
    content: [
      { type: 'text', text: caption },
      { type: 'image', data, mimeType },
    ],
    details: { mimeType },
  };
}

export function failure(message: string): ToolResult {
  return text(message, { ok: false });
}

/**
 * Narrow a caller-supplied id to a safe one.
 *
 * The path helpers assert this too, and deliberately so: this layer turns a bad
 * id into a readable tool error, while the helpers make it impossible for a new
 * call site to skip the check at all.
 */
export function checkId(value: string | undefined, kind: string): { id: string } | { error: ToolResult } {
  if (value !== undefined && isSafeId(value)) return { id: value };
  return { error: failure(`${JSON.stringify(value ?? null)} is not a valid ${kind}.`) };
}
