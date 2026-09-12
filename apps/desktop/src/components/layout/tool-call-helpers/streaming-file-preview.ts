import type { ChatToolCallMessage } from '@/types/ipc';

/** Lines of streamed input shown at the tail of the preview. */
export const TAIL_LINES = 200;

const ARRAY_SEPARATOR = '\n──────\n';

/** Count replacement lines for one payload, using the trailing-newline rule. */
function countReplacementLines(text: string): number {
  return text ? text.split('\n').length - Number(text.endsWith('\n')) : 0;
}

function readArrayEntry(entry: unknown): string {
  if (!entry || typeof entry !== 'object') return '';
  const value = (entry as { newText?: unknown }).newText;
  return typeof value === 'string' ? value : '';
}

export interface StreamingFilePreview {
  previewText: string;
  lineCount: number;
  isFragment: boolean;
}

/**
 * Replacement text for a streamed file tool call.
 *
 * `write` sends `content`. `edit` sends top-level `newText` for a single
 * replacement and `edits[].newText` for an array. A present `edits[]` array is
 * authoritative: incomplete entries never fall back to top-level fields. The
 * line count sums the available payloads, so entry separators do not inflate it.
 */
export function buildStreamingFilePreview(tool: ChatToolCallMessage): StreamingFilePreview {
  const isFragment = tool.toolName === 'edit';

  if (Array.isArray(tool.input.edits)) {
    const entries = tool.input.edits.map(readArrayEntry);
    const available = entries.filter((text) => text.length > 0);
    return {
      isFragment,
      previewText: available.join(ARRAY_SEPARATOR),
      lineCount: entries.reduce((total, text) => total + countReplacementLines(text), 0),
    };
  }

  if (typeof tool.input.newText === 'string') {
    return {
      isFragment,
      previewText: tool.input.newText,
      lineCount: countReplacementLines(tool.input.newText),
    };
  }

  const content = typeof tool.input.content === 'string' ? tool.input.content : '';
  return { isFragment, previewText: content, lineCount: countReplacementLines(content) };
}
