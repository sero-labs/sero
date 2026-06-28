# 01 — Data Model

This is the persisted state model for `plugins/sero-orchestrator-plugin/shared/types.ts`.

The model stores LLM-authored step plans, user-selected workspace settings, and
generic runtime history. It does not encode a fixed workflow and it does not add
Orchestrator-specific execution restrictions.

State is persisted one file per loop (`loops/<loopId>/loop.json`) with a
lightweight `index.json` summary list, all through `host.appState` under the
workspace-scope app dir (see [00 D-07](00-architecture.md#d-07--state-scope)).
`OrchestratorState` is the in-memory composition of those files. Large outputs
are stored as artifacts under each loop's folder and referenced by path.

Open-ended plan, runtime, observation, and schema data uses TypeScript-native
shapes such as `Record<string, unknown>` or `unknown`. Implementations can add
generic parameters where a concrete caller needs narrower types.

## Top-Level State

```ts
interface OrchestratorState {
  version: 1;
  loops: Loop[];
}
```

Any cross-workspace dashboard index is derived. It is not authoritative.

## Loop

```ts
interface Loop {
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
  /** Optional user context override (custom instructions + disabled tools/skills) for the loop's subagents. UI-only, never planner-managed. */
  contextOverrides?: ContextOverrides;
  runs: LoopRun[];
  revisions: PlanRevision[];
  /** Durable lessons reflection learned from this loop's history (see 06-reflection.md). */
  insights?: LoopInsight[];
  /** History-driven improvements pending the user's approve/reject (see 06-reflection.md). */
  suggestions?: LoopSuggestion[];
  /** Resolved human-input requests — planner clarifications + step questions (see 07-human-input.md). */
  answeredInputs?: AnsweredInput[];
  createdAt: string;
  updatedAt: string;
}

type LoopStatus =
  | "draft"
  | "active"
  | "paused"
  | "blocked"
  | "complete"
  | "stopped";
```

`status` is the Orchestrator lifecycle. Logical completion is signaled by a
planned step outcome and recorded in `runtime.completion`.

```ts
interface LoopWarning {
  id: string;
  code: "mixed-workspace-targets" | "model-unavailable";
  message: string;
  stepId?: string; // the step a runtime warning refers to (model-unavailable)
  createdAt: string;
}
```

Warnings do not block activation. They expose important execution consequences
to the user and UI. `model-unavailable` is a runtime warning: a step's pinned
model was not available, so the `MED` tier was used instead. It is re-evaluated
each run (cleared at the start of a run, re-added if the model is still gone).

## Loop Workspace Settings

Workspace isolation is a user-level loop setting. The LLM-authored plan does not
choose whether a loop runs in the workspace root or in a worktree.

```ts
interface LoopWorkspaceSettings {
  useManagedWorktree: boolean;
  reuseExistingWorktree: boolean;
  dirtyWorkspacePromptTimeoutMs: number;
  dirtyWorkspaceDefaultAction: "create-managed-worktree";
  allowDirtyWorkspaceRoot: boolean;
}
```

Defaults for a new loop:

- `useManagedWorktree: true`;
- `reuseExistingWorktree: true`;
- `dirtyWorkspacePromptTimeoutMs: 30_000`;
- `dirtyWorkspaceDefaultAction: "create-managed-worktree"`;
- `allowDirtyWorkspaceRoot: false`.

If `useManagedWorktree` is true, Orchestrator creates or reuses one managed
worktree for the loop and runs background-agent filesystem work there. If it is
false, Orchestrator normally uses the registered workspace root.

`allowDirtyWorkspaceRoot` is a user-owned opt-in that only applies in
workspace-root mode: when set, the loop runs in the workspace root even when it
has uncommitted changes, skipping the dirty preflight (no git status call, no
prompt). It has no effect under a managed worktree. This is the predictable
primitive for recurring edit-in-place loops whose own leftover changes would
otherwise look "dirty" on the next run.

## Loop Plan

The planner returns a `PlanningResponse`. The contained `LoopPlan` is the
LLM-authored workflow. The surrounding response fields map onto `Loop` fields.

```ts
interface PlanningResponse {
  schemaVersion: 1;
  title: string;
  summary: string;
  plan: LoopPlan;
  suggestedTriggers?: LoopTriggerSuggestion[];
  suggestedLimits?: Partial<LoopLimits>;
}

interface LoopTriggerSuggestion {
  type: "manual" | "cron" | "event" | "hybrid";
  schedule?: string;
  eventSource?: string;
  eventFilter?: Record<string, unknown>;
  debounceMs?: number;
  maxFires?: number;
}
```

Mapping rules:

- `PlanningResponse.title` maps to `Loop.title` unless the user supplied a
  title;
- `PlanningResponse.summary` maps to `Loop.summary`;
- `PlanningResponse.plan` maps to `Loop.plan`;
- `PlanningResponse.suggestedTriggers` are materialized into persisted
  `LoopTrigger` records unless the user supplied trigger options;
- `PlanningResponse.suggestedLimits` are merged with default limits and then
  overridden by user-supplied limits.

```ts
interface LoopPlan {
  schemaVersion: 1;
  revision: number;
  objective: string;
  steps: LoopStepDefinition[];
  globalInstructions?: string;
  variablesSchema?: unknown;
}
```

Validation rules:

- step ids must be unique;
- `dependsOn` references must point at existing steps;
- dependency graphs must be acyclic;
- execution targets must be supported;
- at least one step must exist;
- the plan must funnel to exactly one final step — one step that nothing else
  depends on — which emits the completion signal. When the model wires no
  `dependsOn` at all, the ordered step list is normalized into a sequential
  chain (each step after the previous); when it wires some dependencies, that
  structure must already converge on one final step or the plan is rejected.

Validation only checks structure. It does not decide whether the workflow is
safe, cheap, advisable, or likely to succeed.

## Step Definition

```ts
interface LoopStepDefinition {
  id: string;
  title: string;
  instructions: string;
  expectedOutcome?: string;
  dependsOn?: string[];
  execution: StepExecutionTarget;
  onFailure?: string;            // optional LLM-authored recovery hint
  maxAttempts?: number;          // optional per-step limit, capped by loop limits
  produces?: string[];           // routing variables this step records (branching)
  when?: StepGuard;              // branch guard; absent ⇒ the step always runs
}

interface StepGuard {
  var: string;                            // routing variable read from runtime.variables
  in?: (string | number | boolean)[];     // taken when the value is one of these
  default?: true;                         // taken only when no sibling in-guard matched
}
```

Sequential work is represented by `dependsOn`. Parallel work is represented by
multiple steps with satisfied dependencies. Conditional work is represented by
guards: a judge step records a routing variable (declared in `produces`) and
branch steps carry a `when` guard on it — see
[05-branching.md](05-branching.md).

## Step Execution Target

```ts
type StepExecutionTarget =
  | BackgroundAgentTarget
  | ActiveSessionTarget
  | ModelTarget;

interface BackgroundAgentTarget {
  type: "background-agent";
  model?: string;
  thinking?: string;
}

interface ActiveSessionTarget {
  type: "active-session";
  sessionTarget: SessionTarget;
}

interface ModelTarget {
  type: "model";
  model?: string;
  thinking?: string;
  outputSchema?: unknown;
}
```

These targets identify which standard Sero execution path to use. They do not
define a separate Orchestrator permission model.

`model` on a background-agent or model step is the per-step model choice. The
planner picks a **tier** (`"LOW"` | `"MED"` | `"HIGH"`) for each step based on
how hard the step is; the user can override it from the plan view (keep the
tier, pick a different tier, or pin a specific `"provider/modelId"`). At run
time the step's model is resolved against the machine's available models
(`host.listAvailableModels()`): tiers pass straight through (the subagent runner
maps them to the user's configured tier model), and a **pinned model that is no
longer available falls back to the `MED` tier** with a `model-unavailable`
warning on the loop. An absent `model` uses the session default.

`ModelTarget.outputSchema` is included in the model prompt as an expected output
shape. The current `runStructured` host API does not accept or enforce a schema
parameter, so Orchestrator still parses and validates the returned text.

## Workflow Workspace Context

```ts
interface ResolvedWorkspaceContext {
  id: string;
  type: "workspace-root" | "managed-worktree";
  workspaceRoot: string;
  cwd: string;
  worktreePath?: string;
  branchName?: string;
  resolvedBy:
    | "create-option"
    | "clean-workspace"
    | "dirty-workspace-choice"
    | "dirty-workspace-timeout";
  createdAt: string;
}

type DirtyWorkspaceAction =
  | "stash-current-changes"
  | "create-managed-worktree"
  | "defer-workflow";

interface DirtyWorkspacePrompt {
  id: string;
  status: "pending" | "resolved" | "timed-out";
  detectedAt: string;
  expiresAt: string;
  decision?: DirtyWorkspaceDecision;
}

interface DirtyWorkspaceDecision {
  action: DirtyWorkspaceAction;
  source: "user" | "timeout";
  decidedAt: string;
  stashRef?: string;
  contextId?: string;
}

interface LoopWorkspaceRuntime {
  resolved?: ResolvedWorkspaceContext;
  dirtyPrompt?: DirtyWorkspacePrompt;
  lastDirtyCheckAt?: string;
  deferredReason?: string;
}
```

Workspace rules:

- Background-agent steps use the resolved loop workspace cwd.
- Active-session steps use the active session's workspace root. A live session
  cannot be repointed to a managed worktree.
- Model-only steps use no filesystem cwd unless relevant context is included in
  the prompt as text.
- Managed worktrees are created and tracked by Orchestrator, but work inside
  them still runs through standard Sero execution.
- Stashing current workspace changes is only allowed after an explicit user
  choice from the dirty-workspace prompt.

## Runtime State

```ts
interface LoopRuntimeState {
  parentSessionId: string;
  variables: Record<string, unknown>;
  stepStates: Record<string, StepRuntimeState>;
  workspace: LoopWorkspaceRuntime;
  activeRunId?: string;
  dueAgain?: boolean;
  completion?: CompletionSignal;
  block?: LoopBlock;
  // A durable question the loop is waiting on. While set, the loop is parked: no
  // steps start and scheduled fires hold off until answered (see 07-human-input.md).
  pendingInput?: PendingInput;
  lastRunAt?: string;
  // Open PRs this loop has raised — branch name matches the loop id. Refreshed at
  // each run start (merged/closed PRs drop out); injected into background-agent
  // step context so an iteration doesn't redo work an open PR already covers.
  pullRequests?: AppRuntimePullRequestSummary[];
}

interface LoopBlock {
  kind:
    | "planned-block"
    | "recovery-block"
    | "management-limit"
    | "validation-error"
    | "runtime-error";
  reason: string;
  createdAt: string;
  sourceStepId?: string;
  sourceAttemptId?: string;
  limit?: keyof LoopLimits;
}

interface StepRuntimeState {
  status: StepStatus;
  attempts: number;
  lastAttemptId?: string;
  outcome?: StepOutcome;
  updatedAt: string;
}

type StepStatus =
  | "pending"
  | "ready"
  | "running"
  | "succeeded"
  | "failed"
  | "blocked"
  | "skipped"
  | "needs-revision";
```

`ready` is derived from dependencies but may be stored for UI convenience.

## Trigger

```ts
interface LoopTrigger {
  id: string;
  loopId: string;
  workspaceId: string;
  type: "manual" | "cron" | "event" | "hybrid";
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
```

Triggers mark a loop due. They do not execute workflow work directly.

When `maxFires` is set and `fireCount` reaches it, Orchestrator sets
`disabled: true` after recording the final fire.

## Loop Limits

```ts
interface LoopLimits {
  maxAttemptsPerStep?: number;
  maxAttemptsTotal?: number;
  maxConcurrentSteps?: number;
  maxWallClockMs?: number;
  maxTotalTokens?: number;
  maxCostUsd?: number;
}
```

Limits are Orchestrator management controls. They do not restrict what a Sero
agent can do inside an execution. When a limit is reached, Orchestrator stops
starting new attempts and blocks the loop with `LoopBlock.kind =
"management-limit"`.

## Loop Run

```ts
interface LoopRun {
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

type LoopRunStatus =
  | "running"
  | "waiting"
  | "completed"
  | "blocked"
  | "failed"
  | "cancelled"
  | "orphaned";
```

`waiting` means the LLM or plan left no runnable step until a future trigger,
manual action, or revision.

## Step Attempt

```ts
interface StepAttempt {
  id: string;
  stepId: string;
  attemptNumber: number;
  parentSessionId: string;
  executionType: StepExecutionTarget["type"];
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

type StepAttemptStatus =
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "orphaned";

interface StepOutcome {
  status:
    | "succeeded"
    | "failed"
    | "blocked"
    | "skipped"
    | "needs-revision";
  summary: string;
  variables?: Record<string, unknown>;
  completion?: StepCompletion;
  // The step needs the user to answer before it can finish. When present, the
  // loop parks instead of applying this outcome or running recovery, and the
  // step re-runs once answered (see 07-human-input.md).
  questions?: HumanQuestion[];
}
```

`status` is the mechanical execution status. `outcome` is the LLM-reported or
LLM-evaluated logical result of the step. A loop completes only when a planned
step outcome includes `completion.status === "complete"`.

When `StepOutcome.variables` is present, Orchestrator shallow-merges those keys
into `runtime.variables` after accepting the outcome, and injects the current
`runtime.variables` plus completed dependency results into each step's prompt —
this is how steps share context instead of re-discovering it. Later values
replace earlier values for the same key, EXCEPT the reserved `notes` key, which
accumulates (append) into a running shared scratchpad across steps. If
`variables` is omitted, runtime variables do not change.

## Recovery Decision

```ts
interface RecoveryDecision {
  id: string;
  stepId: string;
  failedAttemptId: string;
  decision:
    | "retry-step"
    | "revise-step"
    | "revise-plan"
    | "skip-step"
    | "accept-step"
    | "wait"
  | "block-loop";
  reason: string;
  revisedStep?: LoopStepDefinition;
  revisedPlan?: LoopPlan;
  acceptedOutcome?: StepOutcome;
  createdAt: string;
  modelResponsePath?: string;
}
```

The canonical recovery decisions are `retry-step`, `revise-step`,
`revise-plan`, `skip-step`, `accept-step`, `wait`, and `block-loop`.
`revise-plan` is the way to add, remove, or reorder steps. `accept-step` is for
when the step actually met its goal but its outcome was mis-reported: the
decision carries `acceptedOutcome` (the success `StepOutcome` the step should
have reported), which the engine applies through the normal outcome path so its
variables and any completion signal flow. `block-loop` sets `LoopBlock.kind =
"recovery-block"`. Orchestrator validates any revised step or plan before
applying it.

## Completion Signal

```ts
interface CompletionSignal {
  status: "complete" | "blocked";
  sourceStepId: string;
  sourceAttemptId: string;
  reason: string;
  createdAt: string;
  modelResponsePath?: string;
}

interface StepCompletion {
  status: "complete" | "blocked";
  reason: string;
}
```

Completion is signaled by planned step execution. Orchestrator does not ask for
an unplanned completion check when queues are empty or steps succeed.

## Observation

```ts
interface Observation {
  id: string;
  source:
    | "model"
    | "background-agent"
    | "active-session"
    | "manual"
    | "event"
    | "system";
  summary: string;
  data?: Record<string, unknown>;
  artifactPath?: string;
  createdAt: string;
}
```

## Plan Revision

```ts
interface PlanRevision {
  revision: number;
  previousRevision: number;
  reason: string;
  proposedBy: "model" | "user";
  status: "applied" | "rejected";
  plan: LoopPlan;
  createdAt: string;
  appliedAt?: string;
  rejectionReason?: string;
}
```

## Session Target

```ts
interface SessionTarget {
  workspaceId: string;
  sessionId?: string;
  strategy: "specific-session" | "most-recent-active" | "ask-user";
  deliverAs: "steer" | "followUp" | "nextTurn";
  triggerTurn: boolean;
}
```

## Usage Summary

```ts
interface UsageSummary {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
  durationMs?: number;
}
```

Usage is recorded when the underlying Sero execution reports it.

## Log Policy

```ts
interface LogPolicy {
  retainRuns: number;
  retainArtifacts: boolean;
  maxInlineOutputBytes: number;
  /** Durable run digests kept for reflection (survive run pruning). Default 50. */
  retainDigests?: number;
}
```

## Reflection (self-improvement)

On-demand reflection reads a loop's durable run history and proposes improvements
to its plan. The full model lives in
[06-reflection.md](06-reflection.md); the persisted additions are:

- `RunDigest` — a compact, durable per-run record stored in the loop's colocated
  `loops/<id>/digests.json` (outside `loop.json` and outside run pruning).
- `LoopInsight` — a durable lesson carried across reflection passes (`Loop.insights`).
- `LoopSuggestion` — a pending plan improvement (`Loop.suggestions`) the user
  approves (applied through the revise path, recording a `PlanRevision`) or rejects
  (kept with a reason for the reflection feed).

The watched `LoopSummary` carries a `pendingSuggestions` count for the loop-list
badge.

## Human input (ask the user)

A step or the planner can raise a question that parks the loop until the user
answers. The full model lives in [07-human-input.md](07-human-input.md); the
persisted additions are:

- `PendingInput` — the durable question(s) the loop is parked on
  (`runtime.pendingInput`), with `source: "planner" | "step"`. No timeout, no
  default — the loop waits until answered, and scheduled fires hold off.
- `AnsweredInput` — a resolved request (`Loop.answeredInputs`), kept for history
  and (for step questions) fed back into the asking step's next attempt.
- `StepOutcome.questions` / `ClarifyingResponse` — how a step / the planner asks.
- The watched `LoopSummary` carries a `pendingInput` count for the loop-list badge.

## Coordinator Actions

Tools, slash commands, and UI send these request envelopes to the coordinator.

```ts
type OrchestratorAction =
  | { kind: "create"; prompt: string; title?: string; options?: CreateLoopOptions }
  | { kind: "activate"; loopId: string }
  | { kind: "list" }
  | { kind: "show"; loopId: string }
  | { kind: "disable"; loopId: string }
  | { kind: "enable"; loopId: string }
  | { kind: "run_next"; loopId: string }
  | { kind: "run_again"; loopId: string }
  | { kind: "retry"; loopId: string }
  | { kind: "retry_step"; loopId: string; stepId: string }
  | { kind: "revise"; loopId: string; prompt?: string }
  | { kind: "choose_recovery"; loopId: string; decision: RecoveryDecision }
  | { kind: "set_step_model"; loopId: string; stepId: string; model?: string; thinking?: string }
  | { kind: "set_loop_context"; loopId: string; overrides: ContextOverrides | null }
  | { kind: "reflect"; loopId: string }
  | { kind: "reflect_workspace" }
  | { kind: "choose_suggestion"; loopId: string; suggestionId: string; decision: "approve" | "reject"; rejectionReason?: string }
  | { kind: "answer_input"; loopId: string; requestId: string; answers: InputAnswer[] }
  | { kind: "delete"; loopId: string; deleteBranch?: boolean };

interface CreateLoopOptions {
  activate?: boolean;
  triggers?: LoopTriggerSuggestion[];
  limits?: Partial<LoopLimits>;
  workspace?: Partial<LoopWorkspaceSettings>;
}

interface OrchestratorActionResult {
  ok: boolean;
  loop?: Loop;
  loops?: Loop[];
  run?: LoopRun;
  error?: string;
}
```
