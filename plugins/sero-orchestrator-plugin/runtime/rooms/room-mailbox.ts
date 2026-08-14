/**
 * The durable Room mailbox (spec §17).
 *
 * Every member-to-member operation lands here: send, broadcast, ask, reply,
 * cancel and acknowledge. Three rules shape the whole file:
 *
 *  - **Persist, then deliver.** A message is written to the durable log before
 *    anything is woken. A crash between the two loses no message; the recipient
 *    reads it from its inbox on its next turn. Read cursors are NOT touched
 *    here — a cursor advances only when a member's turn has actually taken the
 *    messages (`store.leaseMessagesFor`, then `store.acknowledgeMessages`).
 *
 *  - **Waking is the coordinator's event path, never a second scheduler.** This
 *    file calls `ctx.wake`, the same seam a user action uses, so a reply resumes
 *    a member immediately instead of waiting for the recovery tick (§17.3).
 *
 *  - **A message carries no authority.** Peer messages are untrusted member
 *    input. Nothing here reads a body to decide what may happen: it cannot grant
 *    a permission, approve protected work, or change a mandate or configuration.
 *    Those travel through validated revisions and the host authority boundary.
 */

import type { RoomMessage } from '../../shared/room-message-types';
import type { RoomMember } from '../../shared/room-types';
import { TERMINAL_ROOM_STATUSES } from '../../shared/room-types';
import { timelineEvent, withMember, withMemberStatus, withRoomStatus } from './room-actions';
import {
  DEFAULT_MAILBOX_LIMITS,
  createSendRateLimiter,
  planRecipients,
  type MailboxLimits,
  type SkippedRecipient,
} from './room-mailbox-limits';
import type { RoomMessageDraft } from './room-messages';
import type { WakeReason } from './room-scheduler';
import type { RoomRecord } from './room-state';
import type {
  MailboxCommand,
  MailboxDelivered,
  MailboxDenied,
  MailboxDenyCode,
  RoomMailbox,
  RoomMailboxContext,
} from './room-mailbox-types';
import { createWaitIndex } from './room-waits';

export type {
  AcknowledgeRequest,
  AskRequest,
  BroadcastRequest,
  CancelRequest,
  MailboxCommand,
  MailboxDelivered,
  MailboxDenied,
  MailboxDenyCode,
  MailboxResult,
  ReplyRequest,
  RoomMailbox,
  RoomMailboxContext,
  SendRequest,
} from './room-mailbox-types';

const deny = (code: MailboxDenyCode, message: string): MailboxDenied => ({ ok: false, code, message });

const delivered = (
  messages: RoomMessage[],
  wokeMemberIds: string[] = [],
  skipped: SkippedRecipient[] = [],
  note: string | null = null,
): MailboxDelivered => ({ ok: true, duplicate: false, messages, wokeMemberIds, skipped, note });

const alreadyApplied = (): MailboxDelivered => ({
  ok: true,
  duplicate: true,
  messages: [],
  wokeMemberIds: [],
  skipped: [],
  note: 'This command was already applied, so nothing was sent again.',
});

type Opened = { ok: true; record: RoomRecord; sender: RoomMember };

/** Nobody left to send to. A full inbox is a different problem from an empty roster. */
function nothingDelivered(skipped: SkippedRecipient[], fallback: string): MailboxDenied {
  const first = skipped[0];
  if (!first) return deny('no-recipients', fallback);
  return deny(first.kind === 'inbox-full' ? 'inbox-full' : 'no-recipients', first.reason);
}

function nameOf(record: RoomRecord, memberId: string): string {
  return record.members.find((member) => member.id === memberId)?.displayName ?? memberId;
}

function namesOf(record: RoomRecord, memberIds: string[]): string {
  return memberIds.map((memberId) => nameOf(record, memberId)).join(', ');
}

export function createRoomMailbox(ctx: RoomMailboxContext): RoomMailbox {
  const { host, store } = ctx;
  const limits: MailboxLimits = { ...DEFAULT_MAILBOX_LIMITS, ...ctx.limits };
  const rate = createSendRateLimiter(limits);
  const waits = createWaitIndex(store);

  /** Validates the sender and the body. Everything else is per-command. */
  async function open(roomId: string, command: MailboxCommand): Promise<Opened | MailboxDenied | 'duplicate'> {
    const record = await store.readRoom(roomId);
    if (!record) return deny('unknown-room', `There is no Room ${roomId}.`);
    if (TERMINAL_ROOM_STATUSES.includes(record.runtime.status)) {
      return deny('room-finished', 'This Room has finished, so it takes no more messages.');
    }
    // Cheap pre-check so a retry costs no rate budget. The claim inside `commit`
    // is the one that actually decides.
    if (await store.hasAppliedCommand(roomId, command.commandId)) return 'duplicate';

    const sender = record.members.find((member) => member.id === command.fromMemberId);
    if (!sender || sender.status === 'retired') {
      return deny('not-a-member', `${command.fromMemberId} is not an active member of this Room.`);
    }
    if (!command.body.trim()) return deny('body-empty', 'A message needs something in it.');
    if (command.body.length > limits.maxBodyChars) {
      return deny('body-too-long', `A message can be ${limits.maxBodyChars} characters at most.`);
    }
    if (!rate.take(roomId, sender.id, Date.parse(host.now()))) {
      return deny('rate-limited', `${sender.displayName} is sending too many messages. Do some work first.`);
    }
    return { ok: true, record, sender };
  }

  function draft(
    kind: RoomMessage['kind'],
    command: MailboxCommand,
    toMemberIds: string[],
    extra: Partial<Pick<RoomMessage, 'questionId' | 'inReplyToQuestionId' | 'wakeRecipients'>> = {},
  ): RoomMessageDraft {
    return {
      id: host.newId('msg'),
      kind,
      fromMemberId: command.fromMemberId,
      toMemberIds,
      body: command.body,
      questionId: extra.questionId ?? null,
      inReplyToQuestionId: extra.inReplyToQuestionId ?? null,
      wakeRecipients: extra.wakeRecipients ?? false,
      commandId: command.commandId,
      createdAt: host.now(),
    };
  }

  /**
   * The messages and their command key reach the record in ONE write, so there
   * is no window where the key is claimed and the message is not in the log —
   * the window a crash would turn into a silently swallowed retry.
   *
   * Returns null when the id was already applied.
   */
  function commit(
    roomId: string,
    commandId: string,
    drafts: RoomMessageDraft[],
  ): Promise<RoomMessage[] | null> {
    return store.appendMessagesOnce(roomId, commandId, drafts);
  }

  /**
   * Signals the recipients that can act on a message (§17.2).
   *
   * An idle member starts now. A member mid-turn keeps the signal — the
   * coordinator holds signals for members it could not start, so a busy
   * recipient runs at its next safe delivery point instead of being steered
   * mid-turn. A waiting, blocked or suspended member is left alone: an ordinary
   * message must not end someone's wait or reverse a block.
   */
  async function signal(record: RoomRecord, memberIds: string[], reason: WakeReason): Promise<string[]> {
    const deliverable = memberIds.filter((memberId) => {
      const status = record.members.find((member) => member.id === memberId)?.status;
      return status === 'idle' || status === 'working';
    });
    for (const memberId of deliverable) await ctx.wake(record.definition.id, memberId, reason);
    return deliverable;
  }

  async function note(roomId: string, memberId: string | null, summary: string): Promise<void> {
    await store.appendTimeline(roomId, [timelineEvent(host, roomId, 'message', memberId, summary)]);
  }

  /**
   * Blocks a member on a question. Written through `withRoomStatus` so the
   * Room's derived active-slot list is recomputed in the same write: waiting
   * holds no execution slot, and a stale id there would fake one for ever
   * (NFR-004).
   */
  function blockOnQuestion(roomId: string, memberId: string, questionId: string, detail: string): Promise<void> {
    return store.updateRoom(roomId, (record) =>
      withRoomStatus(
        withMember(record, memberId, (member) => ({
          ...withMemberStatus(member, 'waiting', detail),
          waitingOnQuestionId: questionId,
        })),
        record.runtime.status,
        host.now(),
      ),
    );
  }

  async function checkDeadlock(roomId: string): Promise<void> {
    if (!ctx.onWaitCycle) return;
    const cycles = await waits.detect(roomId);
    if (cycles.length > 0) await ctx.onWaitCycle(roomId, cycles);
  }

  return {
    async send(roomId, request) {
      const opened = await open(roomId, request);
      if (opened === 'duplicate') return alreadyApplied();
      if (!opened.ok) return opened;
      const plan = planRecipients(opened.record, request.fromMemberId, request.toMemberIds, limits);
      if (plan.unknownIds.length > 0) {
        return deny('unknown-recipient', `There is no member ${plan.unknownIds[0]} in this Room.`);
      }
      if (plan.memberIds.length === 0) return nothingDelivered(plan.skipped, 'Nobody could receive that message.');

      const wake = request.requestResponse === true;
      const messages = await commit(roomId, request.commandId, [
        draft('direct', request, plan.memberIds, { wakeRecipients: wake }),
      ]);
      if (!messages) return alreadyApplied();
      const woke = wake ? await signal(opened.record, plan.memberIds, 'direct-message') : [];
      return delivered(messages, woke, plan.skipped);
    },

    async broadcast(roomId, request) {
      const opened = await open(roomId, request);
      if (opened === 'duplicate') return alreadyApplied();
      if (!opened.ok) return opened;
      const plan = planRecipients(opened.record, request.fromMemberId, null, limits);
      if (plan.memberIds.length === 0) {
        return deny('no-recipients', 'Nobody in this Room can receive a broadcast right now.');
      }

      // FR-021: a broadcast queues. Waking every idle member on an announcement
      // would spend the Room's budget on chatter, so it takes an explicit
      // request AND the policy's permission.
      const asked = request.wakeRecipients === true;
      const permitted =
        limits.broadcastWakePolicy === 'any-member' ||
        (limits.broadcastWakePolicy === 'conductor-only' && opened.sender.isConductor);
      const wake = asked && permitted;

      const messages = await commit(roomId, request.commandId, [
        draft('broadcast', request, plan.memberIds, { wakeRecipients: wake }),
      ]);
      if (!messages) return alreadyApplied();
      const woke = wake ? await signal(opened.record, plan.memberIds, 'direct-message') : [];
      return delivered(
        messages,
        woke,
        plan.skipped,
        asked && !wake ? 'A broadcast does not wake the others here. It is waiting in their inboxes.' : null,
      );
    },

    async ask(roomId, request) {
      const opened = await open(roomId, request);
      if (opened === 'duplicate') return alreadyApplied();
      if (!opened.ok) return opened;
      const { record, sender } = opened;
      const plan = planRecipients(record, request.fromMemberId, request.toMemberIds, limits);
      if (plan.unknownIds.length > 0) {
        return deny('unknown-recipient', `There is no member ${plan.unknownIds[0]} in this Room.`);
      }
      // A question is not partially deliverable: the asker stops to wait, so an
      // answerer that never receives it would leave the asker blocked for good.
      if (plan.skipped.length > 0) return deny('inbox-full', plan.skipped[0].reason);
      if (plan.memberIds.length === 0) return deny('no-recipients', 'There is nobody to ask.');

      const questionId = host.newId('question');
      const messages = await commit(roomId, request.commandId, [
        draft('question', request, plan.memberIds, { questionId, wakeRecipients: true }),
      ]);
      if (!messages) return alreadyApplied();
      waits.remember(roomId, messages[0]);

      const names = namesOf(record, plan.memberIds);
      // The wait is recorded BEFORE anyone is woken, so an answer that comes
      // straight back still finds a member to resume. Releasing the slot is what
      // ends the asker's turn (§17.3).
      if (request.waitForReply !== false) {
        await blockOnQuestion(roomId, sender.id, questionId, `Waiting for an answer from ${names}.`);
      }
      await note(roomId, sender.id, `${sender.displayName} asked ${names} a question.`);
      const woke = await signal(record, plan.memberIds, 'direct-message');
      await checkDeadlock(roomId);
      return delivered(messages, woke, plan.skipped);
    },

    async reply(roomId, request) {
      const opened = await open(roomId, request);
      if (opened === 'duplicate') return alreadyApplied();
      if (!opened.ok) return opened;
      const { record, sender } = opened;

      const question = await waits.find(record, request.questionId);
      const waiting = record.members
        .filter((member) => member.waitingOnQuestionId === request.questionId)
        .map((member) => member.id);
      // The asker is on the question; the waiting roster is the durable half.
      // Either alone is enough to deliver an answer.
      const targets = [...new Set([...(question?.fromMemberId ? [question.fromMemberId] : []), ...waiting])].filter(
        (memberId) => memberId !== sender.id,
      );
      if (targets.length === 0) {
        return deny('unknown-question', `Nobody in this Room is waiting on question ${request.questionId}.`);
      }

      // A reply is never held back by a backlog limit: the recipient is blocked
      // on it, so dropping it would turn a busy inbox into a permanent wait.
      const messages = await commit(roomId, request.commandId, [
        draft('reply', request, targets, { inReplyToQuestionId: request.questionId }),
      ]);
      if (!messages) return alreadyApplied();
      waits.resolve(roomId, request.questionId);
      await note(roomId, sender.id, `${sender.displayName} answered ${namesOf(record, targets)}.`);

      // The event path (§17.3): the asker resumes on this reply, in the same
      // session, without waiting for the periodic tick.
      for (const memberId of waiting) await ctx.wake(roomId, memberId, 'reply-received');
      return delivered(messages, waiting);
    },

    async cancel(roomId, request) {
      const opened = await open(roomId, request);
      if (opened === 'duplicate') return alreadyApplied();
      if (!opened.ok) return opened;
      const { record, sender } = opened;

      const question = await waits.find(record, request.questionId);
      if (!question) return deny('unknown-question', `There is no open question ${request.questionId}.`);
      // Authority is checked against the roster, never against the body: the
      // member that asked, or the Conductor, and nobody else.
      if (question.fromMemberId !== sender.id && !sender.isConductor) {
        return deny('not-your-question', 'Only the member that asked, or the Conductor, can withdraw a question.');
      }

      const waiting = record.members
        .filter((member) => member.waitingOnQuestionId === request.questionId)
        .map((member) => member.id);
      const targets = [...new Set([...question.toMemberIds, ...waiting])].filter(
        (memberId) => memberId !== sender.id,
      );
      // An empty recipient list means "everyone" to the delivery rules, so a
      // withdrawal that reaches nobody must never be written as a broadcast.
      if (targets.length === 0) return deny('no-recipients', 'Nobody needs to hear that this question is withdrawn.');
      const messages = await commit(roomId, request.commandId, [
        draft('cancel', request, targets, { questionId: request.questionId }),
      ]);
      if (!messages) return alreadyApplied();
      waits.resolve(roomId, request.questionId);
      await note(roomId, sender.id, `${sender.displayName} withdrew a question.`);

      // The wait ends with no answer coming, so the waiter is released on the
      // same path a reply would use — it is unblocked either way.
      for (const memberId of waiting) await ctx.wake(roomId, memberId, 'reply-received');
      return delivered(messages, waiting);
    },

    async acknowledge(roomId, request) {
      const opened = await open(roomId, request);
      if (opened === 'duplicate') return alreadyApplied();
      if (!opened.ok) return opened;
      const plan = planRecipients(opened.record, request.fromMemberId, request.toMemberIds, limits);
      if (plan.unknownIds.length > 0) {
        return deny('unknown-recipient', `There is no member ${plan.unknownIds[0]} in this Room.`);
      }
      if (plan.memberIds.length === 0) {
        return nothingDelivered(plan.skipped, 'Nobody could receive that acknowledgement.');
      }
      // An acknowledgement never wakes anyone: it confirms receipt, it asks for
      // nothing, and it unblocks nobody.
      const messages = await commit(roomId, request.commandId, [draft('acknowledgement', request, plan.memberIds)]);
      return messages ? delivered(messages, [], plan.skipped) : alreadyApplied();
    },

    async wait(roomId, memberId, questionId) {
      const record = await store.readRoom(roomId);
      if (!record) return deny('unknown-room', `There is no Room ${roomId}.`);
      const member = record.members.find((candidate) => candidate.id === memberId);
      if (!member || member.status === 'retired') {
        return deny('not-a-member', `${memberId} is not an active member of this Room.`);
      }
      const question = await waits.find(record, questionId);
      if (!question) return deny('unknown-question', `Question ${questionId} is not open.`);
      if (question.fromMemberId !== memberId) {
        return deny('not-your-question', 'A member can only wait on a question it asked itself.');
      }
      const detail = `Waiting for an answer from ${namesOf(record, question.toMemberIds)}.`;
      await blockOnQuestion(roomId, memberId, questionId, detail);
      await checkDeadlock(roomId);
      return delivered([]);
    },

    detectDeadlock: (roomId) => waits.detect(roomId),

    forget(roomId) {
      waits.forget(roomId);
      rate.forget(roomId);
    },
  };
}
