import { useMemo, useState } from 'react';
import { cn } from '@sero-ai/ui/lib/utils';

const DEFAULT_LINE_LIMIT = 14;
const DEFAULT_CHARACTER_LIMIT = 2_000;

/**
 * Long tool text stays inside the chat scroll: clamp to a line budget and
 * open the rest in place, so no tool call owns a scrollbar of its own.
 */
export function ClampedText({
  text,
  lineLimit = DEFAULT_LINE_LIMIT,
  tone = 'default',
}: {
  text: string;
  lineLimit?: number;
  tone?: 'default' | 'error';
}) {
  const [open, setOpen] = useState(false);
  const { preview, isClamped, expandLabel } = useMemo(() => {
    const lines = text.split('\n');
    const lineClamped = lines.length > lineLimit;
    const linePreview = lineClamped ? lines.slice(0, lineLimit).join('\n') : text;
    const characterClamped = linePreview.length > DEFAULT_CHARACTER_LIMIT;

    return {
      preview: characterClamped ? linePreview.slice(0, DEFAULT_CHARACTER_LIMIT) : linePreview,
      isClamped: lineClamped || characterClamped,
      expandLabel: characterClamped
        ? `Show all ${text.length.toLocaleString()} characters`
        : `Show all ${lines.length} lines`,
    };
  }, [lineLimit, text]);

  return (
    <div className="min-w-0">
      <pre
        className={cn(
          'whitespace-pre-wrap break-words font-mono text-sm leading-relaxed',
          tone === 'error' ? 'text-status-error' : 'text-[var(--text-secondary)]',
        )}
      >
        {open || !isClamped ? text : preview}
      </pre>
      {isClamped ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setOpen((previous) => !previous);
          }}
          className="mt-1 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          {open ? 'Show less' : expandLabel}
        </button>
      ) : null}
    </div>
  );
}
