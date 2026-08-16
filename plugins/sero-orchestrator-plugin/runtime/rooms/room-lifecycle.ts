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
import type { RoomMember, RoomStatus, RoomStopReason } from '../../shared/room-types';
import { TERMINAL_ROOM_STATUSES } from '../../shared/room-types';
import type { OrchestratorHost } from '../host';
import { requestRoomGrant, requirePersistentSessions } from './member-grant';
import { deliverRoomResult, INVOKING_CHAT_DESTINATION } from './room-delivery';
import type { MemberSessionPool } from './member-session';
import {
  buildRoomRecord,
  timelineEvent,
  withMember,
  withMemberStatus,
  withRoomStatus,
  type CreateRoomRequest,
} from './room-actions';
import type { RoomRecord, RoomState } from './room-state';
import type { RoomStore } from './room-store';
import type { RoomWorkspaces } from './room-workspace';

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
  /** Placement and checkpoints. Activation needs it BEFORE the grant is requested. */
  workspaces: RoomWorkspaces;
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

  // Checked BEFORE anything is spent. A Room that delivers to the chat that
  // started it, with no chat behind it, runs the whole job and then finds it has
  // nowhere to put the result — the user pays for work they never receive.
  if (record.delivery.destination === INVOKING_CHAT_DESTINATION && !record.delivery.originSessionId) {
    return fail(
      'This Room delivers to the chat that started it, but no chat started it. '
      + 'Change where the result goes before starting it.',
    );
  }

  // Placement comes FIRST. A grant subject is pinned to the directory its member
  // may work in, so an editing member with no worktree yet would either be
  // pinned to the shared tree — the exact reach a worktree exists to prevent —
  // or refused outright. `memberCwdRoots` chooses to refuse, so a Room whose
  // members edit cannot be granted until its trees exist.
  const placements = await ctx.workspaces.prepare(roomId).catch((error: unknown) => {
    ctx.host.log(`room ${roomId}: workspace preparation failed: ${String(error)}`);
    return null;
  });
  if (!placements) return fail('This Room could not prepare a workspace for its members, so it did not start.');

  // Placement wrote `worktreePath` for each editing member, so the grant is
  // requested against the re-read record rather than the stale one.
  const placedRecord = await ctx.store.readRoom(roomId);
  if (!placedRecord) return fail(`Room not found: ${roomId}`);

  // The user can decline, and the host denies anything outside their authority.
  // Both arrive as a rejection, and both mean no session is ever created.
  const requested = await requestRoomGrant(ctx.host, placedRecord).then(
    (grant) => ({ grant, error: null as string | null }),
    (error: unknown) => ({ grant: null, error: error instanceof Error ? error.message : String(error) }),
  );
  if (!requested.grant) {
    ctx.host.log(`room ${roomId}: grant refused: ${requested.error}`);
    // The reason matters: "nobody answered" and "you said no" need different
    // things from the user, and a bare refusal tells them neither.
    return fail(`This Room was not allowed to start: ${requested.error ?? 'the request was refused.'}`);
  }
  const grant = requested.grant;

  const now = ctx.host.now();
  await ctx.store.updateRoom(roomId, (current) =>
    withRoomStatus(
      {
        ...current,
        definition: { ...current.definition, grantId: grant.grantId, historyGrantId: grant.grantId },
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
    ? await ctx.sessions.ensure(record, member).then(
        (session) => ({ session, error: null as string | null }),
        (error: unknown) => ({ session: null, error: error instanceof Error ? error.message : String(error) }),
      )
    : { session: null, error: 'the Conductor is no longer on the roster' };
  if (opened.session) return ok(record);
  ctx.host.log(`room ${roomId}: the Conductor's session failed: ${opened.error}`);

  // No fallback Conductor in the first release: the Room pauses for the user
  // rather than running a team with nobody coordinating it (§13.4).
  //
  // The CAUSE travels with the pause. "It could not start" sends the user to a
  // log file; "its model is not available on this machine" tells them what to
  // change, and this is the state a misconfigured host always lands in.
  const now = ctx.host.now();
  const detail = opened.error
    ? `The Conductor could not start, so the Room is paused: ${opened.error}`
    : 'The Conductor could not start, so the Room is paused.';
  const memberDetail = opened.error
    ? `Its session could not be opened: ${opened.error}`
    : 'Its session could not be opened.';
  await ctx.store.updateRoom(roomId, (current) =>
    withRoomStatus(
      withMember(current, conductor.id, (entry) => withMemberStatus(entry, 'failed', memberDetail)),
      'paused',
      now,
      { kind: 'conductor-failed', detail, at: now },
    ),
  );
  return fail(detail);
}

/**
 * Claims a status transition in the SAME serialized turn that checks it.
 *
 * Every transition here used to validate a snapshot and then write
 * unconditionally. Two that overlapped therefore both believed they had won,
 * and the later write replaced the earlier ending — a cancel could be overwritten
 * by a completion that then delivered the result of a Room the user had stopped,
 * and a late pause could resurrect a finished Room as `paused`. Deciding and
 * writing together means exactly one caller wins and the losers do nothing.
 *
 * `null` from `next` refuses the transition without a write.
 */
async function claimTransition(
  ctx: RoomLifecycleContext,
  roomId: string,
  next: (current: RoomRecord, status: RoomStatus) => RoomRecord | null,
): Promise<{ won: boolean; status: RoomStatus }> {
  const outcome = await ctx.store.transact(roomId, null, (current) => {
    const status = current.runtime.status;
    const record = next(current, status);
    return { record, result: { won: record !== null, status } };
  });
  // `commandId` is null, so this transaction is never a replay.
  return outcome.duplicate ? { won: false, status: 'failed' } : outcome.result;
}

/** What a status may not be moved out of by a pause, a resume or a cancel. */
function refusalFor(status: RoomStatus): string {
  if (status === 'completing') return 'This Room is delivering its result, so it cannot be changed now.';
  return 'This Room has already finished.';
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

  // Whether a turn is still running is read INSIDE the write. Sampled before it,
  // the last turn can finish in between: the pause then records `pausing` with
  // no turn left to settle it, and the Room sits wedged there until a restart.
  //
  // A Room that finished or started delivering while this pause was being
  // decided keeps that ending: pausing it now would resurrect it.
  const claim = await claimTransition(ctx, roomId, (current, status) => {
    if (TERMINAL_ROOM_STATUSES.includes(status) || status === 'completing') return null;
    return withRoomStatus(current, ctx.hasTurnsInFlight(roomId) ? 'pausing' : 'paused', now, stopReason);
  });
  if (!claim.won) return fail(refusalFor(claim.status));

  // What actually landed, read back rather than assumed.
  const settled = (await ctx.store.readRoom(roomId))?.runtime.status;

  // Releasing closes the live sessions; every file stays, so a resume reopens
  // the same history rather than starting a new session (§14.3).
  if (settled === 'paused') await ctx.sessions.releaseRoom(roomId);
  await ctx.store.appendTimeline(roomId, [timelineEvent(ctx.host, roomId, 'room-status', null, stopReason.detail)]);
  ctx.emit({ roomId, kind: 'room-status', memberId: null, detail: stopReason.detail });

  // The last turn can release its controller while the write above is still
  // reaching disk, and a reader in that window still sees `running` — so the
  // turn does not settle the pause and neither did we. Re-checked here, where
  // the write is durable, this cannot leave a `pausing` Room with nothing left
  // to move it. Settling to `paused` finds no turns, so it does not come back.
  if (settled === 'pausing') await settlePendingPause(ctx, roomId, now);
  return ok(await reread(ctx, roomId, record));
}

/**
 * The pause that was waiting for the last turn to end.
 *
 * Re-reads the Room on purpose: a pause can land while the caller was awaiting
 * something else, so the record it started with may still say `running`.
 * Deciding on that record leaves the Room in `pausing` with no turn left to
 * settle it, wedged until a restart.
 */
export async function settlePendingPause(ctx: RoomLifecycleContext, roomId: string, now: string): Promise<void> {
  const record = await ctx.store.readRoom(roomId);
  if (record?.runtime.status !== 'pausing' || ctx.hasTurnsInFlight(roomId)) return;
  const stopReason = record.runtime.stopReason ?? { kind: 'user-paused' as const, detail: 'Paused.', at: now };
  await settlePause(ctx, record, stopReason, now);
}

export async function resumeRoom(ctx: RoomLifecycleContext, roomId: string): Promise<RoomActionResult> {
  const record = await ctx.store.readRoom(roomId);
  if (!record) return fail(`Room not found: ${roomId}`);
  if (!record.definition.grantId) return fail('This Room lost its authority to run and must be started again.');
  // Only a Room that is STILL paused resumes. Checked in the writing turn, so a
  // Room cancelled since the read cannot be restarted as `running`.
  const claim = await claimTransition(ctx, roomId, (current, status) =>
    status === 'paused' ? withRoomStatus(current, 'running', ctx.host.now(), null) : null);
  if (!claim.won) return fail(`This Room is "${claim.status}", so it cannot be resumed.`);
  return ok(await reread(ctx, roomId, record));
}

export async function cancelRoom(
  ctx: RoomLifecycleContext,
  roomId: string,
  detail = 'You cancelled this Room.',
): Promise<RoomActionResult> {
  const record = await ctx.store.readRoom(roomId);
  if (!record) return fail(`Room not found: ${roomId}`);

  // Claimed FIRST, before anything is torn down. A cancel that lost to a
  // completion must not abort the turns that completion is finishing, nor run a
  // second checkpoint pass across the same worktrees while the winner is
  // running its own.
  const now = ctx.host.now();
  const claim = await claimTransition(ctx, roomId, (current, status) =>
    TERMINAL_ROOM_STATUSES.includes(status) || status === 'completing'
      ? null
      : withRoomStatus(
          { ...current, members: current.members.map((member) => withMemberStatus(member, 'completed', detail)) },
          'cancelled',
          now,
          { kind: 'user-cancelled', detail, at: now },
        ));
  if (!claim.won) return fail(refusalFor(claim.status));

  // Cancellation is the one path that does stop work mid-turn: the user asked
  // for it, so the tokens already spent are the price of stopping now.
  ctx.abortTurns(roomId);

  // Commit whatever the members had not committed, BEFORE the grant goes. After
  // `releaseAuthority` no member session can ever run again, so edits left
  // uncommitted here would be stranded in a worktree with nothing in the Room
  // able to finish them. This preserves; it removes nothing (§10, and the rule
  // that cancelling never silently loses member work).
  await ctx.workspaces.preserveRoom(roomId, detail).catch((error: unknown) => {
    ctx.host.log(`room ${roomId}: could not preserve member work on cancel: ${String(error)}`);
    return [];
  });

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
  const now = ctx.host.now();

  // `completing` is the claim AND the crash marker, and it is HELD until the
  // Room is finished with. Winning it makes this caller the one that delivers:
  // a cancel can no longer take the Room and a second completion is refused
  // rather than delivering twice. The members are marked completed in the same
  // write, so delivery reads the finished Room it reports on.
  //
  // Nothing below moves the Room to `completed` until delivery, preservation
  // and revocation have all run. A crash anywhere in between therefore leaves
  // `completing`, which is exactly what recovery looks for to say delivery was
  // interrupted and must not be repeated (§16, room-reconcile).
  const claim = await claimTransition(ctx, roomId, (current, status) =>
    TERMINAL_ROOM_STATUSES.includes(status) || status === 'completing'
      ? null
      : withRoomStatus(
          { ...current, members: current.members.map((member) => withMemberStatus(member, 'completed', summary)) },
          'completing',
          now,
          null,
        ));
  if (!claim.won) {
    return fail(claim.status === 'completing' ? 'This Room is already finishing.' : 'This Room has already finished.');
  }

  // Delivery never decides whether the Room finished: the work is done, and a
  // refused destination is reported to the user rather than reopening the Room.
  const delivered = await deliverRoomResult({ host: ctx.host, store: ctx.store }, { roomId, finalResult: summary, receipt });
  if (!delivered.ok && delivered.problems.length > 0) {
    ctx.host.notify('The Room finished, but its result was not delivered.', 'warning', {
      subtitle: record.definition.title,
      openApp: true,
    });
  }

  // Same reason as cancellation, and a likelier case: finishing is the NORMAL
  // ending, so a member that left edits uncommitted loses them here unless they
  // are checkpointed before the grant goes. The Conductor is meant to collect
  // commits first, but a Room that completes without doing so must still not
  // strand work.
  await ctx.workspaces.preserveRoom(roomId, summary).catch((error: unknown) => {
    ctx.host.log(`room ${roomId}: could not preserve member work on completion: ${String(error)}`);
    return [];
  });

  await releaseAuthority(ctx, roomId, summary);

  // Last: the Room is done with, so the marker can go.
  await claimTransition(ctx, roomId, (current, status) =>
    status === 'completing' ? withRoomStatus(current, 'completed', ctx.host.now(), null) : null);
  return ok(await reread(ctx, roomId, record));
}

/**
 * Cleanup a crash interrupted, finished on restart.
 *
 * A finished Room gives up its grant LAST, so one that is terminal and still
 * holds a grant stopped partway: its members' work may never have been
 * checkpointed and their sessions may still be authorised. The held grant is
 * the marker — no extra state is needed, because `releaseAuthority` clearing it
 * is what "cleanup finished" means.
 *
 * Safe to repeat: preservation commits whatever is uncommitted, and revocation
 * is idempotent.
 */
export async function finishInterruptedCleanup(ctx: RoomLifecycleContext, state: RoomState): Promise<void> {
  const stranded = state.rooms.filter(
    (room) => TERMINAL_ROOM_STATUSES.includes(room.runtime.status) && room.definition.grantId,
  );
  for (const room of stranded) {
    const roomId = room.definition.id;
    const detail = room.runtime.stopReason?.detail ?? 'The Room finished.';
    ctx.host.log(`room ${roomId}: finishing cleanup a restart interrupted.`);
    await ctx.workspaces.preserveRoom(roomId, detail).catch((error: unknown) => {
      ctx.host.log(`room ${roomId}: could not preserve member work during recovery: ${String(error)}`);
      return [];
    });
    await releaseAuthority(ctx, roomId, detail);
  }
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
