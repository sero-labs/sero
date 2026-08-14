/**
 * The wire contract for a planner-authored RoomBlueprint: the shape we ask the
 * model for, and the shape we are willing to accept back.
 *
 * Two rules make this file load-bearing (architecture.md §7, D-14):
 *
 * 1. The blueprint is built here FIELD BY FIELD from known names, so anything
 *    the model invents cannot reach the store even if nobody rejected it.
 * 2. A reply that authors the consent summary or the change report is REFUSED
 *    with a precise reason. Team size, time, spend, access and the changed /
 *    preserved / removed report are computed from the validated blueprint —
 *    accepting a model-written one would let prose disagree with authority.
 *
 * Shape only. Whether the team is legal, and whether every capability sits
 * inside the approved envelope, is `validateRoomBlueprint`'s job.
 */

import type {
  BlueprintMember,
  MemberPermissionLevel,
  OperatingEnvelope,
  RoomBlueprint,
  RoomWorkspaceMode,
  RoomWorkspacePolicy,
} from '../../shared/room-blueprint-types';
import type { ParseResult } from '../structured-call';
import { describeValue, isRecord } from '../structured-call';

const PERMISSION_LEVELS: readonly MemberPermissionLevel[] = ['read-only', 'edit-workspace', 'edit-and-push'];
const WORKSPACE_MODES: readonly RoomWorkspaceMode[] = ['read-only-shared', 'worktree-per-member', 'shared-working-tree'];
const CLAIM_POLICIES: readonly RoomWorkspacePolicy['claimPolicy'][] = ['warn', 'block'];

/**
 * Fields the model must never author. Each one is either the computed consent
 * summary or the computed change report; a reply carrying one is refused rather
 * than ignored, so the repair pass teaches the model the boundary.
 */
export const FORBIDDEN_BLUEPRINT_KEYS: readonly string[] = [
  'proposal', 'proposalSummary', 'summary', 'access', 'accessSummary', 'warnings',
  'teamSize', 'maxCostUsd', 'maxWallClockMs',
  'changes', 'changed', 'changeReport', 'diff', 'preserved', 'removed',
];

// ── readers ─────────────────────────────────────────────────
// Each reader records a precise error and returns a placeholder. The caller
// discards the whole blueprint when any error was recorded, so a placeholder is
// never stored — it only keeps the pass going so the model sees every problem.

function readString(record: Record<string, unknown>, key: string, path: string, errors: string[]): string {
  const value = record[key];
  if (typeof value === 'string') return value;
  errors.push(`${path}${key} must be a string (got ${describeValue(value)})`);
  return '';
}

function readNumber(record: Record<string, unknown>, key: string, path: string, errors: string[]): number {
  const value = record[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  errors.push(`${path}${key} must be a finite number (got ${describeValue(value)})`);
  return 0;
}

function readBoolean(record: Record<string, unknown>, key: string, path: string, errors: string[]): boolean {
  const value = record[key];
  if (typeof value === 'boolean') return value;
  errors.push(`${path}${key} must be true or false (got ${describeValue(value)})`);
  return false;
}

function readStringArray(record: Record<string, unknown>, key: string, path: string, errors: string[]): string[] {
  const value = record[key];
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value;
  errors.push(`${path}${key} must be an array of strings (got ${describeValue(value)})`);
  return [];
}

function readEnum<T extends string>(
  record: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  path: string,
  errors: string[],
): T {
  const value = record[key];
  const found = allowed.find((candidate) => candidate === value);
  if (found !== undefined) return found;
  errors.push(`${path}${key} must be one of ${allowed.join(', ')} (got ${describeValue(value)})`);
  return allowed[0];
}

// ── parsers ─────────────────────────────────────────────────

function parseWorkspacePolicy(record: Record<string, unknown>, path: string, errors: string[]): RoomWorkspacePolicy {
  return {
    mode: readEnum(record, 'mode', WORKSPACE_MODES, path, errors),
    sharedTreeApproved: readBoolean(record, 'sharedTreeApproved', path, errors),
    claimPolicy: readEnum(record, 'claimPolicy', CLAIM_POLICIES, path, errors),
  };
}

function parseEnvelope(record: Record<string, unknown>, errors: string[]): OperatingEnvelope {
  const path = 'envelope.';
  const workspacePolicy = record.workspacePolicy;
  return {
    maxMembers: readNumber(record, 'maxMembers', path, errors),
    maxActiveTurns: readNumber(record, 'maxActiveTurns', path, errors),
    maxRosterRevisions: readNumber(record, 'maxRosterRevisions', path, errors),
    maxMemberReplacements: readNumber(record, 'maxMemberReplacements', path, errors),
    maxWallClockMs: readNumber(record, 'maxWallClockMs', path, errors),
    maxCostUsd: readNumber(record, 'maxCostUsd', path, errors),
    maxCostUsdPerMember: readNumber(record, 'maxCostUsdPerMember', path, errors),
    maxTokens: readNumber(record, 'maxTokens', path, errors),
    maxTokensPerMember: readNumber(record, 'maxTokensPerMember', path, errors),
    maxTurnsPerMember: readNumber(record, 'maxTurnsPerMember', path, errors),
    maxRetriesPerMember: readNumber(record, 'maxRetriesPerMember', path, errors),
    maxConsecutiveFailures: readNumber(record, 'maxConsecutiveFailures', path, errors),
    maxIdleMs: readNumber(record, 'maxIdleMs', path, errors),
    allowedModels: readStringArray(record, 'allowedModels', path, errors),
    allowedThinkingLevels: readStringArray(record, 'allowedThinkingLevels', path, errors),
    allowedTools: readStringArray(record, 'allowedTools', path, errors),
    allowedSkills: readStringArray(record, 'allowedSkills', path, errors),
    allowedDeliveryDestinations: readStringArray(record, 'allowedDeliveryDestinations', path, errors),
    allowNestedSubagents: readBoolean(record, 'allowNestedSubagents', path, errors),
    workspacePolicy: isRecord(workspacePolicy)
      ? parseWorkspacePolicy(workspacePolicy, `${path}workspacePolicy.`, errors)
      : missingWorkspacePolicy(`${path}workspacePolicy`, workspacePolicy, errors),
  };
}

function missingWorkspacePolicy(path: string, value: unknown, errors: string[]): RoomWorkspacePolicy {
  errors.push(`${path} must be an object (got ${describeValue(value)})`);
  return { mode: 'read-only-shared', sharedTreeApproved: false, claimPolicy: 'warn' };
}

function parseMember(record: Record<string, unknown>, index: number, errors: string[]): BlueprintMember {
  const path = `members[${index}].`;
  return {
    key: readString(record, 'key', path, errors),
    displayName: readString(record, 'displayName', path, errors),
    role: readString(record, 'role', path, errors),
    responsibility: readString(record, 'responsibility', path, errors),
    mandate: readString(record, 'mandate', path, errors),
    isConductor: readBoolean(record, 'isConductor', path, errors),
    model: readString(record, 'model', path, errors),
    thinking: readString(record, 'thinking', path, errors),
    promptAdditions: readStringArray(record, 'promptAdditions', path, errors),
    tools: readStringArray(record, 'tools', path, errors),
    skills: readStringArray(record, 'skills', path, errors),
    permissions: readEnum(record, 'permissions', PERMISSION_LEVELS, path, errors),
    needsWorktree: readBoolean(record, 'needsWorktree', path, errors),
    reasonForInclusion: readString(record, 'reasonForInclusion', path, errors),
  };
}

export function parseRoomBlueprint(value: unknown): ParseResult<RoomBlueprint> {
  if (!isRecord(value)) {
    return { ok: false, errors: [`the reply must be a single JSON object (got ${describeValue(value)})`] };
  }

  const forbidden = FORBIDDEN_BLUEPRINT_KEYS.filter((key) => key in value);
  if (forbidden.length > 0) {
    return {
      ok: false,
      errors: [
        `remove ${forbidden.join(', ')}: team size, time, spend, access and the report of what changed are computed `
        + 'from the blueprint, never written by you. Return the blueprint fields only.',
      ],
    };
  }

  // The containers come first: without them every field read below would report
  // its own miss, burying the one problem the model has to fix.
  const { members, envelope, workspacePolicy } = value;
  const containerProblems: string[] = [];
  if (!Array.isArray(members)) containerProblems.push(`members must be an array (got ${describeValue(members)})`);
  if (!isRecord(envelope)) containerProblems.push(`envelope must be an object (got ${describeValue(envelope)})`);
  if (!isRecord(workspacePolicy)) containerProblems.push(`workspacePolicy must be an object (got ${describeValue(workspacePolicy)})`);
  if (!Array.isArray(members) || !isRecord(envelope) || !isRecord(workspacePolicy)) {
    return { ok: false, errors: containerProblems };
  }

  const memberRecords = members.filter(isRecord);
  if (memberRecords.length !== members.length) {
    return { ok: false, errors: ['every entry in members must be an object'] };
  }

  const errors: string[] = [];
  const templateSource = value.templateSource;
  if (templateSource !== undefined && typeof templateSource !== 'string') {
    errors.push(`templateSource must be a string when present (got ${describeValue(templateSource)})`);
  }

  const blueprint: RoomBlueprint = {
    schemaVersion: readNumber(value, 'schemaVersion', '', errors),
    title: readString(value, 'title', '', errors),
    approach: readString(value, 'approach', '', errors),
    objective: readString(value, 'objective', '', errors),
    successCriteria: readStringArray(value, 'successCriteria', '', errors),
    roomInstructions: readString(value, 'roomInstructions', '', errors),
    members: memberRecords.map((member, index) => parseMember(member, index, errors)),
    teamRationale: readString(value, 'teamRationale', '', errors),
    collaborationStrategy: readString(value, 'collaborationStrategy', '', errors),
    workspacePolicy: parseWorkspacePolicy(workspacePolicy, 'workspacePolicy.', errors),
    envelope: parseEnvelope(envelope, errors),
    estimatedDurationMs: readNumber(value, 'estimatedDurationMs', '', errors),
    estimatedCostUsd: readNumber(value, 'estimatedCostUsd', '', errors),
    deliveryDestination: readString(value, 'deliveryDestination', '', errors),
    openAssumptions: readStringArray(value, 'openAssumptions', '', errors),
  };
  if (typeof templateSource === 'string') blueprint.templateSource = templateSource;

  return errors.length === 0 ? { ok: true, value: blueprint } : { ok: false, errors };
}
