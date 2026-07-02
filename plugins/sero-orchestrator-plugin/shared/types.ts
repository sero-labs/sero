/**
 * Persisted data model for Sero Orchestrator.
 *
 * Mirrors docs/features/orchestration/sero-orchestrator/specs/01-data-model.md.
 * The model stores LLM-authored step plans, user-selected workspace settings,
 * and generic runtime history. It encodes no fixed workflow and adds no
 * Orchestrator-specific execution restrictions.
 */

import type { AppRuntimePullRequestSummary, ContextOverrides } from '@sero-ai/common';
import type { EventFiredBy, OrchestratorEvent } from './event-types';
import type { LoopLibraryLink, StepOverride } from './library-types';
import type { LogPolicy, UsageSummary } from './usage-types';
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

// Index attention payload (home inbox) lives in attention-types.ts (see
// specs/09-ui-redesign.md); re-exported here so './types' imports keep resolving.
export type {
  LoopAttention,
  LoopAttentionInput,
  LoopAttentionSuggestion,
} from './attention-types';

// Loop Library types live in library-types.ts (see specs/08-loop-library.md);
// re-exported here so existing imports from './types' keep resolving.
export type {
  SharedTriggerConfig,
  SharedLoopDefinition,
  LibraryVersion,
  LibraryEntry,
  LibraryEntrySummary,
  LibraryIndex,
  LoopLibraryLink,
  StepOverride,
} from './library-types';

// ── Top-level state ─────────────────────────────────────────

export interface OrchestratorState {
  version: 1;
  loops: Loop[];
  /**
   * Ring of recently delivered event keys (`source#dedupeKey`), so a source
   * adapter restart never re-fires an event it already delivered. Only events
   * that carry a `dedupeKey` are recorded. Oldest entries fall off.
   */
  recentEventKeys?: string[];
}

// Event types (Living Loops, spec 12) live in event-types.ts (500-LOC limit);
// re-exported here so existing imports from './types' keep resolving.
export type { OrchestratorEvent, EventFiredBy, GithubSourceHealth, WebhookSourceHealth } from './event-types';

// The watched-index summary types live in index-types.ts (500-LOC limit);
// re-exported here so existing imports from './types' keep resolving.
export type { LoopSummary, OrchestratorIndex, LoopProgress } from './index-types';

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
  /** Set when the loop was loaded from / saved to the library (see specs/08-loop-library.md). Absent ⇒ standalone. */
  libraryLink?: LoopLibraryLink;
  /** Local per-step overrides, replayed after a library version switch so they survive the plan being replaced. */
  stepOverrides?: Record<string, StepOverride>;
  createdAt: string;
  updatedAt: string;
}

export interface LoopWarning {
  id: string;
  code: 'mixed-workspace-targets' | 'model-unavailable' | 'agent-unavailable' | 'event-chain-depth' | 'event-dropped';
  message: string;
  /** The step a runtime warning refers to (model/agent-unavailable), for de-duplication. */
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
  /** Natural-language condition judged by a model call at fire time (never parsed by code). */
  eventCondition?: string;
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
   * Named agent role to run this step as (one of the workspace's `.md` agents),
   * picked by the planner and user-overridable. Omitted ⇒ the default ad-hoc
   * agent. A role contributes its system prompt and its default model/thinking;
   * the orchestrator's step contract always still applies. An unknown role at run
   * time falls back to the default with a warning (see spec 11).
   */
  agent?: string;
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
  /**
   * Monotonic count of runs ever started for this loop. Unlike `runs.length`
   * (capped by run-history pruning), it never repeats, so it yields a unique
   * iteration id for each scheduled run — used for the per-iteration managed
   * worktree key/branch name and as the run's display number.
   */
  runSeq?: number;
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
  /**
   * The latest event that fired while this loop was busy (run in flight or
   * parked on a question) — latest wins, at most one pending fire. Consumed by
   * the next iteration: the engine turns it into the run's `firedBy` + an
   * `event` observation. Only the coordinator writes this field.
   */
  pendingEvent?: OrchestratorEvent;
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
  /**
   * Flat field predicates matched in code against the event payload's top-level
   * fields: strict equality, an array value means "payload value is one of".
   */
  eventFilter?: Record<string, unknown>;
  /** Natural-language condition judged by a model call at fire time (never parsed by code). */
  eventCondition?: string;
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
  /** Set when this run was started by an event fire (Living Loops). */
  firedBy?: EventFiredBy;
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

// The per-run summary index types (runs/index.json) live in index-types.ts
// (500-LOC limit); re-exported here so imports from './types' keep resolving.
export type { LoopRunStepSummary, LoopRunSummary, RunIndex } from './index-types';

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
  /** Set when the step's chosen agent role was unavailable and the default ad-hoc agent ran instead. */
  agentFallback?: { requestedAgent: string };
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
// Split into usage-types.ts (500-LOC limit); re-exported here for existing imports.
export type { UsageSummary, LogPolicy } from './usage-types';

// ── Coordinator actions ─────────────────────────────────────
// Split into actions.ts (500-LOC limit); re-exported here for existing imports.

export type {
  CreateLoopOptions,
  OrchestratorAction,
  OrchestratorActionResult,
  ReflectedLoopSummary,
} from './actions';
