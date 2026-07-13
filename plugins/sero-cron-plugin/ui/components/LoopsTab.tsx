/**
 * LoopsTab, scheduled Orchestrator loops for the active workspace.
 * Read-only except for the schedule: edit/pause it here, everything else in
 * the Orchestrator app.
 */

import { ExternalLink, Infinity as InfinityIcon } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';

import type { ScheduledLoopRow } from '../lib/orchestrator-loops';
import { LoopScheduleCard } from './LoopScheduleCard';

interface LoopsTabProps {
  rows: ScheduledLoopRow[];
  /** False when no workspace is active (loops are per-workspace). */
  hasWorkspace: boolean;
  error: string | null;
  onDismissError: () => void;
  onEditSchedule: (row: ScheduledLoopRow) => void;
  onTogglePaused: (row: ScheduledLoopRow) => void;
  onOpenLoop: (loopId: string) => void;
  onOpenOrchestrator: () => void;
}

export function LoopsTab({
  rows,
  hasWorkspace,
  error,
  onDismissError,
  onEditSchedule,
  onTogglePaused,
  onOpenLoop,
  onOpenOrchestrator,
}: LoopsTabProps) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center animate-cron-fade-in">
        <InfinityIcon className="mb-4 size-10 text-muted-foreground" />
        <h2 className="text-base font-medium text-foreground">No scheduled loops</h2>
        <p className="mt-1.5 max-w-[260px] text-xs leading-relaxed text-muted-foreground">
          {hasWorkspace
            ? 'Orchestrator loops with a schedule show up here.'
            : 'Open a workspace to see its scheduled loops.'}
        </p>
        {hasWorkspace && (
          <Button size="sm" className="mt-4" onClick={onOpenOrchestrator}>
            <ExternalLink className="size-3.5" />
            Open Orchestrator
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 animate-cron-fade-in">
      {error && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <span>{error}</span>
          <button type="button" className="shrink-0 underline" onClick={onDismissError}>
            dismiss
          </button>
        </div>
      )}
      {rows.map((row) => (
        <LoopScheduleCard
          key={`${row.loopId}:${row.triggerId}`}
          row={row}
          onEditSchedule={onEditSchedule}
          onTogglePaused={onTogglePaused}
          onOpenLoop={onOpenLoop}
        />
      ))}
    </div>
  );
}
