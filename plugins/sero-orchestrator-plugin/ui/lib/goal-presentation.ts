import type { GoalIndexEntry } from '../../shared/goal-types';
import type { MemberStatus } from '../components/room-kit/identity';

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

export function goalHistorySubtitle(goal: GoalIndexEntry): string {
  return `${sessionName(goal.sessionPath)} · ${goalStateLabel(goal)} · ${usage(goal)}`;
}
