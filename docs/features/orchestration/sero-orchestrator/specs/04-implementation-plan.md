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
| 5 | Outcomes, recovery, and completion signals | ✅ Done | Failed steps recover through the LLM; planned steps can signal completion |
| 6 | Active-session execution | ✅ Done | Active-session steps send and observe by `turnId` |
| 7 | Scheduling and events | ✅ Done | Manual/cron/event/hybrid triggers mark loops due |
| 8 | Polish and docs | ✅ Done | UI and docs explain generated step plans clearly |
| 9 | Loop Library | ✅ Done | Save/load loops to a profile-global versioned store; linked loops update/downgrade |

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
| FR-10 | Step outcome is LLM-reported or LLM-evaluated, not heuristic | 5 | D-03/D-04 | ✅ |
| FR-11 | Failed steps ask the LLM for recovery or revision | 5 | D-04/D-13 | ✅ |
| FR-12 | Completion is signaled by planned step outcomes, not a coordinator-triggered completion check | 5 | D-03 | ✅ |
| FR-13 | New `host.session` seam for active-session steps | 6 | D-11 | ✅ |
| FR-14 | Active-session steps send and observe by `turnId` | 6 | D-11 | ✅ |
| FR-15 | Manual/cron/event/hybrid triggers mark loops due | 7 | D-12 | ✅ |
| FR-16 | Closed-workspace cron catch-up collapses to one run | 7 | D-08/D-12 | ✅ |
| FR-17 | Plan revisions are structurally validated and recorded | 5 | D-13 | ✅ |
| FR-18 | UI displays generated plan, dependency graph, step states, attempts, recovery, completion, and limits | 1/3/5/8 | D-01 | ✅ |
| FR-19 | No Orchestrator permission, approval, command, git, PR, or tool-policy layer | 4 | D-02 | ✅ |
| FR-20 | User-selected loop workspace isolation supports managed worktree by default and workspace root by option | 4 | D-06 | ✅ |
| FR-21 | Workspace-root loops with dirty roots prompt the user to stash, create a worktree, or defer, with timeout fallback to worktree | 4 | D-06 | ✅ |
| FR-22 | Model steps run through the model path and validate prompted structured output | 4 | D-02 | ✅ |
| FR-23 | Restart recovery marks orphaned runs and attempts before new scheduling | 3 | D-08 | ✅ |
| FR-L1 | Save publishes a loop's definition as a new immutable library version (or a new entry) | 9 | 08 | ✅ |
| FR-L2 | Load instantiates a fresh linked loop in the current workspace from a chosen version | 9 | 08 | ✅ |
| FR-L3 | A loaded loop links to `(entryId, version)`; Update/Downgrade selects any retained version | 9 | 08 | ✅ |
| FR-L4 | A version switch replaces the plan and replays the local step-override overlay | 9 | 08 | ✅ |
| FR-L5 | Push-based "update available" via the watched library index — no polling | 9 | D-07/08 | ✅ |
| FR-L6 | Library-managed plan: no in-place editor; recovery divergence is derived and surfaced | 9 | 08 | ✅ |
| FR-L7 | Version switch only when idle; plan re-validated on load and switch | 9 | D-09/08 | ✅ |
| FR-L8 | Profile-global store at `$SERO_HOME/apps/orchestrator-library/`; deletes never break loaded loops | 9 | D-07/08 | ✅ |
| FR-L9 | Unlink detaches a loaded loop into a standalone loop | 9 | 08 | ✅ |

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
- [x] Dirty-workspace skip and snooze choices record explicit `skipped` or
  `snoozed` runs, with no started steps and a persisted reason/retry time.
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

- [x] Parse structured `StepOutcome` from execution output when present.
- [x] Ask the LLM to evaluate raw execution output when no structured outcome is
  present.
- [x] Ask the LLM for a `RecoveryDecision` after failed, blocked, or
  needs-revision outcomes.
- [x] Apply retry, revised step, revised plan, skip, wait, and block recovery
  decisions.
- [x] Merge accepted `StepOutcome.variables` into `runtime.variables`.
- [x] Validate revised steps and plans before applying them.
- [x] Record `CompletionSignal` when a planned step outcome includes
  `completion`.
- [x] Record typed `LoopBlock` data for planned blocks, recovery blocks, and
  management blocks.
- [x] Ensure Orchestrator never runs an ad hoc completion check when no work is
  ready or all known steps have succeeded.
- [x] Ensure Orchestrator never marks a loop complete without
  `outcome.completion.status === "complete"`.

**Acceptance**

- [x] A failed step can be revised by the LLM and then succeed.
- [x] A failed step can lead to new steps being added by the LLM.
- [x] A failed step can be skipped by LLM recovery when that is the chosen
  decision.
- [x] A `block-loop` recovery decision blocks with `LoopBlock.kind =
  "recovery-block"`.
- [x] A complete set of successful steps without a completion signal does not
  complete the loop.
- [x] A planned validation/finalization step can emit a completion signal and
  complete the loop.
- [x] Invalid revisions are rejected and recorded.
- [x] UI and state can distinguish planned blocks, recovery blocks, and
  management-limit blocks.
- [x] FR-10, FR-11, FR-12, FR-17, and partial FR-18 satisfied.

---

## Phase 6 — Active-Session Execution

**Goal.** Add active-session step execution.

**Tasks**

- [x] Add `host.session.getActiveForWorkspace` and `getState`.
- [x] Add `sendUserSteer` and `sendContextMessage`.
- [x] Add `onTurnComplete` emitter from session turn lifecycle.
- [x] Implement active-session step execution.
- [x] Correlate turn completion by `turnId`.
- [x] Record the resolved active `sessionId` on the step attempt.
- [x] Record turn result as observations and artifacts.

**Acceptance**

- [x] An active-session step sends to the selected session.
- [x] Turn completion is recorded once by `turnId`.
- [x] The attempt records the resolved active `sessionId`.
- [x] The active session continues under standard Sero session behavior.
- [x] FR-13 and FR-14 satisfied.

---

## Phase 7 — Scheduling and Events

**Goal.** Implement manual, cron, event, and hybrid due marking.

**Tasks**

- [x] Implement scheduler state for cron triggers.
- [x] Recompute missed cron fires when workspace runtime starts.
- [x] Collapse missed cron fires into one catch-up run.
- [x] Add event trigger subscriptions for workspace, session, and future event
  sources where available. *(coordinator.fireEvent mechanism; concrete event
  sources subscribe where the host exposes them.)*
- [x] Persist event debounce state.
- [x] Disable a trigger after its `fireCount` reaches `maxFires`.

**Acceptance**

- [x] A cron loop due while closed runs once on next open.
- [x] A trigger during an active coordinator run sets `runtime.dueAgain`.
- [x] Event triggers mark a loop due but do not bypass lifecycle, locks, or
  limits.
- [x] A trigger with `maxFires` stops firing after the final allowed fire.
- [x] FR-15 and FR-16 satisfied.

---

## Phase 8 — Polish and Docs

**Goal.** Make the user-facing behavior clear.

**Tasks**

- [x] Refine UI copy to describe generated step plans without implying a fixed
  workflow.
- [x] Add docs-site documentation for creating, inspecting, pausing, resuming,
  and stopping loops.
- [x] Add examples that show one-step, sequential, and parallel plans.
- [x] Explain that recovery is an LLM decision and completion comes from planned
  step outcomes.

**Acceptance**

- [x] UI shows generated steps, dependencies, workspace isolation, attempts,
  outcomes, recovery, and completion clearly.
- [x] Docs explain Orchestrator management limits without implying tool
  restrictions.
- [x] FR-18 complete.

---

## Phase 9 — Loop Library

**Goal.** A profile-global, versioned store of loop definitions: Save a loop into
it, Load a loop from it into any workspace, and let linked loops update or
downgrade. Full design in [08-loop-library.md](08-loop-library.md).

**9a — Store, types, and host seam**

- [x] Add `shared/library-types.ts` (`SharedLoopDefinition`, `SharedTriggerConfig`,
  `LibraryEntry`, `LibraryVersion`, `LibraryEntrySummary`, `LibraryIndex`) and the
  `Loop.libraryLink` / `Loop.stepOverrides` fields; re-export from `shared/types.ts`.
- [x] Add the `host.library` seam to `OrchestratorHost`, backed on the desktop
  side by app-state read/update/watch pointed at
  `path.join(SERO_HOME, "apps", "orchestrator-library")` (resolved on desktop via
  `appState.globalDir` — the plugin never imports `SERO_HOME`).
- [x] Pure `toSharedDefinition(loop)` and `instantiate(host, def, link)` transforms
  with unit tests.

**9b — Save**

- [x] `library_save` action: `new-version` (append `versions/{latest+1}.json`,
  bump entry + index, set link) and `new-entry` (create entry at `v1`, link it).
- [x] Optional change `note`; default the entry name to the loop title.

**9c — Load and browser**

- [x] `library_load` action: instantiate a fresh draft loop, run the normal
  create validate path. (Load creates a draft; activation is the existing
  `activate` action — the UI can chain it.)
- [x] Watched read of the library index for the renderer (`library_list` returns
  the dir; the browser watches its index.json); Library browser UI (full-panel
  view, searchable entry list, per-entry versions, Load).

**9d — Link, update/downgrade, overlay**

- [x] `library_set_version` (update + downgrade) reusing `initStepStates`;
  idle-only guard; re-validate the plan.
- [x] Record `set_step_model` / `set_step_tools` into `stepOverrides` on linked
  loops; replay onto matching steps after a switch; warn on dropped step ids.
- [x] Derived structural-divergence indicator (`plansStructurallyDiffer`, overlay
  fields ignored); "modified locally" notice with Save-as-new-version / Re-sync.
- [x] `library_unlink`; `library_delete` (never cascades to loaded loops).
- [x] Push-based "update available": the linked-loop detail watches the library
  index and surfaces "vN available"; the loop list shows a per-row update icon
  (`LoopSummary.libraryLink` + the watched index).

**9e — Docs and tests**

- [x] Slash commands (`library_list`/`library_save`/`library_load`/`library_set_version`/`library_unlink`/`library_delete`).
- [x] `apps/docs-site` guide section.
- [x] Store/transform/action unit tests; typecheck; 500-LOC check.

**Acceptance**

- [x] A loop can be saved to the library and loaded into a second workspace.
- [x] Saving a linked loop creates a new version; the other instance shows
  "update available" without any polling.
- [x] Update and Downgrade switch the plan and preserve local step picks,
  triggers, limits, and context overrides.
- [x] A version switch is refused mid-run and an invalid saved plan blocks on load
  with clear errors.
- [x] Deleting a library entry leaves loaded loops working.
- [x] FR-L1 … FR-L9 satisfied.

---

## Cross-Cutting Acceptance

- [x] `pnpm typecheck` passes from the monorepo root.
- [x] No source file exceeds 500 LOC.
- [x] No `any`, `@ts-ignore`, or `@ts-expect-error` without an explanatory
  comment.
- [x] State changes flow through `host.appState`, never renderer storage.
- [x] Tools, commands, and UI request coordinator actions; they do not start
  steps directly.
- [x] Generated plans are structurally validated before activation.
- [x] Orchestrator does not add a separate permission, approval, command, git,
  PR, or tool-policy system.
- [x] Orchestrator does not mark completion without a planned step completion
  signal.
- [x] `@apps/docs-site` is updated before a PR when user-facing behavior changes.
