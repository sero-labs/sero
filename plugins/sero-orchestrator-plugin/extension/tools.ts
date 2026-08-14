/**
 * Orchestrator extension tool — the single bridged entry point for tools, the
 * slash command, and the UI to request coordinator actions.
 *
 * Bridged contexts do not receive `host.*`; they resolve the per-workspace
 * coordinator from the shared registry by cwd and call `requestAction`.
 */

import { StringEnum } from '@earendil-works/pi-ai';
import { Type } from 'typebox';
import { resolveCoordinatorByCwd } from '../runtime/registry';
import type { Coordinator } from '../runtime/coordinator';
import type {
  ContextOverrides,
  CreateLoopOptions,
  InputAnswer,
  LoopDeliverySettings,
  OrchestratorAction,
  OrchestratorActionResult,
  RecoveryDecision,
} from '../shared/types';
import { LOOP_DELIVERY_DESTINATION_IDS } from '../shared/delivery-types';

export const ORCHESTRATOR_ACTIONS = [
  'create',
  'list',
  'show',
  'activate',
  'disable',
  'enable',
  'run_next',
  'run_again',
  'retry',
  'retry_step',
  'revise',
  'choose_recovery',
  'set_step_model',
  'set_step_tools',
  'set_step_agent',
  'set_loop_context',
  'set_delivery',
  'set_schedule',
  'reflect',
  'reflect_workspace',
  'choose_suggestion',
  'answer_input',
  'library_save',
  'library_load',
  'library_list',
  'library_set_version',
  'library_unlink',
  'library_delete',
  'catalog_list',
  'catalog_add_repo',
  'catalog_remove_repo',
  'catalog_refresh',
  'catalog_install',
  'delete',
] as const;

const SUGGESTION_DECISIONS = ['approve', 'reject'] as const;
const LIBRARY_SAVE_MODES = ['new-version', 'new-entry'] as const;
const WORKTREE_BRANCH_SOURCES = ['new', 'event-pr'] as const;

export const OrchestratorToolParams = Type.Object({
  action: StringEnum(ORCHESTRATOR_ACTIONS, {
    description: 'Coordinator action to request',
  }),
  loopId: Type.Optional(Type.String({ description: 'Target loop id (required for everything except create/list)' })),
  prompt: Type.Optional(Type.String({ description: 'User prompt (create) or revision request (revise)' })),
  title: Type.Optional(Type.String({ description: 'Optional loop title for create' })),
  activate: Type.Optional(Type.Boolean({ description: 'Activate the loop immediately after create' })),
  useManagedWorktree: Type.Optional(Type.Boolean({ description: 'Workspace isolation for create (default true)' })),
  allowDirtyWorkspaceRoot: Type.Optional(Type.Boolean({ description: 'For create in workspace-root mode (useManagedWorktree false): run in place even when the workspace is dirty, skipping the dirty preflight (default false)' })),
  worktreeBranchSource: Type.Optional(StringEnum(WORKTREE_BRANCH_SOURCES, { description: 'For create with a managed worktree: "event-pr" checks out the PR branch named by the firing event instead of minting a new branch (PR-lifecycle loops); default "new"' })),
  decisionJson: Type.Optional(Type.String({ description: 'JSON-encoded RecoveryDecision for choose_recovery' })),
  stepId: Type.Optional(Type.String({ description: 'Target step id (required for set_step_model/set_step_tools)' })),
  model: Type.Optional(Type.String({ description: 'For set_step_model: a tier ("LOW"/"MED"/"HIGH") or a "provider/modelId"; omit to revert the step to the default' })),
  thinking: Type.Optional(Type.String({ description: 'For set_step_model: thinking level for a pinned model' })),
  toolsJson: Type.Optional(Type.String({ description: 'For set_step_tools: JSON-encoded array of EXTRA tool names beyond the always-on default tools (e.g. ["web_search","git_manager"]) or "null"/"[]" to use the default tools only' })),
  agent: Type.Optional(Type.String({ description: 'For set_step_agent: a named agent role for the background-agent step; omit/empty to revert the step to the default agent' })),
  contextJson: Type.Optional(Type.String({ description: 'For set_loop_context: JSON-encoded ContextOverrides ({systemPrompt?, disabledTools?, disabledSkills?}) or "null" to clear' })),
  triggerId: Type.Optional(Type.String({ description: 'For set_schedule: the cron/hybrid trigger id (loop.triggers[].id)' })),
  schedule: Type.Optional(Type.String({ description: 'For set_schedule: the new 5-field cron expression (minute hour dom month dow, UTC); omit to keep the current one' })),
  scheduleDisabled: Type.Optional(Type.Boolean({ description: 'For set_schedule: pause (true) or resume (false) the trigger\'s schedule; omit to keep the current state' })),
  deliveryDestination: Type.Optional(StringEnum(LOOP_DELIVERY_DESTINATION_IDS, { description: 'For create/set_delivery: where the loop ships its results (user-chosen; omit on create to derive from placement — worktree ⇒ pr, root ⇒ workspace-files)' })),
  deliveryParamsJson: Type.Optional(Type.String({ description: 'For create/set_delivery: JSON-encoded flat object of destination params (e.g. {"channel":"#market-intel"} or {"url":"https://…"})' })),
  suggestionId: Type.Optional(Type.String({ description: 'For choose_suggestion: the reflection suggestion id to approve/reject' })),
  decision: Type.Optional(StringEnum(SUGGESTION_DECISIONS, { description: 'For choose_suggestion: approve (apply the proposed plan) or reject' })),
  rejectionReason: Type.Optional(Type.String({ description: 'For choose_suggestion reject: why, so the same idea is not re-proposed' })),
  requestId: Type.Optional(Type.String({ description: 'For answer_input: the pending question request id (loop.runtime.pendingInput.id)' })),
  answersJson: Type.Optional(Type.String({ description: 'For answer_input: JSON array of answers [{ questionId, choiceId?, text? }] — answer every question with a picked choiceId and/or free text' })),
  deleteBranch: Type.Optional(Type.Boolean({ description: 'For delete: also delete the loop\'s local git branch (default false — branch is kept)' })),
  mode: Type.Optional(StringEnum(LIBRARY_SAVE_MODES, { description: 'For library_save: "new-version" bumps the loop\'s linked entry; "new-entry" creates a fresh library entry' })),
  name: Type.Optional(Type.String({ description: 'For library_save new-entry: the library entry name (defaults to the loop title)' })),
  note: Type.Optional(Type.String({ description: 'For library_save: an optional one-line "what changed" note on the version' })),
  entryId: Type.Optional(Type.String({ description: 'For library_load/library_delete: the library entry id' })),
  version: Type.Optional(Type.Number({ description: 'For library_load (defaults to latest) or library_set_version (required): the entry version' })),
  url: Type.Optional(Type.String({ description: 'For catalog_add_repo: the catalog git repo URL (https or git@; private repos use your ambient git credentials)' })),
  repoKey: Type.Optional(Type.String({ description: 'For catalog_remove_repo/catalog_install (and optionally catalog_refresh): the catalog repo key from catalog_list' })),
  slug: Type.Optional(Type.String({ description: 'For catalog_install: the catalog entry slug' })),
  workspaceLoad: Type.Optional(Type.Boolean({ description: 'For catalog_install: also create a draft loop in this workspace (default true; false = library entry only)' })),
});

export interface OrchestratorToolParamsShape {
  action: (typeof ORCHESTRATOR_ACTIONS)[number];
  loopId?: string;
  prompt?: string;
  title?: string;
  activate?: boolean;
  useManagedWorktree?: boolean;
  allowDirtyWorkspaceRoot?: boolean;
  worktreeBranchSource?: (typeof WORKTREE_BRANCH_SOURCES)[number];
  decisionJson?: string;
  stepId?: string;
  model?: string;
  thinking?: string;
  toolsJson?: string;
  agent?: string;
  contextJson?: string;
  triggerId?: string;
  schedule?: string;
  scheduleDisabled?: boolean;
  deliveryDestination?: (typeof LOOP_DELIVERY_DESTINATION_IDS)[number];
  deliveryParamsJson?: string;
  suggestionId?: string;
  decision?: (typeof SUGGESTION_DECISIONS)[number];
  rejectionReason?: string;
  requestId?: string;
  answersJson?: string;
  deleteBranch?: boolean;
  mode?: (typeof LIBRARY_SAVE_MODES)[number];
  name?: string;
  note?: string;
  entryId?: string;
  version?: number;
  url?: string;
  repoKey?: string;
  slug?: string;
  workspaceLoad?: boolean;
}

interface ToolResult {
  text: string;
  content: { type: 'text'; text: string }[];
  details: Record<string, unknown>;
}

function result(text: string, details: Record<string, unknown> = {}): ToolResult {
  return { text, content: [{ type: 'text', text }], details };
}

function errorResult(message: string): ToolResult {
  return result(`Error: ${message}`, { ok: false, error: message });
}

/**
 * Builds LoopDeliverySettings from the flat deliveryDestination/deliveryParamsJson
 * params. Structural depth only — full validation happens coordinator-side.
 */
function buildDelivery(params: OrchestratorToolParamsShape): LoopDeliverySettings | { error: string } {
  let parsed: unknown;
  if (params.deliveryParamsJson !== undefined) {
    try {
      parsed = JSON.parse(params.deliveryParamsJson);
    } catch {
      return { error: 'deliveryParamsJson is not valid JSON' };
    }
    if (parsed !== undefined && (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))) {
      return { error: 'deliveryParamsJson must be a JSON object of destination params' };
    }
  }
  return {
    destination: params.deliveryDestination!,
    params: parsed as LoopDeliverySettings['params'],
  };
}

/** Builds the typed coordinator action from flat tool params. */
export function buildAction(params: OrchestratorToolParamsShape): OrchestratorAction | { error: string } {
  switch (params.action) {
    case 'create': {
      if (!params.prompt) return { error: 'create requires a prompt' };
      const options: CreateLoopOptions = {};
      if (params.activate !== undefined) options.activate = params.activate;
      if (params.useManagedWorktree !== undefined || params.allowDirtyWorkspaceRoot !== undefined || params.worktreeBranchSource !== undefined) {
        options.workspace = {};
        if (params.useManagedWorktree !== undefined) options.workspace.useManagedWorktree = params.useManagedWorktree;
        if (params.allowDirtyWorkspaceRoot !== undefined) options.workspace.allowDirtyWorkspaceRoot = params.allowDirtyWorkspaceRoot;
        if (params.worktreeBranchSource !== undefined) options.workspace.worktreeBranchSource = params.worktreeBranchSource;
      }
      if (params.deliveryDestination !== undefined) {
        const delivery = buildDelivery(params);
        if ('error' in delivery) return delivery;
        options.delivery = delivery;
      }
      return { kind: 'create', prompt: params.prompt, title: params.title, options };
    }
    case 'set_delivery': {
      if (!params.loopId) return { error: 'set_delivery requires a loopId' };
      if (!params.deliveryDestination) return { error: 'set_delivery requires a deliveryDestination' };
      const delivery = buildDelivery(params);
      if ('error' in delivery) return delivery;
      return { kind: 'set_delivery', loopId: params.loopId, delivery };
    }
    case 'list':
      return { kind: 'list' };
    case 'revise':
      if (!params.loopId) return { error: 'revise requires a loopId' };
      return { kind: 'revise', loopId: params.loopId, prompt: params.prompt };
    case 'choose_recovery': {
      if (!params.loopId) return { error: 'choose_recovery requires a loopId' };
      if (!params.decisionJson) return { error: 'choose_recovery requires decisionJson' };
      let decision: RecoveryDecision;
      try {
        decision = JSON.parse(params.decisionJson) as RecoveryDecision;
      } catch {
        return { error: 'decisionJson is not valid JSON' };
      }
      return { kind: 'choose_recovery', loopId: params.loopId, decision };
    }
    case 'retry_step':
      if (!params.loopId) return { error: 'retry_step requires a loopId' };
      if (!params.stepId) return { error: 'retry_step requires a stepId' };
      return { kind: 'retry_step', loopId: params.loopId, stepId: params.stepId };
    case 'set_step_model':
      if (!params.loopId) return { error: 'set_step_model requires a loopId' };
      if (!params.stepId) return { error: 'set_step_model requires a stepId' };
      return { kind: 'set_step_model', loopId: params.loopId, stepId: params.stepId, model: params.model, thinking: params.thinking };
    case 'set_step_tools': {
      if (!params.loopId) return { error: 'set_step_tools requires a loopId' };
      if (!params.stepId) return { error: 'set_step_tools requires a stepId' };
      let tools: string[] | undefined;
      if (params.toolsJson !== undefined) {
        try {
          const parsed = JSON.parse(params.toolsJson) as unknown;
          if (parsed === null) tools = undefined;
          else if (Array.isArray(parsed) && parsed.every((t) => typeof t === 'string')) tools = parsed as string[];
          else return { error: 'toolsJson must be a JSON array of tool-name strings, or "null"' };
        } catch {
          return { error: 'toolsJson is not valid JSON' };
        }
      }
      return { kind: 'set_step_tools', loopId: params.loopId, stepId: params.stepId, tools };
    }
    case 'set_step_agent':
      if (!params.loopId) return { error: 'set_step_agent requires a loopId' };
      if (!params.stepId) return { error: 'set_step_agent requires a stepId' };
      return { kind: 'set_step_agent', loopId: params.loopId, stepId: params.stepId, agent: params.agent };
    case 'set_loop_context': {
      if (!params.loopId) return { error: 'set_loop_context requires a loopId' };
      if (params.contextJson === undefined) return { error: 'set_loop_context requires contextJson' };
      let overrides: ContextOverrides | null;
      try {
        overrides = JSON.parse(params.contextJson) as ContextOverrides | null;
      } catch {
        return { error: 'contextJson is not valid JSON' };
      }
      return { kind: 'set_loop_context', loopId: params.loopId, overrides };
    }
    case 'set_schedule':
      if (!params.loopId) return { error: 'set_schedule requires a loopId' };
      if (!params.triggerId) return { error: 'set_schedule requires a triggerId' };
      if (params.schedule === undefined && params.scheduleDisabled === undefined) {
        return { error: 'set_schedule requires a schedule and/or scheduleDisabled' };
      }
      return { kind: 'set_schedule', loopId: params.loopId, triggerId: params.triggerId, schedule: params.schedule, disabled: params.scheduleDisabled };
    case 'reflect_workspace':
      return { kind: 'reflect_workspace' };
    case 'choose_suggestion': {
      if (!params.loopId) return { error: 'choose_suggestion requires a loopId' };
      if (!params.suggestionId) return { error: 'choose_suggestion requires a suggestionId' };
      if (!params.decision) return { error: 'choose_suggestion requires a decision (approve|reject)' };
      return { kind: 'choose_suggestion', loopId: params.loopId, suggestionId: params.suggestionId, decision: params.decision, rejectionReason: params.rejectionReason };
    }
    case 'answer_input': {
      if (!params.loopId) return { error: 'answer_input requires a loopId' };
      if (!params.requestId) return { error: 'answer_input requires a requestId' };
      if (!params.answersJson) return { error: 'answer_input requires answersJson' };
      let answers: InputAnswer[];
      try {
        const parsed = JSON.parse(params.answersJson) as unknown;
        if (!Array.isArray(parsed)) return { error: 'answersJson must be a JSON array of answers' };
        answers = parsed as InputAnswer[];
      } catch {
        return { error: 'answersJson is not valid JSON' };
      }
      return { kind: 'answer_input', loopId: params.loopId, requestId: params.requestId, answers };
    }
    case 'library_save': {
      if (!params.loopId) return { error: 'library_save requires a loopId' };
      if (!params.mode) return { error: 'library_save requires a mode ("new-version"|"new-entry")' };
      return { kind: 'library_save', loopId: params.loopId, mode: params.mode, name: params.name, note: params.note };
    }
    case 'library_load':
      if (!params.entryId) return { error: 'library_load requires an entryId' };
      return { kind: 'library_load', entryId: params.entryId, version: params.version };
    case 'library_list':
      return { kind: 'library_list' };
    case 'library_set_version':
      if (!params.loopId) return { error: 'library_set_version requires a loopId' };
      if (params.version === undefined) return { error: 'library_set_version requires a version' };
      return { kind: 'library_set_version', loopId: params.loopId, version: params.version };
    case 'library_unlink':
      if (!params.loopId) return { error: 'library_unlink requires a loopId' };
      return { kind: 'library_unlink', loopId: params.loopId };
    case 'library_delete':
      if (!params.entryId) return { error: 'library_delete requires an entryId' };
      return { kind: 'library_delete', entryId: params.entryId };
    case 'catalog_list':
      return { kind: 'catalog_list' };
    case 'catalog_add_repo':
      if (!params.url) return { error: 'catalog_add_repo requires a url' };
      return { kind: 'catalog_add_repo', url: params.url };
    case 'catalog_remove_repo':
      if (!params.repoKey) return { error: 'catalog_remove_repo requires a repoKey' };
      return { kind: 'catalog_remove_repo', repoKey: params.repoKey };
    case 'catalog_refresh':
      return { kind: 'catalog_refresh', repoKey: params.repoKey };
    case 'catalog_install':
      if (!params.repoKey) return { error: 'catalog_install requires a repoKey' };
      if (!params.slug) return { error: 'catalog_install requires a slug' };
      return { kind: 'catalog_install', repoKey: params.repoKey, slug: params.slug, workspaceLoad: params.workspaceLoad };
    case 'delete':
      if (!params.loopId) return { error: 'delete requires a loopId' };
      return { kind: 'delete', loopId: params.loopId, deleteBranch: params.deleteBranch };
    default: {
      if (!params.loopId) return { error: `${params.action} requires a loopId` };
      // The switch guarantees params.action is one of the single-loopId kinds
      // (show/activate/disable/enable/run_next/run_again/retry/reflect), all of
      // shape { kind; loopId }.
      return { kind: params.action, loopId: params.loopId } as OrchestratorAction;
    }
  }
}

function summarize(action: OrchestratorAction, res: OrchestratorActionResult): string {
  if (!res.ok) return `Error: ${res.error ?? 'unknown error'}`;
  switch (action.kind) {
    case 'create':
      return `Created loop ${res.loop?.id} — "${res.loop?.title}" (status: ${res.loop?.status}).`;
    case 'list':
      return `${res.loops?.length ?? 0} loop(s).`;
    case 'show':
      return `Loop ${res.loop?.id} — "${res.loop?.title}" (status: ${res.loop?.status}).`;
    case 'delete':
      return `Deleted loop ${action.loopId}.`;
    case 'reflect':
      return `Reflected loop ${action.loopId} — ${res.reflection?.suggestionCount ?? 0} suggestion(s) for review.`;
    case 'reflect_workspace':
      return `Reflected ${res.workspaceReflection?.reflected ?? 0} loop(s) — ${res.workspaceReflection?.suggestionCount ?? 0} suggestion(s) for review.`;
    case 'choose_suggestion':
      return `Suggestion ${action.decision === 'approve' ? 'approved and applied' : 'rejected'}.`;
    case 'answer_input':
      return `Answer recorded for loop ${action.loopId} — ${res.loop?.runtime.pendingInput ? 'more questions are waiting' : `loop now "${res.loop?.status ?? '?'}"`}.`;
    case 'retry_step':
      return `Retried step "${action.stepId}" — loop ${action.loopId} now "${res.loop?.status ?? '?'}".`;
    case 'set_delivery':
      return `Loop ${action.loopId} now delivers to "${action.delivery.destination}".`;
    case 'set_schedule': {
      const trigger = res.loop?.triggers.find((t) => t.id === action.triggerId);
      return `Loop ${action.loopId} schedule is now "${trigger?.schedule}"${trigger?.scheduleDisabled ? ' (paused)' : ''} — next fire ${trigger?.nextFireAt ?? 'n/a'}.`;
    }
    case 'library_save':
      return `Saved loop to the library (now ${res.loop?.libraryLink ? `v${res.loop.libraryLink.version}` : 'linked'}).`;
    case 'library_load':
      return `Loaded library entry ${action.entryId} into loop ${res.loop?.id} (status: ${res.loop?.status}).`;
    case 'library_list':
      return `${res.libraryIndex?.entries.length ?? 0} library entr(ies).`;
    case 'library_set_version':
      return `Loop ${action.loopId} switched to library v${action.version}.`;
    case 'library_unlink':
      return `Loop ${action.loopId} unlinked from the library.`;
    case 'library_delete':
      return `Deleted library entry ${action.entryId}.`;
    case 'catalog_list': {
      const entries = (res.catalogContents ?? []).reduce((n, c) => n + c.entries.length, 0);
      return `${res.catalogRepos?.length ?? 0} catalog repo(s), ${entries} entr(ies). Fetch happens on demand — run catalog_refresh to pull.`;
    }
    case 'catalog_add_repo':
      return `Added catalog repo ${action.url}. Run catalog_refresh to fetch it.`;
    case 'catalog_remove_repo':
      return `Removed catalog repo ${action.repoKey} (installed loops keep their library copies).`;
    case 'catalog_refresh': {
      const failed = (res.catalogRefresh ?? []).filter((r) => r.reason);
      const applied = (res.catalogUpdates ?? []).filter((u) => u.libraryVersion !== undefined);
      const skipped = (res.catalogUpdates ?? []).filter((u) => u.skipped);
      const parts = [
        failed.length === 0
          ? `Refreshed ${res.catalogRefresh?.length ?? 0} catalog repo(s).`
          : `Refreshed with issues: ${failed.map((r) => `${r.key} (${r.stale ? 'showing last-fetched copy' : 'never fetched'}: ${r.reason})`).join('; ')}.`,
      ];
      if (applied.length > 0) parts.push(`${applied.length} installed loop(s) have a new version available.`);
      if (skipped.length > 0) parts.push(`Skipped invalid update(s): ${skipped.map((u) => `${u.repoKey}/${u.slug}`).join(', ')}.`);
      return parts.join(' ');
    }
    case 'catalog_install':
      return res.loop
        ? `Installed "${res.loop.title}" as a draft loop ${res.loop.id} — ${res.loop.runtime.pendingInput ? 'it has questions to adapt it to this workspace' : 'review the plan, then activate'}.`
        : `Installed ${action.repoKey}/${action.slug} into the library.`;
    case 'fire_event':
      return res.deduped
        ? `Dropped ${action.event.source} — an event with the same dedupeKey was already delivered.`
        : `Fired ${action.event.source} — accepted by ${res.delivered ?? 0} loop(s).`;
    default:
      return `${action.kind} ok — loop ${res.loop?.id ?? action.loopId} now "${res.loop?.status ?? '?'}".`;
  }
}

/** Executes a tool invocation against the coordinator resolved from cwd. */
export async function executeOrchestratorTool(
  params: OrchestratorToolParamsShape,
  cwd: string | undefined,
  resolve: (cwd: string) => Coordinator | undefined = resolveCoordinatorByCwd,
): Promise<ToolResult> {
  if (!cwd) return errorResult('No workspace context (cwd) available for this invocation.');
  const coordinator = resolve(cwd);
  if (!coordinator) {
    return errorResult(
      'Orchestrator runtime is not loaded for this workspace. Open the workspace in Sero before running Orchestrator actions.',
    );
  }
  const action = buildAction(params);
  if ('error' in action) return errorResult(action.error);
  const res = await coordinator.requestAction(action);
  return result(summarize(action, res), res as unknown as Record<string, unknown>);
}
