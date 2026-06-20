// Orchestrator state model — the single source of truth shared across the
// extension (Pi-safe), the background runtime, and the UI.
//
// Mirrors docs/features/orchestration/sero-orchestrator/specs/01-data-model.md.
// JSON-serialisable only — no Date, Map, Set, or functions. Large output is
// never stored inline; it is referenced by artifact path (see LogPolicy and
// CheckResult.*Path).

// ── Top-level state ──────────────────────────────────────────────────────────

export interface OrchestratorState {
  version: 1;
  loops: LoopGoal[];
}

// ── Loop goal ────────────────────────────────────────────────────────────────

export type ExecutionMode = 'background-worker' | 'active-session' | 'hybrid';

export type LoopStatus =
  | 'draft'
  | 'active'
  | 'paused'
  | 'blocked'
  | 'complete'
  | 'stopped';

/**
 * Structured reason a loop is `blocked`. Drives recovery: a `no-progress` block
 * can be overridden once via `run_next --override-no-progress`; a budget block
 * (`budget-exhausted` / `changed-files-exceeded`) clears only when the relevant
 * limit is raised and the loop is resumed (D-13, D-17).
 */
export type BlockedReason =
  | 'no-progress'
  | 'budget-exhausted'
  | 'changed-files-exceeded'
  | 'unsafe';

export interface LoopGoal {
  id: string;
  workspaceId: string;
  defaultCwd?: string; // preference only; attempt.workdir.cwd is canonical (D-06)
  sessionId?: string; // bound target session (active-session/hybrid)
  executionMode: ExecutionMode;
  hybridPolicy?: HybridPolicy; // required when executionMode === "hybrid"
  /** Working-tree strategy for attempts: workspace root (default) or an in-workspace worktree (D-06). */
  isolation?: WorkdirMode;
  /** Lazily-created, reused in-workspace worktree for isolated attempts (Phase 6). */
  worktree?: LoopWorktree;
  /** PR-on-complete policy (opt-in); a PR opens only when a worktree loop completes (Phase 6). */
  prPolicy?: PullRequestPolicy;
  /** The PR opened for this loop once it completes (Phase 6). */
  pullRequest?: PullRequestRef;
  title: string;
  goal: string;
  status: LoopStatus;
  /** Reason the loop is blocked/stopped, surfaced to the UI in plain English. */
  statusReason?: string;
  /** Machine-readable block reason; governs how the block recovers (D-13/D-17). */
  blockedReason?: BlockedReason;
  triggers: LoopTrigger[];
  checks: LoopCheck[];
  stopRule: StopRule;
  budget?: RunBudget; // cost/blast-radius limits beyond maxAttempts (D-17)
  logPolicy: LogPolicy;
  tasks: LoopTask[];
  attempts: LoopAttempt[]; // bounded to LogPolicy.retainAttempts
  createdAt: string;
  updatedAt: string;
}

// ── Hybrid policy ────────────────────────────────────────────────────────────

export type HybridPolicy =
  | 'prefer-active-session'
  | 'prefer-background-worker'
  | 'active-if-session-idle'
  | 'ask-user';

// ── Loop trigger ─────────────────────────────────────────────────────────────

export type TriggerType = 'manual' | 'cron' | 'event' | 'hybrid';

export interface LoopTrigger {
  id: string;
  loopId: string;
  workspaceId: string;
  sessionId?: string;
  type: TriggerType;
  schedule?: string; // 5-field cron expr when type includes cron
  eventSource?: string; // e.g. "vcs", "check", "session", "workspace"
  eventFilter?: unknown;
  debounceMs?: number;
  maxFires?: number;
  fireCount: number;
  lastFireAt?: string;
  nextFireAt?: string;
  disabled?: boolean;
}

// ── Loop check ───────────────────────────────────────────────────────────────

export type ReviewerKind = 'quality-reviewer' | 'spec-reviewer';

export type LoopCheck =
  | { type: 'verification'; command: string; required: boolean }
  | { type: 'command'; command: string; required: boolean }
  | {
      type: 'review';
      reviewer: ReviewerKind;
      required: boolean;
    };

export type CheckType = LoopCheck['type'];

// ── Loop attempt ─────────────────────────────────────────────────────────────

export type AttemptExecutionMode = 'background-worker' | 'active-session';

export type AttemptStatus =
  | 'running'
  | 'passed'
  | 'failed'
  | 'blocked'
  | 'cancelled';

export type DirtyRootDecision = 'auto-save' | 'auto-save-timeout' | 'isolated';

export interface LoopAttempt {
  id: string;
  attemptNumber: number;
  executionMode: AttemptExecutionMode;
  routingReason?: string; // why hybrid picked this mode (D-09)
  status: AttemptStatus;
  workdir: AttemptWorkdir;
  parentSessionId: string; // D-15: loop sessionId or "orchestrator:<loopId>"
  baseRef: string; // pre-attempt HEAD — the rollback target (D-07)
  dirtyRootDecision?: DirtyRootDecision; // dirty-root start gate (D-07)
  checkpointId?: string; // optional post-attempt commit, NOT the rollback target
  triggerId?: string;
  workerRunId?: string; // subagent run UUID (in-memory tracker correlation)
  sessionTurnId?: string; // active-session: correlation id from host.session send
  workerInstruction?: WorkerInstruction; // redacted; full prompt for replay
  workerResponsePath?: string; // artifact: raw worker text (D-08/D-14)
  changedFiles: string[];
  /** Hash of the attempt's diff; proxy for "equivalent diff" in no-progress detection (D-13). */
  diffFingerprint?: string;
  /** True when this attempt ran past a no-progress block via an explicit override (D-13). */
  noProgressOverride?: boolean;
  checkResults: CheckResult[];
  learned?: string; // summary distilled into next-attempt context
  nextAction?: string;
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number; cost?: number };
  model?: string;
  startedAt: string;
  endedAt?: string;
}

// ── Attempt workdir ──────────────────────────────────────────────────────────

export type WorkdirMode = 'workspace-root' | 'worktree';

export interface AttemptWorkdir {
  mode: WorkdirMode;
  workspaceRoot: string; // absolute host path of the registered workspace
  cwd: string; // workspaceRoot or a path under .sero/worktrees/
  worktreePath?: string;
  branchName?: string;
}

/**
 * An in-workspace git worktree owned by a loop (Phase 6, D-06). Created lazily
 * on the first isolated attempt and reused across attempts so the loop iterates
 * forward on one branch. The work-item id is a neutral handle mapped onto the
 * host worktree API's card slot — Orchestrator never speaks "card".
 */
export interface LoopWorktree {
  workItemId: string;
  path: string; // absolute worktree path under .sero/worktrees/ — the attempt cwd
  branch: string; // branch checked out in the worktree; the PR head
}

// ── Pull request (Phase 6) ───────────────────────────────────────────────────

export interface PullRequestPolicy {
  /** Open a PR automatically when the loop completes (opt-in; needs worktree isolation). */
  openOnComplete: boolean;
  draft?: boolean; // open as a draft PR
  baseBranch?: string; // base branch; the host default when omitted
}

/** Mirrors host `AppRuntimePullRequestMergeState` (kept local — shared/ is dependency-free). */
export type PullRequestState = 'open' | 'merged' | 'closed' | 'unknown';

export interface PullRequestRef {
  number: number;
  url: string;
  state: PullRequestState;
  branch: string;
  openedAt: string;
}

// ── Worker instruction ───────────────────────────────────────────────────────

export type WorkerRole =
  | 'planner'
  | 'implementer'
  | 'reviewer'
  | 'summarizer'
  | 'custom';

export interface WorkerInstruction {
  role: WorkerRole;
  systemPrompt: string; // passed inline to runStructured
  taskPrompt: string; // becomes runStructured `task`
  outputSchema?: unknown; // enforced by the COORDINATOR, not the subagent
  platformTools: 'all' | 'readOnly' | 'none';
  isolated?: boolean; // true on worktrees
  timeoutMs?: number;
  model?: string;
  thinking?: string;
}

// ── Stop rule ────────────────────────────────────────────────────────────────

export interface StopRule {
  maxAttempts: number;
  requireAllChecks: boolean;
  stopOnNoProgressAttempts?: number;
  noProgressPolicy?: NoProgressPolicy;
}

export interface NoProgressPolicy {
  compareFailedChecks: boolean;
  compareDiffFingerprint: boolean;
  compareChangedFiles: boolean;
}

// ── Run budget ───────────────────────────────────────────────────────────────

export interface RunBudget {
  // cumulative across the whole loop (all attempts)
  maxWallClockMs?: number; // summed attempt durations
  maxTotalTokens?: number; // summed background-worker token usage
  maxCostUsd?: number; // optional cost ceiling derived from usage
  // per attempt
  maxChangedFiles?: number; // diff over this blocks the loop for review
  maxAttemptWallClockMs?: number; // hard per-attempt timeout
  // per command / check
  maxCommandRuntimeMs?: number; // default timeout for each check/command run
}

// ── Loop task ────────────────────────────────────────────────────────────────

export type LoopTaskStatus = 'todo' | 'active' | 'blocked' | 'done' | 'cancelled';

export interface LoopTask {
  id: string;
  title: string;
  description?: string;
  status: LoopTaskStatus;
  blockedBy?: string[];
  acceptance?: string[];
  assignedRole?: WorkerRole;
  createdAt: string;
  updatedAt: string;
}

// ── Check result ─────────────────────────────────────────────────────────────

export type CheckStatus = 'passed' | 'failed' | 'skipped' | 'cancelled';

export interface CheckResult {
  checkId: string;
  type: CheckType;
  status: CheckStatus;
  command?: string;
  summary: string; // from host.verification.summarizeFailure + tail
  stdoutPath?: string; // artifact path; full output never inline
  stderrPath?: string;
  exitCode?: number;
  durationMs?: number;
  startedAt: string;
  endedAt: string;
}

// ── Log policy ───────────────────────────────────────────────────────────────

export interface LogPolicy {
  retainAttempts: number; // older attempts pruned from state
  retainArtifacts: boolean;
  maxInlineOutputBytes: number; // output beyond this goes to artifact files only
}

// ── Session target ───────────────────────────────────────────────────────────

export interface SessionTarget {
  workspaceId: string;
  sessionId?: string;
  strategy: 'specific-session' | 'most-recent-active' | 'ask-user';
  deliverAs: 'steer' | 'followUp';
  triggerTurn: boolean;
}

// ── Control plane (D-01) ─────────────────────────────────────────────────────

/**
 * Authoring shape for creating a loop. The coordinator normalizes this into a
 * full {@link LoopGoal} (fills id/timestamps/workspaceId/defaults/empty
 * attempts). Maps to the data model's `create` action, keeping the tool/UI
 * surface ergonomic while the coordinator owns canonicalization.
 */
export interface CreateLoopInput {
  title: string;
  goal: string;
  executionMode?: ExecutionMode;
  hybridPolicy?: HybridPolicy;
  /** Run attempts in an isolated in-workspace worktree (background-worker only, D-06). */
  isolation?: WorkdirMode;
  /** Open a PR when the loop completes (opt-in; requires worktree isolation). */
  prPolicy?: PullRequestPolicy;
  sessionId?: string;
  defaultCwd?: string;
  triggers?: LoopTrigger[];
  checks?: LoopCheck[];
  stopRule?: Partial<StopRule>;
  budget?: RunBudget;
  logPolicy?: Partial<LogPolicy>;
  tasks?: LoopTask[];
}

export type OrchestratorAction =
  | { kind: 'create'; input: CreateLoopInput }
  | { kind: 'list' }
  | { kind: 'show'; loopId: string }
  | { kind: 'pause'; loopId: string }
  | { kind: 'resume'; loopId: string }
  | { kind: 'stop'; loopId: string }
  | {
      kind: 'run_next';
      loopId: string;
      overrideNoProgress?: boolean;
      // Internal (scheduler/event-router only): when an attempt is already in
      // flight for this loop, queue ONE rerun to fire after it resolves instead
      // of rejecting (D-02 "due again"). Tools/UI never set this, so a manual
      // run_next on a busy loop still gets the "already running" error.
      queueIfBusy?: boolean;
    }
  // Phase 1.5 spike: prove the active-session host seam end to end (idle-gated
  // send + turn-completion observation). CLI-only; not part of the structured
  // tool / UI surface.
  | { kind: 'diagnose_session' };

export type OrchestratorActionKind = OrchestratorAction['kind'];

/**
 * Who issued an action. The coordinator uses `sessionId` to reject control
 * requests that originate from an orchestrator worker session (D-16 recursion
 * guard). Trusted callers (UI, the scheduler) omit it.
 */
export interface ActionSource {
  sessionId?: string | null;
}

export interface OrchestratorActionResult {
  ok: boolean;
  /** Plain-English outcome for tools/UI to surface directly. */
  message?: string;
  loop?: LoopGoal;
  loops?: LoopGoal[];
  error?: string;
}

// ── Defaults & normalization ─────────────────────────────────────────────────

export const STATE_VERSION = 1 as const;

export const DEFAULT_STATE: OrchestratorState = {
  version: STATE_VERSION,
  loops: [],
};

export const DEFAULT_STOP_RULE: StopRule = {
  maxAttempts: 10,
  requireAllChecks: true,
  stopOnNoProgressAttempts: 3,
  noProgressPolicy: {
    compareFailedChecks: true,
    compareDiffFingerprint: true,
    compareChangedFiles: true,
  },
};

export const DEFAULT_LOG_POLICY: LogPolicy = {
  retainAttempts: 20,
  retainArtifacts: true,
  maxInlineOutputBytes: 4000,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Coerce arbitrary parsed JSON into a valid OrchestratorState. Unknown loops
 * are passed through structurally; we only guarantee the top-level shape so a
 * partially-written or future-version file never crashes a reader.
 */
export function normalizeOrchestratorState(value: unknown): OrchestratorState {
  if (!isRecord(value)) return { ...DEFAULT_STATE };
  const loops = Array.isArray(value.loops)
    ? value.loops.filter((loop): loop is LoopGoal => isRecord(loop) && typeof loop.id === 'string')
    : [];
  return { version: STATE_VERSION, loops };
}
