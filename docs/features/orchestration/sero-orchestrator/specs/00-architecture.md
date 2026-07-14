# 00 — Architecture

Sero Orchestrator is a durable runner for LLM-authored step plans.

The LLM turns the user's prompt into expected steps. Orchestrator stores that
plan, applies the user-selected workspace isolation setting, starts steps whose
dependencies are satisfied, records outcomes, and asks the LLM how to recover
from failures. Completion is defined by the plan: a planned step validates the
work and emits an explicit completion signal.

## Principles

1. **The LLM owns the plan.** Step names, instructions, dependencies, expected
   outcomes, validation steps, recovery decisions, revisions, and completion
   signals come from the LLM-authored plan.
2. **Orchestrator owns management.** Persistence, scheduling, step readiness,
   parallel execution, locks, attempt counts, token counts, wall-clock limits,
   workspace isolation, artifact retention, and restart recovery are
   Orchestrator concerns.
3. **Sero performs the work.** Step execution uses standard Sero background
   agents, active sessions, or model calls. Orchestrator does not add a second
   permission, approval, or tool policy layer.
4. **Completion is plan-signaled.** Orchestrator never infers completion from
   all steps being marked successful, from empty queues, from passing commands,
   or from any other heuristic. It marks a loop complete only when a planned
   step emits an explicit completion signal.
5. **Failure recovery is model-decided.** When a step fails, Orchestrator asks
   the LLM whether to retry the step, revise the step, revise the plan, skip
   the step, wait, or block. Adding, removing, or reordering steps is done
   through a plan revision.
6. **Parallelism is data-driven.** Steps with unsatisfied dependencies do not
   start. Independent ready steps may run in parallel, limited only by
   Orchestrator's management limits.
7. **One coordinator advances loop state.** UI, tools, and slash commands request
   actions. The workspace coordinator is the only component that starts steps or
   mutates loop runtime state.
8. **Validation is structural.** Orchestrator validates ids, dependencies,
   execution surface names, and schema shape. It does not judge the workflow's
   domain meaning.

## Component Map

```text
plugins/sero-orchestrator-plugin/
├── package.json
├── shared/
│   └── types.ts              # data model from 01-data-model.md
├── extension/
│   ├── index.ts              # registers tools + commands
│   ├── tools.ts              # orchestrator.{create,list,show,activate,pause,resume,stop,run_next,...}
│   └── commands.ts           # /orchestrator slash command
├── runtime/
│   ├── index.ts              # createAppRuntime(ctx)
│   ├── coordinator.ts        # single executor and loop lifecycle
│   ├── registry.ts           # workspaceId -> coordinator
│   ├── planner.ts            # prompt -> validated PlanningResponse
│   ├── schema.ts             # structural validation and migration
│   ├── scheduler.ts          # manual, cron, event, hybrid triggers
│   ├── step-runner.ts        # starts ready steps and records attempts
│   ├── workspace.ts          # user workspace setting, dirty preflight, worktree resolution
│   ├── reconcile.ts          # restart recovery for orphaned runs and attempts
│   ├── llm-decisions.ts      # recovery, revision, and outcome evaluation
│   ├── limits.ts             # max attempts/tokens/time/concurrency
│   └── artifacts.ts          # output retention under state dir
└── ui/
    └── ...                   # loop list, plan detail, step graph, attempts, controls
```

## Process Placement

- **Coordinator, planner, scheduler, step runner, limit tracking, and LLM
  decisions** run in Electron main inside the workspace app runtime created by
  `createAppRuntime(ctx)`.
- **Extension tools and slash commands** are bridged through the CLI registry.
  They receive session context, not `host.*`. They call the coordinator through
  the registry.
- **UI** runs in the renderer. It reads state through `host.appState` watch and
  requests actions through bridged commands. It does not start steps.

```text
UI / CLI / tools  --request-->  coordinator  --starts-->  Sero agent/session/model
                                           └─records──►  state + artifacts
```

## Core Concepts

### Loop

A loop is the persisted user-facing object. It contains:

- the original user prompt;
- a validated LLM-authored step plan;
- generic lifecycle status;
- user workspace isolation settings;
- step runtime state;
- triggers;
- management limits;
- run history and artifact references;
- plan revision history.

### Step Plan

A step plan is the LLM's expected workflow. It contains steps, dependencies,
execution instructions, and expected outcomes. Suggested triggers and limits
live in the surrounding `PlanningResponse`, not inside the step plan.

Sequential work is represented by dependencies from one step to the next.
Parallel work is represented by multiple steps whose dependencies are already
satisfied.

### Step

A step is one unit of expected work. A step has generated instructions and an
execution target:

- background Sero agent;
- active user session;
- model-only call.

The step can ask the Sero agent/session to do anything the standard Sero runtime
allows. Orchestrator records the result but does not inspect or constrain the
agent's internal tool choices.

### Workspace Isolation

Workspace isolation is where filesystem work runs. It is a user-level loop
setting, not an LLM-authored step-plan choice.

Supported choices:

- **Managed worktree.** Default. Create or reuse one Sero-managed worktree for
  the loop under `.sero/worktrees/` and run background-agent filesystem work
  there.
- **Workspace root.** Run background-agent filesystem work in the registered
  workspace root.

The create-loop UI and tools expose this setting. New loops default to managed
worktrees. The LLM-authored plan cannot change it.

If the loop uses managed worktree isolation, Orchestrator creates or reuses the
loop worktree without prompting about uncommitted changes in the workspace root.
The root's uncommitted changes are not touched.

If the user chose workspace-root execution, Orchestrator checks whether the
registered workspace root has uncommitted changes before starting background
filesystem work. If it does, Orchestrator shows a visible notification naming
the loop and workspace. It links to the loop detail and, for scheduled or
manually started runs, offers a durable snooze. The run choices are:

- create an isolated managed worktree and run there;
- run in the workspace root once or always for this loop;
- stash current changes and run in the workspace root;
- skip this run;
- snooze a scheduled or manually started run for 15 minutes, 1 hour, 4 hours,
  or until 9:00 AM the next day. Event-fired runs omit snooze so the firing
  payload is never lost.

The 60-second notification shows its fallback. If the user does not choose in
time, Orchestrator automatically creates a managed worktree and proceeds there.
A snooze survives restart, holds later scheduled fires, and retries one pass
after it expires. The dirty-workspace check runs again before that pass starts.

Managed worktrees are workflow placement, not workflow logic. Creating a
worktree does not change what the agent is allowed to do; it only changes where
standard Sero execution runs. Stashing is allowed only as the user's explicit
dirty-workspace choice.

Active-session steps cannot use managed worktrees because a live session is
already bound to its workspace root. Model-only steps normally use no filesystem
context.

If a managed-worktree loop mixes background-agent steps and active-session steps
with dependencies between them, Orchestrator records a warning. Background-agent
filesystem work happens in the managed worktree, while active-session work
happens in the live workspace root. The warning is visible before activation but
does not block the loop.

### Step Attempt

A step attempt is one execution of one step. Orchestrator records:

- attempt number;
- execution target;
- resolved workspace root or worktree;
- status reported by the execution;
- LLM-reported step outcome;
- observations and artifacts;
- usage when available.

### Recovery Decision

When a step fails, Orchestrator asks the LLM for a recovery decision. The
decision may retry the same step, revise the failed step, revise the whole plan,
skip the step, wait, or block. A plan revision may add, remove, or reorder
steps. To complete the loop, the revised plan must include a step that emits a
completion signal.

### Completion Signal

Completion is part of the step plan. The LLM can include one or more validation
or finalization steps, and those steps decide whether the loop is done. A loop
moves to `complete` only when a step outcome includes an explicit completion
signal. If no runnable steps remain and no completion signal exists, the loop is
waiting or blocked; no extra completion check runs.

## Loop Planning

Creating a loop has two stages:

1. The user provides a prompt and optional scheduling or management-limit hints.
2. Orchestrator asks the LLM to return a `PlanningResponse`.

The response contains:

- title;
- short summary;
- `LoopPlan`;
- suggested triggers;
- suggested management limits.

The `LoopPlan` contains:

- objective;
- steps;
- dependencies;
- execution target for each step;
- expected outcome for each step.

Orchestrator validates the response and the contained plan before activation.
Invalid responses are sent back to the LLM for repair. A loop cannot activate
with an invalid plan.

### LLM seam validation

Every LLM seam — planner, step-outcome envelope, outcome evaluator, and recovery
decision — uses the same contract: the prompt specifies the exact JSON shape and
allowed values, the response is validated **strictly** (exact field names, exact
enum values; no value-guessing or synonym coercion), and any mismatch is sent
back to the model with the precise reason for a bounded repair pass. An
unexpected value is rejected and corrected, never silently mapped.

## Step Scheduling

The coordinator starts a step when:

- the loop is active;
- the step is pending;
- all dependencies are satisfied;
- the step is not already running;
- loop and step management limits allow another attempt.

If multiple steps are ready, Orchestrator can start them in parallel up to
`limits.maxConcurrentSteps`.

## LLM Outcome and Completion Signal

Step success is not inferred from process exit alone. The step execution must
produce or be evaluated into a structured step outcome:

- `succeeded`;
- `failed`;
- `blocked`;
- `skipped`;
- `needs-revision`.

If the execution cannot provide that structure directly, Orchestrator asks the
LLM to evaluate the raw result.

The step outcome may include a completion signal. This is how a loop completes.
The LLM decides when and how validation happens by adding the appropriate steps
to the plan.

## Management Limits

Orchestrator manages loop execution limits:

- maximum attempts per step;
- maximum total attempts per loop;
- maximum concurrent steps;
- maximum wall-clock runtime;
- maximum tokens or cost when usage is available.

When a limit is reached, Orchestrator stops starting new attempts and blocks the
loop with `LoopBlock.kind = "management-limit"`. This is not a workflow
completion signal.

Artifact and run retention are controlled by `LogPolicy`, not by `LoopLimits`.

## Restart Recovery

Subagent tracker state is in memory. On workspace runtime start, Orchestrator
reconciles persisted runs before scheduling new work:

- if `runtime.activeRunId` points to a run that is no longer observable, mark
  that run `orphaned`;
- mark any persisted `running` step attempts in that run `orphaned`;
- move their step runtime states to `failed`;
- clear `runtime.activeRunId`;
- record a system observation explaining that the process restarted;
- if the loop is still active, continue through normal failure recovery so the
  LLM decides whether to retry, revise, skip, wait, or block.

This prevents loops from staying permanently stuck after process death.

## Resolved Decisions

### D-01 — Plan Ownership

The LLM owns the step plan. Orchestrator must not hard-code a universal sequence
of steps.

### D-02 — Work Ownership

The work is performed by standard Sero execution. Orchestrator does not create a
new tool policy, approval system, permission system, or command layer.

### D-03 — Completion Ownership

The LLM-authored plan decides when completion is checked. Orchestrator never
marks a loop complete using heuristics or by running an unplanned completion
check.

### D-04 — Failure Recovery

The LLM decides recovery after step failure. Orchestrator supplies the failed
step, attempt history, observations, and remaining limits.

The canonical recovery decisions are `retry-step`, `revise-step`,
`revise-plan`, `skip-step`, `wait`, and `block-loop`. Adding or removing steps
is done with `revise-plan`. `block-loop` sets `LoopBlock.kind =
"recovery-block"`.

### D-05 — Management Limits

Orchestrator enforces max attempts, concurrency, wall-clock, and token/cost
limits. Limit exhaustion blocks execution with `LoopBlock.kind =
"management-limit"`; it does not mean the loop is complete.

### D-06 — Workspace Isolation

Workspace isolation is chosen by the user at loop creation. New loops default to
managed worktrees. The LLM-authored plan cannot choose workspace root or
worktree. Orchestrator creates, resolves, records, and cleans up managed
worktrees as part of loop management. Active-session steps always run in the
active session's workspace-root context.

Dirty-workspace prompting applies only when the user chose workspace-root
execution and background filesystem work is about to start. Managed-worktree
loops do not prompt because the root's uncommitted changes are left untouched.
After 60 seconds without a choice in workspace-root mode, Orchestrator creates a
managed worktree and continues there.

Managed-worktree loops that mix background-agent and active-session dependencies
record a warning because those execution targets see different filesystem
roots.

### D-07 — State Scope

Workspace-scoped state is authoritative under `.sero/apps/orchestrator/`, split
one file per loop so a loop's frequent run-time writes never rewrite any other:

```text
.sero/apps/orchestrator/
  index.json                 # lightweight summary per loop (drives the list)
  loops/<loopId>/
    loop.json                # the full Loop (the source of truth)
    artifacts/
      runs/<runId>/...        # run-scoped step outputs
      planner.txt · recovery/ · evaluation/ · revision/
```

The runtime keeps an in-memory cache and writes only the loop files that changed
(plus the index when a summary field changed). A legacy single `state.json` is
migrated into this layout on first load and kept as `state.json.pre-split-backup`.
Cross-workspace dashboards may keep derived indexes, but those are not the source
of truth.

### D-08 — Coordinator Lifecycle

Workspace coordinators run only while the workspace runtime is open.
Cron-trigger catch-up is computed on workspace open. Event triggers that fire
while the workspace is closed are missed and logged.

On workspace open, the coordinator reconciles orphaned active runs and running
attempts before evaluating triggers.

### D-09 — Plan Validation

Plans are validated before activation. Validation checks schema shape, unique
ids, valid dependencies, supported execution targets, acyclic dependency
graphs, and that the plan funnels to exactly one final step (single sink) so it
has one place to emit completion.

### D-10 — Run Locking

Only one coordinator run may advance a loop at a time. Independent steps inside
that run may execute in parallel.

### D-11 — Active-Session Targeting

Active-session steps use a `SessionTarget`. The coordinator uses the session
host seam to find the target session, send the message, and observe completion.

### D-12 — Scheduling

Triggers mark a loop due. They do not execute detached prompts. The coordinator
still applies lifecycle, readiness, locking, and limits.

### D-13 — Plan Revisions

The LLM may revise the plan after failure, after a validation/completion step
outcome, or by manual request. Revisions must pass structural validation and are
recorded.

### D-14 — Logging and Retention

A loop file stores bounded summaries and references. Large outputs, model
responses, and agent responses are stored as artifacts under that loop's own
folder (`loops/<loopId>/artifacts/`), with step outputs scoped by run
(`artifacts/runs/<runId>/`). Deleting a loop removes its folder (state +
artifacts) and, for a managed-worktree loop, its worktree.

## Abstraction Tests

The model must represent all of these without adding special fields:

- GitHub issue implementation loop.
- Pull request review loop.
- Dependency update loop.
- Production error triage loop.
- Customer support routing loop.
- Documentation freshness loop.
- Data quality monitoring loop.
- Competitive intelligence loop.
- Inbox executive assistant loop.
- Experiment optimisation loop.
- A one-off or unusual personal workflow, including one with arbitrary steps.

If a workflow requires Orchestrator to understand a domain-specific concept, the
model is too specific.
