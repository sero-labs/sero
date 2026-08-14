/**
 * What a proposed Room revision MEANS — decided before anything is written
 * (spec §13.1, §13.2).
 *
 * Pure: no store, no host, no clock. The engine calls this twice — once to
 * answer the caller quickly, and again inside the store's serialized write, so
 * two revisions racing past a limit is impossible without duplicating a single
 * rule.
 *
 * Three verdicts, and the difference between them is authority:
 *
 *  - **apply** — inside the operating envelope and inside the authority the
 *    Room already holds. The coordinator applies it and records it.
 *  - **approval** — it widens what the user approved, so the user decides. The
 *    consequence line is COMPUTED here from the same access mapping the
 *    proposal tiles use; a requesting member never writes one (§22).
 *  - **refuse** — it can never be honoured as asked, so nothing is recorded and
 *    the caller is told why in plain English.
 *
 * The refusals that surprise people are the GRANT-BOUND ones. A Room's host
 * grant (AD-029) fixes its subject set and each subject's model, thinking
 * level, tool list, skill list, permission profile and working directory when
 * the Room starts. The capability has no amend operation, and a second grant
 * gets its own session directory — so re-granting a running Room would orphan
 * every member's transcript. Until the capability can amend a live grant, a
 * revision that needs a subject the grant does not have, or a policy it did not
 * approve, is refused rather than half-applied. Removing a tool or a skill IS
 * servable, because the session request only has to stay INSIDE the granted
 * set.
 */

import {
  ROOM_ACCESS_LABEL_TEXT,
  computeAccessSummary,
} from '../../shared/room-access-map';
import type {
  BlueprintMember,
  MemberPermissionLevel,
  OperatingEnvelope,
  RoomBlueprint,
} from '../../shared/room-blueprint-types';
import { NUMERIC_ENVELOPE_FIELDS } from '../../shared/room-clamp';
import type { RoomApprovalRequest, RoomRevisionKind } from '../../shared/room-message-types';
import type { Room, RoomMember } from '../../shared/room-types';
import { checkRosterGrowth } from './room-limits';

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

/** What the user would be asked. Every field is computed from Room records. */
export interface PlannedApproval {
  title: string;
  consequence: string;
  affects: string;
  kind: RoomApprovalRequest['kind'];
  permissionsAfter: MemberPermissionLevel | null;
  estimatedCostUsd: number | null;
}

export type RevisionPlan =
  | { verdict: 'apply'; summary: string }
  | { verdict: 'approval'; summary: string; approval: PlannedApproval }
  | { verdict: 'refuse'; reason: string };

const apply = (summary: string): RevisionPlan => ({ verdict: 'apply', summary });
const refuse = (reason: string): RevisionPlan => ({ verdict: 'refuse', reason });

/**
 * Why a running Room cannot change who is on it or what they hold. Worded for
 * the Conductor, which is the only caller that reaches it.
 */
const GRANT_FIXED =
  'The Room\'s team and each member\'s tools were approved when it started, and that approval cannot be widened while it runs.';

/** The member as the blueprint sees it, so one access mapping serves both. */
export function toBlueprintMember(member: RoomMember): BlueprintMember {
  return {
    key: member.id,
    displayName: member.displayName,
    role: member.mandate.role,
    responsibility: member.responsibility,
    mandate: member.mandate.workingInstructions,
    isConductor: member.isConductor,
    model: member.configuration.model,
    thinking: member.configuration.thinking,
    promptAdditions: [...member.configuration.promptAdditions],
    tools: [...member.configuration.tools],
    skills: [...member.configuration.skills],
    permissions: member.configuration.permissions,
    needsWorktree: member.configuration.needsWorktree,
    reasonForInclusion: member.responsibility,
  };
}

/**
 * The access line for ONE member, from the fixed mapping (§7.1). A single-member
 * projection is used deliberately: the team's union tiles hide the case where a
 * member gains what a colleague already holds, which is exactly the change a
 * consequence line has to name (D-16).
 */
function accessLine(blueprint: RoomBlueprint, member: BlueprintMember): string {
  const summary = computeAccessSummary({ ...blueprint, members: [member] });
  const phrases = summary.entries.map((entry) => ROOM_ACCESS_LABEL_TEXT[entry.label]);
  return phrases.length > 0 ? phrases.join(', ') : 'do nothing outside the Room';
}

/**
 * How a proposed member sits against the envelope. Capability lists can be
 * WIDENED by the user, so they are reported apart from the workspace mode,
 * which cannot: raising it would change every other member's reach as well, and
 * that is a decision about the whole Room rather than about one member.
 */
interface EnvelopeFit {
  widenable: string[];
  blocked: string[];
}

function envelopeFit(member: BlueprintMember, envelope: OperatingEnvelope): EnvelopeFit {
  const widenable: string[] = [];
  const blocked: string[] = [];
  if (!envelope.allowedModels.includes(member.model)) widenable.push(`the model ${member.model}`);
  if (!envelope.allowedThinkingLevels.includes(member.thinking)) {
    widenable.push(`the thinking level ${member.thinking}`);
  }
  const tools = member.tools.filter((tool) => !envelope.allowedTools.includes(tool));
  if (tools.length > 0) widenable.push(`the tools ${tools.join(', ')}`);
  const skills = member.skills.filter((skill) => !envelope.allowedSkills.includes(skill));
  if (skills.length > 0) widenable.push(`the skills ${skills.join(', ')}`);
  if (envelope.workspacePolicy.mode === 'read-only-shared' && member.permissions !== 'read-only') {
    blocked.push('this Room reads only, so a member cannot be given permission to write');
  }
  return { widenable, blocked };
}

/**
 * The smallest envelope that admits this member. Only the capability lists
 * move; every numeric limit and the workspace policy stay exactly as approved.
 */
export function widenEnvelopeForMember(
  envelope: OperatingEnvelope,
  member: BlueprintMember,
): OperatingEnvelope {
  const union = (approved: string[], added: string[]): string[] => [...new Set([...approved, ...added])];
  return {
    ...envelope,
    allowedModels: union(envelope.allowedModels, [member.model]),
    allowedThinkingLevels: union(envelope.allowedThinkingLevels, [member.thinking]),
    allowedTools: union(envelope.allowedTools, member.tools),
    allowedSkills: union(envelope.allowedSkills, member.skills),
  };
}

function findMember(room: Room, memberId: string): RoomMember | undefined {
  return room.members.find((member) => member.id === memberId);
}

/** A member mid-turn is not at a safe boundary — see §13.2 step 5. */
function holdsSlot(member: RoomMember): boolean {
  return member.status === 'working' || member.status === 'starting';
}

/**
 * Joining and replacing share every rule except who leaves, so they share one
 * check. The order matters: a Room that cannot take the member at all is told
 * so before the user is asked anything.
 */
function planRosterAddition(
  room: Room,
  member: BlueprintMember,
  growthKind: 'add' | 'replace',
  applied: string,
  approvalTitle: string,
): RevisionPlan {
  if (findMember(room, member.key)) return refuse(`${member.key} is already a member of this Room.`);
  if (member.isConductor) return refuse('A Room has one Conductor, and a joining member cannot be it.');
  const growth = checkRosterGrowth(room, growthKind);
  if (!growth.ok) return refuse(growth.reason ?? 'The Room cannot change its team again.');

  // A running Room holds a host grant whose subject set was fixed when it
  // started, so a new session for a new member cannot be authorised.
  if (room.definition.grantId) {
    return refuse(`${GRANT_FIXED} ${member.displayName} cannot join a Room that is already running.`);
  }

  const fit = envelopeFit(member, room.definition.envelope);
  if (fit.blocked.length > 0) return refuse(`${member.displayName} cannot join: ${fit.blocked.join('; ')}.`);
  if (fit.widenable.length === 0) return apply(applied);

  // Outside the envelope is the user's decision, not the Conductor's: the
  // envelope is the ceiling the user approved (§12.3).
  return {
    verdict: 'approval',
    summary: `${approvalTitle} This needs ${fit.widenable.join(', ')}, which is outside what you approved.`,
    approval: {
      title: approvalTitle,
      consequence: memberConsequence(room.definition.blueprint, member),
      affects: `Room ${room.definition.title}`,
      kind: 'authority-expansion',
      permissionsAfter: member.permissions,
      estimatedCostUsd: null,
    },
  };
}

function planUpdateMandate(room: Room, memberId: string, patch: MandatePatch): RevisionPlan {
  const member = findMember(room, memberId);
  if (!member) return refuse(`There is no member ${memberId} in this Room.`);
  if (member.status === 'retired') return refuse(`${member.displayName} has retired, so its mandate cannot change.`);
  const changed = Object.values(patch).some((value) => value !== undefined);
  if (!changed) return refuse('A mandate update needs at least one instruction to change.');
  return apply(`${member.displayName}'s mandate updated.`);
}

function planAssignWork(room: Room, memberId: string, task: string): RevisionPlan {
  const member = findMember(room, memberId);
  if (!member) return refuse(`There is no member ${memberId} in this Room.`);
  if (member.status === 'retired' || member.status === 'suspended') {
    return refuse(`${member.displayName} is ${member.status}, so it cannot take new work.`);
  }
  if (!task.trim()) return refuse('An assignment needs a task.');
  return apply(`${member.displayName} was assigned: ${task.trim()}`);
}

/**
 * Only removals apply. Everything else is pinned in the grant's per-subject
 * policy, so changing the record alone would leave the running session with the
 * old authority — a change the Conductor believes happened and did not.
 */
function planChangeConfiguration(room: Room, memberId: string, patch: ConfigurationPatch): RevisionPlan {
  const member = findMember(room, memberId);
  if (!member) return refuse(`There is no member ${memberId} in this Room.`);
  if (member.status === 'retired') return refuse(`${member.displayName} has retired, so its setup cannot change.`);

  const current = member.configuration;
  const widened: string[] = [];
  if (patch.model !== undefined && patch.model !== current.model) widened.push('its model');
  if (patch.thinking !== undefined && patch.thinking !== current.thinking) widened.push('its thinking level');
  if (patch.permissions !== undefined && patch.permissions !== current.permissions) widened.push('its permissions');
  if (patch.needsWorktree !== undefined && patch.needsWorktree !== current.needsWorktree) widened.push('where it works');
  const addedTools = (patch.tools ?? []).filter((tool) => !current.tools.includes(tool));
  const addedSkills = (patch.skills ?? []).filter((skill) => !current.skills.includes(skill));
  if (addedTools.length > 0) widened.push(`the tools ${addedTools.join(', ')}`);
  if (addedSkills.length > 0) widened.push(`the skills ${addedSkills.join(', ')}`);
  if (widened.length > 0) {
    return refuse(`${GRANT_FIXED} ${member.displayName} cannot be given ${widened.join(', ')} while the Room runs.`);
  }

  const removedTools = current.tools.filter((tool) => !(patch.tools ?? current.tools).includes(tool));
  const removedSkills = current.skills.filter((skill) => !(patch.skills ?? current.skills).includes(skill));
  if (removedTools.length === 0 && removedSkills.length === 0) {
    return refuse(`${member.displayName}'s setup is already what you asked for.`);
  }
  // Narrowing takes effect when the session is next opened, so a member holding
  // a slot would keep the wider set for the rest of its turn.
  if (holdsSlot(member)) {
    return refuse(`${member.displayName} is mid-turn. Ask again when its turn ends.`);
  }
  const removed = [...removedTools, ...removedSkills].join(', ');
  return apply(`${member.displayName} no longer uses ${removed}.`);
}

function planSuspend(room: Room, memberId: string): RevisionPlan {
  const member = findMember(room, memberId);
  if (!member) return refuse(`There is no member ${memberId} in this Room.`);
  if (member.isConductor) return refuse('The Conductor cannot be suspended — the Room would have nobody coordinating it.');
  if (member.status === 'suspended') return refuse(`${member.displayName} is already suspended.`);
  if (member.status === 'retired') return refuse(`${member.displayName} has retired.`);
  return apply(`${member.displayName} was suspended.`);
}

function planResume(room: Room, memberId: string): RevisionPlan {
  const member = findMember(room, memberId);
  if (!member) return refuse(`There is no member ${memberId} in this Room.`);
  if (member.status !== 'suspended') return refuse(`${member.displayName} is not suspended.`);
  return apply(`${member.displayName} is working again.`);
}

function planRetire(room: Room, memberId: string, actorMemberId: string): RevisionPlan {
  const member = findMember(room, memberId);
  if (!member) return refuse(`There is no member ${memberId} in this Room.`);
  if (member.status === 'retired') return refuse(`${member.displayName} has already retired.`);
  // Retiring the Conductor is how a Room would lose its only coordinator, so it
  // is the user's call even when the Conductor asks for it itself (§13.4).
  if (member.isConductor) {
    return {
      verdict: 'approval',
      summary: `Retire the Conductor ${member.displayName}.`,
      approval: {
        title: `Retire the Conductor ${member.displayName}?`,
        consequence: 'The Room would have nobody coordinating it, so it stops until you choose what happens next.',
        affects: `Room ${room.definition.title}`,
        kind: 'authority-expansion',
        permissionsAfter: null,
        estimatedCostUsd: null,
      },
    };
  }
  if (member.id === actorMemberId) return refuse('A member cannot retire itself.');
  return apply(`${member.displayName} retired.`);
}

/**
 * A fundamental identity change (§13.3): the old member retires with its
 * session and history intact, and a REPLACEMENT member starts a new session
 * with a handover summary.
 */
function planReplace(
  room: Room,
  memberId: string,
  replacement: BlueprintMember,
  actorMemberId: string,
): RevisionPlan {
  const member = findMember(room, memberId);
  if (!member) return refuse(`There is no member ${memberId} in this Room.`);
  if (member.status === 'retired') return refuse(`${member.displayName} has already retired.`);
  // The Conductor replacing itself is the one roster change no Conductor may
  // make on its own authority (§13.4).
  if (member.isConductor && actorMemberId === member.id) {
    return refuse('The Conductor cannot replace itself. Ask the user to do it.');
  }
  return planRosterAddition(
    room,
    replacement,
    'replace',
    `${replacement.displayName} replaced ${member.displayName}.`,
    `Replace ${member.displayName} with ${replacement.displayName}?`,
  );
}

function planLowerLimit(room: Room, field: SoftLimitField, value: number): RevisionPlan {
  const current = room.definition.envelope[field];
  if (!Number.isFinite(value) || value <= 0) return refuse(`${field} must be a positive number.`);
  if (value >= current) {
    return refuse(`${field} is already ${current}. Only the user can raise it — ask for an expansion instead.`);
  }
  return apply(`${field} lowered from ${current} to ${value}.`);
}

/**
 * The one revision that exists to ask. It never applies on its own: the
 * envelope is the user's approved ceiling, and a Room raising its own ceiling
 * would make the ceiling meaningless (§12.3).
 */
function planExpansion(room: Room, field: SoftLimitField, value: number): RevisionPlan {
  const current = room.definition.envelope[field];
  if (!Number.isFinite(value) || value <= 0) return refuse(`${field} must be a positive number.`);
  if (value <= current) return refuse(`${field} is already ${current}, so no expansion is needed.`);
  return {
    verdict: 'approval',
    summary: `Raise ${field} from ${current} to ${value}.`,
    approval: {
      title: `Raise ${field} to ${value}?`,
      consequence: `The Room may use up to ${value} instead of ${current}. Nothing else changes.`,
      affects: `Room ${room.definition.title}`,
      kind: 'limit-change',
      permissionsAfter: null,
      // The user reads a spending decision as money, so a cost field is filled
      // only when the limit IS money.
      estimatedCostUsd: field === 'maxCostUsd' || field === 'maxCostUsdPerMember' ? value : null,
    },
  };
}

/**
 * The verdict for one proposal. `actorMemberId` is the caller as the ROSTER
 * knows it — the command layer resolves it, and nothing here reads a name out
 * of the proposal itself.
 */
export function planRoomRevision(
  room: Room,
  proposal: RoomRevisionProposal,
  actorMemberId: string,
): RevisionPlan {
  switch (proposal.kind) {
    case 'add-member':
      return planRosterAddition(
        room,
        proposal.member,
        'add',
        `${proposal.member.displayName} joined the Room as ${proposal.member.role}.`,
        `Add ${proposal.member.displayName} to the Room?`,
      );
    case 'update-mandate':
      return planUpdateMandate(room, proposal.memberId, proposal.mandate);
    case 'assign-work':
      return planAssignWork(room, proposal.memberId, proposal.task);
    case 'change-strategy':
      return proposal.strategy.trim()
        ? apply(`The Room now works like this: ${proposal.strategy.trim()}`)
        : refuse('A strategy change needs a strategy.');
    case 'change-configuration':
      return planChangeConfiguration(room, proposal.memberId, proposal.configuration);
    case 'suspend-member':
      return planSuspend(room, proposal.memberId);
    case 'resume-member':
      return planResume(room, proposal.memberId);
    case 'retire-member':
      return planRetire(room, proposal.memberId, actorMemberId);
    case 'replace-member':
      return proposal.handover.trim()
        ? planReplace(room, proposal.memberId, proposal.replacement, actorMemberId)
        : refuse('A replacement needs a handover summary for the member taking over.');
    case 'lower-soft-limit':
      return planLowerLimit(room, proposal.field, proposal.value);
    case 'request-expansion':
      return planExpansion(room, proposal.field, proposal.value);
  }
}

/** Which revisions count against the Room's roster-revision budget (§12.2). */
export function isRosterRevision(kind: RoomRevisionKind): boolean {
  return kind === 'add-member' || kind === 'retire-member' || kind === 'replace-member';
}

/**
 * The consequence line for a member joining or changing, computed from the
 * access mapping. Exported for the add and replace paths, which need it even
 * when the plan refuses, so the approval a future grant amendment creates reads
 * the same as the tiles.
 */
export function memberConsequence(blueprint: RoomBlueprint, member: BlueprintMember): string {
  return `${member.displayName} would be able to ${accessLine(blueprint, member)}.`;
}
