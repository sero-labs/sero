/**
 * Persisted data model for Sero Orchestrator.
 *
 * Mirrors docs/features/orchestration/sero-orchestrator/specs/01-data-model.md.
 * The model stores LLM-authored step plans, user-selected workspace settings,
 * and generic runtime history. It encodes no fixed workflow and adds no
 * Orchestrator-specific execution restrictions.
 */

import type { AppRuntimePullRequestSummary, ContextOverrides } from '@sero-ai/common';
import type { DeliveryReceipt, LoopDeliverySettings } from './delivery-types';
import type { LoopTrigger, LoopTriggerSuggestion } from './trigger-types';
import type { EventFiredBy, OrchestratorEvent } from './event-types';
import type { LoopLibraryLink, StepOverride } from './library-types';
import type { LogPolicy, UsageSummary } from './usage-types';
import type { LoopWorkspaceRuntime, LoopWorkspaceSettings, ResolvedWorkspaceContext } from './workspace-types';
import type { LoopInsight, LoopSuggestion } from './reflection-types';
import type { AnsweredInput, HumanQuestion, PendingInput } from './human-input-types';
import type { CompletionSignal, RecoveryDecision, RecoveryDecisionKind, StepCompletion } from './recovery-types';
import type { Observation } from './observation-types';
import type { LoopRunStatus } from './run-status-types';
import type { FeedbackRuntimeState, StepActivation, StepFeedbackTransition } from './activation-types';
import type { FanOutDefinition, FanOutRuntimeState } from './fanout-types';
import type { StepExecutionTarget } from './execution-types';

export type { AppRuntimePullRequestSummary, ContextOverrides };
export type { FeedbackContext, FeedbackRuntimeState, StepActivation, StepActivationStatus, StepFeedbackTransition } from './activation-types';

// Bounded dynamic fan-out types live in fanout-types.ts (500-LOC limit);
// re-exported here so existing imports from './types' keep resolving.
export type {
  FanOutDefinition,
  FanOutManifest,
  FanOutManifestItem,
  FanOutRuntimeState,
  FanOutAggregate,
  FanOutActivationResult,
} from './fanout-types';

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

// Delivery destination types live in delivery-types.ts (see
// specs/13-pluggable-delivery.md); re-exported here so './types' imports keep
// resolving.
export type {
  DeliveryDestinationId,
  LoopDeliverySettings,
  DeliveryReceipt,
  DeliveryDestinationInfo,
} from './delivery-types';

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
  /** Where results ship (user-chosen, never planner-chosen). Absent ⇒ derived from placement (effectiveDelivery). */
  delivery?: LoopDeliverySettings;
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
  code:
    | 'mixed-workspace-targets'
    | 'model-unavailable'
    | 'agent-unavailable'
    | 'event-chain-depth'
    | 'event-dropped'
    | 'event-queue-overflow'
    | 'delivery-tool-missing'
    | 'catalog-tool-missing';
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

// Trigger shapes live in trigger-types.ts (500-LOC limit); re-exported here so
// existing imports from './types' keep resolving.
export type { LoopTrigger, LoopTriggerSuggestion } from './trigger-types';

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
  /**
   * Approval gate marker (spec 13): this step presents the exact content to be
   * delivered as an `approval` question and parks the loop for the user's
   * decision. Required on a pre-final step for external destinations.
   */
  gate?: 'approval';
  /** Optional bounded return to one strict dependency ancestor. */
  feedback?: StepFeedbackTransition;
  /**
   * Bounded dynamic fan-out (specs/17-dynamic-fan-out.md): the runtime expands
   * this step into one activation per item of an upstream array variable,
   * within the declared bounds. The plan graph itself stays static.
   */
  fanOut?: FanOutDefinition;
}

// ── Execution targets ───────────────────────────────────────
// Step execution targets live in execution-types.ts (500-LOC limit);
// re-exported here so existing imports from './types' keep resolving.

export type {
  StepExecutionTarget,
  BackgroundAgentTarget,
  ActiveSessionTarget,
  ModelTarget,
  SessionTarget,
} from './execution-types';

// ── Runtime state ───────────────────────────────────────────

export interface LoopRuntimeState {
  parentSessionId: string;
  variables: Record<string, unknown>;
  stepStates: Record<string, StepRuntimeState>;
  workspace: LoopWorkspaceRuntime;
  activeRunId?: string;
  dueAgain?: boolean;
  /** A dirty-workspace run delayed by the user. Blocks runs until this durable timestamp. */
  snoozedUntil?: string;
  /** Cron/hybrid trigger being consumed by the next run; cleared when the run starts. */
  pendingTriggerId?: string;
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
   * Accepted delivery receipts, newest last, appended when a run completes with
   * proof of delivery (capped — see outcomes.ts). Injected into step context so
   * a recurring loop knows what it already shipped and doesn't re-deliver.
   */
  deliveries?: DeliveryReceipt[];
  /**
   * FIFO of event fires awaiting their iteration (queued while a run was in
   * flight or the loop was parked on a question), oldest first, bounded —
   * overflow drops the oldest with a visible warning (event-queue.ts). The
   * engine consumes the HEAD at run start and turns it into the run's
   * `firedBy` + an `event` observation. Only the coordinator enqueues.
   */
  pendingEvents?: OrchestratorEvent[];
  /** Per-run traversal counts, keyed by feedback transition id. */
  feedbackStates?: Record<string, FeedbackRuntimeState>;
  /**
   * Fan-out manifests + join aggregates, keyed by step id. The manifest is
   * written before any activation starts so a retry or restart reconstructs the
   * same activations; entries belong to the run recorded in the manifest.
   */
  fanOutStates?: Record<string, FanOutRuntimeState>;
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

export type { DeferredRunResult, LoopRunStatus } from './run-status-types';

export interface LoopRun {
  id: string;
  runNumber: number;
  status: LoopRunStatus;
  /** Why a preflight ended this run without starting steps. */
  statusReason?: string;
  /** Durable retry time for a snoozed run. */
  retryAt?: string;
  triggerId?: string;
  /** Set when this run was started by an event fire (Living Loops). */
  firedBy?: EventFiredBy;
  startedStepIds: string[];
  stepAttempts: StepAttempt[];
  /** Durable logical visits. Optional so existing persisted runs keep loading. */
  stepActivations?: StepActivation[];
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
  /** Logical visit this attempt belongs to. Optional for older history. */
  activationId?: string;
  /**
   * A bookkeeping attempt that did NOT call an executor — the fan-out join
   * record whose real work is its per-item activation attempts. Excluded from
   * the total-attempt budget so the synthetic container/join can't double-count
   * against `maxAttemptsTotal` (see limits.ts).
   */
  synthetic?: boolean;
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

export type { Observation } from './observation-types';

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
