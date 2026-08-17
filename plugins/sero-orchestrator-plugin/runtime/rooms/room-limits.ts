/**
 * Room limit enforcement (spec §21).
 *
 * Mirrors the Workflow `LimitCheck` contract in runtime/limits.ts — same shape,
 * separate rules, because a Room's limits are per member and per roster rather
 * than per step and per attempt.
 *
 * A hard limit stops NEW turns. It never kills work in flight: a member that is
 * mid-turn finishes, because aborting it would lose the tokens already spent
 * and leave its session in an uncertain state.
 */

import type { OperatingEnvelope } from '../../shared/room-blueprint-types';
import type { Room, RoomMember } from '../../shared/room-types';

export interface RoomLimitCheck {
  ok: boolean;
  /** Which envelope field stopped it. Present only when `ok` is false. */
  limit?: keyof OperatingEnvelope;
  /** Plain English, shown to the user as the Room's stop reason. */
  reason?: string;
}

const OK: RoomLimitCheck = { ok: true };

function exceeded(limit: keyof OperatingEnvelope, reason: string): RoomLimitCheck {
  return { ok: false, limit, reason };
}

/**
 * Room-wide gates, checked before any member is selected. Ordered by how the
 * user would want to hear about it: money, then time, then volume.
 */
export function checkRoomLimits(room: Room, nowMs: number): RoomLimitCheck {
  const { envelope } = room.definition;
  const { usage, startedAt } = room.runtime;

  if (usage.costUsd >= envelope.maxCostUsd) {
    return exceeded('maxCostUsd', `The Room reached its ${formatUsd(envelope.maxCostUsd)} spending limit.`);
  }

  if (startedAt) {
    const elapsedMs = nowMs - Date.parse(startedAt);
    if (elapsedMs >= envelope.maxWallClockMs) {
      return exceeded('maxWallClockMs', `The Room reached its ${formatDuration(envelope.maxWallClockMs)} time limit.`);
    }
  }

  if (usage.inputTokens + usage.outputTokens >= envelope.maxTokens) {
    return exceeded('maxTokens', 'The Room reached its total token limit.');
  }

  if (usage.rosterRevisions >= envelope.maxRosterRevisions) {
    // Not fatal on its own — it stops further roster changes, and the caller
    // decides whether that blocks progress.
    return exceeded('maxRosterRevisions', 'The Room reached its limit on team changes.');
  }

  return OK;
}

/** Per-member gates, checked before that member is given a turn. */
export function checkMemberLimits(room: Room, member: RoomMember): RoomLimitCheck {
  const { envelope } = room.definition;
  const { usage } = member;

  if (usage.costUsd >= envelope.maxCostUsdPerMember) {
    return exceeded('maxCostUsdPerMember', `${member.displayName} reached its own spending limit.`);
  }
  if (usage.inputTokens + usage.outputTokens >= envelope.maxTokensPerMember) {
    return exceeded('maxTokensPerMember', `${member.displayName} reached its own token limit.`);
  }
  if (usage.turns >= envelope.maxTurnsPerMember) {
    return exceeded('maxTurnsPerMember', `${member.displayName} reached its own turn limit.`);
  }
  if (usage.consecutiveFailures >= envelope.maxConsecutiveFailures) {
    return exceeded('maxConsecutiveFailures', `${member.displayName} failed ${usage.consecutiveFailures} times in a row.`);
  }
  return OK;
}

/**
 * Whether adding another member is allowed. Separate from the roster-revision
 * count because a replacement consumes a replacement budget as well.
 */
export function checkRosterGrowth(room: Room, kind: 'add' | 'replace'): RoomLimitCheck {
  const { envelope } = room.definition;
  const activeMembers = room.members.filter((member) => member.status !== 'retired').length;

  if (kind === 'add' && activeMembers >= envelope.maxMembers) {
    return exceeded('maxMembers', `The Room already has its maximum of ${envelope.maxMembers} members.`);
  }
  if (kind === 'replace' && room.runtime.usage.memberReplacements >= envelope.maxMemberReplacements) {
    return exceeded('maxMemberReplacements', 'The Room reached its limit on member replacements.');
  }
  if (room.runtime.usage.rosterRevisions >= envelope.maxRosterRevisions) {
    return exceeded('maxRosterRevisions', 'The Room reached its limit on team changes.');
  }
  return OK;
}

/**
 * No-progress detection (spec §21). STRUCTURAL progress only — message volume
 * is not progress, because a Room can talk to itself indefinitely while
 * achieving nothing, and that is exactly the failure this catches.
 */
export function checkIdleLimit(room: Room, nowMs: number): RoomLimitCheck {
  const { maxIdleMs } = room.definition.envelope;
  const since = room.runtime.lastProgressAt ?? room.runtime.startedAt;
  if (!since) return OK;

  const idleMs = nowMs - Date.parse(since);
  if (idleMs >= maxIdleMs) {
    return exceeded('maxIdleMs', `Nothing has progressed for ${formatDuration(idleMs)}.`);
  }
  return OK;
}

function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hour${hours === 1 ? '' : 's'}` : `${hours}h ${rest}m`;
}
