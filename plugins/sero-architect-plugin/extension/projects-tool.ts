/**
 * The `architect_projects` tool: the USER's management surface, driven from a
 * chat or the CLI. The project page calls the same runtime actions.
 */

import { StringEnum } from '@earendil-works/pi-ai';
import type { ExtensionAPI, ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Text } from '@earendil-works/pi-tui';
import { Type } from 'typebox';

import { resolveArchitectRuntime } from '../runtime/registry';
import { AUTONOMY_SETTINGS } from '../shared/charter-shape';
import type { ProjectRecord } from '../shared/record';
import type { ArchitectIndexEntry } from '../shared/types';

export const PROJECT_ACTIONS = [
  'list',
  'show',
  'create',
  'pause',
  'resume',
  'stop',
  'raise_cap',
  'set_autonomy',
  'approve',
  'answer',
  'directive',
  'delete',
] as const;

const APPROVE_TARGETS = ['charter', 'milestone'] as const;

export const PROJECTS_TOOL_DESCRIPTION = `Manage Sero Architect projects. Actions: ${PROJECT_ACTIONS.join(', ')}.`;

export const ProjectsToolParams = Type.Object({
  action: StringEnum(PROJECT_ACTIONS, { description: `One of: ${PROJECT_ACTIONS.join(', ')}` }),
  projectId: Type.Optional(Type.String({ description: 'The project. Required for everything except list and create' })),
  idea: Type.Optional(Type.String({ description: 'create: the idea, in the user\'s own words' })),
  folder: Type.Optional(Type.String({ description: 'create: the folder to build in, under the home directory' })),
  capUsd: Type.Optional(Type.Number({ description: 'raise_cap: the new cost cap in USD' })),
  autonomy: Type.Optional(StringEnum(AUTONOMY_SETTINGS, { description: 'set_autonomy: milestones, charter-only or model-judged' })),
  target: Type.Optional(StringEnum(APPROVE_TARGETS, { description: 'approve: charter or milestone' })),
  milestoneId: Type.Optional(Type.String({ description: 'approve milestone: the milestone id' })),
  decisionId: Type.Optional(Type.String({ description: 'answer: the decision id' })),
  optionId: Type.Optional(Type.String({ description: 'answer: the chosen option id' })),
  note: Type.Optional(Type.String({ description: 'answer: an optional note for the owner' })),
  text: Type.Optional(Type.String({ description: 'directive: what to tell the owner' })),
});

export interface ProjectsToolParamsShape {
  action: (typeof PROJECT_ACTIONS)[number];
  projectId?: string;
  idea?: string;
  folder?: string;
  capUsd?: number;
  autonomy?: (typeof AUTONOMY_SETTINGS)[number];
  target?: (typeof APPROVE_TARGETS)[number];
  milestoneId?: string;
  decisionId?: string;
  optionId?: string;
  note?: string;
  text?: string;
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
      return `${p.name} (${p.id}) [${state}] ${spend}${needs}\n  ${p.stateLine}`;
    })
    .join('\n');
}

function formatRecord(record: ProjectRecord): string {
  const open = record.decisions.filter((d) => d.answer === null);
  return [
    `${record.name} (${record.id}): ${record.phase}${record.overlay ? ` · ${record.overlay}` : ''}`,
    record.stateLine,
    `Folder: ${record.folder}`,
    `Budget: $${record.budget.spentUsd.toFixed(2)} spent${record.budget.capUsd === null ? ', no cap yet' : ` of $${record.budget.capUsd}`}`,
    record.charter ? `Charter: ${record.charter.approvedAt ? 'approved' : 'waiting for approval'} (autonomy ${record.charter.autonomy})` : 'Charter: none yet',
    ...record.milestones.map((m) => `- ${m.id} ${m.title}: ${m.status}${m.dispatch ? ` (${m.dispatch.kind} ${m.dispatch.id})` : ''}`),
    ...open.map((d) => `Decision ${d.id}: ${d.question} [${d.options.map((o) => `${o.id}: ${o.label}`).join('; ')}] recommended ${d.recommendation}`),
    ...record.directives.filter((d) => d.reply === null).map((d) => `Directive ${d.id} awaits a reply`),
  ].join('\n');
}

export async function executeProjectsTool(params: ProjectsToolParamsShape): Promise<ToolResult> {
  const runtime = resolveArchitectRuntime();
  if (!runtime) return result(false, 'The Architect runtime is not running.');
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
    case 'create': {
      const missing = need(params.idea, 'idea') ?? need(params.folder, 'folder');
      if (missing) return result(false, missing);
      const outcome = await actions.create({ idea: params.idea ?? '', folder: params.folder ?? '' });
      return result(outcome.ok, outcome.text, outcome.ok ? { projectId: outcome.projectId } : {});
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
    case 'raise_cap': {
      const missing = need(id, 'projectId');
      if (missing) return result(false, missing);
      if (params.capUsd === undefined) return result(false, 'capUsd is required for raise_cap.');
      const outcome = await actions.raiseCap(id, params.capUsd);
      return result(outcome.ok, outcome.text);
    }
    case 'set_autonomy': {
      const missing = need(id, 'projectId');
      if (missing) return result(false, missing);
      if (!params.autonomy) return result(false, 'autonomy is required for set_autonomy.');
      const outcome = await actions.setAutonomy(id, params.autonomy);
      return result(outcome.ok, outcome.text);
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
  }
}

export function registerProjectsTool(pi: ExtensionAPI): void {
  const tool: ToolDefinition<typeof ProjectsToolParams> = {
    name: 'architect_projects',
    label: 'Architect projects',
    description: PROJECTS_TOOL_DESCRIPTION,
    parameters: ProjectsToolParams,
    execute: (_id, params) => executeProjectsTool(params),
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
