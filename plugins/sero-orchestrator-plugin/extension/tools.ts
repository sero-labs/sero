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
  CreateLoopOptions,
  OrchestratorAction,
  OrchestratorActionResult,
  RecoveryDecision,
} from '../shared/types';

export const ORCHESTRATOR_ACTIONS = [
  'create',
  'list',
  'show',
  'activate',
  'disable',
  'enable',
  'run_next',
  'run_again',
  'revise',
  'choose_recovery',
  'set_step_model',
  'delete',
] as const;

export const OrchestratorToolParams = Type.Object({
  action: StringEnum(ORCHESTRATOR_ACTIONS, {
    description: 'Coordinator action to request',
  }),
  loopId: Type.Optional(Type.String({ description: 'Target loop id (required for everything except create/list)' })),
  prompt: Type.Optional(Type.String({ description: 'User prompt (create) or revision request (revise)' })),
  title: Type.Optional(Type.String({ description: 'Optional loop title for create' })),
  activate: Type.Optional(Type.Boolean({ description: 'Activate the loop immediately after create' })),
  useManagedWorktree: Type.Optional(Type.Boolean({ description: 'Workspace isolation for create (default true)' })),
  decisionJson: Type.Optional(Type.String({ description: 'JSON-encoded RecoveryDecision for choose_recovery' })),
  stepId: Type.Optional(Type.String({ description: 'Target step id (required for set_step_model)' })),
  model: Type.Optional(Type.String({ description: 'For set_step_model: a tier ("LOW"/"MED"/"HIGH") or a "provider/modelId"; omit to revert the step to the default' })),
  thinking: Type.Optional(Type.String({ description: 'For set_step_model: thinking level for a pinned model' })),
  deleteBranch: Type.Optional(Type.Boolean({ description: 'For delete: also delete the loop\'s local git branch (default false — branch is kept)' })),
});

export interface OrchestratorToolParamsShape {
  action: (typeof ORCHESTRATOR_ACTIONS)[number];
  loopId?: string;
  prompt?: string;
  title?: string;
  activate?: boolean;
  useManagedWorktree?: boolean;
  decisionJson?: string;
  stepId?: string;
  model?: string;
  thinking?: string;
  deleteBranch?: boolean;
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

/** Builds the typed coordinator action from flat tool params. */
export function buildAction(params: OrchestratorToolParamsShape): OrchestratorAction | { error: string } {
  switch (params.action) {
    case 'create': {
      if (!params.prompt) return { error: 'create requires a prompt' };
      const options: CreateLoopOptions = {};
      if (params.activate !== undefined) options.activate = params.activate;
      if (params.useManagedWorktree !== undefined) {
        options.workspace = { useManagedWorktree: params.useManagedWorktree };
      }
      return { kind: 'create', prompt: params.prompt, title: params.title, options };
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
    case 'set_step_model':
      if (!params.loopId) return { error: 'set_step_model requires a loopId' };
      if (!params.stepId) return { error: 'set_step_model requires a stepId' };
      return { kind: 'set_step_model', loopId: params.loopId, stepId: params.stepId, model: params.model, thinking: params.thinking };
    case 'delete':
      if (!params.loopId) return { error: 'delete requires a loopId' };
      return { kind: 'delete', loopId: params.loopId, deleteBranch: params.deleteBranch };
    default: {
      if (!params.loopId) return { error: `${params.action} requires a loopId` };
      // The switch guarantees params.action is one of the single-loopId kinds
      // (show/activate/disable/enable/run_next), all of shape { kind; loopId }.
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
