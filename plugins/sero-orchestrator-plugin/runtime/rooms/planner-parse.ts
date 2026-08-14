/**
 * Strict parse of the Room Planner's reply, and assembly of the blueprint the
 * runtime will enforce (spec §9.1 step 5, architecture §7).
 *
 * Three things happen here, in this order, and the order is the safety
 * property:
 *
 * 1. SHAPE. The model's JSON is parsed strictly. An unexpected value is never
 *    coerced — it is rejected with a precise message the repair pass feeds back.
 * 2. EXISTENCE. A name that is not in the catalogue is a hallucination, not an
 *    over-reach: dropping it would leave a member that cannot do its job, so it
 *    goes back to the model.
 * 3. AUTHORITY. The envelope, the workspace approval, the delivery destination
 *    and the permission ceiling come from the USER's choices, not from the
 *    reply, and the blueprint is clamped to them. A suggestion above a limit is
 *    lowered and recorded, rather than failing the whole plan.
 * 4. MEANING. `validateRoomBlueprint` runs again on the clamped blueprint. What
 *    it rejects there (no Conductor, two Conductors, a duplicate key) is
 *    exactly what clamping cannot repair, so those errors go back to the model.
 *
 * The result is that the blueprint handed to `computeProposalSummary` is the
 * same blueprint the runtime enforces (NFR-015).
 */

import type { HumanQuestion } from '../../shared/human-input-types';
import type {
  BlueprintMember,
  MemberPermissionLevel,
  OperatingEnvelope,
  RoomBlueprint,
  RoomWorkspaceMode,
} from '../../shared/room-blueprint-types';
import {
  clampBlueprintToEnvelope,
  validateRoomBlueprint,
  type BlueprintClamp,
  type RoomBlueprintError,
  type RoomBlueprintErrorCode,
  type RoomCapabilityCatalogue,
} from '../../shared/room-validation';
import { parseHumanQuestions } from '../human-input';
import { isRecord, type ParseResult } from '../structured-call';

/** The user-owned half of a plan: everything the model is not allowed to author. */
export interface RoomPlannerContext {
  envelope: OperatingEnvelope;
  /** Everything that EXISTS, so an invented name is reported as invented. */
  catalogue: RoomCapabilityCatalogue;
  /** The user's destination. The planner never chooses one. */
  deliveryDestination: string;
  /** The user's access choice, as the highest permission any member may hold. */
  permissionCeiling: MemberPermissionLevel;
}

export type RoomPlannerReply =
  | { kind: 'questions'; questions: HumanQuestion[] }
  | { kind: 'blueprint'; blueprint: RoomBlueprint; clamps: BlueprintClamp[] };

/** The model may only propose these two. The shared working tree is an advanced setting. */
const PLANNABLE_WORKSPACE_MODES = ['read-only-shared', 'worktree-per-member'] as const;

const PERMISSION_LEVELS: readonly MemberPermissionLevel[] = ['read-only', 'edit-workspace', 'edit-and-push'];

// ── Strict field readers ────────────────────────────────────
// Each records a precise error and returns a placeholder. The placeholder is
// never used: a non-empty error list discards the whole draft.

function readString(source: Record<string, unknown>, key: string, path: string, errors: string[]): string {
  const value = source[key];
  if (typeof value !== 'string' || !value.trim()) {
    errors.push(`${path}${key}: a non-empty string is required`);
    return '';
  }
  return value.trim();
}

function readStringArray(source: Record<string, unknown>, key: string, path: string, errors: string[]): string[] {
  const value = source[key];
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    errors.push(`${path}${key}: must be an array of strings`);
    return [];
  }
  return (value as string[]).map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

function readBoolean(source: Record<string, unknown>, key: string, path: string, errors: string[]): boolean {
  const value = source[key];
  if (typeof value !== 'boolean') {
    errors.push(`${path}${key}: must be true or false`);
    return false;
  }
  return value;
}

function readNumber(source: Record<string, unknown>, key: string, path: string, errors: string[]): number {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    errors.push(`${path}${key}: must be a number of 0 or more`);
    return 0;
  }
  return value;
}

function readEnum<T extends string>(
  source: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  path: string,
  errors: string[],
): T {
  const value = source[key];
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    errors.push(`${path}${key}: must be one of ${allowed.join(', ')}`);
    return allowed[0];
  }
  return value as T;
}

// ── Draft ───────────────────────────────────────────────────

/** Exactly what the model authors. Everything else is the user's. */
interface RoomBlueprintDraft {
  title: string;
  approach: string;
  objective: string;
  successCriteria: string[];
  roomInstructions: string;
  collaborationStrategy: string;
  teamRationale: string;
  workspaceMode: RoomWorkspaceMode;
  estimatedDurationMs: number;
  estimatedCostUsd: number;
  openAssumptions: string[];
  members: BlueprintMember[];
}

function parseMember(raw: unknown, index: number, errors: string[]): BlueprintMember | null {
  if (!isRecord(raw)) {
    errors.push(`members[${index}]: must be an object`);
    return null;
  }
  const path = `members[${index}].`;
  return {
    key: readString(raw, 'key', path, errors),
    displayName: readString(raw, 'displayName', path, errors),
    role: readString(raw, 'role', path, errors),
    responsibility: readString(raw, 'responsibility', path, errors),
    mandate: readString(raw, 'mandate', path, errors),
    // Required here rather than in shared validation: a member with no stated
    // reason is how a redundant member hides in a roster (spec §10).
    reasonForInclusion: readString(raw, 'reasonForInclusion', path, errors),
    isConductor: readBoolean(raw, 'isConductor', path, errors),
    model: readString(raw, 'model', path, errors),
    thinking: readString(raw, 'thinking', path, errors),
    promptAdditions: readStringArray(raw, 'promptAdditions', path, errors),
    tools: readStringArray(raw, 'tools', path, errors),
    skills: readStringArray(raw, 'skills', path, errors),
    permissions: readEnum(raw, 'permissions', PERMISSION_LEVELS, path, errors),
    needsWorktree: readBoolean(raw, 'needsWorktree', path, errors),
  };
}

function parseDraft(value: Record<string, unknown>, errors: string[]): RoomBlueprintDraft | null {
  const rawMembers = value.members;
  if (!Array.isArray(rawMembers) || rawMembers.length === 0) {
    errors.push('members: at least one member is required');
    return null;
  }
  const members = rawMembers.map((raw, index) => parseMember(raw, index, errors));
  const successCriteria = readStringArray(value, 'successCriteria', '', errors);
  if (successCriteria.length === 0) errors.push('successCriteria: at least one criterion is required');

  const draft: RoomBlueprintDraft = {
    title: readString(value, 'title', '', errors),
    approach: readString(value, 'approach', '', errors),
    objective: readString(value, 'objective', '', errors),
    successCriteria,
    roomInstructions: readString(value, 'roomInstructions', '', errors),
    collaborationStrategy: readString(value, 'collaborationStrategy', '', errors),
    teamRationale: readString(value, 'teamRationale', '', errors),
    workspaceMode: readEnum(value, 'workspaceMode', PLANNABLE_WORKSPACE_MODES, '', errors),
    // Models reason in minutes; the record stores milliseconds.
    estimatedDurationMs: readNumber(value, 'estimatedDurationMinutes', '', errors) * 60_000,
    estimatedCostUsd: readNumber(value, 'estimatedCostUsd', '', errors),
    openAssumptions: readStringArray(value, 'openAssumptions', '', errors),
    members: members.filter((member): member is BlueprintMember => member !== null),
  };
  return errors.length === 0 ? draft : null;
}

// ── Assembly ────────────────────────────────────────────────

/**
 * The access choice is a permission ceiling, and `clampBlueprintToEnvelope` has
 * no envelope field for it — it lowers permissions only inside a read-only
 * workspace. So the choice is applied where it lives: on the way in, before the
 * envelope clamp, and recorded like any other clamp.
 */
function capPermissions(
  member: BlueprintMember,
  ceiling: MemberPermissionLevel,
  clamps: BlueprintClamp[],
): BlueprintMember {
  const requested = PERMISSION_LEVELS.indexOf(member.permissions);
  const allowed = PERMISSION_LEVELS.indexOf(ceiling);
  if (requested <= allowed) return member;
  clamps.push({
    kind: 'permissions-lowered',
    memberKey: member.key,
    detail: `${member.displayName} lowered from ${member.permissions} to ${ceiling} — the Room's access choice.`,
  });
  return { ...member, permissions: ceiling };
}

function compose(draft: RoomBlueprintDraft, context: RoomPlannerContext, clamps: BlueprintClamp[]): RoomBlueprint {
  const { envelope } = context;
  return {
    schemaVersion: 1,
    title: draft.title,
    approach: draft.approach,
    objective: draft.objective,
    successCriteria: draft.successCriteria,
    roomInstructions: draft.roomInstructions,
    members: draft.members.map((member) => capPermissions(member, context.permissionCeiling, clamps)),
    teamRationale: draft.teamRationale,
    collaborationStrategy: draft.collaborationStrategy,
    // The mode is the model's to lower; the approval and the claim policy are
    // the user's, so they are copied from the envelope and never read from JSON.
    workspacePolicy: {
      mode: draft.workspaceMode,
      sharedTreeApproved: envelope.workspacePolicy.sharedTreeApproved,
      claimPolicy: envelope.workspacePolicy.claimPolicy,
    },
    envelope,
    // An estimate above the ceiling is meaningless — the Room stops at the
    // ceiling — and reads as a second, higher budget.
    estimatedDurationMs: Math.min(draft.estimatedDurationMs, envelope.maxWallClockMs),
    estimatedCostUsd: Math.min(draft.estimatedCostUsd, envelope.maxCostUsd),
    deliveryDestination: context.deliveryDestination,
    openAssumptions: draft.openAssumptions,
  };
}

/** Names that do not exist anywhere — a hallucination, not an over-reach. */
const INVENTED_NAME_CODES: readonly RoomBlueprintErrorCode[] = ['model-unknown', 'tool-unknown', 'skill-unknown'];

function describe(errors: RoomBlueprintError[]): string[] {
  return errors.map((error) => `${error.path}: ${error.message}`);
}

/**
 * Classifies one planner reply. Clarifying questions are a valid answer, so
 * they parse successfully and no repair pass runs (spec §9.1).
 */
export function parseRoomPlannerReply(value: unknown, context: RoomPlannerContext): ParseResult<RoomPlannerReply> {
  if (!isRecord(value)) return { ok: false, errors: ['the reply must be a single JSON object'] };

  const questions = parseHumanQuestions(value.clarifyingQuestions);
  if (questions) return { ok: true, value: { kind: 'questions', questions } };

  const errors: string[] = [];
  const draft = parseDraft(value, errors);
  if (!draft) return { ok: false, errors };

  const clamps: BlueprintClamp[] = [];
  const proposed = compose(draft, context, clamps);

  // Existence first, and only existence: an over-reach is the clamp's job, but
  // a name nothing can resolve has to go back to the model.
  const beforeClamp = validateRoomBlueprint(proposed, context.catalogue);
  const invented = beforeClamp.ok ? [] : beforeClamp.errors.filter((error) => INVENTED_NAME_CODES.includes(error.code));
  if (invented.length > 0) return { ok: false, errors: describe(invented) };

  const clamped = clampBlueprintToEnvelope(proposed, context.envelope);
  const validation = validateRoomBlueprint(clamped.blueprint, context.catalogue);
  if (!validation.ok) return { ok: false, errors: describe(validation.errors) };

  return { ok: true, value: { kind: 'blueprint', blueprint: clamped.blueprint, clamps: [...clamps, ...clamped.clamps] } };
}
