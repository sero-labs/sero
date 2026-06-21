# 04 — Implementation Plan

This plan builds Sero Orchestrator as a durable runner for LLM-authored step
plans.

## Progress Dashboard

| Phase | Title | Status | Exit gate |
| --- | --- | --- | --- |
| 1 | Plugin shell, state, and UI | ✅ Done | Loops persist and render; controls call coordinator |
| 2 | Planning and validation | ✅ Done | Prompt creates a validated draft from `PlanningResponse` |
| 3 | Coordinator core | ✅ Done | Lifecycle, locks, runs, step states, attempts, and artifacts work |
| 4 | Step execution, workspace isolation, and limits | ✅ Done | Ready steps run through Sero execution in the user-selected workspace |
| 5 | Outcomes, recovery, and completion signals | ⬜ Not started | Failed steps recover through the LLM; planned steps can signal completion |
| 6 | Active-session execution | ⬜ Not started | Active-session steps send and observe by `turnId` |
| 7 | Scheduling and events | ⬜ Not started | Manual/cron/event/hybrid triggers mark loops due |
| 8 | Polish and docs | ⬜ Not started | UI and docs explain generated step plans clearly |

Status legend: ✅ Done · 🟡 In progress · ⬜ Not started · ⛔ Blocked · 🟦 Deferred.

## FR Traceability Matrix

| FR | Requirement | Phase | Decision | Status |
| --- | --- | --- | --- | --- |
| FR-01 | Workspace-scoped plugin with persisted loop state | 1 | D-07 | ✅ |
| FR-02 | Create/list/show/activate/pause/resume/stop/run_next/revise/choose_recovery via tools and UI | 1 | D-10 | ✅ |
| FR-03 | Prompt-to-LLM planning produces a curated `PlanningResponse` | 2 | D-01 | ✅ |
| FR-04 | `PlanningResponse` and `LoopPlan` structural validation and repair path | 2 | D-09 | ✅ |
| FR-05 | Step dependencies support sequential and parallel plans | 3 | D-01/D-10 | ✅ |
| FR-06 | Single coordinator and per-loop run lock | 3 | D-10 | ✅ |
| FR-07 | Generic run, step state, attempt, observation, and artifact history | 3 | D-14 | ✅ |
| FR-08 | Orchestrator enforces max attempts, concurrency, wall-clock, and token/cost limits | 4 | D-05 | ✅ |
| FR-09 | Background-agent steps run through standard Sero background execution | 4 | D-02 | ✅ |
| FR-10 | Step outcome is LLM-reported or LLM-evaluated, not heuristic | 5 | D-03/D-04 | ⬜ |
| FR-11 | Failed steps ask the LLM for recovery or revision | 5 | D-04/D-13 | ⬜ |
| FR-12 | Completion is signaled by planned step outcomes, not a coordinator-triggered completion check | 5 | D-03 | ⬜ |
| FR-13 | New `host.session` seam for active-session steps | 6 | D-11 | ⬜ |
| FR-14 | Active-session steps send and observe by `turnId` | 6 | D-11 | ⬜ |
| FR-15 | Manual/cron/event/hybrid triggers mark loops due | 7 | D-12 | ⬜ |
| FR-16 | Closed-workspace cron catch-up collapses to one run | 7 | D-08/D-12 | ⬜ |
| FR-17 | Plan revisions are structurally validated and recorded | 5 | D-13 | ⬜ |
| FR-18 | UI displays generated plan, dependency graph, step states, attempts, recovery, completion, and limits | 1/3/5/8 | D-01 | 🟡 |
| FR-19 | No Orchestrator permission, approval, command, git, PR, or tool-policy layer | 4 | D-02 | ✅ |
| FR-20 | User-selected loop workspace isolation supports managed worktree by default and workspace root by option | 4 | D-06 | ✅ |
| FR-21 | Workspace-root loops with dirty roots prompt the user to stash, create a worktree, or defer, with timeout fallback to worktree | 4 | D-06 | ✅ |
| FR-22 | Model steps run through the model path and validate prompted structured output | 4 | D-02 | ✅ |
| FR-23 | Restart recovery marks orphaned runs and attempts before new scheduling | 3 | D-08 | ✅ |

---

## Phase 1 — Plugin Shell, State, and UI

**Goal.** Create the built-in plugin, persisted state, coordinator registry, CLI
tools, and basic UI.

**Tasks**

- [x] Scaffold `plugins/sero-orchestrator-plugin` with workspace scope, runtime,
  UI, and Pi extension entries.
- [x] Implement shared types from [01](01-data-model.md).
- [x] Implement `runtime/index.ts` and coordinator registry.
- [x] Implement tools and slash command for `create`, `list`, `show`,
  `activate`, `pause`, `resume`, `stop`, `run_next`, `revise`, and
  `choose_recovery`.
- [x] Return a clear error when a bridged command targets a workspace whose
  runtime coordinator is not loaded.
- [x] Persist `OrchestratorState` through `host.appState`.
- [x] Build UI for loop list, loop detail, generated plan placeholder, step
  status placeholder, workspace isolation placeholder, attempt history placeholder,
  and controls.

**Acceptance**

- [x] Creating a loop stores a draft record.
- [x] Listing and showing loops reads the persisted state file.
- [x] Lifecycle controls mutate state only through `requestAction`.
- [x] UI reflects state changes from `host.appState` watch.
- [x] `pnpm typecheck` passes; no source file exceeds 500 LOC.
- [x] FR-01, FR-02, and partial FR-18 satisfied.

---

## Phase 2 — Planning and Validation

**Goal.** Convert a user prompt into a curated, validated draft step plan.

**Tasks**

- [x] Implement `planner.ts` using the current Sero model execution path and
  the `PlanningResponse` schema.
- [x] Implement `schema.ts` validation for unique step ids, dependency
  references, strict acyclic dependencies, execution target names, and at least
  one step.
- [x] Add one repair pass when generated JSON fails validation.
- [x] Map `PlanningResponse.title`, `summary`, `plan`, `suggestedTriggers`, and
  `suggestedLimits` onto the persisted `Loop`.
- [x] Record non-blocking warnings for managed-worktree loops that mix
  background-agent and active-session dependencies.
- [x] Store invalid drafts as blocked drafts with clear validation errors.
- [x] Show the curated plan in UI: title, summary, steps, dependencies, expected
  outcomes, triggers, and suggested limits.

**Acceptance**

- [x] A prompt can create a valid one-step plan.
- [x] A prompt can create a valid sequential plan.
- [x] A prompt can create a valid parallel plan.
- [x] Invalid model output is repaired once or stored with clear errors.
- [x] No invalid plan can be activated.
- [x] FR-03 and FR-04 satisfied.

---

## Phase 3 — Coordinator Core

**Goal.** Implement lifecycle, locking, run records, step state, attempt records,
observations, and artifacts.

**Tasks**

- [x] Implement lifecycle transitions from [03](03-execution-and-scheduling.md).
- [x] Implement per-loop coordinator lock.
- [x] Initialize `StepRuntimeState` for each plan step.
- [x] Compute ready steps from dependencies and step outcomes.
- [x] Implement `LoopRun`, `StepAttempt`, `Observation`, `RecoveryDecision`, and
  `CompletionSignal` recording.
- [x] Implement artifact writing and retention.
- [x] Create and persist a loop-scoped synthetic `parentSessionId`.
- [x] Implement restart reconciliation for `runtime.activeRunId`, orphaned runs,
  and orphaned running attempts.
- [x] Set `runtime.dueAgain` when triggers arrive during an active coordinator
  run.

**Acceptance**

- [x] Two concurrent `run_next` requests on one loop produce at most one
  coordinator run.
- [x] Dependent steps do not become ready before dependencies succeed.
- [x] Independent steps can both become ready.
- [x] A missing dependency or invalid runtime state blocks the loop with a clear
  reason.
- [x] Large output can be stored as an artifact and referenced from state.
- [x] A persisted running attempt is marked `orphaned` on restart and the loop
  can continue through normal recovery.
- [x] FR-05, FR-06, FR-07, FR-23, and partial FR-18 satisfied.

---

## Phase 4 — Step Execution, Workspace Isolation, and Limits

**Goal.** Start ready steps through standard Sero execution and enforce
management limits.

**Tasks**

- [x] Add `LoopWorkspaceSettings` to loop creation with
  `useManagedWorktree: true` by default.
- [x] Resolve loop workspace from the user-selected setting before filesystem
  work starts.
- [x] Check the registered workspace root for uncommitted changes only when a
  workspace-root loop is about to start background filesystem work.
- [x] Show a visible dirty-workspace notification with choices to stash current
  changes, create a managed worktree, or defer for workspace-root dirty roots.
- [x] Use a 30-second timeout for the dirty-workspace notification.
- [x] On timeout, create a managed worktree and proceed there.
- [x] Create or reuse one Sero-managed worktree for loops that use managed
  worktree isolation.
- [x] Stash current workspace changes only when the user chooses that option.
- [x] Record the resolved workspace on every step attempt that uses filesystem
  work.
- [x] Implement background-agent step execution using
  `host.subagents.runStructured`.
- [x] Pass step instructions, global instructions, runtime variables, relevant
  observations, and expected outcome into the Sero agent.
- [x] Pass the resolved loop workspace cwd to Sero for background-agent steps.
- [x] Pass and persist the loop-scoped `parentSessionId` for background-agent
  and model calls.
- [x] Stream live output to UI through `host.subagents.onLiveOutput`.
- [x] Record response text, artifacts, model id, provider id, duration, and usage
  when available.
- [x] Implement model step execution for structured model output, including
  prompt-based `outputSchema` instructions and returned-text validation.
- [x] Enforce `maxAttemptsPerStep`, `maxAttemptsTotal`, `maxConcurrentSteps`,
  `maxWallClockMs`, `maxTotalTokens`, and `maxCostUsd`.
- [x] Block the loop with `LoopBlock.kind = "management-limit"` when a limit is
  reached.
- [x] Confirm step execution uses standard Sero runtime behavior without an
  Orchestrator permission/tool/command layer.

**Acceptance**

- [x] A generated one-step loop starts a background agent and records its
  attempt.
- [x] A new loop defaults to managed worktree isolation unless the user chooses
  workspace root.
- [x] A managed-worktree loop creates or reuses one worktree and runs background
  agents with that cwd.
- [x] A dirty workspace root does not prompt for a managed-worktree loop.
- [x] A workspace-root loop runs background agents in the registered workspace
  root when the workspace is clean.
- [x] A dirty workspace-root loop shows a visible choice notification before
  steps start.
- [x] Dirty-workspace timeout creates a managed worktree and proceeds there.
- [x] Dirty-workspace stash choice stashes current changes and runs in the
  workspace root.
- [x] Dirty-workspace defer choice leaves the loop waiting without starting
  steps.
- [x] Active-session steps keep using the live session's workspace root even
  when background-agent steps use a managed worktree.
- [x] A generated parallel plan starts multiple ready steps up to
  `maxConcurrentSteps`.
- [x] Max attempts and token limits block new attempts with clear reasons.
- [x] Background-agent output appears in the UI and is recorded in history.
- [x] Model step `outputSchema` is included in the prompt and the response is
  parsed and validated.
- [x] FR-08, FR-09, FR-19, FR-20, FR-21, FR-22, and partial FR-18 satisfied.

---

## Phase 5 — Outcomes, Recovery, and Completion Signals

**Goal.** Make step outcomes, recovery, revisions, and completion signals come
from planned execution.

**Tasks**

- [ ] Parse structured `StepOutcome` from execution output when present.
- [ ] Ask the LLM to evaluate raw execution output when no structured outcome is
  present.
- [ ] Ask the LLM for a `RecoveryDecision` after failed, blocked, or
  needs-revision outcomes.
- [ ] Apply retry, revised step, revised plan, skip, wait, and block recovery
  decisions.
- [ ] Merge accepted `StepOutcome.variables` into `runtime.variables`.
- [ ] Validate revised steps and plans before applying them.
- [ ] Record `CompletionSignal` when a planned step outcome includes
  `completion`.
- [ ] Record typed `LoopBlock` data for planned blocks, recovery blocks, and
  management blocks.
- [ ] Ensure Orchestrator never runs an ad hoc completion check when no work is
  ready or all known steps have succeeded.
- [ ] Ensure Orchestrator never marks a loop complete without
  `outcome.completion.status === "complete"`.

**Acceptance**

- [ ] A failed step can be revised by the LLM and then succeed.
- [ ] A failed step can lead to new steps being added by the LLM.
- [ ] A failed step can be skipped by LLM recovery when that is the chosen
  decision.
- [ ] A `block-loop` recovery decision blocks with `LoopBlock.kind =
  "recovery-block"`.
- [ ] A complete set of successful steps without a completion signal does not
  complete the loop.
- [ ] A planned validation/finalization step can emit a completion signal and
  complete the loop.
- [ ] Invalid revisions are rejected and recorded.
- [ ] UI and state can distinguish planned blocks, recovery blocks, and
  management-limit blocks.
- [ ] FR-10, FR-11, FR-12, FR-17, and partial FR-18 satisfied.

---

## Phase 6 — Active-Session Execution

**Goal.** Add active-session step execution.

**Tasks**

- [ ] Add `host.session.getActiveForWorkspace` and `getState`.
- [ ] Add `sendUserSteer` and `sendContextMessage`.
- [ ] Add `onTurnComplete` emitter from session turn lifecycle.
- [ ] Implement active-session step execution.
- [ ] Correlate turn completion by `turnId`.
- [ ] Record the resolved active `sessionId` on the step attempt.
- [ ] Record turn result as observations and artifacts.

**Acceptance**

- [ ] An active-session step sends to the selected session.
- [ ] Turn completion is recorded once by `turnId`.
- [ ] The attempt records the resolved active `sessionId`.
- [ ] The active session continues under standard Sero session behavior.
- [ ] FR-13 and FR-14 satisfied.

---

## Phase 7 — Scheduling and Events

**Goal.** Implement manual, cron, event, and hybrid due marking.

**Tasks**

- [ ] Implement scheduler state for cron triggers.
- [ ] Recompute missed cron fires when workspace runtime starts.
- [ ] Collapse missed cron fires into one catch-up run.
- [ ] Add event trigger subscriptions for workspace, session, and future event
  sources where available.
- [ ] Persist event debounce state.
- [ ] Disable a trigger after its `fireCount` reaches `maxFires`.

**Acceptance**

- [ ] A cron loop due while closed runs once on next open.
- [ ] A trigger during an active coordinator run sets `runtime.dueAgain`.
- [ ] Event triggers mark a loop due but do not bypass lifecycle, locks, or
  limits.
- [ ] A trigger with `maxFires` stops firing after the final allowed fire.
- [ ] FR-15 and FR-16 satisfied.

---

## Phase 8 — Polish and Docs

**Goal.** Make the user-facing behavior clear.

**Tasks**

- [ ] Refine UI copy to describe generated step plans without implying a fixed
  workflow.
- [ ] Add docs-site documentation for creating, inspecting, pausing, resuming,
  and stopping loops.
- [ ] Add examples that show one-step, sequential, and parallel plans.
- [ ] Explain that recovery is an LLM decision and completion comes from planned
  step outcomes.

**Acceptance**

- [ ] UI shows generated steps, dependencies, workspace isolation, attempts,
  outcomes, recovery, and completion clearly.
- [ ] Docs explain Orchestrator management limits without implying tool
  restrictions.
- [ ] FR-18 complete.

---

## Cross-Cutting Acceptance

- [ ] `pnpm typecheck` passes from the monorepo root.
- [ ] No source file exceeds 500 LOC.
- [ ] No `any`, `@ts-ignore`, or `@ts-expect-error` without an explanatory
  comment.
- [ ] State changes flow through `host.appState`, never renderer storage.
- [ ] Tools, commands, and UI request coordinator actions; they do not start
  steps directly.
- [ ] Generated plans are structurally validated before activation.
- [ ] Orchestrator does not add a separate permission, approval, command, git,
  PR, or tool-policy system.
- [ ] Orchestrator does not mark completion without a planned step completion
  signal.
- [ ] `@apps/docs-site` is updated before a PR when user-facing behavior changes.
