# 04 — Implementation plan

Phased delivery with a live tasklist and per-phase acceptance criteria. Phasing
is build order, not a reduced target — the architecture in
[00](00-architecture.md) is the whole system.

Keep this file in sync with reality: tick task checkboxes as work lands, update
the [progress dashboard](#progress-dashboard) status, and flip
[FR matrix](#fr-traceability-matrix) rows as requirements are satisfied. Mirror
material progress in the loop ledger too.

## Progress dashboard

| Phase | Title | Status | Exit gate |
| --- | --- | --- | --- |
| 0 | Full architecture spec | ✅ Done | This spec reviewed + decisions accepted |
| 1 | Plugin shell, state, UI | ✅ Done | Loops created/listed/shown; state persists; UI renders |
| 1.5 | Session seam spike | ✅ Done | Coordinator safely sends a diagnostic follow-up |
| 2 | Durable coordinator core | ✅ Done | Single executor + locks + stop rules + artifacts |
| 2.5 | Scheduling lifecycle (catch-up-on-open) | ✅ Done | Missed cron fires recomputed on workspace open |
| 3 | Background-worker execution | ✅ Done | Worker → checks → checkpoint → retry loop runs green |
| 4 | Active-session execution | ✅ Done | Idle-gated steer + turn observation + retry |
| 5 | Scheduling and events | ✅ Done | Manual/cron/event/hybrid triggers mark loops due |
| 6 | Isolation and PR workflow | ✅ Done | Worktree isolation + branch/PR + isolate gate |
| 7 | Reusable task system | ⬜ Deferred | Only if a second surface needs durable tasks |

Status legend: ✅ Done · 🟡 In progress · ⬜ Not started · ⛔ Blocked · 🟦 Deferred.

## FR traceability matrix

Functional requirements → phase that delivers → status. Update status with the
phase. (D-NN refer to decisions in [00-architecture.md](00-architecture.md).)

| FR | Requirement | Phase | Decision | Status |
| --- | --- | --- | --- | --- |
| FR-01 | Workspace-scoped plugin with persisted loop state | 1 | D-03 | ✅ |
| FR-02 | Create/list/show/pause/resume/stop/run_next via tools + UI | 1 | D-01 | ✅ |
| FR-03 | Single-executor coordinator; tools/UI only request | 2 | D-01 | ✅ |
| FR-04 | Per-loop execution lock; attempts never overlap in a loop | 2 | D-11 | ✅ |
| FR-05 | Canonical attempt cwd used by worker/checks/VCS/artifacts | 2/3 | D-06 | ✅ |
| FR-06 | Normalized `CheckResult` across verification/command/review | 2/3 | D-12 | ✅ |
| FR-07 | Stop rule: success / maxAttempts / no-progress / pause / unsafe | 2 | D-13 | ✅ |
| FR-08 | Bounded state + artifact retention | 2 | D-14 | ✅ |
| FR-09 | Generated `WorkerInstruction` per attempt | 3 | D-08 | ✅ |
| FR-10 | Coordinator-side output-schema parse/validate | 3 | D-08 | ✅ |
| FR-11 | Subagent run with attempt cwd + parentSessionId + tool policy | 3 | D-10/D-15 | ✅ |
| FR-12 | Live output streamed to UI | 3 | — | ✅ |
| FR-13 | Pre-attempt `baseRef` baseline; restore via git reset; dirty-root safe | 2/3 | D-07 | ✅ |
| FR-14 | New `host.session` seam: find/state/two send methods/onTurnComplete | 1.5/4 | D-05 | ✅ |
| FR-15 | Idle + no-pending gating before any send | 4 | D-05 | ✅ |
| FR-16 | Active-session steer + turn observation + retry | 4 | — | ✅ |
| FR-17 | Hybrid routing per attempt | 4 | D-09 | ✅ |
| FR-18 | Manual/cron/event/hybrid triggers mark loops due | 5 | D-02 | ✅ |
| FR-19 | Catch-up-on-open for closed-workspace cron loops | 2.5/5 | D-04 | ✅ |
| FR-20 | Worktree isolation (in-workspace) | 6 | D-06 | ✅ |
| FR-21 | Branch naming + PR creation | 6 | — | ✅ |
| FR-22 | Recursion guardrails on workers (coordinator-side rejection) | 3 | D-16 | ✅ |
| FR-24 | Active-session attempts restricted to workspace-root | 4 | D-06 | ✅ |
| FR-25 | Turn-completion emitter (onTurnComplete correlated by turnId) | 1.5 | D-05 | ✅ |
| FR-26 | Dirty-root start gate: auto-save / isolate / defer, auto-save on timeout | 2/6 | D-07 | ✅ |
| FR-27 | Per-loop run budgets: wall-clock, tokens/cost, changed-files, command-runtime | 2/3 | D-17 | ✅ |

All five budgets are enforced. The subagent host now reports per-run USD on
`AppRuntimeSubagentResult.usage.cost`, which the derived budget sums across
attempts, so `maxCostUsd` blocks the loop alongside `maxTotalTokens` (D-17).

FR-18 event triggers: `session`, `vcs`, and `workspace` are wired to real
push-model host seams; `check` stays not-yet-wired by design (no event source —
see [Follow-up: non-session event seams](#follow-up--non-session-event-seams-vcs--workspace)).

---

## Phase 0 — Full architecture spec ✅

**Goal.** Record the full architecture, execution modes, host seams, state
model, generated-worker contract, scheduling model, and reuse boundaries before
any code.

**Tasks**
- [x] Map loop steps to existing host capabilities.
- [x] Verify subagent, verification, VCS, cron, and CLI/session contracts against code.
- [x] Resolve every spec gap as a binding decision (D-01…D-16).
- [x] Define the full state model.
- [x] Define the new active-session host seam.
- [x] Produce the phased plan, tasklist, and acceptance criteria (this file).

**Acceptance**
- [x] Each analysis "spec gap" has a decision in [00](00-architecture.md).
- [x] Each reused API is quoted with a real signature in [02](02-integration-seams.md).
- [x] Corrections to the analysis (no output schema, no host restore, card-specific
  worktrees, required parentSessionId, session primitives location) are documented.

---

## Phase 1 — Plugin shell, state, and UI

**Goal.** Stand up `plugins/sero-orchestrator-plugin` with workspace state,
shared types, runtime registration, CLI tools, and read-only-ish UI.

**Depends on:** Phase 0.

**Tasks**
- [x] Scaffold the plugin per [02 §Plugin shell](02-integration-seams.md#plugin-shell)
  (`package.json` with `scope: "workspace"`, runtime + ui entries, `pi.extensions`).
- [x] Implement `shared/types.ts` from [01](01-data-model.md).
- [x] Implement `runtime/index.ts` `createAppRuntime(ctx)` registering an empty
  coordinator in the main-process registry on `start()`, unregistering on `dispose()`.
- [x] Implement `extension/tools.ts` + `commands.ts` for the seven actions,
  forwarding to `registry.get(workspaceId).requestAction(...)`.
- [x] Persist `OrchestratorState` via `host.appState.read/update/watch`.
- [x] Build UI: goal list, goal detail, checks, attempt timeline placeholder,
  and pause/resume/stop/run-next controls (no execution yet).

**Acceptance**
- [x] `orchestrator.create` then `orchestrator.list` returns the loop; state file
  exists at `.sero/apps/orchestrator/state.json` and survives reload.
- [x] `pause`/`resume`/`stop` mutate `status` only through `requestAction`.
- [x] UI renders loops and reflects state changes via `host.appState` watch.
- [x] `pnpm typecheck` passes; no file exceeds 500 LOC.
- [x] FR-01, FR-02 satisfied.

**Implementation notes (Phase 1 as built)**
- The coordinator registry lives in `shared/registry.ts` (not `runtime/`): the
  Pi-safe extension may only import from `shared/`, and it must reach the same
  process-wide `globalThis` singleton the runtime registers into. It is indexed
  by **both** workspace id and absolute workspace path because the structured
  tool path (UI / `useAppTools` / app-agent) supplies only `cwd`, while the CLI
  bridge path supplies `workspaceId`.
- One `orchestrator` tool exposes all seven actions (an `action` discriminator
  plus a `cli` subcommand surface), mirroring the `OrchestratorAction` union.
  The `/orchestrator` slash command shares the same dispatch; its name matches
  the bridged tool, so Sero skips CLI-bridging it (no `sero orchestrator`
  shadow) and it stays a chat-only shortcut.
- `run_next` is accepted but does not advance an attempt yet — it returns a
  truthful "execution lands in a later phase" message (Phase 2/3).
- Validation: full-monorepo `pnpm typecheck` (18 tasks) green; plugin UI build
  green; plugin discovery + CLI-bridge suites green. End-to-end click-through in
  a running workspace is the remaining manual confirmation.

---

## Phase 1.5 — Session seam spike

**Goal.** De-risk the hardest desktop-core integration with a thin vertical
slice of the active-session host seam.

**Depends on:** Phase 1.

**Tasks**
- [x] Add `host.session.getActiveForWorkspace` and `getState`
  (`{ idle, pendingMessages, activeTurnId }`) wrapping `getCliSessionBridge()`
  ([02 §New seam](02-integration-seams.md#new-seam-active-session-host)).
- [x] Add `host.session.sendUserSteer` (wraps `sendUserMessage`) and
  `sendContextMessage` (wraps `sendCustomMessage`), each returning a `turnId`.
- [x] Add the `onTurnComplete` emitter in the session bridge, firing on
  `noteTurnEnd` with the correlating `turnId` (new desktop-core work).
- [x] Prove the coordinator can resolve the active session, read idle/pending,
  send a no-op diagnostic message, and observe its turn completion by `turnId`.

**Acceptance**
- [x] Coordinator resolves the workspace's active session and reads
  `{ idle, pendingMessages, activeTurnId }` correctly.
- [x] A diagnostic message is delivered only when idle + no pending messages;
  otherwise it defers with a logged reason.
- [x] No effect on a busy session; no double-delivery.
- [x] `onTurnComplete` fires once for the diagnostic turn, matched by `turnId`.
- [x] Partial FR-14; FR-25 satisfied.

**Implementation notes (Phase 1.5 as built)**
- The seam contract is `AppRuntimeSessionHost` in
  `packages/common/src/session-host.ts`, added to `AppRuntimeHost.session`. It is
  renderer-safe and reuses the existing `ExtensionRuntimeContent` /
  `ExtensionRuntimeMessage` payload types — no duplication.
- Desktop-core implementation is `createSessionHost()`
  (`apps/desktop/electron/features/apps/runtime/capabilities/session-host.ts`),
  wired into `create-host.ts`. It resolves `getCliSessionBridge()` **lazily per
  call** (the bridge is installed after the host object is built) and reads idle
  from `session.agent.state.isStreaming` + `getActiveTurnId() === null`.
- **`onTurnComplete` is loop-scoped, not per-LLM-turn.** `noteCliTurnStart`
  regenerates a turn id on every `turn_start` (budget accounting), so the emitter
  tracks a separate `loopTurns` id: pinned at the loop's first `turn_start`,
  reported once at `agent_end`. A send returns that same loop id (captured via
  `waitForCliTurnStart`), so the id from a send always matches its completion,
  even across multi-turn loops. Status is derived from the final assistant
  message's `stopReason` (`aborted` / `error` / else `completed`); a forced
  session teardown reports `aborted`.
- The coordinator proof is `WorkspaceCoordinator.diagnoseSession()`, reachable
  via `sero orchestrator diagnose-session` (CLI-only — deliberately not added to
  the structured tool `action` enum or the UI). It gates on idle + no pending,
  subscribes to completion **before** sending (tolerating a turn that completes
  before the send resolves), and reports turn-id correlation. It is read-only
  with respect to loop state, preserving the single-executor invariant.
- Validation: full-monorepo `pnpm typecheck` (18 tasks) green; new unit suites
  `turn-lifecycle.test.ts` and `orchestrator/session-seam.test.ts` (15 tests)
  green; touched CLI / app-runtime / agent suites (267 tests) green. A live
  click-through in a running app was not performed (same standing gap as Phase 1).

---

## Phase 2 — Durable coordinator core

**Goal.** The single-executor coordinator: loop state machine, attempt locking,
stop-rule enforcement, check normalization, logging, and artifact retention —
independent of which adapter runs.

**Depends on:** Phase 1.

**Tasks**
- [x] Implement the state machine and transitions from [03](03-execution-and-scheduling.md#coordinator-state-machine).
- [x] Implement the in-process per-loop execution lock + workspace semaphore (D-11).
- [x] Implement `checks.ts` normalizing verification/command results to `CheckResult`.
- [x] Implement stop-rule evaluation incl. no-progress detection (D-13).
- [x] Implement `artifacts.ts` for output beyond `maxInlineOutputBytes` and
  attempt retention pruning (D-14).
- [x] Capture the pre-attempt baseline `baseRef` on attempt start. Implement the
  dirty-root start gate (D-07): notify + confirm with auto-save / defer (isolate
  added in Phase 6), defaulting to auto-save when unanswered; record the decision.
- [x] Enforce `RunBudget` (D-17): per-attempt hard timeout; `maxChangedFiles` →
  block the loop for review with changes kept (`changed-files-exceeded`);
  per-command `maxCommandRuntimeMs`; cumulative wall-clock → `blocked:
  budget-exhausted`. Both budget blocks recover by raising the limit. Token/cost
  accumulation wires in with worker usage (Phase 3).
- [x] Wire `requestAction` to drive all transitions; reject execution from
  non-coordinator sources.

**Acceptance**
- [x] Two concurrent `run_next` calls on one loop → exactly one attempt advances;
  the other is rejected/queued.
- [x] A loop reaching `maxAttempts` transitions to `stopped`; no-progress over
  threshold transitions to `blocked`.
- [x] `CheckResult` shape is identical regardless of backend.
- [x] Large command output is stored as an artifact and referenced by path; state
  file stays within retention bounds.
- [x] Every attempt records a `baseRef`; a dirty workspace root is preserved as a
  baseline commit before any mutation.
- [x] On a dirty root the start gate appears; choosing defer stops the attempt; no
  response within the window auto-saves and proceeds; the decision is recorded.
- [x] A loop exceeding its wall-clock budget transitions to `blocked:
  budget-exhausted` and resumes only after the budget is raised; an attempt
  exceeding `maxChangedFiles` blocks the loop for review with its changes left in
  place (`changed-files-exceeded`).
- [x] FR-03, FR-04, FR-06, FR-07, FR-08 satisfied; FR-05 enforced where attempts
  exist; FR-13 (baseline capture) partial; FR-26 (gate minus isolate) partial;
  FR-27 (wall-clock/changed-files/command-runtime) partial.

**Implementation notes (Phase 2 as built)**
- The coordinator core is split into focused `runtime/` modules under 500 LOC
  each, with one clean seam between *coordinator core* and *execution adapter*:
  `adapter.ts` (`AttemptAdapter` / `AttemptExecutionResult`). The core owns the
  whole attempt lifecycle; an adapter performs only the change and reports what
  changed at the attempt cwd (D-06). Phase 3 (background-worker) and Phase 4
  (active-session) register real adapters — until then the registry is empty and
  `run_next` returns the truthful "not yet" without touching the lock.
- Modules: `engine.ts` (lock-first `run_next`, transitions, cancellation),
  `attempt-runner.ts` (one attempt's lifecycle), `checks.ts`, `stop-rules.ts`,
  `budget.ts`, `vcs.ts` (baseRef + dirty-root gate), `artifacts.ts`, `locks.ts`,
  `state-store.ts`, `clock.ts`, plus `diagnostics.ts` (the Phase 1.5 spike,
  extracted from the coordinator). The coordinator is now a thin dispatcher that
  composes these and delegates `run_next` to the engine.
- **Single executor / single writer.** All transition logic (stop rules,
  no-progress, budgets) runs as pure functions *inside one `host.appState`
  mutator* in `engine.finalize`, so a loop's status and its finalized attempt are
  written atomically against a fresh snapshot. The per-loop lock is acquired
  synchronously before the first `await`, so two concurrent `run_next` calls
  cannot both start an attempt (verified by test).
- **Three small, spec-aligned model additions** (`shared/types.ts`,
  [01](01-data-model.md)): `LoopGoal.blockedReason` (structured block
  discriminator governing recovery), `LoopAttempt.diffFingerprint` (no-progress
  proxy), `LoopAttempt.noProgressOverride` (records a one-shot override).
- **Seams left injectable for later phases:** the dirty-root decision is a
  `DirtyRootGate` (default = notify + auto-save-on-timeout; a real UI round-trip
  arrives with the response channel); the clock is injectable for deterministic
  budget tests. Token/cost budget accumulation is wired but reads 0 until worker
  usage lands (Phase 3); the per-attempt timeout, `maxChangedFiles`, and
  `maxCommandRuntimeMs` are fully enforced now.
- Validation: full-monorepo `pnpm typecheck` (18 tasks) green; new suites
  `orchestrator/coordinator-core.test.ts` and `coordinator-vcs.test.ts` (20
  tests) plus the existing `session-seam.test.ts` (6) green. End-to-end
  click-through in a running workspace remains the standing manual gap (same as
  Phases 1 / 1.5) — no adapter executes yet, so there is nothing new to click
  until Phase 3.

---

## Phase 2.5 — Scheduling lifecycle (decided: catch-up-on-open) ✅

**Goal.** Implement catch-up-on-open. The global supervisor is **not** built
(D-04, confirmed with product owner).

**Depends on:** Phase 2.

**Tasks**
- [x] On workspace runtime start, recompute each cron trigger's missed fires from
  `lastFireAt` + `schedule`, collapse to a single catch-up, and run due loops.
- [x] Log event triggers that fired while the workspace was closed as missed.

**Acceptance**
- [x] A cron loop due while its workspace was closed runs once on next open, never
  twice.
- [x] Missed while-closed event triggers are logged, not silently dropped.
- [x] FR-19 satisfied (catch-up-on-open).

**Implementation notes (Phase 2.5 as built)**
- Catch-up runs **once per open**, from `OrchestratorRuntime.start()` →
  `coordinator.catchUpOnOpen()` — a state transition, never an interval
  (Principle 6 / no-polling). The live per-minute cron tick and event
  subscriptions stay in Phase 5; nothing here adds an always-on watcher (D-04).
- Cron math is **copied, not imported** from the cron plugin (D-02):
  `runtime/cron.ts` compiles a 5-field expression once into per-field sets and
  adds `nextFireAfter(compiled, from)`, a minute-stepped forward scan capped at
  ~1 year so a pathological schedule still terminates. Matching uses local time,
  identical to the cron plugin.
- `runtime/scheduler.ts` holds the pure `reconcileLoop(loop, now)` and the
  `Scheduler.catchUpOnOpen()` driver. A cron trigger is **due** when the next
  scheduled minute after its anchor (`lastFireAt`, or `loop.createdAt` on first
  arm) is already in the past — so any number of missed minutes **collapses to a
  single catch-up**, and advancing `lastFireAt`/`fireCount` guarantees it never
  fires twice across opens. Only `active` loops are reconciled (a paused/blocked
  loop keeps its anchor, so a later resume still sees the missed fire).
- **Single executor / single writer preserved.** The whole reconcile (advance
  every cron trigger's debounce across all loops) runs inside **one**
  `host.appState` mutation; due loops are then dispatched through the gated
  `requestAction({ kind: 'run_next' })` path, so the per-loop lock, eligibility,
  and stop rule still apply. `catchUpOnOpen()` returns after the
  reconcile + dispatch and **never awaits the runs** (`CatchUpReport.settled` is
  for tests), so `start()` is never blocked by attempt execution.
- Event/hybrid triggers that fired while closed are unobservable (no listener
  existed); they are **logged, never silent** via an injectable `SchedulerLog`
  (default = Electron-main console). The scheduling path is exercised now even
  though no adapter executes until Phase 3 — `run_next` returns the truthful
  "not yet", while the debounce dedup is fully tested.
- Validation: full-monorepo `pnpm typecheck` (18 tasks) green; new
  `orchestrator/coordinator-scheduling.test.ts` (10 tests: cron math +
  due/never-twice/collapse/arm/paused-skip/event-log) plus the existing
  orchestrator suites — **36 tests** green. Live click-through remains the
  standing manual gap (nothing executes until a Phase 3 adapter lands).

---

## Phase 3 — Background-worker execution

**Goal.** The autonomous loop: generated workers, subagent execution,
verification, checkpointing, failure summaries, retries, reviewer workers.

**Depends on:** Phase 2.

**Tasks**
- [x] Implement `workers.ts` building `WorkerInstruction` per attempt with
  role-based tool policy (D-08, D-10).
- [x] Run workers via `host.subagents.runStructured` with attempt cwd +
  `parentSessionId` (D-15); stream `onLiveOutput` to the UI.
- [x] Coordinator-side fenced-JSON parse/validate against `outputSchema`; soft-fail
  on parse error with raw text retained (D-08).
- [x] Restore-on-rollback via `git reset --hard <baseRef>` through
  `host.workspace.runCommand`; remove attempt-created untracked files by path,
  never a blanket `git clean`. Optional post-attempt checkpoint commit for
  inspection (D-07).
- [x] Run required checks against attempt cwd; build next-attempt context from
  `summarizeFailure` + tail.
- [x] Add reviewer workers (`quality-reviewer`, `spec-reviewer`) as optional
  post-pass checks.
- [x] Accumulate worker token/cost into the loop's run-budget usage and enforce
  `maxTotalTokens` / `maxCostUsd` (completes FR-27, D-17). *(Both enforced — the
  host now reports per-run USD on `usage.cost`; see Phase 3 follow-up note.)*
- [x] Enforce recursion guardrails: the coordinator rejects worker-sourced
  `requestAction` (the enforced guard). A filtered `sero-cli` surface hiding
  `orchestrator.*` from workers is optional defense-in-depth, Phase 6 (D-16).

**Acceptance**
- [x] A failing-then-fixable goal runs: worker change → checks fail → summarized
  retry → checks pass → `complete`, all against one cwd.
- [x] Worker model/usage/duration and a response artifact are recorded per attempt.
- [x] Live output appears in the UI keyed by `parentSessionId` (the shell's shared
  subagent-activity surface; workers run under `attempt.parentSessionId`).
- [x] A worker that tries to create an Orchestrator loop is rejected.
- [x] FR-05, FR-09, FR-10, FR-11, FR-12, FR-13, FR-22, FR-27 satisfied
  (FR-27 fully enforced — `maxCostUsd` wired by the Phase 3 follow-up).

**Implementation notes (Phase 3 as built)**
- The Phase 2 seam held: the core (`attempt-runner.ts`/`engine.ts`) was not
  re-plumbed. Phase 3 added `runtime/adapters/background-worker.ts` (the first
  real `AttemptAdapter`) plus the worker/VCS/guard pieces it needs; the
  coordinator registers it by default when no adapter is injected (tests still
  inject fakes or omit it for the "not yet" path).
- `workers.ts` builds the **implementer** `WorkerInstruction` (system prompt +
  task from goal/active task/prior failure/checks/attempts-left, tool policy by
  role D-10, the fenced-JSON output contract) and parses the worker's trailing
  JSON block (`parseWorkerOutput`) — a parse miss is a soft failure with the raw
  text retained to an artifact (D-08). The instruction never carries a cwd (D-06).
- The adapter runs the worker via `host.subagents.runStructured` at the canonical
  `attempt.workdir.cwd` with `parentSessionId` (loop session or
  `orchestrator:<loopId>`, D-15), then **measures** the change with git at that
  same cwd: `git status --porcelain` → `changedFiles`, `sha1(getDiff)` →
  `diffFingerprint`. Live output needs no new channel — running under the
  attempt's `parentSessionId` keys the subagent tracker, which the shell's
  subagent-activity UI already renders (reuse-existing-streaming).
- **Restore-on-rollback (D-07)** lives in the runner: a *completed-but-failing*
  attempt keeps its changes so the next attempt iterates forward on the same cwd;
  an *errored/timed-out* attempt is rolled back with `git reset --hard <baseRef>`
  + a path-scoped `git clean -f -- <changedFiles>` (never a blanket clean). A
  `changed-files-exceeded` block keeps the changes (D-17), and user-cancel leaves
  the tree untouched.
- **Reviewer workers (D-10):** `review` checks now execute a read-only reviewer
  subagent (`reviewers.ts`) injected into `checks.ts`; they have no `sero-cli`
  surface so they can't recurse. checks.ts stays the single `CheckResult`
  normalizer.
- **Token/cost budget (FR-27):** the adapter populates `attempt.usage`, which the
  existing derived budget code sums — `maxTotalTokens` is enforced pre- and
  post-attempt with no new counter (Principle 3). A small Phase 3 follow-up added
  `cost` to the subagent host usage surface
  (`AppRuntimeSubagentResult.usage.cost`, mapped in `single-run.ts`), so
  `cumulativeCostUsd` now sums real per-run USD and `maxCostUsd` is enforced too.
- **Recursion guard (D-16, enforced):** the coordinator owns a
  `WorkerSessionRegistry`; the adapter marks the worker's parent session active
  for the run, and `requestAction(action, source)` rejects control actions whose
  `source.sessionId` is an orchestrator worker (synthetic `orchestrator:*` parent
  by name, or any live worker parent by the registry). Read-only actions stay
  allowed. The extension threads the invoking session id from the CLI bridge.
- Validation: full-monorepo `pnpm typecheck` (18 tasks) green; orchestrator unit
  suites **54 tests** green (18 new across `workers.test.ts` +
  `background-worker.test.ts`, incl. the failing→fixable end-to-end run through
  the real adapter). No desktop-core files changed — all new work is plugin-side
  behind the existing `host.*` surface.
- **Live click-through (standing gap closed).** Ran the real app (Electron
  41.6.1, orchestrator in dev mode) against a throwaway host-runtime workspace
  with a failing `node test.js` (a buggy `sum`). A due cron trigger fired via
  catch-up-on-open → the real background-worker adapter ran a real subagent
  (model `gpt-5.5`) → it fixed `sum.js` → the check passed at the canonical cwd →
  the loop reached `complete` in one attempt, with workdir/baseRef/usage/model/
  instruction/response-artifact all recorded. This is the first end-to-end
  execution in a running app. Two findings from the run: (1) `host.git.getDiff`
  diffs committed changes only, so the diff fingerprint was empty for the
  uncommitted worker change — **fixed** to use `git diff <baseRef>`; (2) the model
  didn't emit the fenced-JSON output block, which the soft-fail path handled
  correctly (the diff is measured from git, not the worker's self-report), so the
  loop still completed.
- **Follow-up: `maxCostUsd` enforcement.** The one part of the orchestrator work
  that crosses the `host.*` boundary: `cost` was added to
  `AppRuntimeSubagentUsage` and mapped in `single-run.ts` (the cost is computed
  internally already — only the host-API mapping dropped it). Plugin-side,
  `cumulativeCostUsd` now sums `attempt.usage.cost`, so the cost ceiling enforces
  exactly like `maxTotalTokens`. Covered by a `maxCostUsd` block test in
  `background-worker.test.ts` mirroring the tokens one.

---

## Phase 4 — Active-session execution

**Goal.** Session-targeted steer/follow-up attempts with lifecycle observation
and retry, built on the Phase 1.5 seam.

**Depends on:** Phase 1.5, Phase 2.

**Tasks**
- [x] Implement the active-session adapter: enforce `workdir.mode ===
  "workspace-root"`, resolve `SessionTarget`, gate on idle + no pending, send via
  `sendUserSteer` / `sendContextMessage` capturing `turnId`, hold the lock,
  observe completion by `turnId` (D-05, D-06).
- [x] Run checks/diff against the attempt cwd (= workspace root) after the turn.
- [x] Implement hybrid routing per `HybridPolicy`, forcing background-worker for
  worktree attempts, with recorded reason (D-09).
- [x] Handle long-busy sessions → `blocked: session-busy`, retried on next trigger.

**Acceptance**
- [x] A steer is delivered only when the target session is idle with no pending
  messages; otherwise deferred with reason.
- [x] The coordinator observes turn completion (by `turnId`) and runs checks
  without blocking.
- [x] A hybrid loop chooses the adapter per policy and records why; a worktree
  attempt is always routed to background-worker.
- [x] An active-session attempt with a worktree workdir is rejected/rerouted;
  active-session only ever runs at workspace root.
- [x] FR-14 (full), FR-15, FR-16, FR-17, FR-24 satisfied.

**Implementation notes (Phase 4 as built)**
- The Phase 2 seam held again: `attempt-runner.ts` / `engine.ts` were not
  re-plumbed. Phase 4 added the second real adapter,
  `runtime/adapters/active-session.ts`, registered alongside the background
  worker via the same default `MapAdapterRegistry` (both share the one
  `WorkerSessionRegistry`, so the recursion guard covers either path, D-16).
- **The idle-gate is a deferral, not a burned attempt.** The adapter interface
  gained an optional `preflight(ctx)` readiness gate the runner calls *before*
  creating the attempt record. The active-session adapter's preflight resolves
  the `SessionTarget` (bound `loop.sessionId` → `specific-session`, else
  `most-recent-active`) and gates on idle + no pending; a busy or unavailable
  session returns not-ready, which the runner turns into a clean **defer** —
  no attempt recorded, no attempt counted, the loop stays `active` and retries on
  its next trigger. ("Long-busy → blocked: session-busy" is surfaced as that
  defer reason; a hard `blocked` status would never reconcile, so the soft defer
  is the only self-consistent reading.) This is the same `AttemptReport.deferred`
  path the dirty-root gate already used, generalized with a `deferReason`.
- **execute** mirrors `diagnostics.ts`: subscribe to `onTurnComplete` *before*
  sending so a fast turn can't complete unobserved, send the generated implementer
  task prompt via `sendUserSteer` (capturing `turnId`), observe completion
  correlated by that id (bounded by the per-attempt timeout `signal`, with a
  generous fallback), then **measure the diff with git at the cwd** exactly like
  the background worker (`git status --porcelain` → changedFiles, `git diff
  <baseRef>` → fingerprint). The steered session is held active in the worker
  registry for the turn so a control action it issues is rejected (D-16); the
  hold is released the instant the turn resolves.
- **Workspace-root only (D-06):** preflight never sees a worktree (the runner
  only makes workspace-root workdirs), and `execute` rejects a worktree workdir
  defensively.
- **Hybrid routing (D-09)** lives in `runtime/hybrid.ts`: a pure `routeHybrid`
  picks background-worker vs active-session per `HybridPolicy` and the probed
  session state, with worktree isolation always forcing the background worker.
  `MapAdapterRegistry.resolve` is now async — it probes the live session for a
  `hybrid` loop and records the chosen `routingReason` on the attempt
  (`LoopAttempt.routingReason`). `active-if-session-idle` routes to the worker
  when the session is busy (rather than deferring); `prefer-active-session`
  routes to the session and lets preflight defer if it is busy.
- Validation: full-monorepo `pnpm typecheck` (18 tasks) green; orchestrator unit
  suites **75 tests** green (20 new in `active-session.test.ts`: preflight
  idle-gate / no-session / pending / bound-session defers, turn-id correlation +
  diff measurement, workspace-root enforcement, not-observed timeout, recursion
  hold, end-to-end steer-to-complete, busy defer with no burned attempt,
  failing-then-fixable, the full `routeHybrid` truth table, and end-to-end hybrid
  routing both directions). No desktop-core files changed — all new work is
  plugin-side behind the existing `host.*` surface (the harness gained a fake
  `host.session` + steer script).

---

## Phase 5 — Scheduling and events ✅

**Goal.** Manual/cron/event/hybrid triggers that mark loops due, using cron
patterns behind an adapter (never cron's transient session runner).

**Depends on:** Phase 2 (and Phase 2.5 outcome).

**Tasks**
- [x] Implement `scheduler.ts` with cron debounce/missed-run carry-over (D-02).
  *(Live `tick()` shares the Phase 2.5 reconcile; the open-workspace wake is the
  smart-alarm in `alarm.ts`, not a poll — see notes.)*
- [x] Subscribe `event` triggers to session lifecycle events
  (`host.session.onTurnComplete`, `events.ts`). At Phase 5 the other declared
  sources (`vcs`, `check`, `workspace`) had no host subscription seam and were
  logged as not-yet-wired; the `vcs` and `workspace` seams were added as a
  follow-up (see [Follow-up: non-session event seams](#follow-up--non-session-event-seams-vcs--workspace)).
  `check` stays not-yet-wired by design (no real source).
- [x] Collapse missed cron fires into one catch-up; set "due again" instead of
  overlapping attempts; persist debounce across restart (debounce persists on the
  trigger via `lastFireAt`, unchanged from Phase 2.5).
- [x] Enqueue due loops as `run_next` to the coordinator (lock + stop rule still gate).

**Acceptance**
- [x] A cron trigger marks a loop due at the scheduled minute exactly once.
- [x] An event during a running attempt does not start a second attempt; it runs
  after the current one resolves.
- [x] Missed fires while closed collapse to a single catch-up on reconcile.
- [x] FR-18 satisfied; FR-19 confirmed end-to-end.

**Implementation notes (Phase 5 as built)**
- **No always-on poll — a smart single alarm (decided with the product owner).**
  Scheduled goals are time-driven (nothing pushes "a minute passed"), so an open
  workspace needs a timer. To honour the no-polling rule (Principle 6, D-04) the
  cron alarm (`runtime/alarm.ts`) is **not** a fixed-interval tick: `CronAlarm`
  arms ONE timer for the single next moment any cron trigger is due
  (`earliestNextFire`), fires the live reconcile then, and re-arms for the
  following due moment. With no schedulable trigger it disarms entirely, so an
  idle workspace never wakes. The timer is an injectable `AlarmTimer` seam
  (default `setTimeout`, `unref`'d; tests inject a controllable fake), and long
  waits chunk at ~24.8 days.
- **Re-arm is push-driven.** The runtime calls `coordinator.armSchedule()` after
  catch-up on `start()` and again from `handleStateChange` (now async), so adding,
  editing, or pausing a scheduled goal resets the alarm to the next due moment
  immediately. `armSchedule` only READS state, so it never recurses with the
  coordinator's own writes. Catch-up-on-open still backstops anything the timer
  ever drops (e.g. a fire missed while the machine slept — collapsed by the same
  reconcile on the next wake).
- **One reconcile, two callers.** `scheduler.ts` keeps the Phase 2.5
  `reconcileLoop` (collapse missed minutes, advance `lastFireAt` so a loop never
  fires twice) and now shares it between `catchUpOnOpen()` (while-closed wording +
  missed-event log) and the live `tick()` (fires happening now). Both advance the
  debounce in ONE atomic mutation (single-writer) and dispatch due loops through
  the gated `run_next` path.
- **Event triggers (`runtime/events.ts`).** `EventRouter.sync()` subscribes to
  the workspace's active session via `host.session.onTurnComplete` for every
  enabled `session` event/hybrid trigger (bound `sessionId` else most-recent-
  active), drops sessions no longer referenced, and warns once per not-yet-wired
  source. A completion marks every matching loop due (respecting `debounceMs` /
  `maxFires`, advancing `fireCount`/`lastFireAt` in one mutation) through the same
  gated `run_next`. `sync()` runs on start and on every state change, so trigger
  edits re-target immediately.
- **Self-retrigger guard.** A loop's own active-session steer also completes a
  turn. The active-session adapter now tags its steered turn id in the shared
  `WorkerSessionRegistry` (`markTurn`/`clearTurn`) before the turn can complete,
  and the event router skips a completion whose turn id is orchestrator-initiated
  (`isOrchestratorTurn`) — so a session trigger never re-fires on the loop's own
  work.
- **"Due again" deferral (D-02).** A trigger that fires while an attempt is in
  flight does not start a second attempt. The scheduler and event router both
  dispatch `run_next` with an internal `queueIfBusy` flag; if the per-loop lock is
  held, the engine records ONE pending rerun and drains it (one microtask off the
  stack) after the in-flight attempt releases the lock — eligibility and stop
  rules still gate, so a loop that just completed/blocked simply no-ops. A manual
  `run_next` (tools/UI never set `queueIfBusy`) still gets the "already running"
  error. A stop/pause clears any pending rerun.
- **Scope decided with the product owner:** the smart single alarm (over a 30s
  poll or no live tick) and "session event triggers now, stub the rest" — the
  non-session sources need new desktop-core seams (`host.git.onCommit` /
  `host.verification.onCheck` / `host.workspace.onChange`), a Phase 6 follow-up.
- Validation: full-monorepo `pnpm typecheck` (18 tasks) green; orchestrator unit
  suites **87 tests** green (12 new in `coordinator-live-scheduling.test.ts`:
  `earliestNextFire` math, the alarm arming/disarming/firing-once/sleep-collapse/
  end-to-end, session-event mark-due + not-yet-wired log + self-retrigger guard,
  and the due-again deferral both directions). No desktop-core files changed —
  all new work is plugin-side behind the existing `host.*` surface (the harness
  gained a controllable alarm timer + a session turn-emit control). Live
  click-through remains the standing manual gap (the live cron path was already
  exercised end-to-end via catch-up-on-open in Phase 3).

---

## Phase 6 — Isolation and PR workflow ✅

**Goal.** Worktree isolation, branch naming, PR creation, richer checks, and any
cross-plugin coordination via events.

**Depends on:** Phase 3.

**Tasks**
- [x] Resolve attempt workdir to an in-workspace worktree via `host.git.createWorktree`.
- [x] Neutralize card-specific worktree naming to a generic work-item concept, or
  wrap it cleanly ([02 §VCS](02-integration-seams.md#vcs-checkpoints-worktrees)).
- [x] Branch naming + `host.git.createPr`/`mergePr`/`getPrMergeState` for PR flow.
- [ ] Optional dedicated `host.git.restoreCheckpoint` if git-reset proves insufficient (D-07).
  *(Deferred — `git reset --hard <baseRef>` + path-scoped clean is sufficient; no need surfaced.)*
- [ ] Optional filtered `sero-cli` surface that hides `orchestrator.*` from worker
  sessions — defense-in-depth on top of coordinator rejection (D-16). *(Deferred —
  the coordinator's enforced recursion rejection already covers this.)*
- [x] Add the "isolate" choice to the dirty-root start gate — reroute the attempt
  to a fresh worktree (completes FR-26, D-07).
- [ ] Add eval/promptfoo command-backed check type. *(Deferred — independent of
  isolation/PR; can layer onto the existing `command` check type later.)*

**Acceptance**
- [x] A loop runs entirely inside `.sero/worktrees/...` with checks, diffs, and
  checkpoints all targeting the worktree cwd.
- [x] A completed loop can open a PR with a generated title/body.
- [x] FR-20, FR-21 satisfied.

**Implementation notes (Phase 6 as built)**
- **No desktop-core changes — Phase 6 is fully plugin-side.** Every host seam it
  needs already exists and is implemented in
  [create-host.ts](../../../../../apps/desktop/electron/features/apps/runtime/capabilities/create-host.ts)
  (`createWorktree` / `removeWorktree` / `pushBranch` / `createPr` / `mergePr` /
  `getPrMergeState`). Unlike the Phase 3 `maxCostUsd` follow-up, nothing crossed
  the `host.*` boundary this phase.
- **Worktree resolution is a workdir change, not a re-plumb.** The Phase 2 seam
  held again: `attempt-runner.ts` previously hard-coded a workspace-root workdir;
  Phase 6 generalizes only that one spot into `resolveWorkdir`, which returns the
  canonical cwd (workspace root **or** an in-workspace worktree) plus the
  baseRef. The worktree cwd is canonical end to end — the worker, checks, diff,
  VCS, and artifacts all target it (verified: every `runCommand`/`runStructured`
  cwd in the worktree test equals the worktree path, never the root).
- **Neutral work-item wrapper (`runtime/worktree.ts`).** The host worktree API is
  card-flavored (`createWorktree(workspacePath, cardId, cardTitle)` → `card-<id>`
  dir, `<type>/<slug>-<id>` branch) and the signature is fixed in desktop core.
  Rather than touch desktop core, Orchestrator wraps it: `ensureLoopWorktree`
  maps a neutral `workItemId` (the loop id) onto the card slot, so no
  card-specific concept leaks into the coordinator. The worktree is created once
  per loop and **reused across attempts** (recorded on `loop.worktree`), so the
  loop iterates forward on one branch.
- **Isolation is background-worker only (D-06).** A loop opts in with
  `isolation: 'worktree'` (or `--isolate` / `--pr`). `MapAdapterRegistry.resolve`
  passes `useWorktree` to `routeHybrid`, so a hybrid loop with isolation always
  forces the background worker even with an idle session; a fixed active-session
  loop has the option dropped at create (FR-24). Once a loop isolates (configured
  or via the gate) it is isolation-locked for the rest of its life.
- **The "isolate" dirty-root choice (completes FR-26).** `DirtyRootChoice` gained
  `'isolate'`. On a dirty root the gate can now reroute the attempt to a fresh
  worktree, leaving the user's uncommitted work untouched at the root (no
  auto-save commit). It is honoured only for the background worker; any other
  adapter degrades to auto-save. The decision is recorded as
  `dirtyRootDecision: 'isolated'`.
- **PR flow — opt-in open, never auto-merge (decided with the product owner).** A
  completed worktree loop that set `prPolicy.openOnComplete` pushes its branch and
  opens a PR (`runtime/pr.ts`) with a **deterministic** title/body generated from
  the loop's known facts (goal, branch, attempt count, passed checks, changed
  files) — no extra LLM round-trip. The PR open runs after the status write (a
  separate coordinator-owned write — single-executor holds), records
  `loop.pullRequest`, and notifies. `getPrMergeState` / `mergePr` are wired as
  helpers for status display and a manual merge; **nothing merges automatically**.
- **Worktree removal is available but not auto-wired.** `removeLoopWorktree` keeps
  the branch by default; Phase 6 does not auto-remove on stop/complete to avoid
  discarding uncommitted worktree work — a deliberate cautious default.
- **Deferred with the product owner:** the non-session event sources
  (`vcs`/`check`/`workspace`) were logged as not-yet-wired at Phase 6. The `vcs`
  and `workspace` seams were since built (see
  [Follow-up: non-session event seams](#follow-up--non-session-event-seams-vcs--workspace)).
  `check` stays deferred — verification has no event source and the orchestrator
  is its only caller, so a `check` trigger would fire on the loop's own checks
  (fabricating it would be speculative). The optional filtered `sero-cli` surface
  and the eval check type are likewise deferred (the recursion guard already
  covers the former; the latter is independent of isolation/PR).
- Validation: full-monorepo `pnpm typecheck` (18 tasks) green; orchestrator unit
  suites **96 tests** green (9 new in `coordinator-worktree.test.ts`: worktree
  workdir resolution + cwd-targeting + reuse-across-attempts, the dirty-root
  isolate reroute + active-session fallback, the PR flow with a generated
  title/body, merge-state/merge helpers, and isolation routing both directions).
  The harness gained worktree/PR host fakes (`harness-git.ts`) and cwd capture; no
  desktop-core files changed. Not live-clicked (the worktree/PR path needs a real
  git remote; the unit suite drives the full plugin flow against host fakes).

---

## Follow-up — non-session event seams (vcs + workspace)

Phase 5 wired only `session` event triggers because that was the one host
subscription seam that existed. This follow-up adds the `vcs` and `workspace`
sources by exposing two new push-model `host.*` seams over event sources that
already run in desktop-core — no new watchers, no polling (Principle 6).

- **`host.git.onCommit(workspaceId, cb)`** — wraps the existing `VcsManager`
  `EventEmitter` (a singleton that already feeds the git UI), filtered to the
  workspace's `checkpoint_created` events. Carries `{ workspaceId, changeId,
  source }`.
- **`host.workspace.onChange(workspaceId, cb)`** — taps the recursive `fs.watch`
  (`FileWatcherManager`) that is already running for an open workspace and only
  pushed to the renderer over IPC; a small in-process fan-out was added so a
  background runtime can subscribe too. Carries `{ workspaceId, directories }`
  (debounced).
- **`check` stays not-yet-wired by design.** Verification is on-demand only with
  no completion event, and the orchestrator is its sole caller — a `check`
  trigger would fire on the loop's own checks. Building an emitter for it would be
  speculative, so it is left logged as not-yet-wired (decided with the product
  owner).

**Self-retrigger guards (the load-bearing correctness piece).** A loop's own
attempt mutates its workspace; without guards a `vcs`/`workspace` trigger would
re-fire on that footprint and cascade.

- The engine marks the workspace busy for the whole duration of every attempt
  (`WorkerSessionRegistry.markAttempt`/`clearAttempt`); the event router ignores
  `vcs`/`workspace` events while busy, plus a short grace window
  (`SELF_TRIGGER_GRACE_MS`) afterwards to absorb the file-watcher's debounce tail.
- The router also ignores `workspace` changes confined to `.sero/` (the
  orchestrator's own state, artifacts, and worktrees all live there), so the
  coordinator's constant state writes never self-trigger.
- This mirrors the existing session self-retrigger guard (a loop's own steered
  turn is tagged and skipped). The chosen semantic is per-workspace suppression:
  while any orchestrator attempt is mutating the workspace, vcs/workspace events
  are treated as our own footprint — this prevents cross-loop cascades, not just a
  single loop re-firing itself.

**Scope/altitude.** Fully push-model and additive: `packages/common` contract
(`AppRuntimeCommitEvent` / `AppRuntimeWorkspaceChangeEvent` + the two methods),
desktop-core wiring (`create-host.ts` + the `FileWatcherManager` fan-out), and the
plugin event router generalized to all three sources. No coordinator core
re-plumb; `check` left deferred.

**Validation.** `pnpm typecheck` 18/18; orchestrator unit suites **102 tests**
(6 new in `coordinator-event-sources.test.ts`: vcs commit → due, workspace change
→ due, `.sero/`-only change ignored, subscription drop, the self-retrigger guard
for both sources, and the grace-window boundary). The harness gained vcs/workspace
event fakes + emit controls (`harness-events.ts`).

---

## Phase 7 — Reusable task system (deferred)

**Goal.** Only if loop-scoped tasks become useful outside Orchestrator, extract a
generic Sero task queue. Do not start here.

**Acceptance**
- [ ] A second product surface has a concrete need for durable cross-plugin tasks.
- [ ] Until then, tasks stay loop-scoped (`LoopTask`).

---

## Cross-cutting acceptance (every phase)

- [ ] `pnpm typecheck` passes from the monorepo root.
- [ ] No source file exceeds 500 LOC; no `any`/`@ts-ignore` without justification.
- [ ] Pi SDK types are imported, not duplicated.
- [ ] State changes flow through `host.appState`, never renderer storage.
- [ ] Execution stays in the coordinator; tools/UI/CLI only request (D-01).
- [ ] `@apps/docs-site` updated when user-facing behavior changes.
