/**
 * LoopScheduleCard, one scheduled Orchestrator loop with schedule actions.
 * The loop itself is managed in the Orchestrator app; from here you can edit
 * or pause its schedule and jump to the loop's details.
 */

import { ExternalLink, Pause, Play } from 'lucide-react';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Card } from '@sero-ai/ui/components/ui/card';
import { cn } from '@sero-ai/ui/lib/utils';
import { cronToHuman } from '../../shared/cron';
import { formatFireTime, type ScheduledLoopRow } from '../lib/orchestrator-loops';

interface LoopScheduleCardProps {
  row: ScheduledLoopRow;
  onEditSchedule: (row: ScheduledLoopRow) => void;
  onTogglePaused: (row: ScheduledLoopRow) => void;
  onOpenLoop: (loopId: string) => void;
}

const STATUS_BADGE: Record<ScheduledLoopRow['status'], { label: string; className: string }> = {
  active: { label: 'Active', className: 'border-emerald-500/30 text-emerald-500' },
  draft: { label: 'Draft', className: 'border-border text-muted-foreground' },
  blocked: { label: 'Blocked', className: 'border-destructive/30 text-destructive' },
  complete: { label: 'Complete', className: 'border-blue-500/30 text-blue-500' },
  disabled: { label: 'Disabled', className: 'border-border text-muted-foreground' },
};

export function LoopScheduleCard({ row, onEditSchedule, onTogglePaused, onOpenLoop }: LoopScheduleCardProps) {
  const status = STATUS_BADGE[row.status];
  // A schedule can only be edited/paused while it can still fire: not exhausted,
  // and on a loop that is still running (complete/disabled loops restart in Orchestrator).
  const canManage = !row.exhausted && row.status !== 'complete' && row.status !== 'disabled';

  return (
    <Card className={cn('gap-0 py-0 shadow-none transition-colors', (row.scheduleDisabled || row.exhausted) && 'opacity-50')}>
      <div className="px-4 py-3">
        {/* Header row: title + badges */}
        <div className="mb-2 flex items-center gap-2">
          <span className="text-base font-semibold text-foreground">{row.title}</span>
          <Badge variant="outline" className={cn('text-sm', status.className)}>
            {status.label}
          </Badge>
          {row.exhausted ? (
            <Badge variant="secondary" className="text-sm" title="This schedule reached its run limit and won't fire again">
              Run limit reached
            </Badge>
          ) : (
            row.scheduleDisabled && canManage && (
              <Badge variant="secondary" className="text-sm">
                Schedule paused
              </Badge>
            )
          )}
          {row.firesOnEvents && (
            <Badge variant="outline" className="border-primary/30 text-sm text-primary" title="This loop also runs when its events fire">
              Events
            </Badge>
          )}
        </div>

        {/* Schedule */}
        <div className="mb-1.5 flex items-center gap-2">
          <code className="rounded bg-secondary px-2 py-0.5 text-xs text-foreground">{row.schedule}</code>
          <span className="text-xs text-muted-foreground">{cronToHuman(row.schedule)} (UTC)</span>
        </div>

        {/* Next / last fire */}
        <p className="mb-3 text-xs text-muted-foreground">
          {row.exhausted
            ? 'Reached its run limit'
            : row.nextFireAt
              ? `Next run ${formatFireTime(row.nextFireAt)}`
              : 'No run scheduled'}
          {row.lastFireAt ? ` · Last run ${formatFireTime(row.lastFireAt)}` : ''}
        </p>

        {/* Actions — a spent schedule (exhausted, or a complete/disabled loop) can't be edited or resumed; restart the loop in Orchestrator */}
        <div className="flex items-center gap-1.5">
          {canManage && (
            <>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onEditSchedule(row)}>
                Edit schedule
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onTogglePaused(row)}>
                {row.scheduleDisabled ? (
                  <>
                    <Play className="size-3.5" />
                    Resume
                  </>
                ) : (
                  <>
                    <Pause className="size-3.5" />
                    Pause
                  </>
                )}
              </Button>
            </>
          )}
          <div className="flex-1" />
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onOpenLoop(row.loopId)}>
            <ExternalLink className="size-3.5" />
            Open in Orchestrator
          </Button>
        </div>
      </div>
    </Card>
  );
}
