# 03 — Execution and Scheduling

This file describes how Orchestrator creates, runs, pauses, resumes, and
schedules step-based loops.

## Lifecycle

Loop lifecycle is generic and separate from step outcomes.

```text
create prompt
    │
    ▼
  draft ──activate──► active ──trigger/manual──► coordinator run
    │                    ▲  │                         │
    │ stop               │  │ pause                   │
    ▼                    │  ▼                         ▼
 stopped             paused ◄────────────── waiting for trigger/revision
                         │
                         │ limit reached / invalid plan / unrecoverable error
                         ▼
                      blocked

planned completion signal: complete / blocked
```

Lifecycle transitions:

| Event | Result |
| --- | --- |
| Prompt creates valid plan | `draft` |
| User or tool activates draft | `active` |
| Manual run or due trigger while active | starts a coordinator run |
| No runnable work and no completion signal | run `waiting`, loop remains `active` or blocks with a clear reason |
| Planned step emits complete signal | loop `complete` |
| Planned step emits blocked signal | loop `blocked` with `runtime.block.kind = "planned-block"` |
| Recovery decision is `block-loop` | loop `blocked` with `runtime.block.kind = "recovery-block"` |
| Management limit is reached | loop `blocked` with `runtime.block.kind = "management-limit"` |
| User pauses | loop `paused`; cancellable background execution is aborted |
| User resumes | loop `active` |
| User stops | loop `stopped` |

Orchestrator does not mark a loop complete without an explicit completion signal
from a planned step outcome.

## Planning Flow

1. Receive a user prompt and optional scheduling or limit hints.
2. Build a planning request containing:
   - the `PlanningResponse` schema;
   - available Sero execution targets;
   - the user's prompt.
3. Call the model through the current Sero model execution path.
4. Parse the model response as JSON.
5. Validate the generated response and contained plan structurally.
6. If validation fails, ask the model to repair the response once with the
   validation errors. If it still fails, store a blocked draft with the errors.
7. Map the response onto `Loop`: title, summary, plan, materialized triggers,
   and merged limits.
8. Add non-blocking warnings such as mixed background-agent and active-session
   dependencies in managed-worktree loops.
9. Persist the loop as `draft`.
10. If the create request explicitly asked to activate, activate only after
   validation succeeds.

The user-facing summary should describe the generated steps and dependencies in
plain language.

The planning prompt must not ask the model to choose workspace root or worktree
use. That choice comes from the user's loop creation options.

## Coordinator Run Flow

When a loop is due, the coordinator runs this algorithm:

1. Check lifecycle. Only `active` loops can start a run.
2. Acquire the per-loop lock. If the lock is held, set `runtime.dueAgain = true`
   and return.
3. Check management limits before starting new step attempts.
4. Resolve the loop workspace if a background-agent filesystem step may start.
5. Compute ready steps:
   - status is `pending`, `ready`, or `failed` with an LLM retry decision;
   - all `dependsOn` steps have outcome status `succeeded` or `skipped`;
   - the step is not already running;
   - the step has attempts remaining.
6. Start ready steps, up to `limits.maxConcurrentSteps`.
7. As each step attempt completes:
   - record mechanical status, output, artifacts, and usage;
   - parse a structured step outcome if present;
   - otherwise ask the LLM to evaluate the raw result into a `StepOutcome`;
   - update the step runtime state.
   - if the step outcome includes a completion signal, apply it and stop.
8. If a step outcome is `failed`, `blocked`, or `needs-revision`, ask the LLM
   for a `RecoveryDecision`.
9. Apply the recovery decision:
   - retry the step;
   - revise the step;
   - revise the plan;
   - skip the step;
   - wait;
   - block the loop with `runtime.block.kind = "recovery-block"`.
10. When no step is running and no step is ready, leave the loop waiting unless a
   step outcome already emitted a completion signal or a management condition
   blocks the loop.
11. Persist the run and updated runtime state.
12. Release the lock.
13. If `runtime.dueAgain` was set during the run and the loop is still active,
    clear the flag and enqueue one more run.

The coordinator never invents steps, retries, recovery actions, validation, or
completion.

## Sequential and Parallel Steps

Sequential execution is represented by dependencies:

```text
step-1 -> step-2 -> step-3 -> step-4
```

Parallel execution is represented by independent ready steps:

```text
step-1 ─┬─> step-2
        ├─> step-3
        └─> step-4
```

If `step-2`, `step-3`, and `step-4` all depend only on `step-1`, Orchestrator may
start them together after `step-1` succeeds, subject to `maxConcurrentSteps`.

## Workspace Preflight and Step Execution

### Workspace Preflight

Before a workflow starts filesystem work, Orchestrator resolves the loop's
workspace setting. This is a user setting stored on the loop, not a generated
step-plan field.

New loops default to `useManagedWorktree: true`.

If the registered workspace root is clean:

- `useManagedWorktree: true` creates or reuses one managed worktree for the
  loop and uses that cwd for background-agent filesystem work;
- `useManagedWorktree: false` uses the registered workspace root.

If `useManagedWorktree: true`, Orchestrator does not prompt about dirty
workspace-root changes. The loop runs in the managed worktree and the root's
uncommitted changes are left untouched.

If `useManagedWorktree: false` and the registered workspace root has
uncommitted changes, Orchestrator shows a visible notification for 30 seconds
with three choices:

- stash current changes and run in the workspace root;
- create an isolated managed worktree and run there;
- defer the workflow.

If the user does not choose before the timeout, Orchestrator creates a managed
worktree and proceeds there.

The resolved workspace is recorded on each step attempt that uses it.

### Background Agent Step

Orchestrator starts a normal background Sero agent with the generated step
instructions, global plan instructions, current variables, relevant
observations, and expected outcome.

Orchestrator passes the resolved workspace cwd to Sero as the background agent
cwd.

Every background-agent run uses the loop-scoped `runtime.parentSessionId`. The
same `parentSessionId` is stored on the `StepAttempt` so the UI can subscribe to
live output with `(workspaceId, parentSessionId)`.

The background agent uses standard Sero runtime behavior. Orchestrator records
the response, usage when available, live output, and artifact paths.

### Active-Session Step

Orchestrator resolves the target session and sends the generated instructions as
a steer, follow-up, next-turn context, or custom message according to the
generated `SessionTarget`.

The active session continues as a normal Sero session. Orchestrator records the
resolved `sessionId`, records the `turnId`, observes completion, and stores the
turn result.

Active-session steps always operate in the live session's workspace root, even
when background-agent steps for the same loop use a managed worktree.

### Model Step

Orchestrator asks the model for structured output using the generated step
instructions. Model steps are also used for planning, outcome evaluation,
recovery, validation, completion signaling, and revision decisions when the plan
contains those steps.

If a `ModelTarget` includes `outputSchema`, Orchestrator includes that schema in
the prompt text. The current host call does not enforce schemas, so Orchestrator
must still parse and validate the returned text.

## Failure Recovery

Step failure always goes back to the LLM unless a management limit has already
blocked the loop.

The recovery prompt includes:

- original user prompt;
- current plan;
- failed step definition;
- failed attempt output and observations;
- prior attempts for the step;
- completed step outcomes;
- remaining management limits.

The LLM returns a `RecoveryDecision`. Orchestrator validates any revised step or
plan before applying it.

Canonical recovery decisions are `retry-step`, `revise-step`, `revise-plan`,
`skip-step`, `accept-step`, `wait`, and `block-loop`. `revise-plan` is the
recovery decision that adds, removes, or reorders steps. `accept-step` is used
when the step actually met its goal but its outcome was mis-reported; the
decision carries `acceptedOutcome`, which the engine applies through the normal
outcome path (so variables and any completion signal flow). `block-loop` sets
`runtime.block.kind = "recovery-block"`.

## Completion Signal

The LLM decides when and how validation happens by including validation or
finalization steps in the plan. Those steps can emit a completion signal in their
`StepOutcome`.

The planner authors exactly one finalization step: the single dependency-graph
sink (the step nothing else depends on). Because only a planned step outcome can
emit completion, the step task builder deterministically reinforces that sink's
prompt to judge the objective and emit a completion signal — so a plan with one
clear final step always has a way to end. When a plan has several leaf steps no
single sink can be identified, and completion is left to the authored step
instructions.

Only a step outcome with `completion.status === "complete"` moves the loop to
`complete`. A step outcome with `completion.status === "blocked"` moves the loop
to `blocked` with `runtime.block.kind = "planned-block"`.

If a step outcome includes `variables`, Orchestrator shallow-merges those keys
into `runtime.variables` after accepting the outcome.

If all current steps have succeeded but no planned step emits a completion
signal, no extra completion check runs. The loop waits for a trigger, manual
revision, or a recovery/plan revision path that adds the missing validation
step.

## Scheduled / Recurring Loops

A loop with an enabled `cron` (or `hybrid`) trigger that is still scheduled to
fire (`isRecurring`) is recurring: it stays `active` between fires. The planner
emits the cron trigger from a natural-language schedule on create (e.g. "every
10 minutes" → `*/10 * * * *`), validated as a 5-field expression (an invalid
schedule fails validation and is repaired).

Each cron fire runs a fresh full pass of the plan:

1. The coordinator skips a loop whose previous iteration is still running
   (`runtime.activeRunId` set) — no overlap.
2. When a fire is due, the prior iteration's managed worktree is removed (its
   branch/PR kept) and the loop is **re-armed**: step states reset to `pending`,
   run context (variables/completion/block/active run) and the resolved
   workspace cleared. The plan, triggers, and run history are kept.
3. The loop runs; each recurring iteration resolves a per-iteration worktree key
   (`<loopId>-r<runNumber>`) so it opens its own pull request.

For a recurring loop, a finalization step's `completion.status === "complete"`
means "this iteration is done" — the loop stays `active` and runs again next
fire. To stop the schedule for good, the step emits `completion.final === true`
(the success criteria the planner encoded from the user's "finish when"), which
makes completion terminal. `maxFires` also stops it: once the trigger is
exhausted the loop is no longer recurring, so the next completion is terminal.

## Management Limits

Orchestrator manages execution limits:

- `maxAttemptsPerStep`;
- `maxAttemptsTotal`;
- `maxConcurrentSteps`;
- `maxWallClockMs`;
- `maxTotalTokens`;
- `maxCostUsd`.

When a limit is reached, Orchestrator stops starting new attempts and blocks the
loop with `runtime.block.kind = "management-limit"`. Limit exhaustion is not
completion.

Run and artifact retention are controlled by `LogPolicy`.

## Restart Recovery

On workspace runtime start, before evaluating triggers, Orchestrator reconciles
persisted in-flight state:

1. If `runtime.activeRunId` points to a run that is no longer observable, mark
   the run `orphaned`.
2. Mark persisted `running` attempts in that run `orphaned`.
3. Move the affected step states to `failed`.
4. Clear `runtime.activeRunId`.
5. Record a system observation explaining that the previous process ended.
6. If the loop is still active, continue through normal failure recovery so the
   LLM decides whether to retry, revise, skip, wait, or block.

## Cancellation

`pause` or `stop` cancels cancellable work.

- Background-agent and model executions receive an `AbortSignal`.
- Active-session executions stop being observed, but Orchestrator does not abort
  the user's live session.

The run records `cancelled`.

## Scheduling

Triggers mark a loop due. They never execute directly.

Trigger types:

- `manual`: user, tool, or UI requests `run_next`;
- `cron`: schedule marks the loop due;
- `event`: workspace, session, or future event source marks the loop due;
- `hybrid`: event trigger with a cron safety net.

### Evaluation

`runtime/scheduler.ts` copies cron's debounce and missed-run pattern behind an
Orchestrator scheduler. Cron triggers persist `lastFireAt`, `nextFireAt`, and
`fireCount`.

When a trigger fires:

1. mark the loop due;
2. call coordinator `run_next`;
3. let lifecycle, step readiness, locks, and limits decide what starts.

### Closed Workspaces

There is no always-on executor. When a workspace opens, Orchestrator recomputes
missed cron fires from trigger state and collapses them into one catch-up run.

Event triggers that fired while the workspace was closed are missed and logged.

### Trigger During Running Loop

If a trigger fires while a coordinator run is active, Orchestrator sets
`runtime.dueAgain = true`. It does not start a second coordinator run. After the
current run ends, the coordinator consumes that flag and starts one more run if
the loop is still active.

## UI Strategy

The UI should be compact and operational:

- loop list;
- loop detail;
- generated plan viewer;
- step dependency graph;
- step runtime status;
- attempt history;
- recovery decisions;
- completion signal;
- trigger and limit settings;
- pause, resume, stop, activate, and run-next controls.

The UI must display generated steps and outcomes. It must not describe a fixed
workflow.
