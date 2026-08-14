/**
 * Natural-language Room adjustment (spec §9.3, architecture.md §7.0, D-16).
 *
 * "Use fewer agents", "add a security reviewer", "keep it under $2". The model
 * returns a REVISED BLUEPRINT and nothing else. Everything the user is then
 * shown — the team size, the time, the spend, the access tiles, the warnings and
 * the report of what changed — is computed here from the revised blueprint after
 * it has been clamped and validated. None of it is ever planner-authored.
 *
 * The order is deliberate: clamp, then validate, then compute. Clamping first
 * means a request for reach the user never approved is corrected and REPORTED as
 * a clamp, rather than burning the single repair pass on something the model
 * cannot fix. What reaches validation is a blueprint the runtime could actually
 * enforce, so a remaining error is a real one worth re-asking about.
 */

import type {
  BlueprintDiff,
  OperatingEnvelope,
  RoomBlueprint,
  RoomProposalSummary,
} from '../../shared/room-blueprint-types';
import type { BlueprintClamp, ClampResult } from '../../shared/room-clamp';
import type { RoomUserLocks } from '../../shared/room-locks';
import type { RoomCapabilityCatalogue } from '../../shared/room-validation';
import { approvedPermissionCeiling, clampBlueprintToLocks, envelopeUnderLocks } from '../../shared/room-locks';
import {
  computeProposalSummary,
  diffBlueprints,
  validateRoomBlueprint,
} from '../../shared/room-validation';
import type { OrchestratorHost } from '../host';
import type { ParseResult } from '../structured-call';
import { isRecord, runStructuredJson } from '../structured-call';
import { parseRoomBlueprint } from './blueprint-schema';
import type { AdjustCapabilityBlock } from './adjust-prompt';
import {
  ROOM_ADJUST_SYSTEM_PROMPT,
  buildAdjustRepairTask,
  buildAdjustTask,
} from './adjust-prompt';

export interface AdjustRoomRequest {
  /** The blueprint the user approved. */
  blueprint: RoomBlueprint;
  /** The user's own words. */
  instruction: string;
  parentSessionId: string;
  /** The authority ceiling. Defaults to the approved blueprint's own envelope. */
  envelope?: OperatingEnvelope;
  /** What the user set explicitly. Stated as fixed in the prompt AND imposed in code. */
  userLocks?: RoomUserLocks;
  /**
   * What the workspace can resolve right now. Defaults to the approved
   * envelope's own lists, every name in which was checked against the live
   * catalogue when the Room was approved.
   */
  catalogue?: RoomCapabilityCatalogue;
  model?: string;
  thinking?: string;
  signal?: AbortSignal;
}

export type AdjustRoomOutcome =
  | {
      ok: true;
      blueprint: RoomBlueprint;
      /** Recomputed after the change, as it must be after EVERY change. */
      proposal: RoomProposalSummary;
      /** The changed / preserved / removed report, at member granularity. */
      diff: BlueprintDiff;
      /** What the user asked for that the approved envelope would not allow. */
      clamps: BlueprintClamp[];
      modelResponses: string[];
    }
  | { ok: false; errors: string[]; modelResponses: string[] };

function intersect(allowed: string[], available: string[]): string[] {
  return allowed.filter((name) => available.includes(name));
}

function approvedEnvelope(request: AdjustRoomRequest): OperatingEnvelope {
  return request.envelope ?? request.blueprint.envelope;
}

function resolveCatalogue(request: AdjustRoomRequest): RoomCapabilityCatalogue {
  const envelope = approvedEnvelope(request);
  return request.catalogue ?? {
    models: envelope.allowedModels,
    tools: envelope.allowedTools,
    skills: envelope.allowedSkills,
  };
}

/**
 * The user's own locks, plus the two an adjustment always carries.
 *
 * The delivery destination it started with: where results go is a user setting,
 * so an adjustment can never move it — only the delivery setting itself can.
 *
 * The permission ceiling the approved roster already holds: the envelope has no
 * permission field, and the standard clamp only lowers permissions inside a
 * read-only workspace, so without this a revision could raise a member to
 * edit-and-push and put GitHub write access in the consent summary on the
 * model's word alone (spec §12.2, §12.3). A caller that means to widen the
 * ceiling passes a higher one explicitly — that is a user decision, not a
 * planner one.
 */
function effectiveLocks(request: AdjustRoomRequest): RoomUserLocks {
  const locks = request.userLocks ?? {};
  return {
    ...locks,
    deliveryDestination: locks.deliveryDestination ?? request.blueprint.deliveryDestination,
    permissionCeiling: locks.permissionCeiling ?? approvedPermissionCeiling(request.blueprint),
  };
}

/** Only the names that are both inside the ceiling and resolvable right now. */
function availableCapabilities(
  request: AdjustRoomRequest,
  catalogue: RoomCapabilityCatalogue,
  locks: RoomUserLocks,
): AdjustCapabilityBlock {
  const ceiling = envelopeUnderLocks(approvedEnvelope(request), locks);
  return {
    models: intersect(ceiling.allowedModels, catalogue.models),
    thinkingLevels: ceiling.allowedThinkingLevels,
    tools: intersect(ceiling.allowedTools, catalogue.tools),
    skills: intersect(ceiling.allowedSkills, catalogue.skills),
    // Pinned, so the list holds exactly one entry — the model is not offered a
    // choice it is not allowed to make.
    deliveryDestinations: intersect(ceiling.allowedDeliveryDestinations, [locks.deliveryDestination ?? '']),
  };
}

/**
 * Fields the model must never author. `parseRoomBlueprint` already drops them by
 * building the blueprint field by field, so nothing invented can reach the
 * store. They are REFUSED here as well, and refused first: a reply that writes
 * its own team size or its own report of what changed has misunderstood the
 * split the whole feature rests on, and the repair pass is where that gets said.
 */
const AUTHORED_SUMMARY_KEYS: readonly string[] = [
  'proposal', 'proposalSummary', 'summary', 'access', 'accessSummary', 'warnings',
  'teamSize', 'maxCostUsd', 'maxWallClockMs',
  'changes', 'changed', 'changeReport', 'diff', 'preserved', 'removed',
];

function authoredSummaryKeys(value: unknown): string[] {
  return isRecord(value) ? AUTHORED_SUMMARY_KEYS.filter((key) => key in value) : [];
}

/**
 * Shape, then authority, then meaning. Runs inside the structured call so a
 * genuine validation failure is fed back to the model verbatim on the one
 * repair pass, exactly as the Workflow planner does.
 */
function settleReply(
  value: unknown,
  request: AdjustRoomRequest,
  catalogue: RoomCapabilityCatalogue,
  locks: RoomUserLocks,
): ParseResult<ClampResult> {
  const authored = authoredSummaryKeys(value);
  if (authored.length > 0) {
    return {
      ok: false,
      errors: [
        `remove ${authored.join(', ')}: team size, time, spend, access and the report of what changed are computed `
        + 'from the blueprint, never written by you. Return the blueprint fields only.',
      ],
    };
  }

  // The schema version is Sero's, not the model's: the prompt never asks for one
  // and an adjustment cannot change it. Carrying it across keeps a reply that
  // followed the prompt exactly from spending the single repair pass.
  const parsed = parseRoomBlueprint(
    isRecord(value) ? { ...value, schemaVersion: request.blueprint.schemaVersion } : value,
  );
  if (!parsed.ok) return parsed;

  const clamped = clampBlueprintToLocks(parsed.value, approvedEnvelope(request), locks);
  const validation = validateRoomBlueprint(clamped.blueprint, catalogue);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors.map((error) => `${error.path}: ${error.message}`) };
  }
  return { ok: true, value: clamped };
}

export async function adjustRoom(host: OrchestratorHost, request: AdjustRoomRequest): Promise<AdjustRoomOutcome> {
  if (!request.instruction.trim()) {
    return { ok: false, errors: ['Say what you would like to change about the Room.'], modelResponses: [] };
  }

  const catalogue = resolveCatalogue(request);
  const locks = effectiveLocks(request);
  // Why each reply was turned down. Kept here because a repair attempt that
  // fails at the transport level replaces the reasons with its own error, and
  // "the model call failed" does not tell the user what was wrong with the Room.
  const rejections: string[] = [];
  const result = await runStructuredJson<ClampResult>(host, {
    systemPrompt: ROOM_ADJUST_SYSTEM_PROMPT,
    task: buildAdjustTask({
      blueprint: request.blueprint,
      instruction: request.instruction,
      locks,
      available: availableCapabilities(request, catalogue, locks),
    }),
    parse: (value) => {
      const settled = settleReply(value, request, catalogue, locks);
      if (!settled.ok) rejections.push(...settled.errors);
      return settled;
    },
    buildRepair: (previous, errors) => buildAdjustRepairTask(request.instruction, previous, errors),
    parentSessionId: request.parentSessionId,
    model: request.model,
    thinking: request.thinking,
    signal: request.signal,
    maxRepairs: 1,
  });

  if (!result.ok || !result.value) {
    const errors = [...new Set([...result.errors, ...rejections])];
    host.log(`Room adjustment failed: ${errors.join('; ')}`);
    return { ok: false, errors, modelResponses: result.responses };
  }

  const revised = result.value.blueprint;
  return {
    ok: true,
    blueprint: revised,
    proposal: computeProposalSummary(revised),
    diff: diffBlueprints(request.blueprint, revised),
    clamps: result.value.clamps,
    modelResponses: result.responses,
  };
}
