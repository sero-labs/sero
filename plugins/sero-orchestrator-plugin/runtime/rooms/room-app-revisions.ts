/**
 * The user's answer to a held setup or team change on a running Room.
 *
 * Its own module so `room-app-actions.ts` stays under the file-size limit. The
 * Room's grant is amended by `RoomAmendments`; these two actions only carry the
 * user's word to it.
 */

import type { RoomAmendments } from './room-amendment';
import type { RoomStore } from './room-store';

export type SimpleOutcome = { ok: true } | { ok: false; error: string };

export interface RevisionActions {
  /**
   * Approves a held setup or team change. The host's grant is amended with the
   * same id as before and shows the user exactly what the change adds.
   */
  approveRevision(roomId: string, revisionId: string): Promise<SimpleOutcome>;
  /** Declines a held change. Room-local: the Room keeps its current setup. */
  declineRevision(roomId: string, revisionId: string): Promise<SimpleOutcome>;
}

/** The user's message to the Room: it wakes the members it names and resumes a Room paused for the user. */
type Tell = (roomId: string, body: string, memberIds: string[]) => Promise<SimpleOutcome>;

export function createRevisionActions(
  ctx: { amendments?: Pick<RoomAmendments, 'approve' | 'decline'>; store: RoomStore },
  tell: Tell,
): RevisionActions {
  /**
   * The member that asked for the change. While it is stopped for the user, or
   * the Room is paused for the user, this decision is the user's answer, so it
   * goes to that member the way a message would.
   */
  async function askerOf(roomId: string, revisionId: string): Promise<{ memberId: string; summary: string } | null> {
    const record = await ctx.store.readRoom(roomId);
    const revision = record?.revisions.find((candidate) => candidate.id === revisionId);
    const asker = record?.members.find((member) => member.id === revision?.actorMemberId);
    if (!record || !revision || !asker || asker.status === 'retired') return null;
    const waiting = asker.status === 'blocked'
      || (record.runtime.status === 'paused' && record.runtime.stopReason?.kind === 'awaiting-user');
    return waiting ? { memberId: asker.id, summary: revision.summary } : null;
  }

  async function answer(roomId: string, asker: { memberId: string; summary: string } | null, verdict: string): Promise<void> {
    if (asker) await tell(roomId, `The user ${verdict} your change: ${asker.summary}`, [asker.memberId]);
  }

  return {
    async approveRevision(roomId, revisionId) {
      if (!ctx.amendments) return { ok: false, error: 'This Room cannot amend its grant here.' };
      const asker = await askerOf(roomId, revisionId);
      const outcome = await ctx.amendments.approve(roomId, revisionId);
      if (!outcome.ok) return { ok: false, error: outcome.reason ?? 'That change could not be approved.' };
      await answer(roomId, asker, 'approved');
      return { ok: true };
    },

    async declineRevision(roomId, revisionId) {
      if (!ctx.amendments) return { ok: false, error: 'This Room cannot amend its grant here.' };
      const asker = await askerOf(roomId, revisionId);
      const outcome = await ctx.amendments.decline(roomId, revisionId);
      if (!outcome.ok) return { ok: false, error: outcome.reason ?? 'That change could not be declined.' };
      await answer(roomId, asker, 'declined');
      return { ok: true };
    },
  };
}
