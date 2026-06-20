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
| 1.5 | Session seam spike | ⬜ Not started | Coordinator safely sends a diagnostic follow-up |
| 2 | Durable coordinator core | ⬜ Not started | Single executor + locks + stop rules + artifacts |
| 2.5 | Scheduling lifecycle (catch-up-on-open) | ⬜ Not started | Missed cron fires recomputed on workspace open |
| 3 | Background-worker execution | ⬜ Not started | Worker → checks → checkpoint → retry loop runs green |
| 4 | Active-session execution | ⬜ Not started | Idle-gated steer + turn observation + retry |
| 5 | Scheduling and events | ⬜ Not started | Manual/cron/event/hybrid triggers mark loops due |
| 6 | Isolation and PR workflow | ⬜ Not started | Worktree isolation + branch/PR + restore |
| 7 | Reusable task system | ⬜ Deferred | Only if a second surface needs durable tasks |

Status legend: ✅ Done · 🟡 In progress · ⬜ Not started · ⛔ Blocked · 🟦 Deferred.

## FR traceability matrix

Functional requirements → phase that delivers → status. Update status with the
phase. (D-NN refer to decisions in [00-architecture.md](00-architecture.md).)

| FR | Requirement | Phase | Decision | Status |
| --- | --- | --- | --- | --- |
| FR-01 | Workspace-scoped plugin with persisted loop state | 1 | D-03 | ✅ |
| FR-02 | Create/list/show/pause/resume/stop/run_next via tools + UI | 1 | D-01 | ✅ |
| FR-03 | Single-executor coordinator; tools/UI only request | 2 | D-01 | ⬜ |
| FR-04 | Per-loop execution lock; attempts never overlap in a loop | 2 | D-11 | ⬜ |
| FR-05 | Canonical attempt cwd used by worker/checks/VCS/artifacts | 2/3 | D-06 | ⬜ |
| FR-06 | Normalized `CheckResult` across verification/command/review | 2/3 | D-12 | ⬜ |
| FR-07 | Stop rule: success / maxAttempts / no-progress / pause / unsafe | 2 | D-13 | ⬜ |
| FR-08 | Bounded state + artifact retention | 2 | D-14 | ⬜ |
| FR-09 | Generated `WorkerInstruction` per attempt | 3 | D-08 | ⬜ |
| FR-10 | Coordinator-side output-schema parse/validate | 3 | D-08 | ⬜ |
| FR-11 | Subagent run with attempt cwd + parentSessionId + tool policy | 3 | D-10/D-15 | ⬜ |
| FR-12 | Live output streamed to UI | 3 | — | ⬜ |
| FR-13 | Pre-attempt `baseRef` baseline; restore via git reset; dirty-root safe | 2/3 | D-07 | ⬜ |
| FR-14 | New `host.session` seam: find/state/two send methods/onTurnComplete | 1.5/4 | D-05 | ⬜ |
| FR-15 | Idle + no-pending gating before any send | 4 | D-05 | ⬜ |
| FR-16 | Active-session steer + turn observation + retry | 4 | — | ⬜ |
| FR-17 | Hybrid routing per attempt | 4 | D-09 | ⬜ |
| FR-18 | Manual/cron/event/hybrid triggers mark loops due | 5 | D-02 | ⬜ |
| FR-19 | Catch-up-on-open for closed-workspace cron loops | 2.5/5 | D-04 | ⬜ |
| FR-20 | Worktree isolation (in-workspace) | 6 | D-06 | ⬜ |
| FR-21 | Branch naming + PR creation | 6 | — | ⬜ |
| FR-22 | Recursion guardrails on workers (coordinator-side rejection) | 3 | D-16 | ⬜ |
| FR-24 | Active-session attempts restricted to workspace-root | 4 | D-06 | ⬜ |
| FR-25 | Turn-completion emitter (onTurnComplete correlated by turnId) | 1.5 | D-05 | ⬜ |
| FR-26 | Dirty-root start gate: auto-save / isolate / defer, auto-save on timeout | 2/6 | D-07 | ⬜ |
| FR-27 | Per-loop run budgets: wall-clock, tokens/cost, changed-files, command-runtime | 2/3 | D-17 | ⬜ |

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
- [ ] Add `host.session.getActiveForWorkspace` and `getState`
  (`{ idle, pendingMessages, activeTurnId }`) wrapping `getCliSessionBridge()`
  ([02 §New seam](02-integration-seams.md#new-seam-active-session-host)).
- [ ] Add `host.session.sendUserSteer` (wraps `sendUserMessage`) and
  `sendContextMessage` (wraps `sendCustomMessage`), each returning a `turnId`.
- [ ] Add the `onTurnComplete` emitter in the session bridge, firing on
  `noteTurnEnd` with the correlating `turnId` (new desktop-core work).
- [ ] Prove the coordinator can resolve the active session, read idle/pending,
  send a no-op diagnostic message, and observe its turn completion by `turnId`.

**Acceptance**
- [ ] Coordinator resolves the workspace's active session and reads
  `{ idle, pendingMessages, activeTurnId }` correctly.
- [ ] A diagnostic message is delivered only when idle + no pending messages;
  otherwise it defers with a logged reason.
- [ ] No effect on a busy session; no double-delivery.
- [ ] `onTurnComplete` fires once for the diagnostic turn, matched by `turnId`.
- [ ] Partial FR-14; FR-25 satisfied.

---

## Phase 2 — Durable coordinator core

**Goal.** The single-executor coordinator: loop state machine, attempt locking,
stop-rule enforcement, check normalization, logging, and artifact retention —
independent of which adapter runs.

**Depends on:** Phase 1.

**Tasks**
- [ ] Implement the state machine and transitions from [03](03-execution-and-scheduling.md#coordinator-state-machine).
- [ ] Implement the in-process per-loop execution lock + workspace semaphore (D-11).
- [ ] Implement `checks.ts` normalizing verification/command results to `CheckResult`.
- [ ] Implement stop-rule evaluation incl. no-progress detection (D-13).
- [ ] Implement `artifacts.ts` for output beyond `maxInlineOutputBytes` and
  attempt retention pruning (D-14).
- [ ] Capture the pre-attempt baseline `baseRef` on attempt start. Implement the
  dirty-root start gate (D-07): notify + confirm with auto-save / defer (isolate
  added in Phase 6), defaulting to auto-save when unanswered; record the decision.
- [ ] Enforce `RunBudget` (D-17): per-attempt hard timeout; `maxChangedFiles` →
  block the loop for review with changes kept (`changed-files-exceeded`);
  per-command `maxCommandRuntimeMs`; cumulative wall-clock → `blocked:
  budget-exhausted`. Both budget blocks recover by raising the limit. Token/cost
  accumulation wires in with worker usage (Phase 3).
- [ ] Wire `requestAction` to drive all transitions; reject execution from
  non-coordinator sources.

**Acceptance**
- [ ] Two concurrent `run_next` calls on one loop → exactly one attempt advances;
  the other is rejected/queued.
- [ ] A loop reaching `maxAttempts` transitions to `stopped`; no-progress over
  threshold transitions to `blocked`.
- [ ] `CheckResult` shape is identical regardless of backend.
- [ ] Large command output is stored as an artifact and referenced by path; state
  file stays within retention bounds.
- [ ] Every attempt records a `baseRef`; a dirty workspace root is preserved as a
  baseline commit before any mutation.
- [ ] On a dirty root the start gate appears; choosing defer stops the attempt; no
  response within the window auto-saves and proceeds; the decision is recorded.
- [ ] A loop exceeding its wall-clock budget transitions to `blocked:
  budget-exhausted` and resumes only after the budget is raised; an attempt
  exceeding `maxChangedFiles` blocks the loop for review with its changes left in
  place (`changed-files-exceeded`).
- [ ] FR-03, FR-04, FR-06, FR-07, FR-08 satisfied; FR-05 enforced where attempts
  exist; FR-13 (baseline capture) partial; FR-26 (gate minus isolate) partial;
  FR-27 (wall-clock/changed-files/command-runtime) partial.

---

## Phase 2.5 — Scheduling lifecycle (decided: catch-up-on-open)

**Goal.** Implement catch-up-on-open. The global supervisor is **not** built
(D-04, confirmed with product owner).

**Depends on:** Phase 2.

**Tasks**
- [ ] On workspace runtime start, recompute each cron trigger's missed fires from
  `lastFireAt` + `schedule`, collapse to a single catch-up, and run due loops.
- [ ] Log event triggers that fired while the workspace was closed as missed.

**Acceptance**
- [ ] A cron loop due while its workspace was closed runs once on next open, never
  twice.
- [ ] Missed while-closed event triggers are logged, not silently dropped.
- [ ] FR-19 satisfied (catch-up-on-open).

---

## Phase 3 — Background-worker execution

**Goal.** The autonomous loop: generated workers, subagent execution,
verification, checkpointing, failure summaries, retries, reviewer workers.

**Depends on:** Phase 2.

**Tasks**
- [ ] Implement `workers.ts` building `WorkerInstruction` per attempt with
  role-based tool policy (D-08, D-10).
- [ ] Run workers via `host.subagents.runStructured` with attempt cwd +
  `parentSessionId` (D-15); stream `onLiveOutput` to the UI.
- [ ] Coordinator-side fenced-JSON parse/validate against `outputSchema`; soft-fail
  on parse error with raw text retained (D-08).
- [ ] Restore-on-rollback via `git reset --hard <baseRef>` through
  `host.workspace.runCommand`; remove attempt-created untracked files by path,
  never a blanket `git clean`. Optional post-attempt checkpoint commit for
  inspection (D-07).
- [ ] Run required checks against attempt cwd; build next-attempt context from
  `summarizeFailure` + tail.
- [ ] Add reviewer workers (`quality-reviewer`, `spec-reviewer`) as optional
  post-pass checks.
- [ ] Accumulate worker token/cost into the loop's run-budget usage and enforce
  `maxTotalTokens` / `maxCostUsd` (completes FR-27, D-17).
- [ ] Enforce recursion guardrails: the coordinator rejects worker-sourced
  `requestAction` (the enforced guard). A filtered `sero-cli` surface hiding
  `orchestrator.*` from workers is optional defense-in-depth, Phase 6 (D-16).

**Acceptance**
- [ ] A failing-then-fixable goal runs: worker change → checks fail → summarized
  retry → checks pass → `complete`, all against one cwd.
- [ ] Worker model/usage/duration and a response artifact are recorded per attempt.
- [ ] Live output appears in the UI keyed by `parentSessionId`.
- [ ] A worker that tries to create an Orchestrator loop is rejected.
- [ ] FR-05, FR-09, FR-10, FR-11, FR-12, FR-13, FR-22, FR-27 satisfied.

---

## Phase 4 — Active-session execution

**Goal.** Session-targeted steer/follow-up attempts with lifecycle observation
and retry, built on the Phase 1.5 seam.

**Depends on:** Phase 1.5, Phase 2.

**Tasks**
- [ ] Implement the active-session adapter: enforce `workdir.mode ===
  "workspace-root"`, resolve `SessionTarget`, gate on idle + no pending, send via
  `sendUserSteer` / `sendContextMessage` capturing `turnId`, hold the lock,
  observe completion by `turnId` (D-05, D-06).
- [ ] Run checks/diff against the attempt cwd (= workspace root) after the turn.
- [ ] Implement hybrid routing per `HybridPolicy`, forcing background-worker for
  worktree attempts, with recorded reason (D-09).
- [ ] Handle long-busy sessions → `blocked: session-busy`, retried on next trigger.

**Acceptance**
- [ ] A steer is delivered only when the target session is idle with no pending
  messages; otherwise deferred with reason.
- [ ] The coordinator observes turn completion (by `turnId`) and runs checks
  without blocking.
- [ ] A hybrid loop chooses the adapter per policy and records why; a worktree
  attempt is always routed to background-worker.
- [ ] An active-session attempt with a worktree workdir is rejected/rerouted;
  active-session only ever runs at workspace root.
- [ ] FR-14 (full), FR-15, FR-16, FR-17, FR-24 satisfied.

---

## Phase 5 — Scheduling and events

**Goal.** Manual/cron/event/hybrid triggers that mark loops due, using cron
patterns behind an adapter (never cron's transient session runner).

**Depends on:** Phase 2 (and Phase 2.5 outcome).

**Tasks**
- [ ] Implement `scheduler.ts` with cron debounce/missed-run carry-over (D-02).
- [ ] Subscribe `event` triggers to workspace/VCS/check/session lifecycle events.
- [ ] Collapse missed cron fires into one catch-up; set "due again" instead of
  overlapping attempts; persist debounce across restart.
- [ ] Enqueue due loops as `run_next` to the coordinator (lock + stop rule still gate).

**Acceptance**
- [ ] A cron trigger marks a loop due at the scheduled minute exactly once.
- [ ] An event during a running attempt does not start a second attempt; it runs
  after the current one resolves.
- [ ] Missed fires while closed collapse to a single catch-up on reconcile.
- [ ] FR-18 satisfied; FR-19 confirmed end-to-end.

---

## Phase 6 — Isolation and PR workflow

**Goal.** Worktree isolation, branch naming, PR creation, richer checks, and any
cross-plugin coordination via events.

**Depends on:** Phase 3.

**Tasks**
- [ ] Resolve attempt workdir to an in-workspace worktree via `host.git.createWorktree`.
- [ ] Neutralize card-specific worktree naming to a generic work-item concept, or
  wrap it cleanly ([02 §VCS](02-integration-seams.md#vcs-checkpoints-worktrees)).
- [ ] Branch naming + `host.git.createPr`/`mergePr`/`getPrMergeState` for PR flow.
- [ ] Optional dedicated `host.git.restoreCheckpoint` if git-reset proves insufficient (D-07).
- [ ] Optional filtered `sero-cli` surface that hides `orchestrator.*` from worker
  sessions — defense-in-depth on top of coordinator rejection (D-16).
- [ ] Add the "isolate" choice to the dirty-root start gate — reroute the attempt
  to a fresh worktree (completes FR-26, D-07).
- [ ] Add eval/promptfoo command-backed check type.

**Acceptance**
- [ ] A loop runs entirely inside `.sero/worktrees/...` with checks, diffs, and
  checkpoints all targeting the worktree cwd.
- [ ] A completed loop can open a PR with a generated title/body.
- [ ] FR-20, FR-21 satisfied.

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
