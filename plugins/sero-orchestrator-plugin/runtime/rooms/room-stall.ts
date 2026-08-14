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

import type { RoomMessage } from '../../shared/room-message-types';
import type { RoomStopReason } from '../../shared/room-types';
import { quietMark, type RoomSignalBook } from './room-signals';
import { timelineEvent, withRoomStatus } from './room-actions';
import { settlePause, type RoomLifecycleContext } from './room-lifecycle';
import type { RoomMessageDraft } from './room-messages';
import type { SchedulerDecision, WakeReason } from './room-scheduler';
import type { RoomRecord } from './room-state';

export interface StallContext extends RoomLifecycleContext {
  /** The coordinator's own wake path — this module never schedules directly. */
  wake(roomId: string, memberId: string, reason: WakeReason): Promise<void>;
  /** The mailbox's view of who waits on whom (FR-020). One source, one answer. */
  detectDeadlock(roomId: string): Promise<string[][]>;
  /** The questions members are blocked on, so a quiet Room can chase the answer. */
  openQuestions(roomId: string): Promise<RoomMessage[]>;
  /** What the Room is holding. Read here only to claim one wake per event. */
  signals: RoomSignalBook;
}

export async function handleStall(
  ctx: StallContext,
  record: RoomRecord,
  decision: SchedulerDecision,
  inFlight: boolean,
): Promise<void> {
  const roomId = record.definition.id;
  // A named envelope field is a hard limit: it stops new turns for good, so the
  // Room pauses for the user rather than sitting there looking idle.
  if (decision.blocked?.limit) {
    const now = ctx.host.now();
    await ctx.store.appendTimeline(roomId, [timelineEvent(ctx.host, roomId, 'limit', null, decision.blocked.reason)]);
    await settlePause(ctx, record, { kind: 'limit-reached', detail: decision.blocked.reason, at: now }, now);
    ctx.host.notify(decision.blocked.reason, 'warning');
    return;
  }
  // Work in flight is not a stall: whoever is running may free everyone else.
  if (inFlight) return;
  if ((await ctx.detectDeadlock(roomId)).length > 0) {
    await escalate(ctx, record, 'deadlock', 'Members are waiting on each other, so nobody can continue.');
    return;
  }
  // Nobody is in a cycle, and yet somebody is waiting for an answer that is
  // never coming: the member that owes it is idle, and no event will ever start
  // it. Only that member can end the wait, so it is woken with the question in
  // front of it — the asker cannot answer itself, and used to sit there until
  // the no-progress clock ran out.
  const owed = await strandedQuestion(ctx, record);
  if (owed) {
    const turns = record.members.find((member) => member.id === owed.memberId)?.usage.turns ?? 0;
    if (ctx.signals.claimQuietWake(roomId, owed.memberId, quietMark(record, owed.memberId))) {
      ctx.signals.noteReminder(roomId, owed.memberId, turns);
      await remindAnswerer(ctx, record, owed.question, owed.memberId);
      return;
    }
    // Chased, given a turn, and still no answer. The answer is not coming, and
    // only the member waiting for it can be freed — otherwise the Room burns its
    // no-progress clock on a question nobody will ever settle, and lands on the
    // user for something it could resolve itself.
    if (ctx.signals.answerIgnored(roomId, owed.memberId, turns)) {
      await freeAsker(ctx, record, owed.question, owed.memberId);
      return;
    }
  }
  // Nothing is running, and a member is sitting on a message it has never
  // read. An ordinary message deliberately wakes nobody — it must not spend a
  // turn while the Room is busy — but a quiet Room has nothing else to spend,
  // and that message is the only thing that can move it. A Conductor that
  // assigned work by message used to leave the Room here until the clock ran
  // out.
  const unread = record.members.find(
    (member) =>
      member.status === 'idle'
      && (record.readCursors.find((cursor) => cursor.memberId === member.id)?.pendingCount ?? 0) > 0,
  );
  if (unread && ctx.signals.claimQuietWake(roomId, unread.id, quietMark(record, unread.id))) {
    await ctx.wake(roomId, unread.id, 'direct-message');
    return;
  }
  // Nobody is waiting on anybody and nothing is queued: the members simply
  // stopped talking. Only the Conductor can read the work and decide the Room is
  // finished, and nothing else was ever going to wake it — so this silence used
  // to run out the no-progress clock and land on the user.
  //
  // A Room where everyone is idle has no stall REASON at all, and that is the
  // case this exists for: it must be handled whether or not the scheduler could
  // name one.
  const lead = record.members.find((member) => member.isConductor && member.status === 'idle');
  if (lead && ctx.signals.claimQuietWake(roomId, lead.id, quietMark(record, lead.id))) {
    await ctx.wake(roomId, lead.id, 'room-quiet');
    return;
  }
  if (decision.blocked) ctx.emit({ roomId, kind: 'blocked', memberId: null, detail: decision.blocked.reason });
}

/** The longest a repeated question stays readable in a reminder. */
const QUESTION_QUOTE_CHARS = 400;

/** An open question whose answer is owed by a member that is doing nothing. */
async function strandedQuestion(
  ctx: StallContext,
  record: RoomRecord,
): Promise<{ question: RoomMessage; memberId: string } | null> {
  for (const question of await ctx.openQuestions(record.definition.id)) {
    const idle = record.members.find(
      (member) => question.toMemberIds.includes(member.id) && member.status === 'idle',
    );
    if (idle) return { question, memberId: idle.id };
  }
  return null;
}

/**
 * Puts the question back in front of the member that owes the answer. It is a
 * system message rather than a resent question, so it cannot make the answerer
 * wait on anything, and the asker's own wait is untouched.
 */
async function remindAnswerer(
  ctx: StallContext,
  record: RoomRecord,
  question: RoomMessage,
  memberId: string,
): Promise<void> {
  const roomId = record.definition.id;
  const asker = record.members.find((member) => member.id === question.fromMemberId);
  const now = ctx.host.now();
  const draft: RoomMessageDraft = {
    id: ctx.host.newId('msg'),
    kind: 'system',
    fromMemberId: null,
    toMemberIds: [memberId],
    body:
      `${asker?.displayName ?? 'A member'} is still waiting for your answer to: `
      + `"${question.body.slice(0, QUESTION_QUOTE_CHARS)}". `
      + 'Reply to it now, or say that you cannot answer it.',
    questionId: null,
    inReplyToQuestionId: null,
    wakeRecipients: true,
    commandId: ctx.host.newId('cmd'),
    createdAt: now,
  };
  await ctx.store.appendMessages(roomId, [draft]);
  await ctx.wake(roomId, memberId, 'direct-message');
}

/**
 * Ends a wait for an answer that is never going to arrive.
 *
 * The message goes to the ASKER, and the wake carries a wait-ending reason, so
 * the release travels the same path as a real reply rather than a second way of
 * writing a member's status.
 */
async function freeAsker(
  ctx: StallContext,
  record: RoomRecord,
  question: RoomMessage,
  answererId: string,
): Promise<void> {
  const roomId = record.definition.id;
  const asker = record.members.find((member) => member.id === question.fromMemberId);
  if (!asker) return;
  const answerer = record.members.find((member) => member.id === answererId);
  const draft: RoomMessageDraft = {
    id: ctx.host.newId('msg'),
    kind: 'system',
    fromMemberId: null,
    toMemberIds: [asker.id],
    body:
      `${answerer?.displayName ?? 'The member you asked'} did not answer: `
      + `"${question.body.slice(0, QUESTION_QUOTE_CHARS)}". `
      + 'Carry on without that answer, ask somebody else, or finish the Room.',
    questionId: null,
    inReplyToQuestionId: question.questionId,
    wakeRecipients: true,
    commandId: ctx.host.newId('cmd'),
    createdAt: ctx.host.now(),
  };
  await ctx.store.appendMessages(roomId, [draft]);
  await ctx.wake(roomId, asker.id, 'direct-message');
}

/**
 * A wait cycle among members (FR-020). The Conductor hears about it first,
 * because it is the one member that can reassign the work that breaks the
 * cycle; a cycle still there next time pauses the Room for the user.
 */
export async function reportWaitCycle(ctx: StallContext, roomId: string, cycles: string[][]): Promise<void> {
  const record = await ctx.store.readRoom(roomId);
  if (!record) return;
  if (record.runtime.status !== 'running' && record.runtime.status !== 'ready') return;
  const names = cycles[0]
    .map((memberId) => record.members.find((member) => member.id === memberId)?.displayName ?? memberId)
    .join(' → ');
  await escalate(ctx, record, 'deadlock', `${names} are waiting on each other, so nobody can continue.`);
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
