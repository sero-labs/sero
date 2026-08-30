import type { RoomSummary } from '../../shared/room-types';
import type { LoopSummary } from '../../shared/types';
import type { GoalIndexEntry } from '../../shared/goal-types';

/** Keep the Home badge equal to the items in the "Needs you" band. */
export function goalNeedsAttention(goal: GoalIndexEntry): boolean {
  return !goal.closedAt && (
    goal.status === 'blocked'
    || goal.status === 'waiting'
    || (goal.status === 'paused' && goal.pauseReason === 'no-progress')
  );
}

export function attentionCount(loops: LoopSummary[], rooms: RoomSummary[], goals: GoalIndexEntry[] = []): number {
  return (
    rooms.reduce(
      (count, room) =>
        count
        + (room.attention?.pause ? 1 : 0)
        + (room.attention?.approvals?.length ?? 0)
        + (room.attention?.requests?.length ?? 0),
      0,
    )
    + loops.reduce(
      (count, loop) =>
        count + (loop.attention?.input ? 1 : 0) + (loop.attention?.suggestions?.length ?? 0),
      0,
    )
    + goals.filter(goalNeedsAttention).length
  );
}
