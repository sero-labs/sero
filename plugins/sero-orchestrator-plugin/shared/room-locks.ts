/**
 * The values the user set explicitly, and their enforcement (spec §12.1, §9.3).
 *
 * Spend, time, team size, access and delivery are the user's to decide. The
 * planner is TOLD they are fixed, and then they are imposed again here in code,
 * because a prompt instruction is not enforcement — it is a request the model
 * is free to ignore.
 *
 * Pure, like the rest of the room-* validation set: the renderer can show the
 * ceiling an adjustment will be held to before the model is ever called.
 */

import type {
  MemberPermissionLevel,
  OperatingEnvelope,
  RoomBlueprint,
  RoomWorkspaceMode,
} from './room-blueprint-types';
import type { BlueprintClamp, ClampResult } from './room-clamp';
import { clampBlueprintToEnvelope } from './room-clamp';

/** Every field is optional: an unset lock means the user left that choice open. */
export interface RoomUserLocks {
  /** Maximum spend, in USD. */
  maxCostUsd?: number;
  /** Maximum working time. */
  maxWallClockMs?: number;
  /** Maximum team size, Conductor included. */
  maxMembers?: number;
  /** The broad access choice, as the workspace mode it maps to. */
  workspaceMode?: RoomWorkspaceMode;
  /** Highest permission any member may hold. */
  permissionCeiling?: MemberPermissionLevel;
  /** The capability pool. A tool outside it cannot be assigned to anyone. */
  allowedTools?: string[];
  allowedSkills?: string[];
  /** Where the result goes. Delivery is a user setting, never planner-chosen. */
  deliveryDestination?: string;
}

/** Reach order; each mode is a strict superset of the one before it. */
const WORKSPACE_MODES: readonly RoomWorkspaceMode[] = ['read-only-shared', 'worktree-per-member', 'shared-working-tree'];
const PERMISSION_LEVELS: readonly MemberPermissionLevel[] = ['read-only', 'edit-workspace', 'edit-and-push'];

function lower(current: number, lock: number | undefined): number {
  return lock === undefined ? current : Math.min(current, lock);
}

function narrow(current: string[], lock: string[] | undefined): string[] {
  return lock === undefined ? current : current.filter((name) => lock.includes(name));
}

function lowerMode(current: RoomWorkspaceMode, lock: RoomWorkspaceMode | undefined): RoomWorkspaceMode {
  if (lock === undefined) return current;
  return WORKSPACE_MODES.indexOf(lock) < WORKSPACE_MODES.indexOf(current) ? lock : current;
}

/**
 * The ceiling an adjustment is held to: the INTERSECTION of the envelope the
 * user already approved and the locks they set. Intersection, not replacement —
 * a lock can tighten the approved envelope but an adjustment must never widen
 * it, whatever the lock says.
 *
 * A lock naming something the approved envelope does not hold therefore narrows
 * to nothing rather than granting it. Validation then refuses the blueprint by
 * name instead of quietly handing over reach the user never approved.
 */
export function envelopeUnderLocks(current: OperatingEnvelope, locks: RoomUserLocks): OperatingEnvelope {
  return {
    ...current,
    maxMembers: lower(current.maxMembers, locks.maxMembers),
    maxWallClockMs: lower(current.maxWallClockMs, locks.maxWallClockMs),
    maxCostUsd: lower(current.maxCostUsd, locks.maxCostUsd),
    allowedTools: narrow(current.allowedTools, locks.allowedTools),
    allowedSkills: narrow(current.allowedSkills, locks.allowedSkills),
    // `deliveryDestination` is pinned on the blueprint instead of narrowed here:
    // choosing one destination from the approved pool is not a decision to
    // discard the rest of the pool.
    workspacePolicy: {
      ...current.workspacePolicy,
      mode: lowerMode(current.workspacePolicy.mode, locks.workspaceMode),
    },
  };
}

/**
 * The permission ceiling has no envelope field of its own — reach is expressed
 * through the workspace mode and the capability pool — so the one lock the
 * standard clamp cannot carry is applied here.
 */
function applyPermissionCeiling(blueprint: RoomBlueprint, ceiling: MemberPermissionLevel, clamps: BlueprintClamp[]): RoomBlueprint {
  const limit = PERMISSION_LEVELS.indexOf(ceiling);
  return {
    ...blueprint,
    members: blueprint.members.map((member) => {
      if (PERMISSION_LEVELS.indexOf(member.permissions) <= limit) return member;
      clamps.push({
        kind: 'permissions-lowered',
        memberKey: member.key,
        detail: `${member.displayName} lowered from ${member.permissions} to ${ceiling} — the permission you set.`,
      });
      return { ...member, permissions: ceiling };
    }),
  };
}

/**
 * Where results go is a user setting, like worktree placement — never a planner
 * choice. So a locked destination is pinned outright rather than merely kept
 * inside the approved pool: switching from one approved destination to another
 * is still a change the user did not ask for.
 */
function pinDelivery(blueprint: RoomBlueprint, destination: string, clamps: BlueprintClamp[]): RoomBlueprint {
  if (blueprint.deliveryDestination === destination) return blueprint;
  clamps.push({
    kind: 'delivery-substituted',
    memberKey: null,
    detail: `Delivery stays ${destination} — where the result goes is your choice, not the planner's.`,
  });
  return { ...blueprint, deliveryDestination: destination };
}

/**
 * Clamp a proposed blueprint to what the user approved AND to what they set
 * explicitly. Every reduction is recorded, so the user is told what was taken
 * away instead of being shown a quietly shrunk team.
 */
export function clampBlueprintToLocks(
  blueprint: RoomBlueprint,
  approved: OperatingEnvelope,
  locks: RoomUserLocks,
): ClampResult {
  const { blueprint: clamped, clamps } = clampBlueprintToEnvelope(blueprint, envelopeUnderLocks(approved, locks));
  const pinned = locks.deliveryDestination === undefined ? clamped : pinDelivery(clamped, locks.deliveryDestination, clamps);
  return {
    blueprint: locks.permissionCeiling === undefined ? pinned : applyPermissionCeiling(pinned, locks.permissionCeiling, clamps),
    clamps,
  };
}
