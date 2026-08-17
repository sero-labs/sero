/**
 * What a Room revision PROPOSES, as a value (spec §13).
 *
 * These types sit in `shared/` rather than beside the planner because the
 * proposal is PERSISTED with the revision it produced (`RoomRevision.proposal`).
 * A revision held for the user has to be re-planned and applied when they
 * answer, and a change that only ever existed as a function argument cannot be.
 */

import type { BlueprintMember, MemberPermissionLevel } from './room-blueprint-types';
import { NUMERIC_ENVELOPE_FIELDS } from './room-clamp';

/** Numeric envelope fields a revision may lower, or ask the user to raise. */
export type SoftLimitField = (typeof NUMERIC_ENVELOPE_FIELDS)[number];

export function isSoftLimitField(value: string): value is SoftLimitField {
  return (NUMERIC_ENVELOPE_FIELDS as readonly string[]).includes(value);
}

/** Instruction-only changes. None of these can add a capability (FR-041). */
export interface MandatePatch {
  responsibilities?: string;
  currentTask?: string;
  priorities?: string[];
  workingInstructions?: string;
}

/** Capability changes. Every field here crosses the host authority boundary. */
export interface ConfigurationPatch {
  model?: string;
  thinking?: string;
  tools?: string[];
  skills?: string[];
  permissions?: MemberPermissionLevel;
  needsWorktree?: boolean;
}

export type RoomRevisionProposal =
  | { kind: 'add-member'; member: BlueprintMember }
  | { kind: 'update-mandate'; memberId: string; mandate: MandatePatch }
  | { kind: 'assign-work'; memberId: string; task: string; priorities?: string[] }
  | { kind: 'change-strategy'; strategy: string }
  | { kind: 'change-configuration'; memberId: string; configuration: ConfigurationPatch }
  | { kind: 'suspend-member'; memberId: string }
  | { kind: 'resume-member'; memberId: string }
  | { kind: 'retire-member'; memberId: string }
  | { kind: 'replace-member'; memberId: string; replacement: BlueprintMember; handover: string }
  | { kind: 'lower-soft-limit'; field: SoftLimitField; value: number }
  | { kind: 'request-expansion'; field: SoftLimitField; value: number };
