/**
 * Adaptive Room templates (spec §11, D-18).
 *
 * A template is a PLANNING SEED, never a fixed roster. It tells the Room Planner
 * how to think about a class of problem — the shape of the team, how the members
 * work together, what the result looks like — and the planner then sizes and
 * staffs the team for the problem actually in front of it. Nothing here fixes
 * the final roster, and nothing here grants authority: the user's envelope is
 * still the only thing that decides what a member may do.
 *
 * Users can save their own templates, so a template is untrusted input. It
 * carries no secret, no session id and no runtime state — `validateRoomTemplate`
 * rejects one that does, and `roomToTemplate` builds from a fixed field list so
 * run-specific data cannot leak in by construction.
 */

import { isDeliveryDestinationId } from './delivery-types';
import type {
  MemberPermissionLevel,
  RoomBlueprint,
  RoomWorkspaceMode,
} from './room-blueprint-types';
import { MEMBER_PERMISSION_LEVELS } from './room-blueprint-types';
import { ROOM_PROTOCOL_CAPABILITIES } from './room-access-map';

/**
 * An illustrative role. The planner may drop it, merge it, rename it or create
 * several of it — a seed that repeats one role per work item is exactly why
 * `exampleRoles` cannot be the roster.
 */
export interface RoomTemplateRole {
  role: string;
  responsibility: string;
  /** Does this kind of member change files? Decides worktree need and permissions. */
  editsWorkspace: boolean;
  isConductor: boolean;
}

/**
 * What the seed leans towards. Every one of these is a preference the user's
 * approved envelope overrides — a template can never widen reach.
 */
export interface RoomTemplateConstraints {
  permissionCeiling: MemberPermissionLevel;
  preferredTools: string[];
  preferredSkills: string[];
  /** Delivery destination id. A user delivery choice wins over it. */
  deliveryDestination: string;
  /** Give every editing member its own worktree. */
  worktreePerEditingMember: boolean;
}

/**
 * Deliberately NOT `RoomWorkspacePolicy`: that type carries `sharedTreeApproved`,
 * and a stored template must never be able to carry an approval the user gives
 * per run. The shared working tree is reachable only through a live approval.
 */
export interface RoomTemplateWorkspaceDefaults {
  mode: RoomWorkspaceMode;
  claimPolicy: 'warn' | 'block';
}

/** Starting points for the envelope. The user's own limits always win. */
export interface RoomTemplateLimits {
  suggestedMaxMembers: number;
  suggestedMaxActiveTurns: number;
  suggestedMaxWallClockMs: number;
  suggestedMaxCostUsd: number;
}

export interface RoomTemplate {
  schemaVersion: number;
  id: string;
  name: string;
  description: string;
  /** How to build a team for this class of problem. The seed's core instruction. */
  planningStrategy: string;
  preferredConstraints: RoomTemplateConstraints;
  exampleRoles: RoomTemplateRole[];
  /** How members work together once the Room runs. */
  collaborationInstructions: string;
  workspaceDefaults: RoomTemplateWorkspaceDefaults;
  limits: RoomTemplateLimits;
  outputExpectations: string;
}

export type RoomTemplateErrorCode =
  | 'id-invalid'
  | 'name-empty'
  | 'description-empty'
  | 'planning-strategy-empty'
  | 'collaboration-instructions-empty'
  | 'output-expectations-empty'
  | 'no-example-roles'
  | 'role-empty'
  | 'limit-not-positive'
  | 'delivery-unknown'
  | 'shared-tree-default'
  | 'run-specific-field';

export interface RoomTemplateError {
  code: RoomTemplateErrorCode;
  path: string;
  message: string;
}

export type RoomTemplateValidation =
  | { ok: true }
  | { ok: false; errors: RoomTemplateError[] };

const TEMPLATE_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * Keys that only ever belong to a live Room: identity of a run, credentials, or
 * accumulated state. Matched by exact key name (lower-cased) at any depth, so
 * `maxTokens` is untouched while `token` is refused.
 */
const RUN_SPECIFIC_KEYS: ReadonlySet<string> = new Set([
  'accesstoken', 'apikey', 'api_key', 'authorization', 'bearer', 'credential', 'credentials',
  'password', 'secret', 'secrets', 'token',
  'grantid', 'memberid', 'roomid', 'sessionid', 'parentsessionid', 'originsessionid',
  'sessionpath', 'livehandleid', 'worktreepath', 'worktreebranch',
  'archivedat', 'brief', 'createdat', 'delivery', 'members', 'runtime', 'status', 'updatedat', 'usage',
]);

function scanRunSpecific(value: unknown, path: string, found: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanRunSpecific(item, `${path}[${index}]`, found));
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    if (RUN_SPECIFIC_KEYS.has(key.toLowerCase())) found.push(childPath);
    scanRunSpecific(child, childPath, found);
  }
}

function requireText(value: string, code: RoomTemplateErrorCode, path: string, message: string, errors: RoomTemplateError[]): void {
  if (!value.trim()) errors.push({ code, path, message });
}

/**
 * Meaning and safety, not shape: the object arrives typed from JSON, so this
 * checks that the seed is usable and that it carries nothing from a run.
 */
export function validateRoomTemplate(template: RoomTemplate): RoomTemplateValidation {
  const errors: RoomTemplateError[] = [];

  if (!TEMPLATE_ID_PATTERN.test(template.id)) {
    errors.push({ code: 'id-invalid', path: 'id', message: `Template id ${template.id} must be a lower-case slug.` });
  }
  requireText(template.name, 'name-empty', 'name', 'A template needs a name.', errors);
  requireText(template.description, 'description-empty', 'description', 'A template needs a description.', errors);
  requireText(template.planningStrategy, 'planning-strategy-empty', 'planningStrategy', 'A template needs a planning strategy.', errors);
  requireText(template.collaborationInstructions, 'collaboration-instructions-empty', 'collaborationInstructions', 'A template needs collaboration instructions.', errors);
  requireText(template.outputExpectations, 'output-expectations-empty', 'outputExpectations', 'A template needs output expectations.', errors);

  if (template.exampleRoles.length === 0) {
    errors.push({ code: 'no-example-roles', path: 'exampleRoles', message: 'A template needs at least one example role.' });
  }
  template.exampleRoles.forEach((role, index) => {
    requireText(role.role, 'role-empty', `exampleRoles[${index}].role`, 'An example role needs a name.', errors);
    requireText(role.responsibility, 'role-empty', `exampleRoles[${index}].responsibility`, `${role.role} needs a responsibility line.`, errors);
  });

  for (const [field, value] of Object.entries(template.limits)) {
    if (value <= 0) {
      errors.push({ code: 'limit-not-positive', path: `limits.${field}`, message: `${field} must be greater than zero.` });
    }
  }

  if (!isDeliveryDestinationId(template.preferredConstraints.deliveryDestination)) {
    errors.push({
      code: 'delivery-unknown',
      path: 'preferredConstraints.deliveryDestination',
      message: `Delivery destination ${template.preferredConstraints.deliveryDestination} does not exist.`,
    });
  }

  // The shared working tree edits the user's own files. Only a live approval can
  // reach it, so a stored seed may not default to it.
  if (template.workspaceDefaults.mode === 'shared-working-tree') {
    errors.push({
      code: 'shared-tree-default',
      path: 'workspaceDefaults.mode',
      message: 'A template cannot default to working in your files directly.',
    });
  }

  const runSpecific: string[] = [];
  scanRunSpecific(template, '', runSpecific);
  for (const path of runSpecific) {
    errors.push({ code: 'run-specific-field', path, message: `${path} belongs to a Room run and cannot be saved in a template.` });
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export const SOFTWARE_DELIVERY_TEMPLATE: RoomTemplate = {
  schemaVersion: 1,
  id: 'software-delivery',
  name: 'Software delivery',
  description: 'Plan, build, review and verify a change, then deliver it as a pull request.',
  planningStrategy:
    'Staff one member for each stage the change actually needs: planning, building, reviewing and verifying. '
    + 'Small changes merge stages — one builder who also verifies is a complete team. Larger changes split the build '
    + 'across members by area, never by file. Members that write code or run verification commands get edit permission '
    + 'and their own worktree; the reviewer and the Conductor read. Size the team to the change, not to the stage list.',
  preferredConstraints: {
    permissionCeiling: 'edit-and-push',
    preferredTools: ['read', 'grep', 'write', 'edit', 'bash', 'gh'],
    preferredSkills: [],
    deliveryDestination: 'pr',
    worktreePerEditingMember: true,
  },
  exampleRoles: [
    { role: 'Conductor', responsibility: 'Splits the work, tracks the stages and decides when the change is ready.', editsWorkspace: false, isConductor: true },
    { role: 'Implementer', responsibility: 'Writes the change in its own worktree.', editsWorkspace: true, isConductor: false },
    { role: 'Reviewer', responsibility: 'Reads the change and reports what must be fixed.', editsWorkspace: false, isConductor: false },
    { role: 'Verifier', responsibility: 'Runs the tests and the type check in its own worktree, and reports the result.', editsWorkspace: true, isConductor: false },
  ],
  collaborationInstructions:
    'Work moves forward one stage at a time. The reviewer reads the implementer\'s branch and the implementer answers '
    + 'every finding before the change moves on. Nothing is delivered until verification passes on the same branch that '
    + 'will be delivered. The reviewer never edits the code it reviews.',
  workspaceDefaults: { mode: 'worktree-per-member', claimPolicy: 'warn' },
  limits: {
    suggestedMaxMembers: 5,
    suggestedMaxActiveTurns: 3,
    suggestedMaxWallClockMs: 7_200_000,
    suggestedMaxCostUsd: 8,
  },
  outputExpectations:
    'One pull request holding the change, with the review findings and the verification result recorded in its description.',
};

export const ADVERSARIAL_ANALYSIS_TEMPLATE: RoomTemplate = {
  schemaVersion: 1,
  id: 'adversarial-analysis',
  name: 'Adversarial analysis',
  description: 'Opposed analysts argue a question from evidence and a judge decides.',
  planningStrategy:
    'Staff at least two analysts holding genuinely OPPOSED positions on the question, plus one judge that holds no '
    + 'position. Give each analyst the position it must argue in its mandate — a team that agrees from the start '
    + 'produces nothing. Add a third analyst only when the question has a real third position. No member edits '
    + 'anything: this Room reads evidence and writes a report.',
  preferredConstraints: {
    permissionCeiling: 'read-only',
    preferredTools: ['read', 'grep'],
    preferredSkills: [],
    deliveryDestination: 'saved-artifact',
    worktreePerEditingMember: false,
  },
  exampleRoles: [
    { role: 'Conductor', responsibility: 'Frames the question, keeps the argument on evidence and calls the ruling.', editsWorkspace: false, isConductor: true },
    { role: 'Analyst for', responsibility: 'Argues the case for the position, from evidence in the workspace.', editsWorkspace: false, isConductor: false },
    { role: 'Analyst against', responsibility: 'Argues the opposing case, from evidence in the workspace.', editsWorkspace: false, isConductor: false },
    { role: 'Judge', responsibility: 'Weighs both cases and writes the decision and its reasons.', editsWorkspace: false, isConductor: false },
  ],
  collaborationInstructions:
    'Members must challenge each other\'s conclusions. Every claim carries the evidence it rests on, and every claim '
    + 'must be answered by the opposing analyst before the judge rules. Agreement reached without a challenge is not a '
    + 'result — say so and keep arguing. The judge decides, the judge\'s decision is final, and the analysts do not '
    + 'reopen it.',
  workspaceDefaults: { mode: 'read-only-shared', claimPolicy: 'warn' },
  limits: {
    suggestedMaxMembers: 4,
    suggestedMaxActiveTurns: 3,
    suggestedMaxWallClockMs: 2_700_000,
    suggestedMaxCostUsd: 5,
  },
  outputExpectations:
    'One report holding both positions, the challenges each survived, the judge\'s decision and the reasons for it.',
};

export const PARALLEL_ISSUES_TEMPLATE: RoomTemplate = {
  schemaVersion: 1,
  id: 'parallel-issues',
  name: 'Parallel issues',
  description: 'One implementer for each issue, working at the same time, integrated by the Conductor.',
  planningStrategy:
    'Staff one implementer for each issue in scope, up to the team cap — the roster size comes from the issue count, '
    + 'not from this seed. Every implementer takes one issue end to end in its own worktree. Do not add reviewer or '
    + 'verifier members: each implementer verifies its own issue. The Conductor takes no issue of its own; it '
    + 'integrates. When there are more issues than the cap allows, take the first ones and say which were left.',
  preferredConstraints: {
    permissionCeiling: 'edit-and-push',
    preferredTools: ['read', 'grep', 'write', 'edit', 'bash', 'gh'],
    preferredSkills: [],
    deliveryDestination: 'pr',
    worktreePerEditingMember: true,
  },
  exampleRoles: [
    { role: 'Conductor', responsibility: 'Assigns one issue per member and integrates the finished branches.', editsWorkspace: false, isConductor: true },
    { role: 'Issue implementer', responsibility: 'Takes one issue end to end in its own worktree and verifies it.', editsWorkspace: true, isConductor: false },
  ],
  collaborationInstructions:
    'Implementers work independently and do not coordinate edits with each other. Path claims WILL overlap because '
    + 'separate issues touch the same files; the overlap is advisory and the worktrees are the real protection, so '
    + 'nobody waits for a claim to clear. Report an overlap to the Conductor and keep working. The Conductor '
    + 'integrates the branches at the end and resolves the conflicts.',
  // `warn`, not `block`: overlapping claims are the normal case here, so blocking
  // on them would stop the Room doing its ordinary work (D-27).
  workspaceDefaults: { mode: 'worktree-per-member', claimPolicy: 'warn' },
  limits: {
    suggestedMaxMembers: 8,
    suggestedMaxActiveTurns: 4,
    suggestedMaxWallClockMs: 10_800_000,
    suggestedMaxCostUsd: 15,
  },
  outputExpectations:
    'One pull request for each issue, plus the Conductor\'s summary of what was integrated and what conflicted.',
};

export const BUILT_IN_ROOM_TEMPLATES: readonly RoomTemplate[] = [
  SOFTWARE_DELIVERY_TEMPLATE,
  ADVERSARIAL_ANALYSIS_TEMPLATE,
  PARALLEL_ISSUES_TEMPLATE,
];

export function findRoomTemplate(id: string): RoomTemplate | null {
  return BUILT_IN_ROOM_TEMPLATES.find((template) => template.id === id) ?? null;
}

function slugify(text: string): string {
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return TEMPLATE_ID_PATTERN.test(slug) ? slug : `room-${slug}`;
}

const PERMISSION_REACH = MEMBER_PERMISSION_LEVELS;

function highestPermission(blueprint: RoomBlueprint): MemberPermissionLevel {
  return blueprint.members.reduce<MemberPermissionLevel>(
    (highest, member) => (PERMISSION_REACH.indexOf(member.permissions) > PERMISSION_REACH.indexOf(highest) ? member.permissions : highest),
    'read-only',
  );
}

/** Union across the team, minus the Room protocol capability every member holds. */
function unionCapabilities(blueprint: RoomBlueprint, pick: 'tools' | 'skills'): string[] {
  const names = blueprint.members.flatMap((member) => member[pick]);
  return [...new Set(names)].filter((name) => !ROOM_PROTOCOL_CAPABILITIES.includes(name.trim().toLowerCase()));
}

/**
 * "Save this Room as a template" (spec §11).
 *
 * Reuse DEFAULTS TO ADAPTING this seed to the new problem, not to replaying the
 * saved roster: the members become `exampleRoles`, which the planner is free to
 * drop, merge or repeat. Replaying the exact roster is a separate advanced
 * option, and it reads the saved blueprint rather than this template.
 *
 * Built field by field so nothing run-specific — ids, sessions, worktrees,
 * usage, the grant — can travel with it.
 */
export function roomToTemplate(
  blueprint: RoomBlueprint,
  overrides: { id?: string; name?: string; description?: string } = {},
): RoomTemplate {
  const editingMembers = blueprint.members.filter((member) => member.permissions !== 'read-only');
  return {
    schemaVersion: 1,
    id: overrides.id ?? slugify(blueprint.title),
    name: overrides.name ?? blueprint.title,
    description: overrides.description ?? blueprint.approach,
    planningStrategy: blueprint.teamRationale,
    preferredConstraints: {
      permissionCeiling: highestPermission(blueprint),
      preferredTools: unionCapabilities(blueprint, 'tools'),
      preferredSkills: unionCapabilities(blueprint, 'skills'),
      deliveryDestination: blueprint.deliveryDestination,
      worktreePerEditingMember: editingMembers.length > 0 && editingMembers.every((member) => member.needsWorktree),
    },
    exampleRoles: blueprint.members.map((member) => ({
      role: member.role,
      responsibility: member.responsibility,
      editsWorkspace: member.permissions !== 'read-only',
      isConductor: member.isConductor,
    })),
    collaborationInstructions: blueprint.collaborationStrategy,
    // A saved Room that ran in the user's own files cannot pass that reach on:
    // the shared tree needs an approval given per run, never one carried in a file.
    workspaceDefaults: {
      mode: blueprint.workspacePolicy.mode === 'shared-working-tree' ? 'worktree-per-member' : blueprint.workspacePolicy.mode,
      claimPolicy: blueprint.workspacePolicy.claimPolicy,
    },
    limits: {
      suggestedMaxMembers: blueprint.envelope.maxMembers,
      suggestedMaxActiveTurns: blueprint.envelope.maxActiveTurns,
      suggestedMaxWallClockMs: blueprint.envelope.maxWallClockMs,
      suggestedMaxCostUsd: blueprint.envelope.maxCostUsd,
    },
    outputExpectations: blueprint.successCriteria.join(' '),
  };
}
