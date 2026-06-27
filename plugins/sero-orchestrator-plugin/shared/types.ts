/**
 * Persisted data model for Sero Orchestrator.
 *
 * Mirrors docs/features/orchestration/sero-orchestrator/specs/01-data-model.md.
 * The model stores LLM-authored step plans, user-selected workspace settings,
 * and generic runtime history. It encodes no fixed workflow and adds no
 * Orchestrator-specific execution restrictions.
 */

import type { ContextOverrides } from '@sero-ai/common';

export type { ContextOverrides };

// ── Top-level state ─────────────────────────────────────────

export interface OrchestratorState {
  version: 1;
  loops: Loop[];
}

/** Lightweight per-loop entry for the watched index (drives the loop list). */
export interface LoopSummary {
  id: string;
  title: string;
  status: LoopStatus;
  summary: string;
  prompt: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * The watched index file: one small entry per loop. Full loops are persisted in
 * their own files (loops/<id>/loop.json), so a loop's frequent run-time writes
 * never rewrite every other loop.
 */
export interface OrchestratorIndex {
  version: 1;
  loops: LoopSummary[];
}

// ── Loop ────────────────────────────────────────────────────

export type LoopStatus =
  | 'draft'
  | 'active'
  | 'blocked'
  | 'complete'
  | 'disabled';

export interface Loop {
  id: string;
  workspaceId: string;
  title: string;
  prompt: string;
  summary: string;
  status: LoopStatus;
  workspace: LoopWorkspaceSettings;
  plan: LoopPlan;
  runtime: LoopRuntimeState;
  triggers: LoopTrigger[];
  limits: LoopLimits;
  logPolicy: LogPolicy;
  warnings: LoopWarning[];
  /** Optional user context override for the loop's subagents (UI-only, never planner-managed). */
  contextOverrides?: ContextOverrides;
  runs: LoopRun[];
  revisions: PlanRevision[];
  createdAt: string;
  updatedAt: string;
}

export interface LoopWarning {
  id: string;
  code: 'mixed-workspace-targets' | 'model-unavailable';
  message: string;
  /** The step a runtime warning refers to (model-unavailable), for de-duplication. */
  stepId?: string;
  createdAt: string;
}

// ── Workspace settings ──────────────────────────────────────

export interface LoopWorkspaceSettings {
  useManagedWorktree: boolean;
  reuseExistingWorktree: boolean;
  dirtyWorkspacePromptTimeoutMs: number;
  dirtyWorkspaceDefaultAction: 'create-managed-worktree';
}

// ── Planning response & plan ────────────────────────────────

export interface PlanningResponse {
  schemaVersion: 1;
  title: string;
  summary: string;
  plan: LoopPlan;
  suggestedTriggers?: LoopTriggerSuggestion[];
  suggestedLimits?: Partial<LoopLimits>;
}

export interface LoopTriggerSuggestion {
  type: 'manual' | 'cron' | 'event' | 'hybrid';
  schedule?: string;
  eventSource?: string;
  eventFilter?: Record<string, unknown>;
  debounceMs?: number;
  maxFires?: number;
}

export interface LoopPlan {
  schemaVersion: 1;
  revision: number;
  objective: string;
  steps: LoopStepDefinition[];
  globalInstructions?: string;
  variablesSchema?: unknown;
}

export interface LoopStepDefinition {
  id: string;
  title: string;
  instructions: string;
  expectedOutcome?: string;
  dependsOn?: string[];
  execution: StepExecutionTarget;
  onFailure?: string;
  maxAttempts?: number;
}

// ── Execution targets ───────────────────────────────────────

export type StepExecutionTarget =
  | BackgroundAgentTarget
  | ActiveSessionTarget
  | ModelTarget;

export interface BackgroundAgentTarget {
  type: 'background-agent';
  model?: string;
  thinking?: string;
  /**
   * EXTRA tools this step needs beyond the always-on lean baseline
   * (LEAN_TOOL_BASELINE), picked by the planner and user-overridable. The
   * effective allowlist is baseline ∪ tools; the baseline can't be removed.
   * Omitted/empty means baseline only. Restricting the active surface also
   * trims the per-tool prompt guidance.
   */
  tools?: string[];
}

export interface ActiveSessionTarget {
  type: 'active-session';
  sessionTarget: SessionTarget;
}

export interface ModelTarget {
  type: 'model';
  model?: string;
  thinking?: string;
  outputSchema?: unknown;
}

export interface SessionTarget {
  workspaceId: string;
  sessionId?: string;
  strategy: 'specific-session' | 'most-recent-active' | 'ask-user';
  deliverAs: 'steer' | 'followUp' | 'nextTurn';
  triggerTurn: boolean;
}

// ── Workspace runtime context ───────────────────────────────

export interface ResolvedWorkspaceContext {
  id: string;
  type: 'workspace-root' | 'managed-worktree';
  workspaceRoot: string;
  cwd: string;
  worktreePath?: string;
  branchName?: string;
  /** Key the worktree was created under (per-iteration for recurring loops); used for cleanup. */
  worktreeKey?: string;
  resolvedBy:
    | 'create-option'
    | 'clean-workspace'
    | 'dirty-workspace-choice'
    | 'dirty-workspace-timeout';
  createdAt: string;
}

export type DirtyWorkspaceAction =
  | 'stash-current-changes'
  | 'create-managed-worktree'
  | 'defer-workflow';

export interface DirtyWorkspacePrompt {
  id: string;
  status: 'pending' | 'resolved' | 'timed-out';
  detectedAt: string;
  expiresAt: string;
  decision?: DirtyWorkspaceDecision;
}

export interface DirtyWorkspaceDecision {
  action: DirtyWorkspaceAction;
  source: 'user' | 'timeout';
  decidedAt: string;
  stashRef?: string;
  contextId?: string;
}

export interface LoopWorkspaceRuntime {
  resolved?: ResolvedWorkspaceContext;
  dirtyPrompt?: DirtyWorkspacePrompt;
  lastDirtyCheckAt?: string;
  deferredReason?: string;
}

// ── Runtime state ───────────────────────────────────────────

export interface LoopRuntimeState {
  parentSessionId: string;
  variables: Record<string, unknown>;
  stepStates: Record<string, StepRuntimeState>;
  workspace: LoopWorkspaceRuntime;
  activeRunId?: string;
  dueAgain?: boolean;
  completion?: CompletionSignal;
  block?: LoopBlock;
  lastRunAt?: string;
}

export interface LoopBlock {
  kind:
    | 'planned-block'
    | 'recovery-block'
    | 'management-limit'
    | 'validation-error'
    | 'runtime-error';
  reason: string;
  createdAt: string;
  sourceStepId?: string;
  sourceAttemptId?: string;
  limit?: keyof LoopLimits;
}

export type StepStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'blocked'
  | 'skipped'
  | 'needs-revision';

export interface StepRuntimeState {
  status: StepStatus;
  attempts: number;
  lastAttemptId?: string;
  outcome?: StepOutcome;
  updatedAt: string;
}

// ── Trigger ─────────────────────────────────────────────────

export interface LoopTrigger {
  id: string;
  loopId: string;
  workspaceId: string;
  type: 'manual' | 'cron' | 'event' | 'hybrid';
  schedule?: string;
  eventSource?: string;
  eventFilter?: Record<string, unknown>;
  debounceMs?: number;
  maxFires?: number;
  fireCount: number;
  lastFireAt?: string;
  nextFireAt?: string;
  disabled?: boolean;
}

// ── Limits ──────────────────────────────────────────────────

export interface LoopLimits {
  maxAttemptsPerStep?: number;
  maxAttemptsTotal?: number;
  maxConcurrentSteps?: number;
  maxWallClockMs?: number;
  maxTotalTokens?: number;
  maxCostUsd?: number;
}

// ── Run, attempt, outcome ───────────────────────────────────

export type LoopRunStatus =
  | 'running'
  | 'waiting'
  | 'completed'
  | 'blocked'
  | 'failed'
  | 'cancelled'
  | 'orphaned';

export interface LoopRun {
  id: string;
  runNumber: number;
  status: LoopRunStatus;
  triggerId?: string;
  startedStepIds: string[];
  stepAttempts: StepAttempt[];
  recoveryDecisions: RecoveryDecision[];
  completionSignal?: CompletionSignal;
  observations: Observation[];
  usage?: UsageSummary;
  startedAt: string;
  endedAt?: string;
  block?: LoopBlock;
}

/**
 * Compact per-run summary stored in `loops/<id>/runs/index.json`. Full runs live
 * one-per-file (`runs/<runId>.json`) so a loop's frequent run writes never bloat
 * loop.json; the UI reads this lightweight index to render run history without
 * loading every run file.
 */
export interface LoopRunStepSummary {
  stepId: string;
  attemptNumber: number;
  executionType: StepExecutionTarget['type'];
  status: StepAttemptStatus;
  outcomeStatus?: StepOutcome['status'];
}

export interface LoopRunSummary {
  id: string;
  runNumber: number;
  status: LoopRunStatus;
  startedAt: string;
  endedAt?: string;
  completionStatus?: CompletionSignal['status'];
  steps: LoopRunStepSummary[];
  recoveries: { decision: RecoveryDecisionKind; reason: string }[];
}

export interface RunIndex {
  version: 1;
  runs: LoopRunSummary[];
}

export type StepAttemptStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'orphaned';

export interface StepAttempt {
  id: string;
  stepId: string;
  attemptNumber: number;
  parentSessionId: string;
  executionType: StepExecutionTarget['type'];
  status: StepAttemptStatus;
  outcome?: StepOutcome;
  workspace?: ResolvedWorkspaceContext;
  workerRunId?: string;
  resolvedSessionId?: string;
  sessionTurnId?: string;
  model?: string;
  /** Set when the step's pinned model was unavailable and the MED tier was used instead. */
  modelFallback?: { requestedModel: string };
  outputPath?: string;
  observations: Observation[];
  usage?: UsageSummary;
  startedAt: string;
  endedAt?: string;
  error?: string;
}

export interface StepOutcome {
  status: 'succeeded' | 'failed' | 'blocked' | 'skipped' | 'needs-revision';
  summary: string;
  variables?: Record<string, unknown>;
  completion?: StepCompletion;
}

// ── Recovery ────────────────────────────────────────────────

export type RecoveryDecisionKind =
  | 'retry-step'
  | 'revise-step'
  | 'revise-plan'
  | 'skip-step'
  | 'accept-step'
  | 'wait'
  | 'block-loop';

export interface RecoveryDecision {
  id: string;
  stepId: string;
  failedAttemptId: string;
  decision: RecoveryDecisionKind;
  reason: string;
  revisedStep?: LoopStepDefinition;
  revisedPlan?: LoopPlan;
  /** Set for accept-step: the success outcome the step should have reported. */
  acceptedOutcome?: StepOutcome;
  createdAt: string;
  modelResponsePath?: string;
}

// ── Completion ──────────────────────────────────────────────

export interface CompletionSignal {
  status: 'complete' | 'blocked';
  /** For a scheduled (recurring) loop: stop the schedule permanently (success criteria met). */
  final?: boolean;
  sourceStepId: string;
  sourceAttemptId: string;
  reason: string;
  createdAt: string;
  modelResponsePath?: string;
}

export interface StepCompletion {
  status: 'complete' | 'blocked';
  reason: string;
  /**
   * Recurring loops only: set true when the loop's overall success criteria is
   * met, to stop the schedule for good. Omitted/false means "this iteration is
   * done" — the loop stays scheduled and runs again on its next fire.
   */
  final?: boolean;
}

// ── Observation ─────────────────────────────────────────────

export interface Observation {
  id: string;
  source:
    | 'model'
    | 'background-agent'
    | 'active-session'
    | 'manual'
    | 'event'
    | 'system';
  summary: string;
  data?: Record<string, unknown>;
  artifactPath?: string;
  createdAt: string;
}

// ── Plan revision ───────────────────────────────────────────

export interface PlanRevision {
  revision: number;
  previousRevision: number;
  reason: string;
  proposedBy: 'model' | 'user';
  status: 'applied' | 'rejected';
  plan: LoopPlan;
  createdAt: string;
  appliedAt?: string;
  rejectionReason?: string;
}

// ── Usage & log policy ──────────────────────────────────────

export interface UsageSummary {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
  durationMs?: number;
}

export interface LogPolicy {
  retainRuns: number;
  retainArtifacts: boolean;
  maxInlineOutputBytes: number;
}

// ── Coordinator actions ─────────────────────────────────────
// Split into actions.ts (500-LOC limit); re-exported here for existing imports.

export type {
  CreateLoopOptions,
  OrchestratorAction,
  OrchestratorActionResult,
} from './actions';
