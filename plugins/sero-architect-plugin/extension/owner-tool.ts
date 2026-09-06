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
  action: StringEnum(OWNER_ACTIONS, { description: 'What to do: brief, charter, milestone, decide, research, dispatch, evidence, status, reply, blocked or sleep' }),
  projectId: Type.String({ description: 'The project this session owns. Every call carries it' }),
  text: Type.Optional(Type.String({ description: 'brief/status/reply/blocked/sleep: the text' })),
  title: Type.Optional(Type.String({ description: 'milestone: the title (required for a new milestone)' })),
  milestoneId: Type.Optional(Type.String({ description: 'milestone/dispatch/evidence: the milestone id' })),
  plan: Type.Optional(Type.String({ description: 'milestone: the plan' })),
  previewRoute: Type.Optional(Type.String({ description: 'milestone: the route a preview milestone must render, e.g. /' })),
  done: Type.Optional(Type.Boolean({ description: 'milestone: accept it on passed evidence' })),
  milestonesJson: Type.Optional(Type.String({ description: 'charter: JSON [{"title":"...","plan":"...","previewRoute":"/"}]' })),
  escalationPolicy: Type.Optional(Type.String({ description: 'charter: what you raise to the user and what you decide yourself' })),
  autonomy: Type.Optional(StringEnum(AUTONOMY_SETTINGS, { description: 'charter: milestones (default), charter-only or model-judged' })),
  capUsd: Type.Optional(Type.Number({ description: 'charter: the cost cap in USD (required)' })),
  question: Type.Optional(Type.String({ description: 'decide/research: the question' })),
  optionsJson: Type.Optional(Type.String({ description: 'decide: JSON [{"id":"a","label":"...","consequence":"..."}]' })),
  recommendation: Type.Optional(Type.String({ description: 'decide: the option id you recommend' })),
  reason: Type.Optional(Type.String({ description: 'decide: why the user must answer this' })),
  parks: Type.Optional(Type.String({ description: 'decide: milestone ids to park, comma-separated' })),
  stoppingCondition: Type.Optional(Type.String({ description: 'research: when the researcher should stop' })),
  kind: Type.Optional(StringEnum(DISPATCH_KINDS, { description: 'dispatch: workflow or room' })),
  prompt: Type.Optional(Type.String({ description: 'dispatch: the Workflow prompt or the Room mandate' })),
  destination: Type.Optional(StringEnum(DISPATCH_DESTINATIONS, { description: 'dispatch, release only: where the run delivers. pr or workspace-files run directly; an external destination becomes a decision for the user' })),
  maxCostUsd: Type.Optional(Type.Number({ description: 'dispatch: what the run may spend; more than the remaining budget becomes a decision for the user' })),
  commandsJson: Type.Optional(Type.String({ description: 'evidence: JSON array of commands for the runtime to run, e.g. ["pnpm test"]' })),
  route: Type.Optional(Type.String({ description: 'evidence: the route to open for a preview milestone' })),
  directiveId: Type.Optional(Type.String({ description: 'reply: the directive id from the contract' })),
  exitCode: Type.Optional(Type.Number({ description: DO_NOT_SET })),
  capturePath: Type.Optional(Type.String({ description: DO_NOT_SET })),
  diffSummary: Type.Optional(Type.String({ description: DO_NOT_SET })),
});

export interface OwnerToolParamsShape {
  action: (typeof OWNER_ACTIONS)[number];
  projectId: string;
  text?: string;
  title?: string;
  milestoneId?: string;
  plan?: string;
  previewRoute?: string;
  done?: boolean;
  milestonesJson?: string;
  escalationPolicy?: string;
  autonomy?: (typeof AUTONOMY_SETTINGS)[number];
  capUsd?: number;
  question?: string;
  optionsJson?: string;
  recommendation?: string;
  reason?: string;
  parks?: string;
  stoppingCondition?: string;
  kind?: (typeof DISPATCH_KINDS)[number];
  prompt?: string;
  destination?: (typeof DISPATCH_DESTINATIONS)[number];
  maxCostUsd?: number;
  commandsJson?: string;
  route?: string;
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

export function buildOwnerActionInput(params: OwnerToolParamsShape): OwnerActionInput | { error: string } {
  const commands = parseCommands(params.commandsJson);
  if (!Array.isArray(commands)) return commands;
  const extraKeys = RESERVED_IN_SCHEMA.filter((key) => params[key] !== undefined);
  return {
    action: params.action,
    projectId: params.projectId,
    text: params.text,
    title: params.title,
    milestoneId: params.milestoneId,
    plan: params.plan,
    previewRoute: params.previewRoute,
    done: params.done,
    milestonesJson: params.milestonesJson,
    escalationPolicy: params.escalationPolicy,
    autonomy: params.autonomy,
    capUsd: params.capUsd,
    question: params.question,
    optionsJson: params.optionsJson,
    recommendation: params.recommendation,
    reason: params.reason,
    parks: params.parks?.split(',').map((id) => id.trim()).filter(Boolean),
    stoppingCondition: params.stoppingCondition,
    kind: params.kind,
    prompt: params.prompt,
    destination: params.destination,
    maxCostUsd: params.maxCostUsd,
    commands,
    route: params.route,
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
    description: 'Act on the Architect project you own: brief, charter, milestone, decide, research, dispatch, evidence, status, reply, blocked, sleep. Every call carries projectId.',
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
