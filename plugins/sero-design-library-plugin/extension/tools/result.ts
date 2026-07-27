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
