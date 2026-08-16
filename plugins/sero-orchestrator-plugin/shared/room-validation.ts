/**
 * Room blueprint validation, and the entry point for every computed Room
 * projection (architecture.md §7, spec §10, §12).
 *
 * Everything here is pure: no I/O, no host calls, no clock. That is deliberate —
 * the same functions run in the runtime before a grant is requested and in the
 * renderer while the user adjusts the proposal, and both must reach the same
 * answer.
 *
 * SHAPE is not re-checked. The planner's JSON passes the structured-call schema
 * before it becomes a `RoomBlueprint`, so this file validates MEANING: is the
 * team legal, and is every capability inside the envelope the user approved.
 */

import type { RoomBlueprint } from './room-blueprint-types';
import { accessLabelForCapability } from './room-access-map';

export {
  ROOM_ACCESS_RULES,
  ROOM_PROTOCOL_CAPABILITIES,
  accessLabelForCapability,
  computeAccessSummary,
} from './room-access-map';
export type { AccessFact, AccessGroup, AccessRule, AccessSummary } from './room-access-map';
export { computeProposalSummary } from './room-proposal';
export { diffBlueprints } from './room-diff';
export { clampBlueprintToEnvelope } from './room-clamp';
export type { BlueprintClamp, BlueprintClampKind, ClampResult } from './room-clamp';
export { ROOM_COMMANDS, validateRoomCommand } from './room-commands';
export type {
  RoomCommandActor,
  RoomCommandDenyCode,
  RoomCommandId,
  RoomCommandRequest,
  RoomCommandSpec,
  RoomCommandValidation,
} from './room-commands';

/** What the workspace can actually resolve right now. Names absent from it do not exist. */
export interface RoomCapabilityCatalogue {
  models: string[];
  tools: string[];
  skills: string[];
}

export type RoomBlueprintErrorCode =
  | 'title-empty'
  | 'objective-empty'
  | 'approach-empty'
  | 'success-criteria-empty'
  | 'no-members'
  | 'too-many-members'
  | 'conductor-count'
  | 'member-key-empty'
  | 'duplicate-member-key'
  | 'member-responsibility-empty'
  | 'member-mandate-empty'
  | 'model-unknown'
  | 'model-not-allowed'
  | 'thinking-not-allowed'
  | 'tool-unknown'
  | 'tool-not-allowed'
  | 'read-only-command'
  | 'skill-unknown'
  | 'skill-not-allowed'
  | 'delivery-not-allowed'
  | 'shared-tree-not-approved';

export interface RoomBlueprintError {
  code: RoomBlueprintErrorCode;
  /** Where the problem is, e.g. `members[2].tools`. */
  path: string;
  message: string;
}

export type RoomBlueprintValidation =
  | { ok: true }
  | { ok: false; errors: RoomBlueprintError[] };

/**
 * Every problem in one pass, so the planner's single repair attempt sees the
 * whole list rather than fixing one error and failing on the next.
 */
export function validateRoomBlueprint(
  blueprint: RoomBlueprint,
  catalogue: RoomCapabilityCatalogue,
): RoomBlueprintValidation {
  const errors: RoomBlueprintError[] = [];
  const { envelope, members } = blueprint;

  if (!blueprint.title.trim()) errors.push({ code: 'title-empty', path: 'title', message: 'The Room needs a title.' });
  if (!blueprint.objective.trim()) errors.push({ code: 'objective-empty', path: 'objective', message: 'The Room needs an objective.' });
  if (!blueprint.approach.trim()) errors.push({ code: 'approach-empty', path: 'approach', message: 'The Room needs an approach.' });
  if (!blueprint.successCriteria.some((criterion) => criterion.trim())) {
    errors.push({ code: 'success-criteria-empty', path: 'successCriteria', message: 'The Room needs at least one success criterion.' });
  }

  if (members.length === 0) {
    errors.push({ code: 'no-members', path: 'members', message: 'The Room needs at least one member.' });
  } else if (members.length > envelope.maxMembers) {
    errors.push({
      code: 'too-many-members',
      path: 'members',
      message: `${members.length} members exceeds the approved cap of ${envelope.maxMembers}.`,
    });
  }

  const conductorCount = members.filter((member) => member.isConductor).length;
  if (conductorCount !== 1) {
    errors.push({
      code: 'conductor-count',
      path: 'members',
      message: `A Room needs exactly one Conductor, found ${conductorCount}.`,
    });
  }

  const seenKeys = new Set<string>();
  members.forEach((member, index) => {
    const path = `members[${index}]`;
    if (!member.key.trim()) {
      errors.push({ code: 'member-key-empty', path: `${path}.key`, message: 'A member needs a key.' });
    } else if (seenKeys.has(member.key)) {
      errors.push({ code: 'duplicate-member-key', path: `${path}.key`, message: `Member key ${member.key} is used twice.` });
    }
    seenKeys.add(member.key);

    if (!member.responsibility.trim()) {
      errors.push({ code: 'member-responsibility-empty', path: `${path}.responsibility`, message: `${member.displayName} needs a responsibility line.` });
    }
    if (!member.mandate.trim()) {
      errors.push({ code: 'member-mandate-empty', path: `${path}.mandate`, message: `${member.displayName} needs a mandate.` });
    }

    if (!catalogue.models.includes(member.model)) {
      errors.push({ code: 'model-unknown', path: `${path}.model`, message: `Model ${member.model} is not available.` });
    }
    if (!envelope.allowedModels.includes(member.model)) {
      errors.push({ code: 'model-not-allowed', path: `${path}.model`, message: `Model ${member.model} is outside the approved envelope.` });
    }
    if (!envelope.allowedThinkingLevels.includes(member.thinking)) {
      errors.push({ code: 'thinking-not-allowed', path: `${path}.thinking`, message: `Thinking level ${member.thinking} is outside the approved envelope.` });
    }

    for (const tool of member.tools) {
      if (!catalogue.tools.includes(tool)) {
        errors.push({ code: 'tool-unknown', path: `${path}.tools`, message: `Tool ${tool} does not exist.` });
      }
      if (!envelope.allowedTools.includes(tool)) {
        errors.push({ code: 'tool-not-allowed', path: `${path}.tools`, message: `Tool ${tool} is outside the approved envelope.` });
      }
      if (member.permissions === 'read-only' && accessLabelForCapability(tool) === 'run-commands') {
        errors.push({
          code: 'read-only-command',
          path: `${path}.tools`,
          message: `${member.displayName} is read-only, so it cannot use the command tool ${tool}.`,
        });
      }
    }
    for (const skill of member.skills) {
      if (!catalogue.skills.includes(skill)) {
        errors.push({ code: 'skill-unknown', path: `${path}.skills`, message: `Skill ${skill} does not exist.` });
      }
      if (!envelope.allowedSkills.includes(skill)) {
        errors.push({ code: 'skill-not-allowed', path: `${path}.skills`, message: `Skill ${skill} is outside the approved envelope.` });
      }
    }
  });

  if (!envelope.allowedDeliveryDestinations.includes(blueprint.deliveryDestination)) {
    errors.push({
      code: 'delivery-not-allowed',
      path: 'deliveryDestination',
      message: `Delivery to ${blueprint.deliveryDestination} is outside the approved envelope.`,
    });
  }

  // The shared working tree is the one mode that edits the user's own files, so
  // it needs an explicit approval. The blueprint cannot carry its own approval
  // flag either — that would let the planner approve on the user's behalf.
  if (blueprint.workspacePolicy.mode === 'shared-working-tree' && !envelope.workspacePolicy.sharedTreeApproved) {
    errors.push({
      code: 'shared-tree-not-approved',
      path: 'workspacePolicy.mode',
      message: 'Working in your files directly needs your approval first.',
    });
  }
  if (blueprint.workspacePolicy.sharedTreeApproved && !envelope.workspacePolicy.sharedTreeApproved) {
    errors.push({
      code: 'shared-tree-not-approved',
      path: 'workspacePolicy.sharedTreeApproved',
      message: 'The blueprint claims a shared-tree approval the user never gave.',
    });
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
