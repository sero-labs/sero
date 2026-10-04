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
 * flight are still finishing. `starting` does not: it covers workspace
 * preparation and the wait for the user to grant the Room its authority, and no
 * member works in either. `completing` does not either: `withRoomStatus` stamps
 * `endedAt` when completion begins, on the rule that the Room stopped working
 * then, and counting it here would contradict that stamp. Everything else,
 * including `paused`, `ready` and `draft`, is not working.
 */
const ACTIVE_STATUSES: readonly RoomStatus[] = ['running', 'pausing'];

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

/**
 * Writes the accumulator into a record that predates it, at `now`: the
 * migration instant the design names. Restart recovery calls this for every
 * Room, so a paused legacy Room keeps the figure it showed at that instant and
 * the figure stops growing. Without it the seed above is re-read against a
 * later `nowMs` each time and a paused Room's clock keeps running.
 */
export function seedActiveTime(runtime: RoomRuntimeState, now: string): RoomRuntimeState {
  if (runtime.activeMs !== undefined) return runtime;
  const activeMs = accumulated(runtime, Date.parse(now));
  const open = isActiveStatus(runtime.status) && !TERMINAL_ROOM_STATUSES.includes(runtime.status);
  return { ...runtime, activeMs, activeSince: open ? now : null, ...(runtime.startedAt ? { activeSeeded: true } : {}) };
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

/**
 * The longest a running Room goes between saved checkpoints. The runtime's
 * recovery tick writes one, so it must not run slower than this.
 */
export const ACTIVE_CHECKPOINT_MS = 60_000;

/**
 * Banks the open period and starts the next one at `now`. A process that dies
 * afterwards leaves an open period no older than the last checkpoint, instead
 * of one that began when the Room last changed status.
 */
export function checkpointActiveTime(runtime: RoomRuntimeState, now: string): RoomRuntimeState {
  if (runtime.activeSince == null) return runtime;
  const open = Math.max(0, Date.parse(now) - Date.parse(runtime.activeSince));
  return { ...runtime, activeMs: accumulated(runtime, Date.parse(now)) + open, activeSince: now };
}

/**
 * Banks the open period and leaves none open. For a graceful shutdown: the
 * Room keeps its status, and recovery opens a new period if it resumes.
 */
export function bankActiveTime(runtime: RoomRuntimeState, now: string): RoomRuntimeState {
  if (runtime.activeSince == null) return runtime;
  return { ...checkpointActiveTime(runtime, now), activeSince: null };
}

/**
 * For restart recovery. A period still open in a loaded record belonged to a
 * runtime that stopped without banking it. The time since its checkpoint is
 * mostly the closed interval, so none of it is counted. What the Room may have
 * worked after that checkpoint is at most one checkpoint interval, and it is
 * kept as an uncertain amount, not added to the measured figure.
 */
export function closeInterruptedPeriod(runtime: RoomRuntimeState, now: string): RoomRuntimeState {
  if (runtime.activeSince == null) return runtime;
  const gap = Math.max(0, Date.parse(now) - Date.parse(runtime.activeSince));
  return {
    ...runtime,
    activeSince: null,
    activeUncertainMs: (runtime.activeUncertainMs ?? 0) + Math.min(gap, ACTIVE_CHECKPOINT_MS),
  };
}

/**
 * What a surface must say beside the figure when it is not a plain measured
 * time. `short` sits next to the number; `full` is the sentence behind it.
 * Null when the figure is measured working time and nothing is uncertain.
 */
export function activeTimeNote(
  runtime: Pick<RoomRuntimeState, 'activeSeeded' | 'activeUncertainMs'>,
): { short: string; full: string } | null {
  const uncertainMin = Math.ceil((runtime.activeUncertainMs ?? 0) / 60_000);
  const uncertain = uncertainMin > 0
    ? { short: `up to ${uncertainMin}m uncounted`, full: `Sero closed unexpectedly. Up to ${uncertainMin} min of work after the last saved time is not counted.` }
    : null;
  if (!runtime.activeSeeded) return uncertain;
  const seeded = { short: 'before tracking', full: 'This time was recorded before working time was tracked, so it includes time the Room was not working.' };
  return uncertain ? { short: `${seeded.short}, ${uncertain.short}`, full: `${seeded.full} ${uncertain.full}` } : seeded;
}
