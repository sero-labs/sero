import { useMemo } from 'react';
import type { ChatToolCallMessage } from '@/types/ipc';
import { buildStreamingFilePreview, TAIL_LINES } from './streaming-file-preview';

/** Show a readable tail of streamed file input inside the full tool details. */
export function StreamingFileWrite({ tool }: { tool: ChatToolCallMessage }) {
  const path = typeof tool.input.path === 'string' ? tool.input.path : null;
  const { previewText, lineCount, isFragment } = useMemo(
    () => buildStreamingFilePreview(tool),
    [tool],
  );

  const tail = useMemo(() => {
    if (!previewText) return '';
    return previewText.split('\n').slice(-TAIL_LINES).join('\n');
  }, [previewText]);

  return (
    <div className="min-w-0 space-y-1.5">
      <div className="grid min-w-0 grid-cols-[minmax(0,6rem)_minmax(0,1fr)_auto] gap-3">
        <span className="truncate font-mono text-sm text-(--text-muted)">file</span>
        <span className="min-w-0 truncate font-mono text-sm text-(--text-secondary)">
          {path ?? 'Waiting for path…'}
        </span>
        <span className="shrink-0 font-mono text-sm text-(--text-muted)">
          {isFragment ? 'replacement · ' : ''}
          {lineCount} {lineCount === 1 ? 'line' : 'lines'}
        </span>
      </div>
      <pre className="flex max-h-60 flex-col justify-end overflow-hidden whitespace-pre py-1 font-mono text-sm leading-relaxed text-[var(--text-secondary)]">
        {tail}
        <span className="inline-block h-3.5 w-1.5 animate-pulse bg-status-info align-text-bottom" />
      </pre>
    </div>
  );
}
