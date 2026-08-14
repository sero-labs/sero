/**
 * Advisory path claims (spec §19.3).
 *
 * A claim is COORDINATION, never a lock. The real safety boundary is the
 * per-member worktree and Git's own conflict handling: two members holding
 * overlapping claims still cannot corrupt each other, because they are editing
 * two different checkouts. What a claim buys is the chance to say "I am already
 * in that file" before two members each spend a turn on the same change.
 *
 * Three rules shape the file:
 *
 *  - **Overlap is checked against OTHER members' active claims.** A member
 *    re-claiming its own pattern is a no-op, not a conflict with itself.
 *
 *  - **The Room's policy decides the consequence.** `warn` records the claim and
 *    names who else is there; `block` refuses the whole request, so a partly
 *    applied claim set never exists.
 *
 *  - **A claim never outlives its owner.** Retirement and the end of the Room
 *    release claims. `releaseForMember` is the immediate path, and every claim
 *    read re-checks the roster, so a claim whose member is already gone can
 *    never keep warning the rest of the Room even if that call was missed.
 */

import { normalizeClaimPattern, patternsOverlap } from '../../shared/room-claim-overlap';
import type { PathClaim, PathClaimOverlap } from '../../shared/room-message-types';
import { TERMINAL_ROOM_STATUSES } from '../../shared/room-types';
import type { OrchestratorHost } from '../host';
import { timelineEvent } from './room-actions';
import type { RoomRecord } from './room-state';
import type { RoomStore } from './room-store';

/**
 * Claims one member may hold at once. A member that claims the whole tree a
 * pattern at a time is not coordinating with anyone, and an unbounded list would
 * grow room.json without limit.
 */
export const MAX_ACTIVE_CLAIMS_PER_MEMBER = 50;

/**
 * Released claims kept for the audit trail. Active claims are capped per member,
 * but a member that claims and releases all day would still grow the list
 * forever, so the released tail is trimmed oldest-first.
 */
export const MAX_RELEASED_CLAIMS = 200;

/** Keeps every active claim and the most recent released ones, in order. */
export function pruneReleasedClaims(claims: PathClaim[]): PathClaim[] {
  const released = claims.filter((claim) => claim.status === 'released');
  if (released.length <= MAX_RELEASED_CLAIMS) return claims;
  const dropped = new Set(released.slice(0, released.length - MAX_RELEASED_CLAIMS).map((claim) => claim.id));
  return claims.filter((claim) => !dropped.has(claim.id));
}

export type ClaimDenyCode =
  | 'unknown-room'
  | 'room-finished'
  | 'not-a-member'
  | 'no-patterns'
  | 'too-many-claims'
  | 'blocked-by-claim';

export interface ClaimAccepted {
  ok: true;
  /** Claims actually recorded. Empty when the member already held them all. */
  claims: PathClaim[];
  overlaps: PathClaimOverlap[];
  /** Plain-English notice for the claiming member; null when nothing overlaps. */
  warning: string | null;
}

export interface ClaimDenied {
  ok: false;
  code: ClaimDenyCode;
  message: string;
  overlaps: PathClaimOverlap[];
}

export type ClaimResult = ClaimAccepted | ClaimDenied;

export interface RoomClaimsContext {
  host: OrchestratorHost;
  store: RoomStore;
}

export interface RoomClaims {
  /** Records claims for a member, subject to the Room's overlap policy. */
  claim(roomId: string, memberId: string, patterns: string[], reason: string): Promise<ClaimResult>;
  /** Releases the named patterns, or every claim this member holds when none are named. */
  release(roomId: string, memberId: string, patterns?: string[]): Promise<PathClaim[]>;
  /** Retirement and replacement path: everything this member held goes at once. */
  releaseForMember(roomId: string, memberId: string, reason: string): Promise<PathClaim[]>;
  /** End of the Room: nothing is left holding a path. */
  releaseAll(roomId: string, reason: string): Promise<PathClaim[]>;
  /** Active claims, with any owned by a gone member released first. */
  active(roomId: string): Promise<PathClaim[]>;
}

/** Members other than `memberId` whose active claims meet `pattern`. */
export { normalizeClaimPattern, patternsOverlap };

export function findClaimOverlap(
  claims: PathClaim[],
  memberId: string,
  pattern: string,
  action: 'warn' | 'block',
): PathClaimOverlap {
  const memberIds = [
    ...new Set(
      claims
        .filter((claim) => claim.memberId !== memberId && patternsOverlap(claim.pattern, pattern))
        .map((claim) => claim.memberId),
    ),
  ];
  return { pattern: normalizeClaimPattern(pattern), memberIds, action };
}

/**
 * Releases claims whose owner is retired, gone from the roster, or whose Room
 * has finished — the guarantee that a claim cannot outlive its member even when
 * the retirement path never called `releaseForMember`.
 *
 * Returns the SAME reference when nothing changes, so an unchanged Room is not
 * rewritten by a read (the store diffs Rooms by reference).
 */
export function withGoneClaimsReleased(record: RoomRecord, now: string): RoomRecord {
  const finished = TERMINAL_ROOM_STATUSES.includes(record.runtime.status);
  const gone = (memberId: string): boolean => {
    const member = record.members.find((candidate) => candidate.id === memberId);
    return !member || member.status === 'retired';
  };
  const claims = record.claims.map((claim) =>
    claim.status === 'active' && (finished || gone(claim.memberId))
      ? { ...claim, status: 'released' as const, releasedAt: now }
      : claim,
  );
  return claims.some((claim, index) => claim !== record.claims[index]) ? { ...record, claims } : record;
}

export function activeClaimsOf(record: RoomRecord): PathClaim[] {
  return record.claims.filter((claim) => claim.status === 'active');
}

function denied(code: ClaimDenyCode, message: string, overlaps: PathClaimOverlap[] = []): ClaimDenied {
  return { ok: false, code, message, overlaps };
}

function describeOverlaps(record: RoomRecord, overlaps: PathClaimOverlap[]): string {
  return overlaps
    .map((overlap) => {
      const names = overlap.memberIds
        .map((id) => record.members.find((member) => member.id === id)?.displayName ?? id)
        .join(', ');
      return `${overlap.pattern} (${names})`;
    })
    .join('; ');
}

export function createRoomClaims(ctx: RoomClaimsContext): RoomClaims {
  const { host, store } = ctx;

  /** Applies a claim change and records it, returning the claims that moved. */
  async function releaseWhere(
    roomId: string,
    matches: (claim: PathClaim) => boolean,
    summary: string,
    memberId: string | null,
  ): Promise<PathClaim[]> {
    const record = await store.readRoom(roomId);
    if (!record) return [];
    const now = host.now();
    const released = activeClaimsOf(record).filter(matches);
    if (released.length === 0) return [];
    const releasedIds = new Set(released.map((claim) => claim.id));
    await store.updateRoom(roomId, (current) => ({
      ...current,
      claims: pruneReleasedClaims(
        current.claims.map((claim) =>
          releasedIds.has(claim.id) ? { ...claim, status: 'released' as const, releasedAt: now } : claim,
        ),
      ),
    }));
    await store.appendTimeline(roomId, [
      timelineEvent(host, roomId, 'claim', memberId, summary, {
        patterns: released.map((claim) => claim.pattern).join(', '),
      }),
    ]);
    return released.map((claim) => ({ ...claim, status: 'released' as const, releasedAt: now }));
  }

  /** Reads the Room with dead claims already released, so no caller sees one. */
  async function readLive(roomId: string): Promise<RoomRecord | null> {
    const record = await store.readRoom(roomId);
    if (!record) return null;
    const healed = withGoneClaimsReleased(record, host.now());
    if (healed === record) return record;
    await store.updateRoom(roomId, (current) => withGoneClaimsReleased(current, host.now()));
    return healed;
  }

  return {
    async claim(roomId, memberId, patterns, reason) {
      const record = await readLive(roomId);
      if (!record) return denied('unknown-room', `There is no Room ${roomId}.`);
      if (TERMINAL_ROOM_STATUSES.includes(record.runtime.status)) {
        return denied('room-finished', 'This Room has finished, so it takes no more claims.');
      }
      const member = record.members.find((candidate) => candidate.id === memberId);
      if (!member || member.status === 'retired') {
        return denied('not-a-member', `${memberId} is not an active member of this Room.`);
      }
      const wanted = [...new Set(patterns.map(normalizeClaimPattern).filter((pattern) => pattern.length > 0))];
      if (wanted.length === 0) return denied('no-patterns', 'A claim needs at least one path.');

      const live = activeClaimsOf(record);
      const mine = live.filter((claim) => claim.memberId === memberId);
      const fresh = wanted.filter((pattern) => !mine.some((claim) => claim.pattern === pattern));
      if (mine.length + fresh.length > MAX_ACTIVE_CLAIMS_PER_MEMBER) {
        return denied(
          'too-many-claims',
          `${member.displayName} can hold ${MAX_ACTIVE_CLAIMS_PER_MEMBER} claims at once. Release some first.`,
        );
      }

      const policy = record.definition.workspacePolicy.claimPolicy;
      const overlaps = wanted
        .map((pattern) => findClaimOverlap(live, memberId, pattern, policy))
        .filter((overlap) => overlap.memberIds.length > 0);

      // Block refuses the WHOLE request: a half-applied claim set would leave the
      // member believing it holds paths it does not.
      if (policy === 'block' && overlaps.length > 0) {
        return denied(
          'blocked-by-claim',
          `Already claimed by another member: ${describeOverlaps(record, overlaps)}. Ask them, or work elsewhere.`,
          overlaps,
        );
      }

      const now = host.now();
      const claims: PathClaim[] = fresh.map((pattern) => ({
        id: host.newId('claim'),
        roomId,
        memberId,
        pattern,
        reason: reason.trim().slice(0, 300),
        status: 'active',
        createdAt: now,
        releasedAt: null,
      }));
      if (claims.length > 0) {
        await store.updateRoom(roomId, (current) => ({ ...current, claims: [...current.claims, ...claims] }));
        await store.appendTimeline(roomId, [
          timelineEvent(host, roomId, 'claim', memberId, `${member.displayName} claimed ${claims.length} path(s).`, {
            patterns: claims.map((claim) => claim.pattern).join(', '),
          }),
        ]);
      }
      const warning =
        overlaps.length > 0
          ? `These paths are already claimed: ${describeOverlaps(record, overlaps)}. Claims are advisory — agree who edits what.`
          : null;
      return { ok: true, claims, overlaps, warning };
    },

    release(roomId, memberId, patterns) {
      const wanted = patterns?.map(normalizeClaimPattern).filter((pattern) => pattern.length > 0);
      return releaseWhere(
        roomId,
        (claim) => claim.memberId === memberId && (!wanted?.length || wanted.includes(claim.pattern)),
        'Paths released.',
        memberId,
      );
    },

    releaseForMember: (roomId, memberId, reason) =>
      releaseWhere(roomId, (claim) => claim.memberId === memberId, reason, memberId),

    releaseAll: (roomId, reason) => releaseWhere(roomId, () => true, reason, null),

    async active(roomId) {
      const record = await readLive(roomId);
      return record ? activeClaimsOf(record) : [];
    },
  };
}
