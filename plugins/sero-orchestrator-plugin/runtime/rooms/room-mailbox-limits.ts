/**
 * Mailbox traffic limits (spec §17.2, §21): message size, inbox backlog, send
 * rate and the broadcast-wake policy.
 *
 * These are deliberately NOT operating-envelope fields. The envelope is the
 * authority the user approved — models, tools, permissions, spend — and it can
 * only be widened with a new approval. These are traffic guards that protect a
 * Room from its own chatter, so they live with the mailbox and can be tuned
 * without asking the user to approve anything.
 *
 * The rate window is per process. A restart resets it, which is correct: the
 * burst it exists to damp is one member talking in a loop inside one run, and a
 * restart has already ended that run.
 */

import { resolveMemberRef } from '../../shared/room-member-ref';
import type { RoomRecord } from './room-state';

export interface MailboxLimits {
  /** Longest message body. Anything over is refused, never truncated. */
  maxBodyChars: number;
  /** Undelivered messages one member may hold before senders are turned away. */
  maxInboxBacklog: number;
  /** Messages one member may send inside `windowMs`. */
  maxSendsPerWindow: number;
  windowMs: number;
  /**
   * Who may ask a broadcast to wake idle members (FR-021). A woken member burns
   * a turn, so a peer cannot make the whole Room pay for its announcement; the
   * Conductor is the one member with authority over what the Room works on.
   */
  broadcastWakePolicy: 'never' | 'conductor-only' | 'any-member';
}

export const DEFAULT_MAILBOX_LIMITS: MailboxLimits = {
  maxBodyChars: 4_000,
  maxInboxBacklog: 50,
  maxSendsPerWindow: 20,
  windowMs: 60_000,
  broadcastWakePolicy: 'conductor-only',
};

export interface SendRateLimiter {
  /** Records a send and returns false when the member is over its window. */
  take(roomId: string, memberId: string, nowMs: number): boolean;
  forget(roomId: string): void;
}

export function createSendRateLimiter(limits: MailboxLimits): SendRateLimiter {
  const sends = new Map<string, number[]>();
  return {
    take(roomId, memberId, nowMs) {
      const key = `${roomId}:${memberId}`;
      const recent = (sends.get(key) ?? []).filter((at) => nowMs - at < limits.windowMs);
      sends.set(key, recent);
      if (recent.length >= limits.maxSendsPerWindow) return false;
      recent.push(nowMs);
      return true;
    },
    forget(roomId) {
      for (const key of sends.keys()) if (key.startsWith(`${roomId}:`)) sends.delete(key);
    },
  };
}

export interface SkippedRecipient {
  memberId: string;
  kind: 'retired' | 'inbox-full';
  /** Plain English, shown to the sender so it knows the message did not land. */
  reason: string;
}

export interface RecipientPlan {
  /** Who the message is addressed to, after the roster and backlog checks. */
  memberIds: string[];
  skipped: SkippedRecipient[];
  /** Requested ids that are not in the roster at all. */
  unknownIds: string[];
}

/**
 * Resolves the recipient set against the CURRENT roster.
 *
 * Recipients are always enumerated, including for a broadcast. An empty
 * `toMemberIds` means "everyone" to the delivery rules, which would deliver a
 * broadcast to members that joined afterwards and would leave no id to check a
 * backlog against. Freezing the set at send time makes both honest.
 *
 * `requested` is null for a broadcast — every active member except the sender.
 */
export function planRecipients(
  record: RoomRecord,
  fromMemberId: string,
  requested: string[] | null,
  limits: MailboxLimits,
): RecipientPlan {
  const backlog = new Map(record.readCursors.map((cursor) => [cursor.memberId, cursor.pendingCount]));
  const requestedIds =
    requested ??
    record.members.filter((member) => member.status !== 'retired').map((member) => member.id);

  const memberIds: string[] = [];
  const skipped: SkippedRecipient[] = [];
  const unknownIds: string[] = [];

  for (const ref of new Set(requestedIds)) {
    // The roster shows names, so a member writes names. Resolving here means the
    // rest of the Room still deals only in ids.
    const member = resolveMemberRef(record.members, ref);
    if (!member) {
      unknownIds.push(ref);
      continue;
    }
    const memberId = member.id;
    // A member never messages itself: it would read its own words back as new
    // input on its next turn.
    if (memberId === fromMemberId || memberIds.includes(memberId)) continue;
    if (member.status === 'retired') {
      skipped.push({ memberId, kind: 'retired', reason: `${member.displayName} has left the Room.` });
      continue;
    }
    if ((backlog.get(memberId) ?? 0) >= limits.maxInboxBacklog) {
      skipped.push({
        memberId,
        kind: 'inbox-full',
        reason: `${member.displayName} has too many unread messages.`,
      });
      continue;
    }
    memberIds.push(memberId);
  }

  return { memberIds, skipped, unknownIds };
}
