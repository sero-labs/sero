import { useMemo, useState } from 'react';
import { cn } from '@sero-ai/ui/lib/utils';

const DEFAULT_LINE_LIMIT = 14;

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
  const lines = useMemo(() => text.split('\n'), [text]);
  const isClamped = lines.length > lineLimit;

  return (
    <div className="min-w-0">
      <pre
        className={cn(
          'whitespace-pre-wrap break-words font-mono text-sm leading-relaxed',
          tone === 'error' ? 'text-status-error' : 'text-[var(--text-secondary)]',
        )}
      >
        {open || !isClamped ? text : lines.slice(0, lineLimit).join('\n')}
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
          {open ? 'Show less' : `Show all ${lines.length} lines`}
        </button>
      ) : null}
    </div>
  );
}
