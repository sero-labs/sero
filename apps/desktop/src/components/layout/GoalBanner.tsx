import { useState } from 'react';
import { ChevronRight, CircleStop, Pause, Play, Target } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { cn } from '@sero-ai/ui/lib/utils';
import type { ChatGoalSnapshot } from '@/types/ipc';
import type { GoalBannerAction } from './goal-banner-actions';

function displayStatus(goal: ChatGoalSnapshot): string {
  if (goal.closedAt) return 'Stopped';
  if (goal.status === 'complete') return 'Reported';
  if (goal.status === 'paused' && goal.pauseReason === 'no-progress') return 'Held';
  if (goal.status === 'limited') return 'Limit';
  return goal.status[0].toUpperCase() + goal.status.slice(1);
}

function statusTone(goal: ChatGoalSnapshot): string {
  if (goal.status === 'active') return 'bg-status-success-subtle text-status-success';
  if (goal.status === 'paused' || goal.status === 'waiting') {
    return 'bg-status-warning-subtle text-status-warning';
  }
  if (goal.status === 'complete') return 'bg-status-info-subtle text-status-info';
  return 'bg-status-error-subtle text-status-error';
}

function reason(goal: ChatGoalSnapshot): string | null {
  if (goal.closedAt) return 'You stopped this goal. The objective was not marked as met.';
  if (goal.status === 'paused' && goal.pauseReason === 'no-progress') {
    return 'Held because three turns repeated the same result without a tool call.';
  }
  if (goal.status === 'paused') return `Paused${goal.pauseReason ? ` after ${goal.pauseReason}` : ''}.`;
  if (goal.status === 'waiting') return goal.wait?.reason ?? 'Waiting for the user to resume it.';
  if (goal.status === 'blocked') return goal.block?.reason ?? 'The agent needs a decision from you.';
  if (goal.status === 'limited') return `Reached ${goal.limitReached ?? 'a budget limit'}. A limit is not completion.`;
  if (goal.status === 'complete') return 'The agent reported the criteria met. This claim is not verified.';
  return null;
}

function Budget({ label, used, limit }: { label: string; used: string; limit?: string }) {
  return (
    <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-2">
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div className="mt-0.5 font-mono text-xs text-[var(--text-secondary)]">
        {used}{limit ? ` of ${limit}` : ''}
      </div>
    </div>
  );
}

export function GoalBanner({
  goal,
  onAction,
}: {
  goal: ChatGoalSnapshot;
  onAction: (action: GoalBannerAction) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const turns = goal.limits.maxAttemptsTotal === undefined
    ? `${goal.usage.automaticTurns} turns`
    : `${goal.usage.automaticTurns}/${goal.limits.maxAttemptsTotal} turns`;
  const canResume = !goal.closedAt && ['paused', 'waiting', 'blocked'].includes(goal.status);
  const canStop = !goal.closedAt && goal.status !== 'complete';
  const explanation = reason(goal);

  return (
    <section className="shrink-0 border-b border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2" aria-label="Goal status">
      <div className="overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50">
        <div className="flex min-w-0 items-center gap-2 px-2.5 py-2">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            <ChevronRight className={cn('size-3.5 shrink-0 text-[var(--text-muted)] transition-transform', expanded && 'rotate-90')} />
            <Target className="size-3.5 shrink-0 text-[var(--accent-primary)]" />
            <span className="text-xs font-semibold text-[var(--text-secondary)]">Goal</span>
            <span className="min-w-0 truncate text-sm text-[var(--text-primary)]">{goal.objective}</span>
            <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', statusTone(goal))}>
              {displayStatus(goal)}
            </span>
            <span className="shrink-0 font-mono text-xs text-[var(--text-muted)]">{turns}</span>
          </button>
          <div className="flex shrink-0 items-center gap-1">
            {goal.status === 'active' && !goal.closedAt ? (
              <Button size="icon-sm" variant="ghost" title="Pause goal" aria-label="Pause goal" onClick={() => onAction('pause')}>
                <Pause className="size-3.5" />
              </Button>
            ) : null}
            {canResume ? (
              <Button size="icon-sm" variant="ghost" title="Resume goal" aria-label="Resume goal" onClick={() => onAction('resume')}>
                <Play className="size-3.5" />
              </Button>
            ) : null}
            {goal.status === 'limited' && !goal.closedAt ? (
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onAction('raise-limit')}>
                Raise limit
              </Button>
            ) : null}
            {canStop ? (
              <Button size="icon-sm" variant="ghost" title="Stop goal" aria-label="Stop goal" onClick={() => onAction('stop')}>
                <CircleStop className="size-3.5" />
              </Button>
            ) : null}
          </div>
        </div>

        {expanded ? (
          <div className="border-t border-[var(--border-subtle)] px-3 py-3">
            {explanation ? <p className="mb-3 text-xs text-[var(--text-secondary)]">{explanation}</p> : null}
            <div className="grid grid-cols-2 gap-2 @min-[760px]/panel:grid-cols-4">
              <Budget label="Automatic turns" used={String(goal.usage.automaticTurns)} limit={goal.limits.maxAttemptsTotal?.toLocaleString()} />
              <Budget label="Tokens" used={goal.usage.totalTokens.toLocaleString()} limit={goal.limits.maxTotalTokens?.toLocaleString()} />
              <Budget label="Cost" used={`$${goal.usage.costUsd.toFixed(2)}`} limit={goal.limits.maxCostUsd === undefined ? undefined : `$${goal.limits.maxCostUsd.toFixed(2)}`} />
              <Budget label="Active time" used={`${Math.round(goal.usage.activeMs / 60_000)} min`} limit={goal.limits.maxWallClockMs === undefined ? undefined : `${Math.round(goal.limits.maxWallClockMs / 60_000)} min`} />
            </div>
            <div className="mt-3">
              <div className="text-xs font-semibold text-[var(--text-secondary)]">Criteria</div>
              {goal.criteria.length > 0 ? (
                <ul className="mt-1.5 space-y-1 text-xs text-[var(--text-muted)]">
              {goal.criteria.map((criterion: string) => <li key={criterion}>- {criterion}</li>)}
                </ul>
              ) : <p className="mt-1 text-xs text-[var(--text-muted)]">The objective is the criterion.</p>}
            </div>
            {goal.reportedComplete?.evidence || goal.block?.evidence ? (
              <div className="mt-3">
                <div className="text-xs font-semibold text-[var(--text-secondary)]">Evidence</div>
                <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--text-muted)]">
                  {goal.reportedComplete?.evidence ?? goal.block?.evidence}
                </p>
              </div>
            ) : null}
            <p className="mt-3 text-[11px] text-[var(--text-muted)]">
              Only automatic Goal turns count. Tokens and cost are checked after each turn.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
