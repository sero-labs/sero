import { useMemo, useState } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import type { GoalIndexEntry, GoalStatus } from '../../shared/goal-types';
import { ListRow } from './ListRow';
import { SectionHead, type MemberStatus } from './room-kit';

const PAGE = 8;
const ORDER: GoalStatus[] = ['active', 'blocked', 'waiting', 'paused', 'limited', 'complete'];

export function goalDot(goal: GoalIndexEntry): MemberStatus {
  if (goal.closedAt) return 'idle';
  if (goal.status === 'active') return 'working';
  if (goal.status === 'complete') return 'done';
  if (goal.status === 'blocked' || goal.status === 'limited') return 'blocked';
  return 'waiting';
}

export function goalStateLabel(goal: GoalIndexEntry): string {
  if (goal.closedAt) return 'Stopped';
  if (goal.status === 'complete') return 'Reported complete';
  if (goal.status === 'paused' && goal.pauseReason === 'no-progress') return 'Held for no progress';
  return goal.status[0].toUpperCase() + goal.status.slice(1);
}

function sessionName(path: string): string {
  const leaf = path.split(/[\\/]/).pop() ?? path;
  return leaf.replace(/\.jsonl?$/, '') || 'Chat session';
}

function usage(goal: GoalIndexEntry): string {
  const automaticTurns = goal.automaticTurns ?? 0;
  const turns = goal.maxAutomaticTurns === undefined
    ? `${automaticTurns} turns`
    : `${automaticTurns}/${goal.maxAutomaticTurns}`;
  const costUsd = goal.costUsd ?? 0;
  return costUsd > 0 ? `${turns} · $${costUsd.toFixed(2)}` : turns;
}

export function GoalsOverview({ goals, onOpenGoal }: { goals: GoalIndexEntry[]; onOpenGoal: (goalId: string) => void }) {
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
      {sorted.slice(0, shown).map((goal) => (
        <ListRow
          key={goal.id}
          status={goalDot(goal)}
          title={goal.objective}
          sub={`${sessionName(goal.sessionPath)} · ${goalStateLabel(goal)}`}
          needsCount={['blocked', 'waiting'].includes(goal.status) || goal.pauseReason === 'no-progress' ? 1 : 0}
          meta={usage(goal)}
          onClick={() => onOpenGoal(goal.id)}
        />
      ))}
      {sorted.length > shown ? (
        <Button size="sm" variant="ghost" className="self-start text-xs text-room-text3" onClick={() => setShown((value) => value + PAGE)}>
          Show {sorted.length - shown} more
        </Button>
      ) : null}
    </div>
  );
}
