import {
  MEMBER_PERMISSION_LEVELS,
  type BlueprintMember,
  type MemberPermissionLevel,
} from './room-blueprint-types';
import {
  isSoftLimitField,
  type ConfigurationPatch,
  type MandatePatch,
  type RoomRevisionProposal,
} from './room-revision-types';

export type RoomRevisionProposalParseResult =
  | { proposal: RoomRevisionProposal }
  | { error: string };

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isOptionalStringArray(value: unknown): value is string[] | undefined {
  return value === undefined || isStringArray(value);
}

function isMemberPermissionLevel(value: unknown): value is MemberPermissionLevel {
  return typeof value === 'string' && MEMBER_PERMISSION_LEVELS.some((level) => level === value);
}

function isBlueprintMember(value: unknown): value is BlueprintMember {
  if (!isObject(value)) return false;
  return typeof value.key === 'string'
    && typeof value.displayName === 'string'
    && typeof value.role === 'string'
    && typeof value.responsibility === 'string'
    && typeof value.mandate === 'string'
    && typeof value.isConductor === 'boolean'
    && typeof value.model === 'string'
    && typeof value.thinking === 'string'
    && isStringArray(value.promptAdditions)
    && isStringArray(value.tools)
    && isStringArray(value.skills)
    && isMemberPermissionLevel(value.permissions)
    && typeof value.needsWorktree === 'boolean'
    && typeof value.reasonForInclusion === 'string';
}

function isMandatePatch(value: unknown): value is MandatePatch {
  if (!isObject(value)) return false;
  return isOptionalString(value.responsibilities)
    && isOptionalString(value.currentTask)
    && isOptionalStringArray(value.priorities)
    && isOptionalString(value.workingInstructions);
}

function isConfigurationPatch(value: unknown): value is ConfigurationPatch {
  if (!isObject(value)) return false;
  return isOptionalString(value.model)
    && isOptionalString(value.thinking)
    && isOptionalStringArray(value.tools)
    && isOptionalStringArray(value.skills)
    && (value.permissions === undefined || isMemberPermissionLevel(value.permissions))
    && (value.needsWorktree === undefined || typeof value.needsWorktree === 'boolean');
}

function invalid(kind: string, shape: string): RoomRevisionProposalParseResult {
  return { error: `${kind} proposal must contain ${shape}` };
}

/** Parses the untrusted JSON value before it can reach revision planning or persistence. */
export function parseRoomRevisionProposal(value: unknown): RoomRevisionProposalParseResult {
  if (!isObject(value) || typeof value.kind !== 'string') {
    return { error: 'proposal must be an object with a string "kind"' };
  }

  switch (value.kind) {
    case 'add-member':
      return isBlueprintMember(value.member)
        ? { proposal: { kind: value.kind, member: value.member } }
        : invalid(value.kind, 'a valid member');
    case 'update-mandate':
      return typeof value.memberId === 'string' && isMandatePatch(value.mandate)
        ? { proposal: { kind: value.kind, memberId: value.memberId, mandate: value.mandate } }
        : invalid(value.kind, 'a string memberId and valid mandate');
    case 'assign-work':
      return typeof value.memberId === 'string'
        && typeof value.task === 'string'
        && isOptionalStringArray(value.priorities)
        ? { proposal: { kind: value.kind, memberId: value.memberId, task: value.task, priorities: value.priorities } }
        : invalid(value.kind, 'a string memberId, string task, and optional string priorities');
    case 'change-strategy':
      return typeof value.strategy === 'string'
        ? { proposal: { kind: value.kind, strategy: value.strategy } }
        : invalid(value.kind, 'a string strategy');
    case 'change-configuration':
      return typeof value.memberId === 'string' && isConfigurationPatch(value.configuration)
        ? { proposal: { kind: value.kind, memberId: value.memberId, configuration: value.configuration } }
        : invalid(value.kind, 'a string memberId and valid configuration');
    case 'suspend-member':
    case 'resume-member':
    case 'retire-member':
      return typeof value.memberId === 'string'
        ? { proposal: { kind: value.kind, memberId: value.memberId } }
        : invalid(value.kind, 'a string memberId');
    case 'replace-member':
      return typeof value.memberId === 'string'
        && isBlueprintMember(value.replacement)
        && typeof value.handover === 'string'
        ? { proposal: { kind: value.kind, memberId: value.memberId, replacement: value.replacement, handover: value.handover } }
        : invalid(value.kind, 'a string memberId, valid replacement, and string handover');
    case 'lower-soft-limit':
    case 'request-expansion':
      return typeof value.field === 'string'
        && isSoftLimitField(value.field)
        && typeof value.value === 'number'
        && Number.isFinite(value.value)
        ? { proposal: { kind: value.kind, field: value.field, value: value.value } }
        : invalid(value.kind, 'a numeric soft-limit field and finite numeric value');
    default:
      return { error: `unknown proposal kind "${value.kind}"` };
  }
}
