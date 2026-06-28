/**
 * Default values for new loops and Orchestrator state.
 */

import type {
  LoopLimits,
  LoopWorkspaceSettings,
  LogPolicy,
  OrchestratorIndex,
  OrchestratorState,
  RunIndex,
} from './types';

export const DEFAULT_STATE: OrchestratorState = {
  version: 1,
  loops: [],
};

export const DEFAULT_INDEX: OrchestratorIndex = {
  version: 1,
  loops: [],
};

export const DEFAULT_RUN_INDEX: RunIndex = {
  version: 1,
  runs: [],
};

export const DEFAULT_WORKSPACE_SETTINGS: LoopWorkspaceSettings = {
  useManagedWorktree: true,
  reuseExistingWorktree: true,
  dirtyWorkspacePromptTimeoutMs: 30_000,
  dirtyWorkspaceDefaultAction: 'create-managed-worktree',
  allowDirtyWorkspaceRoot: false,
};

/**
 * Default management limits. Conservative caps so a misbehaving plan cannot
 * run unbounded. The LLM's `suggestedLimits` and user-supplied limits override
 * these.
 */
export const DEFAULT_LIMITS: Required<Pick<
  LoopLimits,
  'maxAttemptsPerStep' | 'maxAttemptsTotal' | 'maxConcurrentSteps'
>> & LoopLimits = {
  maxAttemptsPerStep: 3,
  maxAttemptsTotal: 50,
  maxConcurrentSteps: 3,
  maxWallClockMs: 30 * 60_000,
};

export const DEFAULT_LOG_POLICY: LogPolicy = {
  retainRuns: 20,
  retainArtifacts: true,
  maxInlineOutputBytes: 8_000,
};
