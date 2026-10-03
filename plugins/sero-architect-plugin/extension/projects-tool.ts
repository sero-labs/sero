/**
 * The `architect_projects` tool: the USER's management surface, driven from a
 * chat or the CLI. The project page calls the same runtime actions.
 */

import { StringEnum } from '@earendil-works/pi-ai';
import { MODEL_TIERS, THINKING_LEVELS } from '@sero-ai/common';
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Text } from '@earendil-works/pi-tui';
import { Type } from 'typebox';

import { CONTROL_OPERATIONS, type ControlOperation } from '../runtime/linked-work';
import { resolveArchitectRuntime } from '../runtime/registry';
import type { ModelDefaultInput } from '../runtime/model-default-actions';
import type { ProjectsActions } from '../runtime/projects-actions';
import type { TraceQuery } from '../runtime/trace-query';
import { AUTONOMY_SETTINGS } from '../shared/charter-shape';
import { EXECUTION_MODES, type ExecutionMode, type ProjectRecord } from '../shared/record';
import type { ArchitectIndexEntry } from '../shared/types';
import { callerSignals } from './owner-tool';

export const PROJECT_ACTIONS = [
  'list',
  'show',
  'history',
  'trace',
  'feedback',
  'watch_owner',
  'unwatch_owner',
  'watch_room',
  'unwatch_room',
  'create',
  'request_change',
  'enable_openspec',
  'pause',
  'resume',
  'repair',
  'retry',
  'preview',
  'stop',
  'control',
  'raise_cap',
  'set_autonomy',
  'set_execution_mode',
  'set_model_tier',
  'clear_model_tier',
  'refresh_model_tiers',
  'approve',
  'answer',
  'directive',
  'delete',
] as const;

const APPROVE_TARGETS = ['charter', 'milestone'] as const;

export const PROJECTS_TOOL_DESCRIPTION = `Manage Sero Architect projects. Actions: ${PROJECT_ACTIONS.join(', ')}.`;

export const ProjectsToolParams = Type.Object({
  action: StringEnum(PROJECT_ACTIONS, { description: `One of: ${PROJECT_ACTIONS.join(', ')}` }),
  projectId: Type.Optional(Type.String({ description: 'Project ID. Required for every action except list and create' })),
  idea: Type.Optional(Type.String({ description: 'create: the idea, in the user\'s own words' })),
  openSpecEnabled: Type.Optional(Type.Boolean({ description: 'create: enable the OpenSpec proof of concept for this Architect project' })),
  folder: Type.Optional(Type.String({ description: 'create: the new folder to build in, under the home directory. Not used when workspaceId is given' })),
  workspaceId: Type.Optional(Type.String({ description: 'create: an existing registered workspace to work in, instead of a new folder' })),
  capUsd: Type.Optional(Type.Number({ description: 'create: the start cap in USD the user set; with it the user approves the start once and no charter is proposed. raise_cap: the project cap; retry: an explicitly approved new total Workflow cap in USD' })),
  executionMode: Type.Optional(StringEnum(EXECUTION_MODES, { description: 'create/set_execution_mode: workspace or worktree; new projects default to workspace' })),
  models: Type.Optional(Type.Array(Type.Object({
    tier: StringEnum(MODEL_TIERS),
    model: Type.String({ description: 'provider/modelId' }),
    thinking: Type.Optional(StringEnum(THINKING_LEVELS)),
  }), { description: 'create: project model overrides per tier, checked against the catalogue' })),
  autonomy: Type.Optional(StringEnum(AUTONOMY_SETTINGS, { description: 'set_autonomy: milestones, charter-only or model-judged' })),
  tier: Type.Optional(StringEnum(MODEL_TIERS, { description: 'set_model_tier/clear_model_tier: LOW, MED or HIGH' })),
  model: Type.Optional(Type.String({ description: 'set_model_tier: the model as provider/modelId' })),
  thinking: Type.Optional(StringEnum(THINKING_LEVELS, { description: 'set_model_tier: the thinking level for that model' })),
  target: Type.Optional(StringEnum(APPROVE_TARGETS, { description: 'approve: charter or milestone' })),
  milestoneId: Type.Optional(Type.String({ description: 'approve/retry: the milestone id' })),
  decisionId: Type.Optional(Type.String({ description: 'answer: the decision id' })),
  optionId: Type.Optional(Type.String({ description: 'answer: the chosen option id' })),
  note: Type.Optional(Type.String({ description: 'answer: an optional note for the owner' })),
  text: Type.Optional(Type.String({ description: 'directive: what to tell the owner; request_change: the next change to make' })),
  cursor: Type.Optional(Type.String({ description: 'history: cursor for an older page' })),
  runId: Type.Optional(Type.String({ description: 'trace: the run id, shared for project-scoped activity, or lifetime for every run (default shared)' })),
  afterSeq: Type.Optional(Type.Number({ description: 'trace: continue a detail page after this sequence' })),
  limit: Type.Optional(Type.Number({ description: 'trace: records per detail page; the runtime bounds it' })),
  detail: Type.Optional(Type.Boolean({ description: 'trace: include record metadata. Off by default, so a summary request receives no records' })),
  knownSpendUsd: Type.Optional(Type.Number({ description: 'trace: the project spend to reconcile the run total against' })),
  workflowId: Type.Optional(Type.String({ description: 'repair: existing workflow selected by the user' })),
  roomId: Type.Optional(Type.String({ description: 'watch_room/unwatch_room: a Room this project started' })),
  observerId: Type.Optional(Type.String({ description: 'watch_*/unwatch_*: the id of the open view that holds the watch' })),
  workId: Type.Optional(Type.String({ description: 'control: the milestone id or research id whose Room or Workflow is controlled' })),
  operation: Type.Optional(StringEnum(CONTROL_OPERATIONS, { description: 'control: pause, resume, retry or cancel' })),
  maxMinutes: Type.Optional(Type.Number({ description: 'control resume: a larger total working-time limit in minutes for a Room that used its time' })),
});

export interface ProjectsToolParamsShape {
  action: (typeof PROJECT_ACTIONS)[number];
  projectId?: string;
  roomId?: string;
  observerId?: string;
  idea?: string;
  openSpecEnabled?: boolean;
  folder?: string;
  workspaceId?: string;
  capUsd?: number;
  executionMode?: ExecutionMode;
  models?: ModelDefaultInput[];
  autonomy?: (typeof AUTONOMY_SETTINGS)[number];
  tier?: (typeof MODEL_TIERS)[number];
  model?: string;
  thinking?: (typeof THINKING_LEVELS)[number];
  target?: (typeof APPROVE_TARGETS)[number];
  milestoneId?: string;
  decisionId?: string;
  optionId?: string;
  note?: string;
  text?: string;
  cursor?: string;
  workflowId?: string;
  workId?: string;
  operation?: ControlOperation;
  maxMinutes?: number;
  /** Trace query. `detail` is opt-in, so a summary request reads no records. */
  runId?: string;
  afterSeq?: number;
  limit?: number;
  detail?: boolean;
  knownSpendUsd?: number;
}

interface ToolResult {
  content: { type: 'text'; text: string }[];
  details: Record<string, unknown>;
}

const result = (ok: boolean, text: string, details: Record<string, unknown> = {}): ToolResult => ({
  content: [{ type: 'text', text: ok ? text : `Error: ${text}` }],
  details: { ok, ...details },
});

export function formatIndex(projects: ArchitectIndexEntry[]): string {
  if (projects.length === 0) return 'No Architect projects yet.';
  return projects
    .map((p) => {
      const state = p.overlay ? `${p.phase} · ${p.overlay}` : p.phase;
      const spend = p.capUsd === null ? `$${p.spentUsd.toFixed(2)}` : `$${p.spentUsd.toFixed(2)} of $${p.capUsd}`;
      const needs = p.needsYou ? ` · needs you: ${p.needsYou}` : '';
      const line = [p.activity.headline, p.activity.action].filter(Boolean).join('. ');
      return `${p.name} (${p.id}) [${state}] ${spend}${needs}\n  ${line}`;
    })
    .join('\n');
}

/** The authority the project runs under: its agreement, or the charter of the deprecated flow. */
function agreementLine(record: ProjectRecord): string {
  const { agreement, charter } = record;
  if (agreement) {
    const state = agreement.approvedAt && agreement.authority
      ? `approved ${agreement.approvedAt} (revision ${agreement.revision})`
      : agreement.refusedAt ? 'not approved; resume to ask again' : 'waiting for the start approval';
    return `Agreement: $${agreement.capUsd} start cap, ${state}`;
  }
  const state = charter ? `${charter.approvedAt ? 'approved' : 'waiting for approval'} (autonomy ${charter.autonomy})` : 'none yet';
  return `Charter: ${state}. This project uses the charter flow, which is deprecated.`;
}

function formatRecord(record: ProjectRecord): string {
  const open = record.decisions.filter((d) => d.answer === null);
  return [
    `${record.name} (${record.id}): ${record.phase}${record.overlay ? ` · ${record.overlay}` : ''}`,
    record.stateLine,
    `Folder: ${record.folder}`,
    `Execution location: ${record.executionMode ?? 'choose in project settings'}`,
    `Budget: $${record.budget.spentUsd.toFixed(2)} spent${record.budget.capUsd === null ? ', no cap yet' : ` of $${record.budget.capUsd}`}`,
    agreementLine(record),
    ...(record.working ? [`Working objective (revision ${record.working.revision}): ${record.working.objective}`] : []),
    ...record.milestones.map((m) => `- ${m.id} ${m.title}: ${m.status}${m.dispatch ? ` (${m.dispatch.kind} ${m.dispatch.id})` : ''}`),
    ...open.map((d) => `Decision ${d.id}: ${d.question} [${d.options.map((o) => `${o.id}: ${o.label}`).join('; ')}] recommended ${d.recommendation}`),
    ...record.directives.filter((d) => d.reply === null).map((d) => `Directive ${d.id} awaits a reply`),
  ].join('\n');
}

export async function executeProjectsTool(params: ProjectsToolParamsShape, ctx?: ExtensionContext): Promise<ToolResult> {
  const runtime = resolveArchitectRuntime();
  if (!runtime) return result(false, 'The Architect runtime is not running.');
  // The owner session loads this plugin whole, so the management tool arrives
  // with it. An owner that could approve its own charter, raise its own cap or
  // answer its own decisions would make every user gate optional.
  const owner = await runtime.owner.owns(callerSignals(ctx));
  if (owner) return result(false, `The architect_projects tool is for the user. This session owns project ${owner.id}; use the architect tool.`);
  const actions = runtime.projects;
  const id = params.projectId ?? '';
  const need = (value: string | undefined, name: string): string | null => (value?.trim() ? null : `${name} is required for ${params.action}.`);
  switch (params.action) {
    case 'list':
      return result(true, formatIndex(await actions.list()));
    case 'show': {
      const missing = need(id, 'projectId');
      if (missing) return result(false, missing);
      const record = await actions.show(id);
      return record ? result(true, formatRecord(record)) : result(false, `No project ${id}.`);
    }
    case 'history': {
      const missing = need(id, 'projectId');
      if (missing) return result(false, missing);
      const page = await actions.history(id, params.cursor);
      return page
        ? result(true, `Read ${page.entries.length} owner-session history entries.`, { entries: page.entries, olderCursor: page.olderCursor })
        : result(false, `Project ${id} has no readable owner session.`);
    }
    case 'feedback': {
      // With no project named it answers for every project, which is what a list reads.
      const feedback = await actions.feedback(id || undefined);
      return result(true, `${feedback.snapshots.length} work item(s) reported.`, { ...(id ? { projectId: id } : {}), feedback });
    }
    case 'watch_owner':
    case 'unwatch_owner':
    case 'watch_room':
    case 'unwatch_room':
      return watchAction(actions, params.action, id, params.roomId ?? '', params.observerId ?? '');
    case 'trace': {
      const missing = need(id, 'projectId');
      if (missing) return result(false, missing);
      if (params.runId === 'lifetime') {
        const lifetime = await actions.lifetime(id, params.knownSpendUsd);
        return lifetime
          ? result(true, 'Project lifetime totals.', { projectId: lifetime.projectId, lifetime })
          : result(false, `No project ${id}, or it keeps no trace.`);
      }
      const query: Omit<TraceQuery, 'projectId'> = {
        journalId: params.runId,
        afterSeq: params.afterSeq,
        limit: params.limit,
        knownSpendUsd: params.knownSpendUsd,
        detail: params.detail === true,
      };
      const answer = await actions.trace(id, query);
      if (!answer) return result(false, `No project ${id}, or it keeps no trace.`);
      const details: Record<string, unknown> = {
        projectId: answer.projectId,
        journalId: answer.journalId,
        recorded: answer.recorded,
        summary: answer.summary,
        timing: answer.timing,
        tokens: answer.tokens,
        records: answer.records,
        nextAfterSeq: answer.nextAfterSeq,
        incomplete: answer.incomplete,
        activity: answer.activity,
        linkedSharedUsd: answer.linkedSharedUsd,
      };
      return result(true, answer.summary.incomplete ? 'Trace summary. More history exists than this folded.' : 'Trace summary.', details);
    }
    case 'create': {
      const missing = need(params.idea, 'idea') ?? (params.workspaceId ? null : need(params.folder, 'folder'));
      if (missing) return result(false, missing);
      const outcome = await actions.create({
        idea: params.idea ?? '',
        executionMode: params.executionMode,
        openSpecEnabled: params.openSpecEnabled,
        models: params.models,
        ...(params.capUsd !== undefined ? { capUsd: params.capUsd } : {}),
        ...(params.folder !== undefined ? { folder: params.folder } : {}),
        ...(params.workspaceId !== undefined ? { workspaceId: params.workspaceId } : {}),
      });
      return result(outcome.ok, outcome.text, outcome.ok ? { projectId: outcome.projectId } : {});
    }
    case 'preview': {
      const missing = need(id, 'projectId');
      if (missing) return result(false, missing);
      const outcome = await actions.preview(id);
      return result(outcome.ok, outcome.text, { url: outcome.url });
    }
    case 'retry': {
      const missing = need(id, 'projectId') ?? need(params.milestoneId, 'milestoneId');
      if (missing) return result(false, missing);
      const outcome = await actions.retry(id, params.milestoneId ?? '', params.capUsd);
      return result(outcome.ok, outcome.text);
    }
    case 'repair': {
      const missing = need(id, 'projectId');
      if (missing) return result(false, missing);
      const outcome = await actions.repair(id, params.workflowId);
      return result(outcome.ok, outcome.text, { candidates: outcome.candidates ?? [] });
    }
    case 'pause':
    case 'resume':
    case 'stop':
    case 'delete': {
      const missing = need(id, 'projectId');
      if (missing) return result(false, missing);
      const outcome = await actions[params.action](id);
      return result(outcome.ok, outcome.text);
    }
    case 'control': {
      const missing = need(id, 'projectId') ?? need(params.workId, 'workId') ?? need(params.operation, 'operation');
      if (missing || !params.operation) return result(false, missing ?? 'operation is required.');
      const outcome = await actions.control(id, params.workId ?? '', params.operation, { maxMinutes: params.maxMinutes, maxCostUsd: params.capUsd });
      return result(outcome.ok, outcome.text);
    }
    case 'raise_cap': {
      const missing = need(id, 'projectId');
      if (missing) return result(false, missing);
      if (params.capUsd === undefined) return result(false, 'capUsd is required for raise_cap.');
      const outcome = await actions.raiseCap(id, params.capUsd);
      return result(outcome.ok, outcome.text);
    }
    case 'set_execution_mode': {
      const missing = need(id, 'projectId');
      if (missing) return result(false, missing);
      if (!params.executionMode) return result(false, 'executionMode is required.');
      const outcome = await actions.setExecutionMode(id, params.executionMode);
      return result(outcome.ok, outcome.text);
    }
    case 'set_autonomy': {
      const missing = need(id, 'projectId');
      if (missing) return result(false, missing);
      if (!params.autonomy) return result(false, 'autonomy is required for set_autonomy.');
      const outcome = await actions.setAutonomy(id, params.autonomy);
      return result(outcome.ok, outcome.text);
    }
    case 'set_model_tier': {
      const missing = need(id, 'projectId');
      if (missing) return result(false, missing);
      if (!params.tier) return result(false, 'tier is required for set_model_tier: LOW, MED or HIGH.');
      if (!params.model) return result(false, 'model is required for set_model_tier, as provider/modelId.');
      const modelInput: ModelDefaultInput = { tier: params.tier, model: params.model };
      if (params.thinking) modelInput.thinking = params.thinking;
      const outcome = await actions.setModelDefault(id, modelInput);
      return result(outcome.ok, outcome.text);
    }
    case 'clear_model_tier': {
      const missing = need(id, 'projectId');
      if (missing) return result(false, missing);
      if (!params.tier) return result(false, 'tier is required for clear_model_tier: LOW, MED or HIGH.');
      const outcome = await actions.clearModelDefault(id, params.tier);
      return result(outcome.ok, outcome.text);
    }
    case 'refresh_model_tiers': {
      const missing = need(id, 'projectId');
      if (missing) return result(false, missing);
      const outcome = await actions.refreshModelTiers(id);
      return result(outcome.ok, outcome.text, outcome.tiers ? { tiers: outcome.tiers } : {});
    }
    case 'approve': {
      const missing = need(id, 'projectId');
      if (missing) return result(false, missing);
      if (!params.target) return result(false, 'target is required for approve: charter or milestone.');
      const outcome = await actions.approve(id, params.target, params.milestoneId);
      return result(outcome.ok, outcome.text);
    }
    case 'answer': {
      const missing = need(id, 'projectId') ?? need(params.decisionId, 'decisionId') ?? need(params.optionId, 'optionId');
      if (missing) return result(false, missing);
      const outcome = await actions.answer(id, params.decisionId ?? '', params.optionId ?? '', params.note);
      return result(outcome.ok, outcome.text);
    }
    case 'directive': {
      const missing = need(id, 'projectId') ?? need(params.text, 'text');
      if (missing) return result(false, missing);
      const outcome = await actions.directive(id, params.text ?? '');
      return result(outcome.ok, outcome.text);
    }
    case 'request_change': {
      const missing = need(id, 'projectId') ?? need(params.text, 'text');
      if (missing) return result(false, missing);
      const outcome = await actions.requestChange(id, params.text ?? '');
      return result(outcome.ok, outcome.text);
    }
    case 'enable_openspec': {
      const missing = need(id, 'projectId');
      if (missing) return result(false, missing);
      const outcome = await actions.enableOpenSpec(id);
      return result(outcome.ok, outcome.text);
    }
  }
}

export function registerProjectsTool(pi: ExtensionAPI): void {
  const tool: ToolDefinition<typeof ProjectsToolParams> = {
    name: 'architect_projects',
    label: 'Architect projects',
    description: PROJECTS_TOOL_DESCRIPTION,
    parameters: ProjectsToolParams,
    execute: (_id, params, _signal, _onUpdate, ctx) => executeProjectsTool(params, ctx),
    renderCall(args, theme) {
      return new Text(theme.fg('toolTitle', theme.bold('architect_projects ')) + theme.fg('muted', args.action), 0, 0);
    },
    renderResult(res, _options, theme) {
      const first = res.content[0];
      return new Text(theme.fg('muted', first?.type === 'text' ? first.text : ''), 0, 0);
    },
  };
  pi.registerTool(tool);
}

/**
 * The live watch a Work view holds while it is open. It returns where the turn
 * stands now; later changes are pushed to the view. Only a view calls these.
 */
async function watchAction(actions: ProjectsActions, action: string, projectId: string, roomId: string, observerId: string): Promise<ToolResult> {
  const watch = actions.workWatch;
  if (!watch) return result(false, 'Live watch is not available in this runtime.');
  if (!projectId || !observerId) return result(false, `${action} needs projectId and observerId.`);
  if (action === 'watch_owner') return result(true, 'Watching Architect.', { ownerLive: watch.watchOwner(projectId, observerId) });
  if (action === 'unwatch_owner') {
    watch.unwatchOwner(projectId, observerId);
    return result(true, 'Stopped watching Architect.');
  }
  if (!roomId) return result(false, `${action} needs roomId.`);
  if (action === 'unwatch_room') {
    await watch.unwatchRoom(projectId, roomId, observerId);
    return result(true, 'Stopped watching the Room.');
  }
  const members = await watch.watchRoom(projectId, roomId, observerId);
  return members
    ? result(true, `Watching ${members.length} member(s).`, { roomId, members })
    : result(false, 'This Room cannot be watched from this project now.');
}
