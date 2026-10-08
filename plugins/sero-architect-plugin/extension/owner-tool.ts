/**
 * The `architect` tool: the owner session's one door to the runtime. It holds
 * no logic. It shapes flat CLI parameters into an action and hands them to the
 * runtime, which resolves the caller from its session file and refuses a
 * foreign project id.
 */

import { StringEnum } from '@earendil-works/pi-ai';
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Text } from '@earendil-works/pi-tui';
import { Type } from 'typebox';

import { resolveArchitectRuntime } from '../runtime/registry';
import { AUTONOMY_SETTINGS } from '../shared/charter-shape';
import { OVERVIEW_FIELDS } from '../shared/agreement';
import { SUMMARY_SOURCE_KINDS } from '../runtime/owner-summary';
import {
  DISPATCH_DESTINATIONS,
  DISPATCH_KINDS,
  EVIDENCE_RESERVED_KEYS,
  OWNER_ACTIONS,
  type OwnerActionInput,
  type OwnerCallerSignals,
} from '../shared/owner-actions';

const DO_NOT_SET = 'Do not set. Evidence is produced by the runtime; a call carrying this is refused.';

/**
 * The reserved evidence names the schema carries on purpose. The CLI bridge
 * drops flags the schema does not define, so the only way to refuse a call
 * that tries to attach an exit code is to accept the field and then refuse it.
 */
const RESERVED_IN_SCHEMA = ['exitCode', 'capturePath', 'diffSummary'] as const satisfies readonly (typeof EVIDENCE_RESERVED_KEYS)[number][];

export const OwnerToolParams = Type.Object({
  action: StringEnum(OWNER_ACTIONS, { description: 'Action to run: brief, working, summary, charter, milestone, decide, research, dispatch, work, control, evidence, status, reply, blocked or sleep' }),
  projectId: Type.String({ description: 'The project this session owns. Every call carries it' }),
  runId: Type.Optional(Type.String({ description: 'milestone/sleep: the maintenance run id from the contract' })),
  noWorkNeeded: Type.Optional(Type.Boolean({ description: 'sleep: close runId as no work needed after triage; requires text explaining why' })),
  text: Type.Optional(Type.String({ description: 'brief/summary/status/reply/blocked/sleep: the text, on one line. work report: what you completed' })),
  textJson: Type.Optional(Type.String({ description: 'brief/reply: the text as one JSON string, in place of text, when it has more than one line. Write a newline as \\n and a double quote as \\u0022' })),
  planJson: Type.Optional(Type.String({ description: 'milestone: the plan as one JSON string, in place of plan, when it has more than one line' })),
  approachJson: Type.Optional(Type.String({ description: 'working: the approach as one JSON string, in place of approach, when it has more than one line' })),
  field: Type.Optional(StringEnum(OVERVIEW_FIELDS, { description: 'summary: which short overview sentence to write: outcome (what the user will get), objective (what you work on now), result (what there is to use) or acknowledgement (your answer to the last instruction)' })),
  sourceKind: Type.Optional(StringEnum(SUMMARY_SOURCE_KINDS, { description: 'summary: the kind of work the sentence is about; required for result and acknowledgement' })),
  sourceId: Type.Optional(Type.String({ description: 'summary: the id of that milestone, research, evidence milestone or directive; any value for plan' })),
  title: Type.Optional(Type.String({ description: 'milestone: the title (required for a new milestone)' })),
  milestoneId: Type.Optional(Type.String({ description: 'milestone/dispatch/work/evidence: the milestone id' })),
  plan: Type.Optional(Type.String({ description: 'milestone: the plan, including the acceptance criteria an evaluator can check against the result' })),
  previewRoute: Type.Optional(Type.String({ description: 'milestone: the route a preview milestone must render, e.g. /' })),
  done: Type.Optional(Type.Boolean({ description: 'milestone: set true to accept it after evidence passes' })),
  milestonesJson: Type.Optional(Type.String({ description: 'charter: JSON [{"title":"...","plan":"..."}]; optional previewRoute only for browser milestones' })),
  escalationPolicy: Type.Optional(Type.String({ description: 'charter: what you raise to the user and what you decide yourself' })),
  autonomy: Type.Optional(StringEnum(AUTONOMY_SETTINGS, { description: 'charter: milestones (default), charter-only or model-judged' })),
  capUsd: Type.Optional(Type.Number({ description: 'charter: the cost cap in USD (required)' })),
  objective: Type.Optional(Type.String({ description: 'working: what the work must achieve, in one or two sentences' })),
  approach: Type.Optional(Type.String({ description: 'working: how you intend to do it now. Revise it when findings change it' })),
  assumptionsJson: Type.Optional(Type.String({ description: 'working: JSON [{"text":"...","why":"..."}], the choices you made without asking; why is optional and shown to the user next to the choice' })),
  criteriaJson: Type.Optional(Type.String({ description: 'working: JSON [{"id":"c1","text":"...","userStated":true}]. Set userStated true for a requirement the user stated; it cannot be removed without a user decision' })),
  question: Type.Optional(Type.String({ description: 'decide/research: the question' })),
  optionsJson: Type.Optional(Type.String({ description: 'decide: JSON [{"id":"a","label":"...","consequence":"..."}]' })),
  recommendation: Type.Optional(Type.String({ description: 'decide: the option id you recommend' })),
  reason: Type.Optional(Type.String({ description: 'decide: why the user must answer this; working: what you learned that changed the interpretation' })),
  parks: Type.Optional(Type.String({ description: 'decide: milestone ids to park, comma-separated' })),
  stoppingCondition: Type.Optional(Type.String({ description: 'research: when the researcher should stop' })),
  changeName: Type.Optional(Type.String({ description: 'openspec/research: the OpenSpec change linked to a milestone; research requires a read-only Room' })),
  operation: Type.Optional(StringEnum(['status', 'instructions', 'validate', 'pause', 'resume', 'retry', 'cancel', 'begin', 'continue', 'report', 'wait'] as const, { description: 'openspec: status, instructions or validate. control: pause, resume, retry or cancel. work: begin, continue, report or wait' })),
  executionId: Type.Optional(Type.String({ description: 'work continue/report: the execution id that begin returned' })),
  target: Type.Optional(Type.String({ description: 'control/work wait: the milestone id or research id whose Room or Workflow you control or wait for' })),
  source: Type.Optional(Type.String({ description: 'work wait: child (the target\'s Room or Workflow). process and ci cannot be monitored yet and are refused' })),
  deadlineMinutes: Type.Optional(Type.Number({ description: 'work wait: end the wait as expired after this many minutes' })),
  maxMinutes: Type.Optional(Type.Number({ description: 'control resume: a larger total working-time limit in minutes for a Room that used its time. The user decides' })),
  artifact: Type.Optional(StringEnum(['proposal', 'specs', 'design', 'tasks', 'apply'] as const, { description: 'openspec instructions: artifact to prepare' })),
  needsCommands: Type.Optional(Type.Boolean({ description: 'research, kind room only: true when the question can only be answered by running commands such as tests or builds. The Room then gets edit-workspace access, each member in its own worktree' })),
  kind: Type.Optional(StringEnum(DISPATCH_KINDS, { description: 'dispatch/research: room for investigation, solution planning or adversarial review by specialists; workflow for a structured execution flow toward an accepted objective; omitted research uses one researcher' })),
  prompt: Type.Optional(Type.String({ description: 'dispatch: the objective, the approved constraints and the acceptance criteria. The Workflow or Room plans its own execution; do not supply a step-by-step plan' })),
  destination: Type.Optional(StringEnum(DISPATCH_DESTINATIONS, { description: 'dispatch, release only: delivery target. pr and workspace-files run directly. Any other target requires a user decision. work report: workspace-files when your own work is the delivery' })),
  maxCostUsd: Type.Optional(Type.Number({ description: 'dispatch: maximum USD this run may spend. If it exceeds the remaining budget, ask the user first. control retry: a larger total cap for a Workflow that stopped at its cap; the user decides' })),
  commandsJson: Type.Optional(Type.String({ description: 'evidence: JSON array of commands for the runtime to run, e.g. ["pnpm test"]' })),
  route: Type.Optional(Type.String({ description: 'evidence: the route to open for a preview milestone' })),
  criteria: Type.Optional(Type.String({ description: 'evidence: the ids of the working criteria these commands check, comma-separated. A criterion counts as proved only by evidence that names it' })),
  directiveId: Type.Optional(Type.String({ description: 'reply: the directive id from the contract' })),
  exitCode: Type.Optional(Type.Number({ description: DO_NOT_SET })),
  capturePath: Type.Optional(Type.String({ description: DO_NOT_SET })),
  diffSummary: Type.Optional(Type.String({ description: DO_NOT_SET })),
});

export interface OwnerToolParamsShape {
  action: (typeof OWNER_ACTIONS)[number];
  projectId: string;
  text?: string;
  textJson?: string;
  planJson?: string;
  approachJson?: string;
  field?: (typeof OVERVIEW_FIELDS)[number];
  sourceKind?: (typeof SUMMARY_SOURCE_KINDS)[number];
  sourceId?: string;
  runId?: string;
  noWorkNeeded?: boolean;
  title?: string;
  milestoneId?: string;
  plan?: string;
  previewRoute?: string;
  done?: boolean;
  milestonesJson?: string;
  escalationPolicy?: string;
  autonomy?: (typeof AUTONOMY_SETTINGS)[number];
  capUsd?: number;
  objective?: string;
  approach?: string;
  assumptionsJson?: string;
  criteriaJson?: string;
  question?: string;
  optionsJson?: string;
  recommendation?: string;
  reason?: string;
  parks?: string;
  stoppingCondition?: string;
  changeName?: string;
  operation?: 'status' | 'instructions' | 'validate' | 'pause' | 'resume' | 'retry' | 'cancel' | 'begin' | 'continue' | 'report' | 'wait';
  executionId?: string;
  target?: string;
  source?: string;
  deadlineMinutes?: number;
  maxMinutes?: number;
  artifact?: 'proposal' | 'specs' | 'design' | 'tasks' | 'apply';
  needsCommands?: boolean;
  kind?: (typeof DISPATCH_KINDS)[number];
  prompt?: string;
  destination?: (typeof DISPATCH_DESTINATIONS)[number];
  maxCostUsd?: number;
  commandsJson?: string;
  route?: string;
  criteria?: string;
  directiveId?: string;
  exitCode?: number;
  capturePath?: string;
  diffSummary?: string;
}

interface ToolResult {
  content: { type: 'text'; text: string }[];
  details: Record<string, unknown>;
}

const result = (ok: boolean, text: string, details: Record<string, unknown> = {}): ToolResult => ({
  content: [{ type: 'text', text: ok ? text : `Error: ${text}` }],
  details: { ok, ...details },
});

function parseCommands(raw: string | undefined): string[] | { error: string } {
  if (raw === undefined) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((entry) => typeof entry === 'string')) return { error: 'commandsJson must be a JSON array of strings.' };
    return parsed;
  } catch {
    return { error: 'commandsJson is not valid JSON.' };
  }
}

/**
 * A document that has more than one line cannot travel as a plain flag: the CLI
 * bridge runs one command per line, so a newline inside a flag ends the
 * command. The owner sends such a text as one JSON string instead, and this
 * decodes it. Nothing is parsed out of the text; it is stored as written.
 */
function decodeDocument(plain: string | undefined, json: string | undefined, name: string): string | undefined | { error: string } {
  if (json === undefined) return plain;
  if (plain !== undefined) return { error: `Give ${name} or ${name}Json, not both.` };
  try {
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed === 'string') return parsed;
  } catch {
    // Reported below with the same guidance.
  }
  return { error: `${name}Json must be one JSON string. Write a newline as \\n and a double quote inside the text as \\u0022.` };
}

export function buildOwnerActionInput(params: OwnerToolParamsShape): OwnerActionInput | { error: string } {
  const commands = parseCommands(params.commandsJson);
  if (!Array.isArray(commands)) return commands;
  const text = decodeDocument(params.text, params.textJson, 'text');
  if (typeof text === 'object') return text;
  const plan = decodeDocument(params.plan, params.planJson, 'plan');
  if (typeof plan === 'object') return plan;
  const approach = decodeDocument(params.approach, params.approachJson, 'approach');
  if (typeof approach === 'object') return approach;
  const extraKeys = RESERVED_IN_SCHEMA.filter((key) => params[key] !== undefined);
  return {
    action: params.action,
    projectId: params.projectId,
    text,
    field: params.field,
    sourceKind: params.sourceKind,
    sourceId: params.sourceId,
    runId: params.runId,
    noWorkNeeded: params.noWorkNeeded,
    title: params.title,
    milestoneId: params.milestoneId,
    plan,
    previewRoute: params.previewRoute,
    done: params.done,
    milestonesJson: params.milestonesJson,
    escalationPolicy: params.escalationPolicy,
    autonomy: params.autonomy,
    capUsd: params.capUsd,
    objective: params.objective,
    approach,
    assumptionsJson: params.assumptionsJson,
    criteriaJson: params.criteriaJson,
    question: params.question,
    optionsJson: params.optionsJson,
    recommendation: params.recommendation,
    reason: params.reason,
    parks: params.parks?.split(',').map((id) => id.trim()).filter(Boolean),
    stoppingCondition: params.stoppingCondition,
    changeName: params.changeName,
    operation: params.operation,
    executionId: params.executionId,
    target: params.target,
    source: params.source,
    deadlineMinutes: params.deadlineMinutes,
    maxMinutes: params.maxMinutes,
    artifact: params.artifact,
    needsCommands: params.needsCommands,
    kind: params.kind,
    prompt: params.prompt,
    destination: params.destination,
    maxCostUsd: params.maxCostUsd,
    commands,
    route: params.route,
    criteria: params.criteria?.split(',').map((id) => id.trim()).filter(Boolean),
    directiveId: params.directiveId,
    extraKeys: [...extraKeys],
  };
}

/** The session file is the caller signal: the host bound it to one owner subject. */
export function callerSignals(ctx: ExtensionContext | undefined): OwnerCallerSignals {
  return { sessionPath: ctx?.sessionManager.getSessionFile?.() ?? null, cwd: ctx?.cwd ?? null };
}

export async function executeOwnerTool(params: OwnerToolParamsShape, ctx: ExtensionContext | undefined): Promise<ToolResult> {
  const runtime = resolveArchitectRuntime();
  if (!runtime) return result(false, 'The Architect runtime is not running.');
  const input = buildOwnerActionInput(params);
  if ('error' in input) return result(false, input.error);
  const outcome = await runtime.owner.execute(callerSignals(ctx), input);
  return result(outcome.ok, outcome.text, outcome.details);
}

export function registerOwnerTool(pi: ExtensionAPI): void {
  const tool: ToolDefinition<typeof OwnerToolParams> = {
    name: 'architect',
    label: 'Architect',
    description: 'Act on the Architect project you own: brief, working, summary, charter, milestone, decide, research, dispatch, work, control, evidence, status, reply, blocked, sleep. Every call carries projectId.',
    parameters: OwnerToolParams,
    execute: (_id, params, _signal, _onUpdate, ctx) => executeOwnerTool(params, ctx),
    renderCall(args, theme) {
      return new Text(theme.fg('toolTitle', theme.bold('architect ')) + theme.fg('muted', `${args.action} ${args.projectId}`), 0, 0);
    },
    renderResult(res, _options, theme) {
      const first = res.content[0];
      return new Text(theme.fg('muted', first?.type === 'text' ? first.text : ''), 0, 0);
    },
  };
  pi.registerTool(tool);
}
