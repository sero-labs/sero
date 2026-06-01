/**
 * RunHistory, shows recent cron job execution results with expandable output.
 */

import { useState } from 'react';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Button } from '@sero-ai/ui/components/ui/button';
import { cn } from '@sero-ai/ui/lib/utils';
import type { CronRunResult } from '../../shared/types';
import { formatDuration, timeAgo } from '../lib/cron-utils';

interface RunHistoryProps {
  results: CronRunResult[];
}

export function RunHistory({ results }: RunHistoryProps) {
  if (results.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-muted-foreground">
        No executions yet
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {results.map((r, i) => (
        <RunResultRow
          key={`${r.jobName}-${r.startedAt}`}
          result={r}
          isLast={i === results.length - 1}
          defaultExpanded={i === 0 && !!(r.output?.trim())}
        />
      ))}
    </div>
  );
}

function RunResultRow({
  result: r,
  isLast,
  defaultExpanded,
}: {
  result: CronRunResult;
  isLast: boolean;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasOutput = !!r.output?.trim();
  const hasError = !!r.error;
  const hasExpandable = hasOutput || hasError;

  // First line preview for inline display
  const preview = r.output?.trim().split('\n')[0]?.slice(0, 80) ?? '';

  return (
    <div className={cn('px-4 py-2.5 text-xs', !isLast && 'border-b border-border')}>
      {/* Summary row */}
      <div className="flex items-center gap-3">
        {/* Status dot */}
        <span
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            r.ok ? 'bg-emerald-500' : 'bg-destructive',
          )}
        />

        {/* Job name */}
        <span className="font-medium text-foreground">{r.jobName}</span>

        {/* Duration */}
        <Badge variant="secondary" className="text-[10px]">
          {formatDuration(r.durationMs)}
        </Badge>

        {/* Inline preview (when collapsed and has output) */}
        {!expanded && hasOutput && (
          <span className="line-clamp-1 flex-1 text-muted-foreground">
            {preview}{preview.length >= 80 ? '...' : ''}
          </span>
        )}

        {/* Error hint (when no output) */}
        {!expanded && hasError && !hasOutput && (
          <span className="line-clamp-1 flex-1 text-destructive">
            {r.error}
          </span>
        )}

        <div className="flex-1" />

        {/* Expand toggle */}
        {hasExpandable && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
          >
            {expanded ? '▾ Hide' : '▸ Output'}
          </Button>
        )}

        {/* Time ago */}
        <span className="shrink-0 text-muted-foreground">
          {timeAgo(r.startedAt)}
        </span>
      </div>

      {/* Expanded output */}
      {expanded && hasExpandable && (
        <div className="mt-2 rounded-md border border-border bg-muted/30 p-3">
          {hasOutput && (
            <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-foreground/80">
              {r.output}
            </pre>
          )}
          {hasError && (
            <pre className="mt-1 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-destructive">
              {r.error}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
