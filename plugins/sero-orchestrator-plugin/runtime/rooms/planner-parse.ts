/**
 * One Room Planner reply → the blueprint the runtime will enforce
 * (spec §9.1 step 5, architecture §7).
 *
 * Four things happen here, in this order, and the order is the safety property:
 *
 * 1. THE USER'S FIELDS ARE NOT READ FROM THE REPLY. Only the planner's own
 *    fields are picked out of it; the operating envelope, the workspace
 *    approval and the delivery destination are supplied from the user's
 *    choices. The model cannot author a limit even by accident, because its
 *    value for one is never looked at — only reported when it asked for more.
 * 2. SHAPE. `parseRoomBlueprint` builds the blueprint field by field and
 *    rejects an unexpected value with a precise message instead of coercing it.
 * 3. EXISTENCE. A name that is in no catalogue is a hallucination, not an
 *    over-reach: dropping it would leave a member that cannot do its job, so it
 *    goes back to the model.
 * 4. LIMITS, THEN MEANING. The blueprint is clamped to the envelope — a
 *    suggestion above a limit is lowered and recorded rather than failing the
 *    plan — and then validated. What validation rejects after clamping (no
 *    Conductor, two Conductors, a duplicate key) is exactly what clamping
 *    cannot repair, so those errors go back to the model too.
 *
 * The blueprint that comes out is therefore the one `computeProposalSummary`
 * projects the user's consent summary from (NFR-015).
 */

import type { HumanQuestion } from '../../shared/human-input-types';
import type {
  BlueprintMember,
  MemberPermissionLevel,
  OperatingEnvelope,
  RoomBlueprint,
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
import { parseRoomBlueprint } from './blueprint-schema';

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

/**
 * The only fields taken from the reply. Everything else in a `RoomBlueprint` —
 * the schema version, the envelope, the workspace approval, the delivery
 * destination — belongs to Sero or to the user.
 */
const PLANNER_FIELDS = [
  'title', 'approach', 'objective', 'successCriteria', 'roomInstructions',
  'members', 'teamRationale', 'collaborationStrategy',
  'estimatedDurationMs', 'estimatedCostUsd', 'openAssumptions',
] as const satisfies readonly (keyof RoomBlueprint)[];

/** Reach order. Each level is a strict superset of the one before it. */
const PERMISSION_LEVELS: readonly MemberPermissionLevel[] = ['read-only', 'edit-workspace', 'edit-and-push'];

/** Names that exist nowhere — a hallucination rather than an over-reach. */
const INVENTED_NAME_CODES: readonly RoomBlueprintErrorCode[] = ['model-unknown', 'tool-unknown', 'skill-unknown'];

/**
 * The envelope in the reply is never used; the approved one is. But a reply
 * that asked for more has to be REPORTED, or the user sees a team quietly
 * sized for a budget it does not have.
 */
function reportEnvelopeOverreach(raw: unknown, approved: OperatingEnvelope, clamps: BlueprintClamp[]): void {
  if (!isRecord(raw)) return;
  for (const [field, approvedValue] of Object.entries(approved)) {
    const proposed = raw[field];
    if (typeof approvedValue !== 'number' || typeof proposed !== 'number' || proposed <= approvedValue) continue;
    clamps.push({
      kind: 'envelope-lowered',
      memberKey: null,
      detail: `${field} lowered from ${proposed} to ${approvedValue}.`,
    });
  }
}

/**
 * Rebuilds the object to parse from the planner's fields plus the user's. The
 * workspace MODE is the one part of the policy the planner keeps: lowering
 * reach is a planning decision, and the clamp catches an attempt to raise it.
 */
function withUserAuthority(value: Record<string, unknown>, context: RoomPlannerContext): Record<string, unknown> {
  const proposedPolicy = isRecord(value.workspacePolicy) ? value.workspacePolicy : {};
  const picked: Record<string, unknown> = {
    schemaVersion: 1,
    envelope: context.envelope,
    workspacePolicy: {
      mode: proposedPolicy.mode,
      sharedTreeApproved: context.envelope.workspacePolicy.sharedTreeApproved,
      claimPolicy: context.envelope.workspacePolicy.claimPolicy,
    },
    deliveryDestination: context.deliveryDestination,
  };
  for (const field of PLANNER_FIELDS) picked[field] = value[field];
  return picked;
}

/**
 * The access choice is a permission ceiling, and `clampBlueprintToEnvelope` has
 * no envelope field for it — it lowers permissions only inside a read-only
 * workspace. So the choice is applied where it lives, and recorded like any
 * other clamp.
 */
function capPermissions(
  member: BlueprintMember,
  ceiling: MemberPermissionLevel,
  clamps: BlueprintClamp[],
): BlueprintMember {
  if (PERMISSION_LEVELS.indexOf(member.permissions) <= PERMISSION_LEVELS.indexOf(ceiling)) return member;
  clamps.push({
    kind: 'permissions-lowered',
    memberKey: member.key,
    detail: `${member.displayName} lowered from ${member.permissions} to ${ceiling} — the Room's access choice.`,
  });
  return { ...member, permissions: ceiling };
}

function applyCeilings(blueprint: RoomBlueprint, context: RoomPlannerContext, clamps: BlueprintClamp[]): RoomBlueprint {
  return {
    ...blueprint,
    members: blueprint.members.map((member) => capPermissions(member, context.permissionCeiling, clamps)),
    // An estimate above the ceiling is meaningless — the Room stops at the
    // ceiling — and reads as a second, higher budget.
    estimatedDurationMs: Math.min(blueprint.estimatedDurationMs, context.envelope.maxWallClockMs),
    estimatedCostUsd: Math.min(blueprint.estimatedCostUsd, context.envelope.maxCostUsd),
  };
}

/**
 * Shared validation has no rule for this field, and the planner's whole defence
 * against a redundant member is that it must justify each one in writing.
 */
function missingReasons(blueprint: RoomBlueprint): string[] {
  return blueprint.members
    .filter((member) => !member.reasonForInclusion.trim())
    .map((member) => `members: ${member.displayName} needs a reasonForInclusion — one sentence on what is lost without it.`);
}

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

  const clamps: BlueprintClamp[] = [];
  reportEnvelopeOverreach(value.envelope, context.envelope, clamps);

  const parsed = parseRoomBlueprint(withUserAuthority(value, context));
  if (!parsed.ok) return parsed;

  const reasons = missingReasons(parsed.value);
  if (reasons.length > 0) return { ok: false, errors: reasons };

  const proposed = applyCeilings(parsed.value, context, clamps);

  // Existence, and only existence: an over-reach is the clamp's job, but a name
  // nothing can resolve has to go back to the model.
  const beforeClamp = validateRoomBlueprint(proposed, context.catalogue);
  const invented = beforeClamp.ok ? [] : beforeClamp.errors.filter((error) => INVENTED_NAME_CODES.includes(error.code));
  if (invented.length > 0) return { ok: false, errors: describe(invented) };

  const clamped = clampBlueprintToEnvelope(proposed, context.envelope);
  const validation = validateRoomBlueprint(clamped.blueprint, context.catalogue);
  if (!validation.ok) return { ok: false, errors: describe(validation.errors) };

  return { ok: true, value: { kind: 'blueprint', blueprint: clamped.blueprint, clamps: [...clamps, ...clamped.clamps] } };
}
