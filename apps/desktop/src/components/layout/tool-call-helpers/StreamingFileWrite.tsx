import { useMemo } from 'react';
import { FileCode2 } from 'lucide-react';
import type { ChatToolCallMessage } from '@/types/ipc';

const TAIL_LINES = 200;

/** Show a readable tail of streamed file input inside the full tool details. */
export function StreamingFileWrite({ tool }: { tool: ChatToolCallMessage }) {
  const content = typeof tool.input.content === 'string' ? tool.input.content : '';
  const path = typeof tool.input.path === 'string' ? tool.input.path : null;
  const isFragment = tool.toolName === 'edit';

  const { tail, lineCount } = useMemo(() => {
    const lines = content.split('\n');
    return {
      tail: lines.slice(-TAIL_LINES).join('\n'),
      lineCount: content ? lines.length - Number(content.endsWith('\n')) : 0,
    };
  }, [content]);

  return (
    <div className="overflow-hidden rounded-lg border border-status-info-border bg-status-info-faint">
      <div className="flex items-center gap-2 px-3 py-2">
        <FileCode2 className="size-3.5 shrink-0 text-status-info" />
        <span className="min-w-0 truncate font-mono text-xs text-[var(--text-secondary)]">
          {path ?? 'Waiting for path…'}
        </span>
        <span className="ml-auto shrink-0 font-mono text-sm text-[var(--text-muted)]">
          {isFragment ? 'replacement · ' : ''}
          {lineCount} {lineCount === 1 ? 'line' : 'lines'}
        </span>
      </div>
      <pre className="flex max-h-60 flex-col justify-end overflow-hidden whitespace-pre bg-[var(--bg-surface)]/70 px-3 py-2 font-mono text-xs leading-relaxed text-[var(--text-secondary)]">
        {tail}
        <span className="inline-block h-3.5 w-1.5 animate-pulse bg-status-info align-text-bottom" />
      </pre>
    </div>
  );
}
