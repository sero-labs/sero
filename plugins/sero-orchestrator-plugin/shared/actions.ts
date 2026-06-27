/**
 * Coordinator action contracts. Split from types.ts to keep each file within the
 * 500-LOC limit; re-exported from types.ts so existing imports are unaffected.
 */

import type { ContextOverrides } from '@sero-ai/common';
import type {
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
  | { kind: 'revise'; loopId: string; prompt?: string }
  | { kind: 'choose_recovery'; loopId: string; decision: RecoveryDecision }
  | { kind: 'set_step_model'; loopId: string; stepId: string; model?: string; thinking?: string }
  | { kind: 'set_loop_context'; loopId: string; overrides: ContextOverrides | null }
  | { kind: 'delete'; loopId: string; deleteBranch?: boolean };

export interface OrchestratorActionResult {
  ok: boolean;
  loop?: Loop;
  loops?: Loop[];
  run?: LoopRun;
  error?: string;
}
