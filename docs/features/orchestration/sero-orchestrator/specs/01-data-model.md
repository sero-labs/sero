# 01 — Data model

The complete state model, in `plugins/sero-orchestrator-plugin/shared/types.ts`.
It is specific enough to support both execution modes, scheduled triggers,
generated workers, normalized checks, and attempt history — without becoming a
generic `pi-tasks` clone.

All of this is persisted through `host.appState` at the workspace-scope state
path ([02 §App state](02-integration-seams.md#app-state)). Large output is
**not** stored inline — see `LogPolicy` and `CheckResult.*Path`.

## Top-level state

```ts
interface OrchestratorState {
  version: 1;
  loops: LoopGoal[];
}
```

Any cross-workspace dashboard index (D-03) is a separate derived structure, not
part of this authoritative file.

## Loop goal

```ts
interface LoopGoal {
  id: string;
  workspaceId: string;
  defaultCwd?: string;            // preference only; attempt.workdir.cwd is canonical
  sessionId?: string;            // bound target session (active-session/hybrid)
  executionMode: "background-worker" | "active-session" | "hybrid";
  hybridPolicy?: HybridPolicy;   // required when executionMode === "hybrid"
  isolation?: "workspace-root" | "worktree"; // worktree isolation, opt-in (Phase 6, D-06)
  worktree?: LoopWorktree;       // lazily-created, reused in-workspace worktree (Phase 6)
  prPolicy?: PullRequestPolicy;  // open a PR on complete, opt-in (Phase 6)
  pullRequest?: PullRequestRef;  // the PR opened for this loop, once complete (Phase 6)
  title: string;
  goal: string;
  status: "draft" | "active" | "paused" | "blocked" | "complete" | "stopped";
  statusReason?: string;         // plain-English blocker/stop reason for the UI
  blockedReason?: BlockedReason; // machine-readable block reason; governs recovery
  triggers: LoopTrigger[];
  checks: LoopCheck[];
  stopRule: StopRule;
  budget?: RunBudget;            // cost/blast-radius limits beyond maxAttempts (D-17)
  logPolicy: LogPolicy;
  tasks: LoopTask[];
  attempts: LoopAttempt[];       // bounded to LogPolicy.retainAttempts
  createdAt: string;
  updatedAt: string;
}

type BlockedReason =
  | "no-progress"            // overridable once via run_next --override-no-progress
  | "budget-exhausted"      // clears only when the limit is raised + resumed
  | "changed-files-exceeded"// clears only when the limit is raised + resumed
  | "unsafe";
```

`statusReason` is the human-facing string; `blockedReason` is the structured
discriminator the coordinator branches on when deciding whether `run_next` may
override a block (no-progress) or whether the user must raise a limit first
(budget / changed-files) — see [00 §D-13](00-architecture.md#d-13-stop-rules) /
[D-17](00-architecture.md#d-17-run-budgets).

`defaultCwd` only seeds a new attempt's workdir resolution. Once an attempt
starts, `LoopAttempt.workdir.cwd` is the single source of truth (D-06).

## Hybrid policy

```ts
type HybridPolicy =
  | "prefer-active-session"
  | "prefer-background-worker"
  | "active-if-session-idle"
  | "ask-user";
```

Routing semantics are defined in
[00 §D-09](00-architecture.md#d-09-hybrid-routing). The chosen mode and its
reason are recorded on each attempt.

## Loop trigger

Triggers mark loop work **due**; they never execute detached prompts (Principle
6). Modeled separately from cron's job shape because Orchestrator carries far
more metadata.

```ts
interface LoopTrigger {
  id: string;
  loopId: string;
  workspaceId: string;
  sessionId?: string;
  type: "manual" | "cron" | "event" | "hybrid";
  schedule?: string;             // 5-field cron expr when type includes cron
  eventSource?: string;          // e.g. "vcs", "check", "session", "workspace"
  eventFilter?: unknown;
  debounceMs?: number;
  maxFires?: number;
  fireCount: number;
  lastFireAt?: string;
  nextFireAt?: string;
  disabled?: boolean;
}
```

Debounce state (`lastFireAt`, `fireCount`) is persisted so it survives restart,
mirroring cron's `lastTickMinute` carry-over
([02 §Cron patterns](02-integration-seams.md#cron-patterns)).

## Loop check

```ts
type LoopCheck =
  | { type: "verification"; command: string; required: boolean }
  | { type: "command"; command: string; required: boolean }
  | { type: "review"; reviewer: "quality-reviewer" | "spec-reviewer"; required: boolean };
```

`verification` checks are seeded from `host.verification.detectVerificationCommands`
when the user provides none. `eval` is a future command-backed check type.

## Loop attempt

```ts
interface LoopAttempt {
  id: string;
  attemptNumber: number;
  executionMode: "background-worker" | "active-session";
  routingReason?: string;        // why hybrid picked this mode (D-09)
  status: "running" | "passed" | "failed" | "blocked" | "cancelled";
  workdir: AttemptWorkdir;
  parentSessionId: string;       // D-15: loop sessionId or "orchestrator:<loopId>"
  baseRef: string;               // pre-attempt HEAD — the rollback target (D-07)
  dirtyRootDecision?: "auto-save" | "auto-save-timeout" | "isolated";  // dirty-root start gate (D-07); deferrals logged at loop level
  checkpointId?: string;         // optional post-attempt commit for inspection, NOT the rollback target
  triggerId?: string;
  workerRunId?: string;          // subagent run UUID (in-memory tracker correlation)
  sessionTurnId?: string;        // active-session: correlation id returned by host.session send (D-05)
  workerInstruction?: WorkerInstruction;  // redacted; full prompt for replay
  workerResponsePath?: string;   // artifact: raw worker text (D-08/D-14)
  changedFiles: string[];
  diffFingerprint?: string;      // hash of the diff; proxy for "equivalent diff" in no-progress (D-13)
  noProgressOverride?: boolean;  // this attempt ran past a no-progress block via an explicit override (D-13)
  checkResults: CheckResult[];
  learned?: string;              // summary distilled into next-attempt context
  nextAction?: string;
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
  model?: string;
  startedAt: string;
  endedAt?: string;
}
```

`workerRunId` correlates to the in-memory subagent tracker only and is **not**
durable across restart — the durable record is everything else on this object
([02 §Subagents](02-integration-seams.md#subagents)).

## Attempt workdir

The correctness boundary (D-06). Every operation in an attempt uses `cwd`.

```ts
interface AttemptWorkdir {
  mode: "workspace-root" | "worktree";
  workspaceRoot: string;         // absolute host path of the registered workspace
  cwd: string;                   // workspaceRoot or a path under .sero/worktrees/
  worktreePath?: string;
  branchName?: string;
}
```

`cwd` must always be inside `workspaceRoot`; `runWorkspaceCommand` rejects
anything else ([02 §Verified facts](02-integration-seams.md#verified-facts)).
**Active-session attempts require `mode: "workspace-root"`** — a live session's
tool cwd cannot be repointed at a worktree, so only background-worker attempts
may use `mode: "worktree"` (D-06).

## Worktree + pull request (Phase 6)

```ts
interface LoopWorktree {
  workItemId: string;            // neutral id mapped onto the host card slot
  path: string;                  // absolute worktree path under .sero/worktrees/
  branch: string;                // branch checked out in the worktree; the PR head
}

interface PullRequestPolicy {
  openOnComplete: boolean;       // open a PR when the loop completes (opt-in)
  draft?: boolean;
  baseBranch?: string;           // host default when omitted
}

interface PullRequestRef {       // recorded after the PR opens
  number: number;
  url: string;
  state: "open" | "merged" | "closed" | "unknown";
  branch: string;
  openedAt: string;
}
```

Worktree isolation is background-worker only and opt-in (`isolation:
"worktree"`, or implied by `prPolicy.openOnComplete`). The worktree is created
once per loop via the neutral `runtime/worktree.ts` wrapper and reused across
attempts. A completed worktree loop that opted in pushes its branch and opens a
PR with a deterministically generated title/body; merging stays a manual action.

## Worker instruction

The first-class generated-worker contract (D-08). `agent` is not just a template
name — each attempt builds a full instruction.

```ts
interface WorkerInstruction {
  role: "planner" | "implementer" | "reviewer" | "summarizer" | "custom";
  systemPrompt: string;          // passed inline to runStructured
  taskPrompt: string;            // becomes runStructured `task`
  outputSchema?: unknown;        // enforced by the COORDINATOR, not the subagent
  platformTools: "all" | "readOnly" | "none";
  isolated?: boolean;            // true on worktrees
  timeoutMs?: number;
  model?: string;
  thinking?: string;
}
```

The coordinator derives the worker `cwd` from `LoopAttempt.workdir.cwd`; the
instruction never carries the working directory (D-06). Default tool policy by
role is fixed in [00 §D-10](00-architecture.md#d-10-tool-policies).

## Stop rule

```ts
interface StopRule {
  maxAttempts: number;
  requireAllChecks: boolean;
  stopOnNoProgressAttempts?: number;
  noProgressPolicy?: NoProgressPolicy;
}

interface NoProgressPolicy {
  compareFailedChecks: boolean;
  compareDiffFingerprint: boolean;
  compareChangedFiles: boolean;
}
```

No-progress signals: equivalent failing checks, empty/equivalent diff, unchanged
file set, repeated error class, or a worker/reviewer reporting no material path
forward. Enforcement in [00 §D-13](00-architecture.md#d-13-stop-rules).

## Run budget

`maxAttempts` bounds *count*, not *cost or blast radius*. `RunBudget` adds
cumulative and per-attempt limits, enforced by the coordinator (D-17).

```ts
interface RunBudget {
  // cumulative across the whole loop (all attempts)
  maxWallClockMs?: number;       // summed attempt durations
  maxTotalTokens?: number;       // summed background-worker token usage
  maxCostUsd?: number;           // optional cost ceiling derived from usage
  // per attempt
  maxChangedFiles?: number;      // diff over this blocks the loop for review (changes kept)
  maxAttemptWallClockMs?: number;// hard per-attempt timeout (worker timeoutMs / turn-wait cap)
  // per command / check
  maxCommandRuntimeMs?: number;  // default timeout for each check/command run
}
```

Consumption is **derived** by summing attempt records (durations, `usage`, and
`changedFiles.length`) plus the in-flight attempt's elapsed time — there is no
separate authoritative counter (Principle 3). A cumulative overrun blocks the
loop with reason `budget-exhausted`; a per-attempt `maxChangedFiles` overrun
blocks the loop for review (reason `changed-files-exceeded`) with the attempt's
changes left in place. Both are recoverable by raising the relevant limit.
Token/cost limits bound background-worker spend; active-session turns run in the
user's own session and are attributed best-effort from the observed turn result.

## Loop task

Loop-scoped only (Phase 7 deferred).

```ts
interface LoopTask {
  id: string;
  title: string;
  description?: string;
  status: "todo" | "active" | "blocked" | "done" | "cancelled";
  blockedBy?: string[];
  acceptance?: string[];
  assignedRole?: WorkerInstruction["role"];
  createdAt: string;
  updatedAt: string;
}
```

## Check result

Normalized across all backends (D-12).

```ts
interface CheckResult {
  checkId: string;
  type: LoopCheck["type"];
  status: "passed" | "failed" | "skipped" | "cancelled";
  command?: string;
  summary: string;               // from host.verification.summarizeFailure + tail
  stdoutPath?: string;           // artifact path; full output never inline
  stderrPath?: string;
  exitCode?: number;
  durationMs?: number;
  startedAt: string;
  endedAt: string;
}
```

## Log policy

```ts
interface LogPolicy {
  retainAttempts: number;        // older attempts pruned from state, artifacts optional
  retainArtifacts: boolean;
  maxInlineOutputBytes: number;  // output beyond this goes to artifact files only
}
```

## Session target

Intentionally smaller than the reference `pi-tasks` model. Expands only if
reusable cross-plugin task management becomes a real requirement.

```ts
interface SessionTarget {
  workspaceId: string;
  sessionId?: string;
  strategy: "specific-session" | "most-recent-active" | "ask-user";
  deliverAs: "steer" | "followUp";
  triggerTurn: boolean;
}
```

## Coordinator action (control plane)

The request envelope tools/CLI/UI send to the single executor (D-01).

```ts
type OrchestratorAction =
  | { kind: "create"; loop: Omit<LoopGoal, "id" | "attempts" | "createdAt" | "updatedAt"> }
  | { kind: "list"; }
  | { kind: "show"; loopId: string }
  | { kind: "pause"; loopId: string }
  | { kind: "resume"; loopId: string }
  | { kind: "stop"; loopId: string }
  | { kind: "run_next"; loopId: string; overrideNoProgress?: boolean };

interface OrchestratorActionResult {
  ok: boolean;
  loop?: LoopGoal;
  loops?: LoopGoal[];
  error?: string;
}
```
