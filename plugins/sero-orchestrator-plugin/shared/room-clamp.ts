/**
 * Clamping a blueprint to the approved operating envelope (spec §12.2).
 *
 * The planner and the Conductor can never raise a value. Everything here drops
 * or lowers, and every change is recorded so the user sees what was taken away
 * instead of a silently shrunk team.
 *
 * The embedded envelope is clamped FIRST, then members are clamped against the
 * clamped envelope. That ordering is what makes `validate(clamp(x))` hold: a
 * capability the approved envelope allows but the blueprint's own envelope does
 * not would otherwise survive on a member and fail validation.
 */

import { isThinkingLevel, THINKING_LEVELS } from '@sero-ai/common';

import type {
  BlueprintMember,
  MemberPermissionLevel,
  OperatingEnvelope,
  RoomBlueprint,
  RoomWorkspaceMode,
  RoomWorkspacePolicy,
} from './room-blueprint-types';
import { MEMBER_PERMISSION_LEVELS } from './room-blueprint-types';
import { isDeliveryDestinationId, isExternalDestination } from './delivery-types';

export type BlueprintClampKind =
  | 'envelope-lowered'
  | 'member-dropped'
  | 'tools-removed'
  | 'skills-removed'
  | 'model-substituted'
  | 'thinking-substituted'
  | 'permissions-lowered'
  | 'workspace-lowered'
  | 'delivery-substituted';

export interface BlueprintClamp {
  kind: BlueprintClampKind;
  /** null for a Room-level clamp. */
  memberKey: string | null;
  /** Plain English. Shown to the user next to the proposal. */
  detail: string;
}

export interface ClampResult {
  blueprint: RoomBlueprint;
  clamps: BlueprintClamp[];
}

/** Exported so a limit revision moves exactly the fields clamping knows about. */
export const NUMERIC_ENVELOPE_FIELDS = [
  'maxMembers', 'maxActiveTurns', 'maxRosterRevisions', 'maxMemberReplacements',
  'maxWallClockMs', 'maxCostUsd', 'maxCostUsdPerMember', 'maxTokens', 'maxTokensPerMember',
  'maxTurnsPerMember', 'maxRetriesPerMember', 'maxConsecutiveFailures', 'maxIdleMs',
] as const satisfies readonly (keyof OperatingEnvelope)[];

const LIST_ENVELOPE_FIELDS = [
  'allowedModels', 'allowedThinkingLevels', 'allowedTools', 'allowedSkills', 'allowedDeliveryDestinations',
] as const satisfies readonly (keyof OperatingEnvelope)[];

type ClampedEnvelopeField =
  | (typeof NUMERIC_ENVELOPE_FIELDS)[number]
  | (typeof LIST_ENVELOPE_FIELDS)[number]
  | 'allowNestedSubagents'
  | 'workspacePolicy';

/**
 * Every envelope field needs a clamp rule. A new field added without one breaks
 * this line at compile time, instead of quietly letting a blueprint keep its own
 * higher value for it.
 */
const ENVELOPE_CLAMP_COVERAGE: Exclude<keyof OperatingEnvelope, ClampedEnvelopeField> extends never
  ? true
  : false = true;
void ENVELOPE_CLAMP_COVERAGE;

/** Reach order. Each mode is a strict superset of the one before it. */
const WORKSPACE_MODES: readonly RoomWorkspaceMode[] = ['read-only-shared', 'worktree-per-member', 'shared-working-tree'];

/** Reach order, same rule as the workspace modes. */
const PERMISSION_LEVELS = MEMBER_PERMISSION_LEVELS;

function clampEnvelope(
  proposed: OperatingEnvelope,
  approved: OperatingEnvelope,
  clamps: BlueprintClamp[],
): OperatingEnvelope {
  const clamped: OperatingEnvelope = { ...proposed };
  for (const field of NUMERIC_ENVELOPE_FIELDS) {
    if (proposed[field] > approved[field]) {
      clamps.push({
        kind: 'envelope-lowered',
        memberKey: null,
        detail: `${field} lowered from ${proposed[field]} to ${approved[field]}.`,
      });
      clamped[field] = approved[field];
    }
  }
  for (const field of LIST_ENVELOPE_FIELDS) {
    const removed = proposed[field].filter((value) => !approved[field].includes(value));
    if (removed.length > 0) {
      clamps.push({
        kind: 'envelope-lowered',
        memberKey: null,
        detail: `${field}: removed ${removed.join(', ')}.`,
      });
      clamped[field] = proposed[field].filter((value) => approved[field].includes(value));
    }
  }
  if (proposed.allowNestedSubagents && !approved.allowNestedSubagents) {
    clamps.push({ kind: 'envelope-lowered', memberKey: null, detail: 'Nested subagents turned off.' });
    clamped.allowNestedSubagents = false;
  }
  clamped.workspacePolicy = clampWorkspacePolicy(proposed.workspacePolicy, approved.workspacePolicy, 'Limits', clamps);
  return clamped;
}

function clampWorkspacePolicy(
  proposed: RoomWorkspacePolicy,
  ceiling: RoomWorkspacePolicy,
  label: string,
  clamps: BlueprintClamp[],
): RoomWorkspacePolicy {
  // The planner cannot approve the shared tree on the user's behalf.
  const sharedTreeApproved = proposed.sharedTreeApproved && ceiling.sharedTreeApproved;
  let mode = proposed.mode;
  if (WORKSPACE_MODES.indexOf(mode) > WORKSPACE_MODES.indexOf(ceiling.mode)) mode = ceiling.mode;
  if (mode === 'shared-working-tree' && !sharedTreeApproved) mode = 'worktree-per-member';
  if (mode !== proposed.mode) {
    clamps.push({
      kind: 'workspace-lowered',
      memberKey: null,
      detail: `${label} workspace mode lowered from ${proposed.mode} to ${mode}.`,
    });
  }
  // A blocking claim policy is the stricter one, so it wins.
  const claimPolicy = ceiling.claimPolicy === 'block' ? 'block' : proposed.claimPolicy;
  if (claimPolicy !== proposed.claimPolicy) {
    clamps.push({ kind: 'workspace-lowered', memberKey: null, detail: `${label} path claims now block instead of warn.` });
  }
  return { mode, sharedTreeApproved, claimPolicy };
}

/**
 * The highest allowed level at or below the requested one. When the envelope
 * allows nothing that low, the lowest allowed level is used: it is the only
 * choice that does not pick a more expensive level than needed.
 */
function clampThinking(requested: string, allowed: string[]): string {
  if (allowed.includes(requested)) return requested;
  const ranked = allowed.filter(isThinkingLevel)
    .sort((a, b) => THINKING_LEVELS.indexOf(a) - THINKING_LEVELS.indexOf(b));
  const requestedIndex = isThinkingLevel(requested) ? THINKING_LEVELS.indexOf(requested) : -1;
  const atOrBelow = ranked.filter((level) => THINKING_LEVELS.indexOf(level) <= requestedIndex);
  return atOrBelow.length > 0 ? atOrBelow[atOrBelow.length - 1] : (ranked[0] ?? allowed[0] ?? requested);
}

function clampMember(
  member: BlueprintMember,
  envelope: OperatingEnvelope,
  workspace: RoomWorkspacePolicy,
  clamps: BlueprintClamp[],
): BlueprintMember {
  const clamped: BlueprintMember = { ...member };

  const droppedTools = member.tools.filter((tool) => !envelope.allowedTools.includes(tool));
  if (droppedTools.length > 0) {
    clamps.push({ kind: 'tools-removed', memberKey: member.key, detail: `Removed ${droppedTools.join(', ')} from ${member.displayName}.` });
    clamped.tools = member.tools.filter((tool) => envelope.allowedTools.includes(tool));
  }
  const droppedSkills = member.skills.filter((skill) => !envelope.allowedSkills.includes(skill));
  if (droppedSkills.length > 0) {
    clamps.push({ kind: 'skills-removed', memberKey: member.key, detail: `Removed ${droppedSkills.join(', ')} from ${member.displayName}.` });
    clamped.skills = member.skills.filter((skill) => envelope.allowedSkills.includes(skill));
  }

  // An envelope with no allowed model cannot be satisfied by substitution; the
  // member keeps its model and validation reports it.
  if (!envelope.allowedModels.includes(member.model) && envelope.allowedModels.length > 0) {
    clamped.model = envelope.allowedModels[0];
    clamps.push({ kind: 'model-substituted', memberKey: member.key, detail: `${member.displayName} moved from ${member.model} to ${clamped.model}.` });
  }
  if (!envelope.allowedThinkingLevels.includes(member.thinking) && envelope.allowedThinkingLevels.length > 0) {
    clamped.thinking = clampThinking(member.thinking, envelope.allowedThinkingLevels);
    clamps.push({ kind: 'thinking-substituted', memberKey: member.key, detail: `${member.displayName} thinking lowered from ${member.thinking} to ${clamped.thinking}.` });
  }

  // A read-only workspace is the permission ceiling: pushing a branch needs a
  // tree it is allowed to write.
  if (workspace.mode === 'read-only-shared' && member.permissions !== 'read-only') {
    clamped.permissions = 'read-only';
    clamps.push({ kind: 'permissions-lowered', memberKey: member.key, detail: `${member.displayName} lowered to read-only in a read-only workspace.` });
  }
  return clamped;
}

/** Keeps the Conductor and the first members in order; drops the overflow. */
function clampRoster(members: BlueprintMember[], maxMembers: number, clamps: BlueprintClamp[]): BlueprintMember[] {
  if (members.length <= maxMembers) return members;
  const kept = members.filter((member) => member.isConductor).slice(0, maxMembers);
  for (const member of members) {
    if (kept.length >= maxMembers) break;
    if (!member.isConductor) kept.push(member);
  }
  const keptKeys = new Set(kept.map((member) => member.key));
  for (const member of members.filter((candidate) => !keptKeys.has(candidate.key))) {
    clamps.push({ kind: 'member-dropped', memberKey: member.key, detail: `${member.displayName} dropped — the team cap is ${maxMembers}.` });
  }
  return members.filter((member) => keptKeys.has(member.key));
}

/** Prefers a destination that keeps the result inside Sero. */
function clampDelivery(destination: string, allowed: string[], clamps: BlueprintClamp[]): string {
  if (allowed.includes(destination) || allowed.length === 0) return destination;
  const internal = allowed.find((id) => isDeliveryDestinationId(id) && !isExternalDestination(id));
  const replacement = internal ?? allowed[0];
  clamps.push({ kind: 'delivery-substituted', memberKey: null, detail: `Delivery moved from ${destination} to ${replacement}.` });
  return replacement;
}

export function clampBlueprintToEnvelope(blueprint: RoomBlueprint, envelope: OperatingEnvelope): ClampResult {
  const clamps: BlueprintClamp[] = [];
  const clampedEnvelope = clampEnvelope(blueprint.envelope, envelope, clamps);
  const workspacePolicy = clampWorkspacePolicy(blueprint.workspacePolicy, clampedEnvelope.workspacePolicy, 'Room', clamps);
  const roster = clampRoster(blueprint.members, clampedEnvelope.maxMembers, clamps);
  return {
    blueprint: {
      ...blueprint,
      envelope: clampedEnvelope,
      workspacePolicy,
      members: roster.map((member) => clampMember(member, clampedEnvelope, workspacePolicy, clamps)),
      deliveryDestination: clampDelivery(blueprint.deliveryDestination, clampedEnvelope.allowedDeliveryDestinations, clamps),
    },
    clamps,
  };
}
