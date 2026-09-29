/**
 * Tool result extraction for the CLI bridge.
 *
 * Turns a Pi tool result's content into CLI content blocks and plain text.
 */

import type { CliContentBlock } from './types';

/** Reads the text and image blocks out of a Pi tool result. */
export function extractContent(result: unknown): CliContentBlock[] {
  const content = (result as { content?: unknown })?.content;
  if (!Array.isArray(content)) return [];

  return content.flatMap((block): CliContentBlock[] => {
    if (!block || typeof block !== 'object') return [];
    if ((block as { type?: string }).type === 'text' && typeof (block as { text?: unknown }).text === 'string') {
      return [{ type: 'text', text: (block as { text: string }).text }];
    }
    if ((block as { type?: string }).type === 'image' && typeof (block as { data?: unknown }).data === 'string') {
      return [{
        type: 'image',
        data: (block as { data: string }).data,
        mimeType: typeof (block as { mimeType?: unknown }).mimeType === 'string'
          ? (block as { mimeType: string }).mimeType
          : 'image/png',
      }];
    }
    return [];
  });
}

/** Joins the text blocks of a CLI content list. */
export function extractText(content: CliContentBlock[]): string {
  return content
    .filter((entry): entry is { type: 'text'; text: string } => entry.type === 'text')
    .map((entry) => entry.text)
    .join('\n');
}
