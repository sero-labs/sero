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
  'retry',
  'retry_step',
  'revise',
  'choose_recovery',
  'set_step_model',
  'set_step_tools',
  'set_loop_context',
  'reflect',
  'reflect_workspace',
  'choose_suggestion',
  'answer_input',
  'delete',
] as const;

const SUGGESTION_DECISIONS = ['approve', 'reject'] as const;

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
  decisionJson: Type.Optional(Type.String({ description: 'JSON-encoded RecoveryDecision for choose_recovery' })),
  stepId: Type.Optional(Type.String({ description: 'Target step id (required for set_step_model/set_step_tools)' })),
  model: Type.Optional(Type.String({ description: 'For set_step_model: a tier ("LOW"/"MED"/"HIGH") or a "provider/modelId"; omit to revert the step to the default' })),
  thinking: Type.Optional(Type.String({ description: 'For set_step_model: thinking level for a pinned model' })),
  toolsJson: Type.Optional(Type.String({ description: 'For set_step_tools: JSON-encoded array of EXTRA tool names beyond the always-on default tools (e.g. ["web_search","git_manager"]) or "null"/"[]" to use the default tools only' })),
  contextJson: Type.Optional(Type.String({ description: 'For set_loop_context: JSON-encoded ContextOverrides ({systemPrompt?, disabledTools?, disabledSkills?}) or "null" to clear' })),
  suggestionId: Type.Optional(Type.String({ description: 'For choose_suggestion: the reflection suggestion id to approve/reject' })),
  decision: Type.Optional(StringEnum(SUGGESTION_DECISIONS, { description: 'For choose_suggestion: approve (apply the proposed plan) or reject' })),
  rejectionReason: Type.Optional(Type.String({ description: 'For choose_suggestion reject: why, so the same idea is not re-proposed' })),
  requestId: Type.Optional(Type.String({ description: 'For answer_input: the pending question request id (loop.runtime.pendingInput.id)' })),
  answersJson: Type.Optional(Type.String({ description: 'For answer_input: JSON array of answers [{ questionId, choiceId?, text? }] — answer every question with a picked choiceId and/or free text' })),
  deleteBranch: Type.Optional(Type.Boolean({ description: 'For delete: also delete the loop\'s local git branch (default false — branch is kept)' })),
});

export interface OrchestratorToolParamsShape {
  action: (typeof ORCHESTRATOR_ACTIONS)[number];
  loopId?: string;
  prompt?: string;
  title?: string;
  activate?: boolean;
  useManagedWorktree?: boolean;
  allowDirtyWorkspaceRoot?: boolean;
  decisionJson?: string;
  stepId?: string;
  model?: string;
  thinking?: string;
  toolsJson?: string;
  contextJson?: string;
  suggestionId?: string;
  decision?: (typeof SUGGESTION_DECISIONS)[number];
  rejectionReason?: string;
  requestId?: string;
  answersJson?: string;
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
      if (params.useManagedWorktree !== undefined || params.allowDirtyWorkspaceRoot !== undefined) {
        options.workspace = {};
        if (params.useManagedWorktree !== undefined) options.workspace.useManagedWorktree = params.useManagedWorktree;
        if (params.allowDirtyWorkspaceRoot !== undefined) options.workspace.allowDirtyWorkspaceRoot = params.allowDirtyWorkspaceRoot;
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
