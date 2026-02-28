/**
 * JobCard — displays a single cron job with actions.
 */

import { Badge } from '@sero/ui/components/ui/badge';
import { Button } from '@sero/ui/components/ui/button';
import { Card } from '@sero/ui/components/ui/card';
import { cn } from '@sero/ui/lib/utils';
import { cronToHuman } from '../../shared/cron';
import type { CronJob } from '../../shared/types';

interface JobCardProps {
  job: CronJob;
  onEdit: (name: string) => void;
  onToggleEnabled: (name: string) => void;
  onRemove: (name: string) => void;
  onRun: (name: string) => void;
  schedulerActive: boolean;
}

export function JobCard({
  job,
  onEdit,
  onToggleEnabled,
  onRemove,
  onRun,
  schedulerActive,
}: JobCardProps) {
  const human = cronToHuman(job.schedule);

  return (
    <Card
      className={cn(
        'gap-0 py-0 shadow-none transition-colors',
        job.disabled && 'opacity-50',
      )}
    >
      <div className="px-4 py-3">
        {/* Header row: name + badges */}
        <div className="mb-2 flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            {job.name}
          </span>

          {job.disabled ? (
            <Badge variant="secondary" className="text-[10px]">
              Paused
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-emerald-500/30 text-[10px] text-emerald-500"
            >
              Active
            </Badge>
          )}

          {job.channel !== 'cron' && (
            <Badge
              variant="outline"
              className="border-primary/30 text-[10px] text-primary"
            >
              {job.channel}
            </Badge>
          )}

          {job.model && (
            <Badge
              variant="outline"
              className="border-amber-500/30 text-[10px] font-mono text-amber-500"
            >
              {job.model}
            </Badge>
          )}
        </div>

        {/* Schedule */}
        <div className="mb-1.5 flex items-center gap-2">
          <code className="rounded bg-secondary px-2 py-0.5 text-xs text-foreground">
            {job.schedule}
          </code>
          <span className="text-xs text-muted-foreground">{human}</span>
        </div>

        {/* Prompt (truncated) */}
        <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {job.prompt}
        </p>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onEdit(job.name)}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onToggleEnabled(job.name)}
          >
            {job.disabled ? '▶ Enable' : '⏸ Disable'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onRun(job.name)}
            disabled={!schedulerActive}
            title={
              schedulerActive ? 'Run now' : 'Start scheduler first'
            }
          >
            ▶ Run
          </Button>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-destructive hover:text-destructive"
            onClick={() => onRemove(job.name)}
          >
            Remove
          </Button>
        </div>
      </div>
    </Card>
  );
}
