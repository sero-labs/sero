/**
 * Room lifecycle transitions: create, start, pause, resume, cancel, complete
 * and delete (spec §16).
 *
 * These are the coordinator's own operations, split out to keep each file
 * inside the 500-line limit. They take a narrow context rather than the
 * coordinator itself, so each transition is testable on its own and none of
 * them can reach into scheduling.
 *
 * The authority rule that lives here: a grant is revoked when the Room
 * FINISHES — completed, cancelled or deleted. Pausing keeps it, because a
 * revoked grant can never be widened back and resuming must not need a second
 * approval from the user.
 */

import type { DeliveryReceipt } from '../../shared/delivery-types';
import type { RoomMember, RoomStopReason } from '../../shared/room-types';
import { TERMINAL_ROOM_STATUSES } from '../../shared/room-types';
import type { OrchestratorHost } from '../host';
import { requestRoomGrant, requirePersistentSessions } from './member-grant';
import { deliverRoomResult } from './room-delivery';
import type { MemberSessionPool } from './member-session';
import {
  buildRoomRecord,
  timelineEvent,
  withMember,
  withMemberStatus,
  withRoomStatus,
  type CreateRoomRequest,
} from './room-actions';
import type { RoomRecord } from './room-state';
import type { RoomStore } from './room-store';

export interface RoomActionResult {
  ok: boolean;
  error?: string;
  room?: RoomRecord;
}

export interface RoomCoordinatorEvent {
  roomId: string;
  kind: 'room-status' | 'member-status' | 'turn-ended' | 'progress' | 'blocked';
  memberId: string | null;
  detail: string;
}

/** What a lifecycle transition needs from the coordinator, and nothing more. */
export interface RoomLifecycleContext {
  host: OrchestratorHost;
  store: RoomStore;
  sessions: MemberSessionPool;
  /** True while this process has a turn running for the Room. */
  hasTurnsInFlight(roomId: string): boolean;
  /** Aborts every turn this process is running for the Room. */
  abortTurns(roomId: string): void;
  emit(event: RoomCoordinatorEvent): void;
  /** Drops ready signals for a Room that can no longer run. */
  forgetSignals(roomId: string): void;
}

export const ok = (room?: RoomRecord): RoomActionResult => ({ ok: true, room });
export const fail = (error: string): RoomActionResult => ({ ok: false, error });

const reread = async (ctx: RoomLifecycleContext, roomId: string, fallback: RoomRecord): Promise<RoomRecord> =>
  (await ctx.store.readRoom(roomId)) ?? fallback;

/** A draft Room: members are addressable, nothing runs, and no authority is held. */
export async function createRoom(ctx: RoomLifecycleContext, request: CreateRoomRequest): Promise<RoomActionResult> {
  const record = buildRoomRecord(ctx.host, request);
  const roomId = record.definition.id;
  await ctx.store.updateState((state) => ({ ...state, rooms: [...state.rooms, record] }));
  await ctx.store.appendTimeline(roomId, [
    timelineEvent(ctx.host, roomId, 'room-status', null, `Room drafted with ${record.members.length} members.`),
  ]);
  return ok(record);
}

/**
 * Start: request the grant the user approves, then bring the Conductor's
 * session up.
 *
 * The Conductor's session is opened here rather than lazily, so a bad
 * configuration fails at the Start press instead of stalling silently later.
 * Every other member's session opens on its first turn — a member that never
 * runs never consumes one (§14.3).
 */
export async function startRoom(ctx: RoomLifecycleContext, roomId: string): Promise<RoomActionResult> {
  const record = await ctx.store.readRoom(roomId);
  if (!record) return fail(`Room not found: ${roomId}`);
  if (record.runtime.status !== 'draft' && record.runtime.status !== 'ready') {
    return fail(`This Room is "${record.runtime.status}", so it cannot be started.`);
  }
  const conductor = record.members.find((member) => member.isConductor);
  if (!conductor) return fail('This Room has no Conductor.');

  // The user can decline, and the host denies anything outside their authority.
  // Both arrive as a rejection, and both mean no session is ever created.
  const grant = await requestRoomGrant(ctx.host, record).catch((error: unknown) => {
    ctx.host.log(`room ${roomId}: grant refused: ${String(error)}`);
    return null;
  });
  if (!grant) return fail('This Room was not allowed to start.');

  const now = ctx.host.now();
  await ctx.store.updateRoom(roomId, (current) =>
    withRoomStatus(
      {
        ...current,
        definition: { ...current.definition, grantId: grant.grantId },
        // Idle, not starting: a member without a session yet holds no execution
        // slot, and its session opens on its first turn.
        members: current.members.map((member) => withMemberStatus(member, 'idle', 'Ready.')),
      },
      'ready',
      now,
      null,
    ),
  );

  const started = await startConductor(ctx, roomId, conductor);
  if (!started.ok) return started;

  await ctx.store.appendTimeline(roomId, [timelineEvent(ctx.host, roomId, 'room-status', null, 'Room started.')]);
  ctx.emit({ roomId, kind: 'room-status', memberId: null, detail: 'Room started.' });
  return ok(await reread(ctx, roomId, record));
}

async function startConductor(
  ctx: RoomLifecycleContext,
  roomId: string,
  conductor: RoomMember,
): Promise<RoomActionResult> {
  const record = await ctx.store.readRoom(roomId);
  if (!record) return fail(`Room not found: ${roomId}`);
  const member = record.members.find((candidate) => candidate.id === conductor.id);
  const opened = member
    ? await ctx.sessions.ensure(record, member).catch((error: unknown) => {
        ctx.host.log(`room ${roomId}: the Conductor's session failed: ${String(error)}`);
        return null;
      })
    : null;
  if (opened) return ok(record);

  // No fallback Conductor in the first release: the Room pauses for the user
  // rather than running a team with nobody coordinating it (§13.4).
  const now = ctx.host.now();
  const detail = 'The Conductor could not start, so the Room is paused.';
  await ctx.store.updateRoom(roomId, (current) =>
    withRoomStatus(
      withMember(current, conductor.id, (entry) => withMemberStatus(entry, 'failed', 'Its session could not be opened.')),
      'paused',
      now,
      { kind: 'conductor-failed', detail, at: now },
    ),
  );
  return fail(detail);
}

export async function pauseRoom(
  ctx: RoomLifecycleContext,
  roomId: string,
  detail = 'You paused this Room.',
): Promise<RoomActionResult> {
  const record = await ctx.store.readRoom(roomId);
  if (!record) return fail(`Room not found: ${roomId}`);
  if (TERMINAL_ROOM_STATUSES.includes(record.runtime.status)) return fail('This Room has already finished.');
  const now = ctx.host.now();
  return settlePause(ctx, record, { kind: 'user-paused', detail, at: now }, now);
}

/**
 * Stops new turns. A turn already running is allowed to FINISH — aborting it
 * would lose the tokens already spent and leave its session in an uncertain
 * state — so the Room sits in `pausing` until the last one ends.
 */
export async function settlePause(
  ctx: RoomLifecycleContext,
  record: RoomRecord,
  stopReason: RoomStopReason,
  now: string,
): Promise<RoomActionResult> {
  const roomId = record.definition.id;
  const pausing = ctx.hasTurnsInFlight(roomId);
  await ctx.store.updateRoom(roomId, (current) => withRoomStatus(current, pausing ? 'pausing' : 'paused', now, stopReason));
  // Releasing closes the live sessions; every file stays, so a resume reopens
  // the same history rather than starting a new session (§14.3).
  if (!pausing) await ctx.sessions.releaseRoom(roomId);
  await ctx.store.appendTimeline(roomId, [timelineEvent(ctx.host, roomId, 'room-status', null, stopReason.detail)]);
  ctx.emit({ roomId, kind: 'room-status', memberId: null, detail: stopReason.detail });
  return ok(await reread(ctx, roomId, record));
}

export async function resumeRoom(ctx: RoomLifecycleContext, roomId: string): Promise<RoomActionResult> {
  const record = await ctx.store.readRoom(roomId);
  if (!record) return fail(`Room not found: ${roomId}`);
  if (record.runtime.status !== 'paused') return fail(`This Room is "${record.runtime.status}", so it cannot be resumed.`);
  if (!record.definition.grantId) return fail('This Room lost its authority to run and must be started again.');
  await ctx.store.updateRoom(roomId, (current) => withRoomStatus(current, 'running', ctx.host.now(), null));
  return ok(await reread(ctx, roomId, record));
}

export async function cancelRoom(
  ctx: RoomLifecycleContext,
  roomId: string,
  detail = 'You cancelled this Room.',
): Promise<RoomActionResult> {
  const record = await ctx.store.readRoom(roomId);
  if (!record) return fail(`Room not found: ${roomId}`);
  // Cancellation is the one path that does stop work mid-turn: the user asked
  // for it, so the tokens already spent are the price of stopping now.
  ctx.abortTurns(roomId);
  const now = ctx.host.now();
  await ctx.store.updateRoom(roomId, (current) =>
    withRoomStatus(
      { ...current, members: current.members.map((member) => withMemberStatus(member, 'completed', detail)) },
      'cancelled',
      now,
      { kind: 'user-cancelled', detail, at: now },
    ),
  );
  await releaseAuthority(ctx, roomId, detail);
  return ok(await reread(ctx, roomId, record));
}

/**
 * Completes the Room: records the transition, delivers the result, then closes
 * the sessions and revokes the grant so nothing can run afterwards.
 *
 * `summary` is the Conductor's final answer — it is what the invoking chat
 * receives. Delivery runs on the completed record, so what the user reads
 * (state, artifacts, cost) is what was actually persisted.
 */
export async function completeRoom(
  ctx: RoomLifecycleContext,
  roomId: string,
  summary = 'The Room finished its work.',
  receipt?: DeliveryReceipt,
): Promise<RoomActionResult> {
  const record = await ctx.store.readRoom(roomId);
  if (!record) return fail(`Room not found: ${roomId}`);
  if (TERMINAL_ROOM_STATUSES.includes(record.runtime.status)) return fail('This Room has already finished.');
  const now = ctx.host.now();
  await ctx.store.updateRoom(roomId, (current) => withRoomStatus(current, 'completing', now, null));
  await ctx.store.updateRoom(roomId, (current) =>
    withRoomStatus(
      { ...current, members: current.members.map((member) => withMemberStatus(member, 'completed', summary)) },
      'completed',
      ctx.host.now(),
      null,
    ),
  );

  // Delivery never decides whether the Room finished: the work is done, and a
  // refused destination is reported to the user rather than reopening the Room.
  const delivered = await deliverRoomResult({ host: ctx.host, store: ctx.store }, { roomId, finalResult: summary, receipt });
  if (!delivered.ok && delivered.problems.length > 0) {
    ctx.host.notify(`The Room finished, but its result was not delivered: ${delivered.problems.join('; ')}`, 'warning');
  }

  await releaseAuthority(ctx, roomId, summary);
  return ok(await reread(ctx, roomId, record));
}

/** Closes every session and gives up the grant. Only ever called for a Room that is finished. */
export async function releaseAuthority(ctx: RoomLifecycleContext, roomId: string, detail: string): Promise<void> {
  const record = await ctx.store.readRoom(roomId);
  if (!record) return;
  await ctx.sessions.releaseRoom(roomId);
  if (record.definition.grantId) {
    await requirePersistentSessions(ctx.host).revokeGrant(record.definition.grantId);
    await ctx.store.updateRoom(roomId, (current) => ({
      ...current,
      definition: { ...current.definition, grantId: null },
    }));
  }
  ctx.forgetSignals(roomId);
  await ctx.store.appendTimeline(roomId, [timelineEvent(ctx.host, roomId, 'room-status', null, detail)]);
  ctx.emit({ roomId, kind: 'room-status', memberId: null, detail });
}

/** Deletes the Room and everything under it. The grant goes first. */
export async function deleteRoom(ctx: RoomLifecycleContext, roomId: string): Promise<RoomActionResult> {
  const record = await ctx.store.readRoom(roomId);
  if (!record) return fail(`Room not found: ${roomId}`);
  ctx.abortTurns(roomId);
  await releaseAuthority(ctx, roomId, 'Room deleted.');
  await ctx.store.deleteRoom(roomId);
  return ok();
}
