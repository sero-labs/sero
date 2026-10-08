/**
 * The user's answer to a held setup or team change on a running Room.
 *
 * Its own module so `room-app-actions.ts` stays under the file-size limit. The
 * Room's grant is amended by `RoomAmendments`; these two actions only carry the
 * user's word to it.
 */

import type { RoomAmendments } from './room-amendment';

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

export function createRevisionActions(ctx: { amendments?: Pick<RoomAmendments, 'approve' | 'decline'> }): RevisionActions {
  return {
    async approveRevision(roomId, revisionId) {
      if (!ctx.amendments) return { ok: false, error: 'This Room cannot amend its grant here.' };
      const outcome = await ctx.amendments.approve(roomId, revisionId);
      return outcome.ok ? { ok: true } : { ok: false, error: outcome.reason ?? 'That change could not be approved.' };
    },

    async declineRevision(roomId, revisionId) {
      if (!ctx.amendments) return { ok: false, error: 'This Room cannot amend its grant here.' };
      const outcome = await ctx.amendments.decline(roomId, revisionId);
      return outcome.ok ? { ok: true } : { ok: false, error: outcome.reason ?? 'That change could not be declined.' };
    },
  };
}
