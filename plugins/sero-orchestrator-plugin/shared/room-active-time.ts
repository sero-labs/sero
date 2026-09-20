/**
 * How long a Room has actually been working.
 *
 * The time limit used to be tested against `now - startedAt`, and so did the
 * Room header, which is why a Room paused for nine days against a one-hour
 * limit read `229h 28m of 1h`. Both were faithful to the same wrong rule: a
 * paused Room is not spending its time budget, so neither the clock nor the
 * limit should move while it is paused.
 *
 * This mirrors `elapsedActiveMs` in runtime/goals/goal-limits.ts, which already
 * solves it for Goals: a saved accumulator plus the period that is open now.
 */

import { TERMINAL_ROOM_STATUSES, type RoomRuntimeState, type RoomStatus } from './room-types';

/**
 * Statuses that spend the Room's time budget. `pausing` counts because turns in
 * flight are still finishing. `completing` does not: `withRoomStatus` stamps
 * `endedAt` when completion begins, on the rule that the Room stopped working
 * then, and counting it here would contradict that stamp. Everything else,
 * including `paused`, `ready` and `draft`, is not working.
 */
const ACTIVE_STATUSES: readonly RoomStatus[] = ['starting', 'running', 'pausing'];

export function isActiveStatus(status: RoomStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

/**
 * The accumulator for a record that predates it: the wall clock it has already
 * accrued. Seeding from zero would hand back time that was really spent, so an
 * existing Room keeps the figure it shows today and only stops growing.
 */
function accumulated(runtime: Pick<RoomRuntimeState, 'activeMs' | 'startedAt' | 'endedAt'>, nowMs: number): number {
  if (runtime.activeMs !== undefined) return runtime.activeMs;
  if (!runtime.startedAt) return 0;
  const until = runtime.endedAt ? Date.parse(runtime.endedAt) : nowMs;
  return Math.max(0, until - Date.parse(runtime.startedAt));
}

/** Time the Room has been active: what is banked, plus the period open now. */
export function elapsedActiveMs(
  runtime: Pick<RoomRuntimeState, 'activeMs' | 'activeSince' | 'startedAt' | 'endedAt' | 'status'>,
  nowMs: number,
): number {
  const banked = accumulated(runtime, nowMs);
  // A record with no accumulator has its open period already inside the wall
  // clock seeded above, so adding it again would count it twice.
  if (runtime.activeMs === undefined) return banked;
  const open = runtime.activeSince ? Math.max(0, nowMs - Date.parse(runtime.activeSince)) : 0;
  return banked + open;
}

/**
 * Closes or opens the active period as the Room's status changes. Called from
 * the one helper every status transition goes through, so no timer runs and
 * the figure is correct whenever the record is read.
 */
export function withActiveTime(
  runtime: RoomRuntimeState,
  nextStatus: RoomStatus,
  now: string,
): Pick<RoomRuntimeState, 'activeMs' | 'activeSince'> {
  const nowMs = Date.parse(now);
  const banked = accumulated(runtime, nowMs);
  const wasActive = runtime.activeSince != null;
  const willBeActive = isActiveStatus(nextStatus) && !TERMINAL_ROOM_STATUSES.includes(nextStatus);

  if (wasActive && !willBeActive) {
    const open = Math.max(0, nowMs - Date.parse(runtime.activeSince!));
    return { activeMs: banked + open, activeSince: null };
  }
  if (!wasActive && willBeActive) return { activeMs: banked, activeSince: now };
  if (wasActive) return { activeMs: banked, activeSince: runtime.activeSince };
  return { activeMs: banked, activeSince: null };
}
