/**
 * RunHistory — shows recent cron job execution results.
 */

import { Badge } from '@sero/ui/components/ui/badge';
import { cn } from '@sero/ui/lib/utils';
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
      {results.slice(0, 20).map((r, i) => (
        <div
          key={`${r.jobName}-${r.startedAt}`}
          className={cn(
            'flex items-center gap-3 px-4 py-2 text-xs',
            i < results.length - 1 && 'border-b border-border',
          )}
        >
          {/* Status dot */}
          <span
            className={cn(
              'h-1.5 w-1.5 shrink-0 rounded-full',
              r.ok ? 'bg-emerald-500' : 'bg-destructive',
            )}
          />

          {/* Job name */}
          <span className="font-medium text-foreground">{r.jobName}</span>

          {/* Duration */}
          <Badge variant="secondary" className="text-[10px]">
            {formatDuration(r.durationMs)}
          </Badge>

          {/* Error (if any) */}
          {r.error && (
            <span className="line-clamp-1 flex-1 text-destructive">
              {r.error}
            </span>
          )}

          <div className="flex-1" />

          {/* Time ago */}
          <span className="shrink-0 text-muted-foreground">
            {timeAgo(r.startedAt)}
          </span>
        </div>
      ))}
    </div>
  );
}
