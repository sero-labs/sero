/**
 * Prompts for natural-language Room adjustment (spec §9.3, D-19).
 *
 * Two things this prompt must get right, both of them safety properties rather
 * than wording:
 *
 * - It asks for a FULL revised blueprint, never a patch. A patch language would
 *   be a second schema to get wrong, and a half-applied patch is a team the user
 *   never approved.
 * - It tells the model that the consent summary and the report of what changed
 *   are computed, so it must not write them. Everything the prompt states as
 *   fixed is imposed again in code afterwards.
 */

import type { RoomUserLocks } from '../../shared/room-locks';
import type { RoomBlueprint } from '../../shared/room-blueprint-types';

/**
 * The shape asked for, written to match `parseRoomBlueprint` exactly: a field
 * described here but not read there is silently dropped, and the reverse is a
 * guaranteed repair pass. Every string field must be non-empty.
 */
export const ROOM_BLUEPRINT_JSON_SHAPE = `{
  "title": string,                       // short Room title (prose)
  "approach": string,                    // ONE sentence describing how the team will work (prose)
  "objective": string,                   // what the Room must achieve
  "successCriteria": string[],           // at least one, each checkable
  "roomInstructions": string,            // rules that apply to every member
  "members": [
    {
      "key": string,                     // stable identity — keep a kept member's key EXACTLY
      "displayName": string,
      "role": string,
      "responsibility": string,          // ONE user-facing line (prose)
      "mandate": string,                 // the member's full working instructions (prose)
      "reasonForInclusion": string,      // why this member exists (prose)
      "isConductor": boolean,            // exactly one member is true
      "model": string,                   // from the AVAILABLE MODELS list
      "thinking": string,                // from the AVAILABLE THINKING LEVELS list
      "promptAdditions": string[],       // appended after the base prompt; [] is normal
      "tools": string[],                 // from the AVAILABLE TOOLS list
      "skills": string[],                // from the AVAILABLE SKILLS list
      "permissions": "read-only" | "edit-workspace" | "edit-and-push",
      "needsWorktree": boolean           // true for a member that edits files
    }
  ],
  "teamRationale": string,               // why this team as a whole (prose)
  "collaborationStrategy": string,       // how members work together
  "workspacePolicy": { "mode": "read-only-shared" | "worktree-per-member" | "shared-working-tree", "sharedTreeApproved": boolean, "claimPolicy": "warn" | "block" },
  "envelope": {
    "maxMembers": number, "maxActiveTurns": number, "maxRosterRevisions": number, "maxMemberReplacements": number,
    "maxWallClockMs": number, "maxCostUsd": number, "maxCostUsdPerMember": number,
    "maxTokens": number, "maxTokensPerMember": number, "maxTurnsPerMember": number,
    "maxRetriesPerMember": number, "maxConsecutiveFailures": number, "maxIdleMs": number,
    "allowedModels": string[], "allowedThinkingLevels": string[], "allowedTools": string[],
    "allowedSkills": string[], "allowedDeliveryDestinations": string[],
    "allowNestedSubagents": boolean,
    "workspacePolicy": { "mode": …, "sharedTreeApproved": boolean, "claimPolicy": … }
  },
  "estimatedDurationMs": number,
  "estimatedCostUsd": number,
  "deliveryDestination": string,         // keep the current value
  "templateSource": string?,             // keep the current value; omit when there is none
  "openAssumptions": string[]            // anything you had to assume; [] when none
}`;

export const ROOM_ADJUST_SYSTEM_PROMPT = `You are the ROOM PLANNER for Sero. A user has an approved team blueprint and has asked for one change to it. Your only job is to return the SAME blueprint with that change applied.

Return ONLY a single JSON object — the complete revised blueprint, no prose before or after. Never return a patch, a diff, a list of edits, or only the parts you changed: return every field.

CHANGE THE LEAST YOU CAN. Everything the instruction did not ask about stays EXACTLY as it is — same members, same keys, same models, same tools, same skills, same permissions, same limits, same wording. Do not tidy, re-balance or improve anything you were not asked about. The user approved the rest already.

MEMBER KEYS ARE IDENTITY. A member you keep keeps its exact "key". A member you add gets a new key that no other member uses. Removing a member means dropping its object. Reusing one member's key for a different member reports the wrong change to the user.

WHAT YOU WRITE, AND WHAT YOU MUST NOT. You write prose: the title, the one-sentence approach, each member's responsibility line, mandate and reason for inclusion, the team rationale, the collaboration strategy and the Room instructions. You must NOT write the user-facing summary of the team: its size, its maximum time, its maximum spend, what it can access, its warnings, or any report of what you changed. All of those are computed from the blueprint itself and shown to the user by the application. A reply containing "proposal", "summary", "access", "warnings", "teamSize", "changes", "changed", "diff", "preserved" or "removed" is refused.

STAY INSIDE THE APPROVED LIMITS. You may LOWER a limit when the instruction asks for it. You can never raise one, widen the capability pool, add reach the user did not approve, or approve working in the user's files directly. Anything raised is put back before the user sees it, so raising it only wastes the change.

Exactly one member has "isConductor": true. Choose models, thinking levels, tools, skills and the delivery destination only from the lists you are given — a name that is not on a list does not exist.`;

/** Renders one lock line, or nothing when the user left that choice open. */
function lockLines(locks: RoomUserLocks): string[] {
  const lines: string[] = [];
  if (locks.maxCostUsd !== undefined) lines.push(`- Maximum spend: $${locks.maxCostUsd}. Do not change it.`);
  if (locks.maxWallClockMs !== undefined) {
    lines.push(`- Maximum working time: ${Math.round(locks.maxWallClockMs / 60_000)} minutes. Do not change it.`);
  }
  if (locks.maxMembers !== undefined) lines.push(`- Maximum team size: ${locks.maxMembers}, Conductor included. Do not exceed it.`);
  if (locks.workspaceMode !== undefined) lines.push(`- Workspace: ${locks.workspaceMode}. Do not change it.`);
  if (locks.permissionCeiling !== undefined) lines.push(`- No member may hold more than ${locks.permissionCeiling} permission.`);
  if (locks.deliveryDestination !== undefined) lines.push(`- Delivery destination: ${locks.deliveryDestination}. Do not change it.`);
  if (locks.allowedTools !== undefined) lines.push(`- Tools may only come from: ${locks.allowedTools.join(', ') || '(none)'}.`);
  if (locks.allowedSkills !== undefined) lines.push(`- Skills may only come from: ${locks.allowedSkills.join(', ') || '(none)'}.`);
  return lines;
}

export function buildLocksBlock(locks: RoomUserLocks): string {
  const lines = lockLines(locks);
  if (lines.length === 0) return '';
  return `THESE ARE FIXED — each one is either set by the user or already approved by them. They are checked again after you reply, and a change to one is put back:
${lines.join('\n')}

`;
}

/** What actually exists for this Room: the approved envelope, already narrowed to the workspace catalogue. */
export interface AdjustCapabilityBlock {
  models: string[];
  thinkingLevels: string[];
  tools: string[];
  skills: string[];
  deliveryDestinations: string[];
}

export function buildCapabilityBlock(available: AdjustCapabilityBlock): string {
  const list = (names: string[]): string => (names.length > 0 ? names.join(', ') : '(none available)');
  return `AVAILABLE MODELS: ${list(available.models)}
AVAILABLE THINKING LEVELS: ${list(available.thinkingLevels)}
AVAILABLE TOOLS: ${list(available.tools)}
AVAILABLE SKILLS: ${list(available.skills)}
AVAILABLE DELIVERY DESTINATIONS: ${list(available.deliveryDestinations)}

`;
}

export interface AdjustTaskArgs {
  blueprint: RoomBlueprint;
  instruction: string;
  locks: RoomUserLocks;
  available: AdjustCapabilityBlock;
}

export function buildAdjustTask(args: AdjustTaskArgs): string {
  return `The user approved this Room blueprint:

${JSON.stringify(args.blueprint, null, 2)}

They now ask for this change:
${args.instruction}

${buildLocksBlock(args.locks)}${buildCapabilityBlock(args.available)}Return the complete revised blueprint as one JSON object in exactly this shape:

${ROOM_BLUEPRINT_JSON_SHAPE}

Apply the change and nothing else. Output ONLY the JSON object.`;
}

export function buildAdjustRepairTask(instruction: string, previous: string, errors: string[]): string {
  return `Your revised blueprint was refused.

The change the user asked for:
${instruction}

Your previous response:
${previous}

Problems:
${errors.map((error) => `- ${error}`).join('\n')}

Return a corrected blueprint that fixes every problem, still applying the user's change and still leaving everything else exactly as it was. Output ONLY the JSON object.`;
}
