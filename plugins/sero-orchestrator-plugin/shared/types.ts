/**
 * Persisted data model for Sero Orchestrator.
 *
 * Mirrors docs/features/orchestration/sero-orchestrator/specs/01-data-model.md.
 * The model stores LLM-authored step plans, user-selected workspace settings,
 * and generic runtime history. It encodes no fixed workflow and adds no
 * Orchestrator-specific execution restrictions.
 */

import type { AppRuntimePullRequestSummary, ContextOverrides } from '@sero-ai/common';
import type { LoopWorkspaceRuntime, LoopWorkspaceSettings, ResolvedWorkspaceContext } from './workspace-types';
import type { LoopInsight, LoopSuggestion } from './reflection-types';
import type { AnsweredInput, HumanQuestion, PendingInput } from './human-input-types';
import type { CompletionSignal, RecoveryDecision, RecoveryDecisionKind, StepCompletion } from './recovery-types';

export type { AppRuntimePullRequestSummary, ContextOverrides };

// Workspace settings & runtime-context types live in workspace-types.ts (500-LOC
// limit); re-exported here so existing imports from './types' keep resolving.
export type {
  LoopWorkspaceSettings,
  ResolvedWorkspaceContext,
  DirtyWorkspaceAction,
  DirtyWorkspacePrompt,
  DirtyWorkspaceDecision,
  LoopWorkspaceRuntime,
} from './workspace-types';

// Reflection (self-improvement) types live in reflection-types.ts (500-LOC
// limit); re-exported here so existing imports from './types' keep resolving.
export type {
  RunDigest,
  RunDigestStep,
  DigestLog,
  LoopInsight,
  LoopSuggestion,
  SuggestionConfidence,
  SuggestionStatus,
} from './reflection-types';

// Human-input (ask-the-user) types live in human-input-types.ts (500-LOC limit);
// re-exported here so existing imports from './types' keep resolving.
export type {
  HumanChoice,
  HumanQuestion,
  PendingInput,
  InputAnswer,
  AnsweredInput,
  ClarifyingResponse,
} from './human-input-types';

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
  /** Count of pending reflection suggestions — drives the loop-list badge. */
  pendingSuggestions?: number;
  /** Count of open questions the loop is waiting on — drives the input badge. */
  pendingInput?: number;
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
  /** Durable lessons reflection learned from this loop's run history (see specs/06-reflection.md). */
  insights?: LoopInsight[];
  /** History-driven improvements pending the user's approve/reject. */
  suggestions?: LoopSuggestion[];
  /** Resolved human-input requests (planner clarifications + step questions). */
  answeredInputs?: AnsweredInput[];
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

/**
 * A branch guard gating whether a step runs, matched against a routing variable an
 * upstream step recorded. See specs/05-branching.md. Exactly one of `in`/`default`.
 */
export interface StepGuard {
  /** Routing variable read from loop.runtime.variables. */
  var: string;
  /** Taken when the variable's value is one of these. */
  in?: (string | number | boolean)[];
  /** Default branch: taken only when no sibling guard on the same `var` matched its value. */
  default?: true;
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
  /**
   * Routing variables this step records in its StepOutcome — declares a branch
   * decision so guards can be validated and the UI can mark the branch point.
   * Advisory; the runtime source of truth is what the step actually records.
   */
  produces?: string[];
  /** Branch guard. Absent → the step always runs (the main line). */
  when?: StepGuard;
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
   * EXTRA tools this step needs beyond the always-on default tools
   * (DEFAULT_TOOLS), picked by the planner and user-overridable. The effective
   * allowlist is defaults ∪ tools; the default tools can't be removed.
   * Omitted/empty means defaults only. Restricting the active surface also
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
  /**
   * A durable question the loop is waiting on. While set, the loop is parked: no
   * steps start and scheduled fires hold off until the user answers (no timeout,
   * no default). Cleared by the `answer_input` action.
   */
  pendingInput?: PendingInput;
  lastRunAt?: string;
  /**
   * Open PRs this loop has raised — branch name matches the loop id. Refreshed at
   * each run start (stale/merged PRs drop out); injected into step context so an
   * iteration doesn't redo work an open PR already covers.
   */
  pullRequests?: AppRuntimePullRequestSummary[];
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
  /** Rolled-up token/time totals across this run's attempts (cost when reported). */
  usage?: UsageSummary;
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
  /**
   * The step needs the user to answer before it can finish. When present, the
   * loop parks (the step re-runs with the answer once the user responds) instead
   * of applying this outcome or running recovery.
   */
  questions?: HumanQuestion[];
}

// ── Recovery & completion ───────────────────────────────────
// Recovery decision and completion signal types live in recovery-types.ts
// (500-LOC limit); re-exported here so existing imports from './types' resolve.
export type {
  RecoveryDecisionKind,
  RecoveryDecision,
  CompletionSignal,
  StepCompletion,
} from './recovery-types';

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
  /** Durable run digests kept for reflection (survive run pruning). Default 50. */
  retainDigests?: number;
}

// ── Coordinator actions ─────────────────────────────────────
// Split into actions.ts (500-LOC limit); re-exported here for existing imports.

export type {
  CreateLoopOptions,
  OrchestratorAction,
  OrchestratorActionResult,
  ReflectedLoopSummary,
} from './actions';
