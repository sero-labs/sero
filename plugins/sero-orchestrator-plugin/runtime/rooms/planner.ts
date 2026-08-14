/**
 * The Room Planner — one plain-language problem in, one validated
 * `RoomBlueprint` plus its computed proposal out (spec §9, FR-004, FR-005).
 *
 * It runs the same bounded shape as the Workflow planner: one structured model
 * call, at most ONE repair pass, and the exact validation errors fed back so
 * the model can fix what it actually got wrong. Clarifying questions are a
 * valid first answer and skip the repair pass.
 *
 * The division of authority is the point of this module:
 *
 *   the model  → prose and roster design (title, approach, mandates, who is on
 *                the team and what each one holds)
 *   this code  → the operating envelope, the workspace approval, the delivery
 *                destination and the permission ceiling, all built from the
 *                USER's choices
 *   shared code → the clamp, the validation and `computeProposalSummary`
 *
 * So the summary the user approves is a projection of the blueprint the runtime
 * enforces, and no planner sentence can disagree with it (D-14, NFR-015).
 */

import { flattenModelGroups, modelKey, type ContextSkillInfo, type ContextToolInfo } from '@sero-ai/common';
import { ROOM_SURFACE_TOOL } from '../../shared/room-surface';

import { defaultDeliveryFor, deliveryDestinationInfo, type DeliveryDestinationId } from '../../shared/delivery-types';
import type { HumanQuestion } from '../../shared/human-input-types';
import type {
  AccessLabel,
  MemberPermissionLevel,
  OperatingEnvelope,
  RoomBlueprint,
  RoomProposalSummary,
  RoomWorkspaceMode,
} from '../../shared/room-blueprint-types';
import {
  accessLabelForCapability,
  computeProposalSummary,
  type BlueprintClamp,
  type RoomCapabilityCatalogue,
} from '../../shared/room-validation';
import type { OrchestratorHost } from '../host';
import { runStructuredJson } from '../structured-call';
import { parseRoomPlannerReply, type RoomPlannerReply } from './planner-parse';
import {
  ROOM_PLANNING_SYSTEM_PROMPT,
  buildRoomPlanningTask,
  buildRoomRepairTask,
  type RoomPlanningCatalogue,
  type RoomPlanningModelInfo,
  type RoomPresetSeed,
} from './planner-prompt';

/**
 * The one broad access question the user is asked at create time (spec §9.1).
 * It is the same scale as a member's permission level, because that is exactly
 * what it sets: the highest permission any member of this Room may hold.
 */
export type RoomAccessChoice = MemberPermissionLevel;

/** Everything the user may set before planning. Every field is optional. */
export interface RoomUserLimits {
  maxCostUsd?: number;
  maxWallClockMs?: number;
  maxMembers?: number;
  access?: RoomAccessChoice;
  /** Where the result goes. A user setting — the planner never chooses one. */
  deliveryDestination?: DeliveryDestinationId;
}

export interface RoomPlanRequest {
  /** The user's own words. Kept verbatim for the audit trail. */
  problem: string;
  parentSessionId: string;
  limits?: RoomUserLimits;
  /** A template or built-in preset to adapt (spec §11). */
  preset?: RoomPresetSeed;
  /**
   * Skills members may hold. Supplied by the caller because `OrchestratorHost`
   * has no skill-catalogue seam yet; an empty list simply means no member can
   * hold a skill.
   */
  skills?: ContextSkillInfo[];
  /** Answers to the planner's earlier clarifying questions, folded into a re-plan. */
  clarifications?: { prompt: string; answer: string }[];
  model?: string;
  thinking?: string;
  signal?: AbortSignal;
}

export type RoomPlanOutcome =
  | {
      ok: true;
      blueprint: RoomBlueprint;
      /** Computed from the validated blueprint. Never planner-authored. */
      proposal: RoomProposalSummary;
      /** What the user's limits took away from the model's suggestion. */
      clamps: BlueprintClamp[];
      modelResponses: string[];
    }
  | { ok: false; needsInput: true; questions: HumanQuestion[]; modelResponses: string[] }
  | { ok: false; needsInput?: false; errors: string[]; modelResponses: string[] };

// ── Defaults the user's chips override (D-18) ───────────────

export const ROOM_PLANNING_DEFAULTS = {
  maxMembers: 5,
  maxCostUsd: 5,
  maxWallClockMs: 60 * 60_000,
  access: 'edit-workspace',
} as const satisfies { maxMembers: number; maxCostUsd: number; maxWallClockMs: number; access: RoomAccessChoice };

/**
 * Envelope fields no create-time chip covers. They bound the mechanics rather
 * than the user's intent: how many members run at once, how often the roster
 * may change, how long the Room may sit idle before it pauses for the user.
 */
const ENVELOPE_MECHANICS = {
  maxActiveTurns: 3,
  maxRosterRevisions: 5,
  maxMemberReplacements: 3,
  maxTokens: 2_000_000,
  maxTurnsPerMember: 30,
  maxRetriesPerMember: 2,
  maxConsecutiveFailures: 3,
  /** Nested subagents are out of scope for the first release (spec §34.6). */
  allowNestedSubagents: false,
  maxIdleMs: 5 * 60_000,
} as const;

/**
 * `xhigh` and `max` are left out: they multiply the cost of every turn of every
 * member, and no default Room needs them. Advanced settings can widen this.
 */
const DEFAULT_THINKING_LEVELS: readonly string[] = ['off', 'minimal', 'low', 'medium', 'high'];

/** A single member may spend at most half the Room, so one cannot starve the rest. */
const MEMBER_SHARE = 0.5;

const WORKSPACE_CEILING: Record<RoomAccessChoice, RoomWorkspaceMode> = {
  'read-only': 'read-only-shared',
  'edit-workspace': 'worktree-per-member',
  'edit-and-push': 'worktree-per-member',
};

/**
 * Capability classes each access choice excludes. Deployment is never granted
 * by a broad choice — it changes live systems, so it stays an advanced,
 * deliberate decision.
 */
const BLOCKED_ACCESS_LABELS: Record<RoomAccessChoice, readonly AccessLabel[]> = {
  'read-only': ['edit-workspace', 'edit-working-files-directly', 'github-write', 'deployment'],
  'edit-workspace': ['github-write', 'deployment'],
  'edit-and-push': ['deployment'],
};

/** The user's number when they set one, the default when they did not. */
function chosen(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && value > 0 ? value : fallback;
}

function accessChoice(limits: RoomUserLimits): RoomAccessChoice {
  return limits.access ?? ROOM_PLANNING_DEFAULTS.access;
}

function deliveryChoice(limits: RoomUserLimits): DeliveryDestinationId {
  return limits.deliveryDestination ?? defaultDeliveryFor(accessChoice(limits));
}

function allowsCapability(name: string, access: RoomAccessChoice): boolean {
  const label = accessLabelForCapability(name);
  // An unmapped capability stays in the pool: the fixed mapping shows it as
  // "Other tools" in the summary, so it is disclosed rather than hidden (D-15).
  return label === null || !BLOCKED_ACCESS_LABELS[access].includes(label);
}

// ── Catalogue ───────────────────────────────────────────────

/** Everything the workspace can actually resolve right now, with labels for the prompt. */
export interface RoomCatalogue {
  models: RoomPlanningModelInfo[];
  thinkingLevels: string[];
  tools: ContextToolInfo[];
  skills: ContextSkillInfo[];
}

/**
 * A machine-level pin on what any Room may run: `SERO_ROOM_MODELS` takes
 * `provider/id` keys and `SERO_ROOM_THINKING` takes effort levels, both comma
 * separated. The evaluation gate uses them to hold a whole run on one model and
 * one effort level, so a measured cost means something. Unset, a Room may use
 * everything the workspace offers.
 *
 * A pin that matches nothing is reported and ignored: a Room with no model left
 * cannot be staffed at all, and a silent typo is worse than no pin.
 */
function pinned(host: OrchestratorHost, variable: string, available: string[]): string[] {
  const wanted = (process.env[variable] ?? '').split(',').map((entry) => entry.trim()).filter(Boolean);
  if (wanted.length === 0) return available;
  const kept = available.filter((entry) => wanted.includes(entry));
  if (kept.length > 0) return kept;
  host.log(`${variable}=${wanted.join(',')} matches nothing available (${available.join(', ')}); ignoring it`);
  return available;
}

async function loadCatalogue(host: OrchestratorHost, skills: ContextSkillInfo[]): Promise<RoomCatalogue> {
  const [groups, tools] = await Promise.all([host.listAvailableModels(), host.listToolCatalog()]);
  const models = flattenModelGroups(groups).map((model) => ({
    id: modelKey(model.provider, model.modelId),
    label: model.name,
  }));
  const allowed = pinned(host, 'SERO_ROOM_MODELS', models.map((model) => model.id));
  return {
    models: models.filter((model) => allowed.includes(model.id)),
    thinkingLevels: pinned(host, 'SERO_ROOM_THINKING', [...DEFAULT_THINKING_LEVELS]),
    tools,
    skills,
  };
}

/** Names only — what `validateRoomBlueprint` checks an invented name against. */
function capabilityNames(catalogue: RoomCatalogue): RoomCapabilityCatalogue {
  return {
    models: catalogue.models.map((model) => model.id),
    // The Room surface always exists — the host provides it to every member
    // session — so it is never an invented name, even though the planner is not
    // shown it and never picks it.
    tools: [ROOM_SURFACE_TOOL, ...catalogue.tools.map((tool) => tool.name).filter((name) => name !== ROOM_SURFACE_TOOL)],
    skills: catalogue.skills.map((skill) => skill.name),
  };
}

/**
 * The envelope the user approves. The planner and the Conductor can only ever
 * work below it (spec §12.2), so it is built here from the user's own choices
 * and never from anything the model returns.
 */
export function resolveRoomEnvelope(catalogue: RoomCatalogue, limits: RoomUserLimits = {}): OperatingEnvelope {
  const access = accessChoice(limits);
  const maxCostUsd = chosen(limits.maxCostUsd, ROOM_PLANNING_DEFAULTS.maxCostUsd);
  return {
    ...ENVELOPE_MECHANICS,
    maxMembers: Math.max(1, Math.floor(chosen(limits.maxMembers, ROOM_PLANNING_DEFAULTS.maxMembers))),
    maxWallClockMs: chosen(limits.maxWallClockMs, ROOM_PLANNING_DEFAULTS.maxWallClockMs),
    maxCostUsd,
    maxCostUsdPerMember: maxCostUsd * MEMBER_SHARE,
    maxTokensPerMember: ENVELOPE_MECHANICS.maxTokens * MEMBER_SHARE,
    allowedModels: catalogue.models.map((model) => model.id),
    allowedThinkingLevels: [...catalogue.thinkingLevels],
    // The Room surface is not an access choice: a read-only member still has to
    // be able to answer a question and report what it found (AD-020).
    allowedTools: [
      ROOM_SURFACE_TOOL,
      ...catalogue.tools.map((tool) => tool.name).filter((name) => name !== ROOM_SURFACE_TOOL && allowsCapability(name, access)),
    ],
    allowedSkills: catalogue.skills.map((skill) => skill.name).filter((name) => allowsCapability(name, access)),
    workspacePolicy: {
      mode: WORKSPACE_CEILING[access],
      // Working in the user's own files is reachable only through an explicit
      // approval in advanced settings, never through a broad access choice.
      sharedTreeApproved: false,
      claimPolicy: 'warn',
    },
    allowedDeliveryDestinations: [deliveryChoice(limits)],
  };
}

/** The catalogue the model sees: filtered to the envelope, so every visible name is usable. */
function promptCatalogue(catalogue: RoomCatalogue, envelope: OperatingEnvelope): RoomPlanningCatalogue {
  return {
    models: catalogue.models.filter((model) => envelope.allowedModels.includes(model.id)),
    tools: catalogue.tools.filter((tool) => tool.name !== ROOM_SURFACE_TOOL && envelope.allowedTools.includes(tool.name)),
    skills: catalogue.skills.filter((skill) => envelope.allowedSkills.includes(skill.name)),
    thinkingLevels: envelope.allowedThinkingLevels,
  };
}

// ── Planning ────────────────────────────────────────────────

export async function planRoom(host: OrchestratorHost, request: RoomPlanRequest): Promise<RoomPlanOutcome> {
  const catalogue = await loadCatalogue(host, request.skills ?? []);
  if (catalogue.models.length === 0) {
    return { ok: false, errors: ['no models are available in this workspace, so a Room cannot be staffed'], modelResponses: [] };
  }

  const limits = request.limits ?? {};
  const envelope = resolveRoomEnvelope(catalogue, limits);
  const destination = deliveryChoice(limits);

  const result = await runStructuredJson<RoomPlannerReply>(host, {
    systemPrompt: ROOM_PLANNING_SYSTEM_PROMPT,
    task: buildRoomPlanningTask({
      problem: request.problem,
      catalogue: promptCatalogue(catalogue, envelope),
      envelope,
      deliveryLabel: deliveryDestinationInfo(destination).label,
      preset: request.preset,
      clarifications: request.clarifications,
    }),
    parse: (value) => parseRoomPlannerReply(value, {
      envelope,
      catalogue: capabilityNames(catalogue),
      deliveryDestination: destination,
      permissionCeiling: accessChoice(limits),
    }),
    buildRepair: (previous, errors) => buildRoomRepairTask(request.problem, previous, errors),
    parentSessionId: request.parentSessionId,
    model: request.model,
    thinking: request.thinking,
    signal: request.signal,
  });

  if (!result.ok || !result.value) {
    host.log(`room planning failed: ${result.errors.join('; ')}`);
    return { ok: false, errors: result.errors, modelResponses: result.responses };
  }
  if (result.value.kind === 'questions') {
    return { ok: false, needsInput: true, questions: result.value.questions, modelResponses: result.responses };
  }

  const { blueprint, clamps } = result.value;
  if (clamps.length > 0) host.log(`room plan clamped to the approved limits: ${clamps.map((clamp) => clamp.detail).join(' ')}`);
  return {
    ok: true,
    blueprint,
    // Computed AFTER validation, from the blueprint the runtime will enforce.
    proposal: computeProposalSummary(blueprint),
    clamps,
    modelResponses: result.responses,
  };
}
