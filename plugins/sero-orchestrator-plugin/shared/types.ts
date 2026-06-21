/**
 * Persisted data model for Sero Orchestrator.
 *
 * Mirrors docs/features/orchestration/sero-orchestrator/specs/01-data-model.md.
 * The model stores LLM-authored step plans, user-selected workspace settings,
 * and generic runtime history. It encodes no fixed workflow and adds no
 * Orchestrator-specific execution restrictions.
 */

// ── Top-level state ─────────────────────────────────────────

export interface OrchestratorState {
  version: 1;
  loops: Loop[];
}

// ── Loop ────────────────────────────────────────────────────

export type LoopStatus =
  | 'draft'
  | 'active'
  | 'paused'
  | 'blocked'
  | 'complete'
  | 'stopped';

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
  runs: LoopRun[];
  revisions: PlanRevision[];
  createdAt: string;
  updatedAt: string;
}

export interface LoopWarning {
  id: string;
  code: 'mixed-workspace-targets';
  message: string;
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
  createdAt: string;
  modelResponsePath?: string;
}

// ── Completion ──────────────────────────────────────────────

export interface CompletionSignal {
  status: 'complete' | 'blocked';
  sourceStepId: string;
  sourceAttemptId: string;
  reason: string;
  createdAt: string;
  modelResponsePath?: string;
}

export interface StepCompletion {
  status: 'complete' | 'blocked';
  reason: string;
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
  | { kind: 'pause'; loopId: string }
  | { kind: 'resume'; loopId: string }
  | { kind: 'stop'; loopId: string }
  | { kind: 'run_next'; loopId: string }
  | { kind: 'revise'; loopId: string; prompt?: string }
  | { kind: 'choose_recovery'; loopId: string; decision: RecoveryDecision };

export interface OrchestratorActionResult {
  ok: boolean;
  loop?: Loop;
  loops?: Loop[];
  run?: LoopRun;
  error?: string;
}
