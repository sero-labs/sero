/**
 * What a Room does when a pass starts nothing (spec §21, FR-020).
 *
 * Split from the coordinator to keep both files inside the size limit. Three
 * different silences need three different answers, and telling them apart is
 * the whole job:
 *
 *  - a HARD LIMIT stops new turns for good, so the Room pauses for the user;
 *  - a DEADLOCK means the members cannot free each other, so the Conductor is
 *    told and continued deadlock pauses the Room; and
 *  - ordinary waiting is not a fault at all, and must not raise anything.
 *
 * The escalation ladder is read from the PERSISTED stop reason rather than from
 * memory, so a restart cannot reset it and leave a stuck Room escalating for
 * ever.
 */

import type { RoomStopReason } from '../../shared/room-types';
import { buildWaitEdges, timelineEvent, withRoomStatus } from './room-actions';
import { settlePause, type RoomLifecycleContext } from './room-lifecycle';
import type { RoomMessageDraft } from './room-messages';
import { detectWaitCycles, type SchedulerDecision, type WakeReason } from './room-scheduler';
import type { RoomRecord } from './room-state';

/** How far back a deadlock check reads for the questions members are waiting on. */
const DEADLOCK_SCAN = 100;

export interface StallContext extends RoomLifecycleContext {
  /** The coordinator's own wake path — this module never schedules directly. */
  wake(roomId: string, memberId: string, reason: WakeReason): Promise<void>;
}

export async function handleStall(
  ctx: StallContext,
  record: RoomRecord,
  decision: SchedulerDecision,
  inFlight: boolean,
): Promise<void> {
  if (!decision.blocked) return;
  const roomId = record.definition.id;
  // A named envelope field is a hard limit: it stops new turns for good, so the
  // Room pauses for the user rather than sitting there looking idle.
  if (decision.blocked.limit) {
    const now = ctx.host.now();
    await ctx.store.appendTimeline(roomId, [timelineEvent(ctx.host, roomId, 'limit', null, decision.blocked.reason)]);
    await settlePause(ctx, record, { kind: 'limit-reached', detail: decision.blocked.reason, at: now }, now);
    ctx.host.notify(decision.blocked.reason, 'warning');
    return;
  }
  // Work in flight is not a stall: whoever is running may free everyone else.
  if (inFlight) return;
  if (await hasWaitCycle(ctx, record)) {
    await escalate(ctx, record, 'deadlock', 'Members are waiting on each other, so nobody can continue.');
    return;
  }
  ctx.emit({ roomId, kind: 'blocked', memberId: null, detail: decision.blocked.reason });
}

async function hasWaitCycle(ctx: StallContext, record: RoomRecord): Promise<boolean> {
  // One waiting member cannot be a cycle, and reading the message log to prove
  // that would cost a page read on every quiet pass.
  if (record.members.filter((member) => member.status === 'waiting').length < 2) return false;
  const from = Math.max(0, record.runtime.messageSequence - DEADLOCK_SCAN);
  const messages = await ctx.store.readMessages(record.definition.id, from, DEADLOCK_SCAN);
  return detectWaitCycles(buildWaitEdges(record, messages)).length > 0;
}

/**
 * Tell the Conductor first; pause only when the same condition is still true
 * next time (spec §21). Starting a turn does NOT clear a ladder reason — only
 * structural progress does — so "continued" means continued.
 */
export async function escalate(
  ctx: StallContext,
  record: RoomRecord,
  kind: RoomStopReason['kind'],
  detail: string,
): Promise<void> {
  const roomId = record.definition.id;
  const now = ctx.host.now();
  if (record.runtime.stopReason?.kind === kind) {
    await settlePause(ctx, record, { kind, detail, at: now }, now);
    ctx.host.notify(detail, 'warning');
    return;
  }
  await ctx.store.updateRoom(roomId, (current) =>
    withRoomStatus(current, current.runtime.status, now, { kind, detail, at: now }),
  );
  const conductor = record.members.find((member) => member.isConductor && member.status !== 'retired');
  if (!conductor) return;
  const draft: RoomMessageDraft = {
    id: ctx.host.newId('msg'),
    kind: 'system',
    fromMemberId: null,
    toMemberIds: [conductor.id],
    body: `${detail} Decide what should change, or finish the Room.`,
    questionId: null,
    inReplyToQuestionId: null,
    wakeRecipients: true,
    commandId: ctx.host.newId('cmd'),
    createdAt: now,
  };
  await ctx.store.appendMessages(roomId, [draft]);
  await ctx.wake(roomId, conductor.id, 'user-intervention');
}
