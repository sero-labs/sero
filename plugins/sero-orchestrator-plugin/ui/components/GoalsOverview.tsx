import { useMemo, useState } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import type { GoalIndexEntry, GoalStatus } from '../../shared/goal-types';
import { goalDot, goalHistorySubtitle } from '../lib/goal-presentation';
import { GoalDeleteButton } from './GoalDeleteButton';
import { Pill, SectionHead } from './room-kit/chrome';
import { StatusDot } from './room-kit/identity';

const PAGE = 8;
const ORDER: GoalStatus[] = ['active', 'blocked', 'waiting', 'paused', 'limited', 'complete'];

export function GoalsOverview({
  goals,
  busy = false,
  onOpenGoal,
  onDeleteGoal,
}: {
  goals: GoalIndexEntry[];
  busy?: boolean;
  onOpenGoal: (goalId: string) => void;
  onDeleteGoal?: (goalId: string) => void;
}) {
  const [shown, setShown] = useState(PAGE);
  const sorted = useMemo(() => goals.toSorted((a, b) => {
    const finishedA = a.closedAt || a.status === 'complete' ? 1 : 0;
    const finishedB = b.closedAt || b.status === 'complete' ? 1 : 0;
    return finishedA - finishedB
      || ORDER.indexOf(a.status) - ORDER.indexOf(b.status)
      || b.updatedAt.localeCompare(a.updatedAt);
  }), [goals]);

  if (goals.length === 0) {
    return <p className="text-sm text-room-text3">No goals yet. Start one with <code>/goal</code> in a chat.</p>;
  }

  return (
    <div className="flex flex-col">
      <SectionHead count={goals.length}>Goals</SectionHead>
      {sorted.slice(0, shown).map((goal) => {
        const needsAttention = ['blocked', 'waiting'].includes(goal.status) || goal.pauseReason === 'no-progress';
        const finished = Boolean(goal.closedAt) || goal.status === 'complete';
        return (
          <div
            key={goal.id}
            className="mb-1 flex items-center rounded-lg border border-room-line bg-room-surface pr-2 last:mb-0 hover:bg-room-raised/60"
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 items-start gap-2.5 px-3 py-2 text-left"
              onClick={() => onOpenGoal(goal.id)}
            >
              <StatusDot status={goalDot(goal)} className="mt-1.5" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-room-text">{goal.objective}</span>
                <span className="mt-0.5 block truncate text-xs text-room-text3" title={goalHistorySubtitle(goal)}>
                  {goalHistorySubtitle(goal)}
                </span>
              </span>
              {needsAttention ? <Pill tone="warn" className="mt-0.5 shrink-0">Needs you</Pill> : null}
            </button>
            {finished && onDeleteGoal ? (
              <GoalDeleteButton busy={busy} onDelete={() => onDeleteGoal(goal.id)} />
            ) : null}
          </div>
        );
      })}
      {sorted.length > shown ? (
        <Button size="sm" variant="ghost" className="self-start text-xs text-room-text3" onClick={() => setShown((value) => value + PAGE)}>
          Show {sorted.length - shown} more
        </Button>
      ) : null}
    </div>
  );
}
