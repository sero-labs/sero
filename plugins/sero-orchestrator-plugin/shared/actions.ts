/**
 * Coordinator action contracts. Split from types.ts to keep each file within the
 * 500-LOC limit; re-exported from types.ts so existing imports are unaffected.
 */

import type { ContextOverrides } from '@sero-ai/common';
import type {
  InputAnswer,
  Loop,
  LoopLimits,
  LoopRun,
  LoopTriggerSuggestion,
  LoopWorkspaceSettings,
  RecoveryDecision,
} from './types';

export interface CreateLoopOptions {
  activate?: boolean;
  triggers?: LoopTriggerSuggestion[];
  limits?: Partial<LoopLimits>;
  workspace?: Partial<LoopWorkspaceSettings>;
}

export type OrchestratorAction =
  | { kind: 'create'; prompt: string; title?: string; options?: CreateLoopOptions }
  | { kind: 'activate'; loopId: string }
  | { kind: 'list' }
  | { kind: 'show'; loopId: string }
  | { kind: 'disable'; loopId: string }
  | { kind: 'enable'; loopId: string }
  | { kind: 'run_next'; loopId: string }
  | { kind: 'run_again'; loopId: string }
  | { kind: 'retry'; loopId: string }
  | { kind: 'retry_step'; loopId: string; stepId: string }
  | { kind: 'revise'; loopId: string; prompt?: string }
  | { kind: 'choose_recovery'; loopId: string; decision: RecoveryDecision }
  | { kind: 'set_step_model'; loopId: string; stepId: string; model?: string; thinking?: string }
  | { kind: 'set_step_tools'; loopId: string; stepId: string; tools?: string[] }
  | { kind: 'set_loop_context'; loopId: string; overrides: ContextOverrides | null }
  | { kind: 'reflect'; loopId: string }
  | { kind: 'reflect_workspace' }
  | { kind: 'choose_suggestion'; loopId: string; suggestionId: string; decision: 'approve' | 'reject'; rejectionReason?: string }
  | { kind: 'answer_input'; loopId: string; requestId: string; answers: InputAnswer[] }
  | { kind: 'delete'; loopId: string; deleteBranch?: boolean };

/** Per-loop result of a workspace-wide reflection sweep. */
export interface ReflectedLoopSummary {
  loopId: string;
  title: string;
  suggestionCount: number;
}

export interface OrchestratorActionResult {
  ok: boolean;
  loop?: Loop;
  loops?: Loop[];
  run?: LoopRun;
  error?: string;
  /** Set by `reflect`: how many suggestions this pass produced. */
  reflection?: { suggestionCount: number };
  /** Set by `reflect_workspace`: the consecutive per-loop sweep summary. */
  workspaceReflection?: { reflected: number; suggestionCount: number; perLoop: ReflectedLoopSummary[] };
}
