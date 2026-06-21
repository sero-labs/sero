# 00 — Architecture

The full Orchestrator architecture. This is the Phase 0 deliverable: it records
the component shape, execution ownership, lifecycle, and the resolved decisions
for every spec gap the analysis raised. Implementation phasing is only the order
in which these pieces are built — the architecture targets the whole system.

## Principles

1. **One executor.** The workspace coordinator is the only thing that advances
   an attempt. Tools, CLI commands, and UI *request* actions; they never run
   attempts. This is the rule that keeps two surfaces from racing a loop.
2. **One canonical workdir per attempt.** Worker execution, checks, diffs,
   checkpoints, and artifacts all use `LoopAttempt.workdir.cwd`. A worker must
   never mutate a worktree while checks run against the base tree.
3. **Loop state is the source of truth.** The subagent tracker is in-memory and
   dies on restart ([02 §Subagents](02-integration-seams.md#subagents)). Durable
   loop history lives in the Orchestrator state file, written through
   `host.appState`.
4. **Two adapters, one state machine.** Background-worker and active-session
   modes share loop state, checks, and stop rules but have separate execution
   adapters with separate safety rules. They are never the same code path.
5. **Reuse the primitives, add only the coordinator.** Sero already has
   subagents, verification, VCS/worktrees, scheduling patterns, and a CLI
   bridge. The only genuinely new desktop-core seam is safe active-session
   re-wake ([02 §Session host seam](02-integration-seams.md#new-seam-active-session-host)).
6. **Push, not poll.** Loop progress advances from durable state transitions and
   completion events (worker done, checks done, session idle, trigger due), not
   from an interval that re-scans work. Cron-style ticking is a scheduling
   safety net only.

## Component map

```text
plugins/sero-orchestrator-plugin/
├── package.json              # sero.app { scope: "workspace", runtime, ui }, pi.extensions
├── shared/
│   └── types.ts              # state model (01-data-model.md), shared renderer + runtime
├── extension/
│   ├── index.ts              # registers tools + commands; forwards to coordinator
│   ├── tools.ts              # orchestrator.{create,list,show,pause,resume,stop,run_next}
│   └── commands.ts           # /orchestrator slash command
├── runtime/
│   ├── index.ts              # createAppRuntime(ctx): wires coordinator to host + state
│   ├── coordinator.ts        # single executor: state machine, locks, stop rules
│   ├── registry.ts           # main-process registry: workspaceId -> coordinator
│   ├── adapters/
│   │   ├── background-worker.ts
│   │   └── active-session.ts
│   ├── checks.ts             # normalizes verification/command/review into CheckResult
│   ├── workers.ts            # builds + records WorkerInstruction per attempt
│   ├── scheduler.ts          # trigger evaluation (cron/event/hybrid)
│   └── artifacts.ts          # large-output retention under the state dir
└── ui/
    └── ...                   # goal list, goal detail, attempt timeline, controls
```

### Process placement

- **Coordinator + adapters + scheduler** run in **Electron main**, inside the
  app runtime started by `createAppRuntime(ctx)`. Only here is the full `host.*`
  surface available.
- **Extension tools/commands** are bridged through the CLI registry (AD-020).
  They run in main but **do not receive `host.*`** — they receive a session
  context and `sessionRuntime` only
  ([02 §Verified facts](02-integration-seams.md#verified-facts)). They must call
  the coordinator through the main-process registry, never execute work.
- **UI** runs in the renderer, reads state through `host.appState` watch +
  IPC, and issues actions through bridged commands. It owns no execution.

```text
UI / CLI / tools  --request-->  coordinator (decides)  --executes-->  state records result
```

### Coordinator registry

The coordinator must be reachable from bridged CLI commands that lack `host.*`.
A small main-process singleton bridges them:

```ts
interface OrchestratorCoordinatorRegistry {
  get(workspaceId: string): OrchestratorCoordinator | null;
  register(workspaceId: string, coordinator: OrchestratorCoordinator): void;
  unregister(workspaceId: string): void;
}

interface OrchestratorCoordinator {
  requestAction(action: OrchestratorAction): Promise<OrchestratorActionResult>;
}
```

`createAppRuntime` registers the coordinator on `start()` and unregisters on
`dispose()`. A bridged tool resolves `registry.get(workspaceId)` and calls
`requestAction`. `host.appState.update` serializes file writes but does **not**
prevent two attempts racing; the coordinator holds an in-process per-loop
execution lock so exactly one attempt advances a loop at a time.

## Execution modes

Both modes are first-class. They share the loop, checks, and stop rule; they
differ only in the *actor* that performs the change.

- **Background-worker mode.** The coordinator builds a `WorkerInstruction`, runs
  a subagent via `host.subagents.runStructured` with the attempt `cwd`, streams
  live output, then runs checks. Used for autonomous, worktree-isolated, or
  test-driven work. Buildable almost entirely from existing `host.*`.
- **Active-session mode.** The coordinator confirms the target session is idle
  with no pending messages, sends a steer/follow-up built from loop context,
  then observes the externally-driven turn through lifecycle events. The attempt
  lock is held while that turn is pending. Used when the user expects the main
  conversation to stay in control. Requires the new session host seam.
- **Hybrid.** `executionMode: "hybrid"` routes per attempt via `HybridPolicy`
  (see [D-09](#d-09-hybrid-routing)).

## Coordinator lifecycle (D-04)

App runtimes start per open workspace. A loop can become due for a workspace
whose runtime is not running. **Decision (confirmed with product owner):
catch-up-on-open — workspace coordinators are the only executors, and there is no
always-on watcher.**

- When a workspace runtime starts, the coordinator recomputes each cron trigger's
  missed fires from `lastFireAt` + `schedule` (catch-up collapsed to a single
  run, D-13/Phase 5) and runs any due loop then.
- Event triggers that fire while a workspace is closed are missed — no listener
  exists — which is logged, never silent.
- A lightweight **global supervisor** (a `scope: "global"` companion that marks
  work due but never executes) remains a future option if scheduling for closed
  workspaces becomes a real need. It is **not built now**.

This keeps the model simple and preserves Principle 1 (one executor) without
making every workspace runtime hot.

## Resolved decisions

These close the analysis's "spec gaps to resolve." Each is a binding decision
for implementation.

### D-01 — Executor ownership
The runtime coordinator is the sole executor. Tools/UI/CLI only call
`requestAction`. Enforced by the registry boundary: bridged contexts have no
`host.*` and so *cannot* run subagents, verification, or VCS even if they tried.

### D-02 — Scheduler ownership
Orchestrator owns its triggers in its own state file. It does **not** store
loops in cron's state. Cron-style parsing/missed-run logic is **copied behind a
small adapter** in `runtime/scheduler.ts` initially; extraction to a shared util
is deferred until a second consumer exists (avoids premature shared surface).

### D-03 — State scope
Workspace-scoped state is the source of truth, at
`.sero/apps/orchestrator/state.json` (resolved via the workspace-scope state
path, [02 §App state](02-integration-seams.md#app-state)). A cross-workspace
dashboard index (loop id, workspace id, status, next due) is only a derived cache
— never authoritative. With no always-on supervisor (D-04), it covers open
workspaces; a persistent global index would arrive only if the supervisor is ever
added.

### D-04 — Coordinator lifecycle
**Catch-up-on-open (confirmed).** Workspace coordinators are the only executors;
no always-on watcher is built. When a workspace opens, missed cron fires are
recomputed from `lastFireAt` + `schedule` (collapsed to one catch-up) and due
loops run then. Event triggers fired while a workspace was closed are missed and
logged. The global supervisor stays a future option if cross-workspace,
while-closed scheduling becomes a real need; Phase 2.5 now confirms this rather
than building a watcher.

### D-05 — Session targeting
A loop resolves a `SessionTarget` ([01](01-data-model.md#session-target)).
Strategy is one of `specific-session` (remembered `sessionId`),
`most-recent-active` (resolved via the bridge each fire), or `ask-user`. The
chosen session id is recorded on the attempt so retries target the same
conversation. Re-wake safety (idle + no pending) is enforced by the coordinator
before every send.

### D-06 — Attempt workdir
Workers, checks, VCS ops, and artifacts all use `LoopAttempt.workdir.cwd`. Only
in-workspace worktrees under `.sero/worktrees/` are supported, because
`runWorkspaceCommand` rejects any cwd outside the registered workspace root
([02 §Verified facts](02-integration-seams.md#verified-facts)). External
worktrees require a runtime mount change and are out of scope until then.

**Active-session attempts are restricted to `mode: "workspace-root"`.** A live
session is permanently bound to its workspace root as cwd (AD-012), and there is
no seam to repoint a running session's tool cwd at a worktree. Steering a live
session while checks run against a worktree would validate the wrong tree, so a
worktree attempt **forces background-worker mode** (D-09). The coordinator
rejects any active-session attempt whose resolved workdir is not workspace-root.
**Product decision (confirmed): we accept this limit.** Worktree isolation is a
background-worker-only feature; steering a live session always operates on the
workspace root. A session fork / cwd-override capability is explicitly **not
planned** unless a concrete need appears later.

### D-07 — VCS baseline, checkpoint, and restore
Each attempt records a **pre-attempt baseline** `baseRef = git rev-parse HEAD`
captured *before* any mutation. Restore is `git reset --hard <baseRef>` against
the attempt cwd via `host.workspace.runCommand`. **Corrections to the analysis:**

- `host.git.createCheckpoint(cwd, message)` does `git add -A && commit` and
  returns the new short SHA, or **null when the tree is clean**. It therefore
  cannot supply a rollback target *before* an attempt (clean tree → no SHA), and
  its post-attempt SHA *includes* the attempt's changes — useless as a rollback
  point. The durable rollback target is `baseRef`, not a checkpoint id.
- `VcsManager.restoreCheckpoint` is desktop-core, **not** on the host surface.

**Dirty-root start gate (product decision).** A clean root sets `baseRef = HEAD`;
a worktree attempt starts clean so `baseRef = worktree HEAD`. When a
workspace-root attempt is about to start on a **dirty** tree, the coordinator
does not silently commit the user's work. It raises a prompt
(`host.notifications.notify` + a UI confirm dialog) with three choices:

- **Auto-save (default):** commit the dirty work as a baseline
  (`host.git.createCheckpoint(cwd, "orchestrator: pre-attempt baseline")`) so
  nothing is lost, set `baseRef` to it, and proceed.
- **Isolate:** run this attempt in a fresh in-workspace worktree instead, leaving
  the dirty main folder untouched (background-worker only — a live session cannot
  move into a worktree, D-06). Available once worktree isolation lands (Phase 6).
- **Defer:** do not start now; the loop stays active and retries on its next
  trigger or manual run. The deferral is recorded at loop level.

**No response → Auto-save.** If the user does not answer within a short window,
the coordinator treats that as "not actively working" and auto-saves. This keeps
unattended loops moving while protecting work-in-progress when the user is at the
keyboard. The chosen path is recorded on the attempt (`dirtyRootDecision`).

Restore resets tracked files to `baseRef`; untracked files the attempt created
are removed by path from `changedFiles` — never a blanket `git clean`, which
could delete unrelated user files.

An optional post-attempt checkpoint commit may capture the attempt's result for
inspection (`LoopAttempt.checkpointId`); it is *not* the rollback target. Diffs
use `host.git.getDiff(cwd)` / `getDiffSummary(cwd)`. A dedicated
`host.git.restoreCheckpoint` capability is optional, Phase 6.

### D-08 — Worker prompts
`WorkerInstruction` is built per attempt from goal, active task, prior failures,
check output, changed files, stop rule, tool policy, and an expected-output
shape. **Correction:** subagents do not validate an output schema
([02 §Subagents](02-integration-seams.md#subagents)). The instruction asks the
worker to emit a fenced JSON block matching `outputSchema`; the coordinator
parses and validates it, and on parse failure treats the attempt as a soft
failure with the raw text retained. The full instruction (with secrets redacted)
and the raw response are stored on the attempt for replay
([D-13](#d-13-logging)).

### D-09 — Hybrid routing
`HybridPolicy` decides per attempt:
- `prefer-active-session` — use active session if it exists and is idle, else
  background worker.
- `prefer-background-worker` — always background worker unless the session is
  explicitly required.
- `active-if-session-idle` — active session only when idle + no pending; else
  defer (do not silently fall back).
- `ask-user` — surface a choice via notification/UI and wait.

A worktree attempt is never eligible for active-session execution (D-06): if the
resolved workdir is a worktree, hybrid routing forces background-worker mode
regardless of policy. The routing decision and its reason are recorded on the
attempt.

### D-10 — Tool policies
Per worker role, mapped to `platformTools: 'all' | 'readOnly' | 'none'`:
- `planner` → `readOnly` (reads repo, writes a plan, no mutations).
- `implementer` → `all` (write + bash + edit).
- `reviewer` → `readOnly`.
- `summarizer` → `none`.
Workers run with `isolated: true` when on a worktree. Whether a worker may call
`sero-cli` Orchestrator tools is governed by [D-16](#d-16-recursion-guardrails).

### D-11 — Concurrency
Multiple loops per workspace are allowed. **Within a single loop, attempts never
overlap** — the per-loop execution lock serializes them. Across loops, the
coordinator caps concurrent executing attempts per workspace (default 2,
configurable) to bound subagent load. Cancellation propagates by aborting the
subagent (`AbortSignal` → `host.subagents` abort) and marking the attempt
`cancelled`; for active-session attempts, cancellation stops observing the turn
but does not abort the user's session.

### D-12 — Checks and evals
Check types: `verification`, `command`, `review`. All normalize to `CheckResult`
([01](01-data-model.md#check-result)) so stop rules and learning never depend on
the backend. Timeouts are per check; output beyond `LogPolicy.maxInlineOutputBytes`
is truncated inline and written in full to an artifact file referenced by path. A
failed required check becomes next-attempt context via `summarizeFailure` plus the
truncated tail. **Verification is now LLM-authored (D-18, spec 05):** a loop with a
`verificationPlan` evaluates its derived **criteria** directly (a fourth
`CheckResult.type`, `criterion`) — `checks.ts` stays the single normalizer
(`commandResultToCheck`), reused by `criteria.ts`. The legacy `checks` array is
retired from the evaluation path for a plan-bearing loop. The earlier mechanical
`eval` check type was built then rolled back (no author surface; heuristic layer)
and replaced by D-18.

### D-13 — Stop rules
A loop stops on: all required checks pass (success); `maxAttempts` reached; a
`RunBudget` limit exhausted (D-17); no-progress detected over
`stopOnNoProgressAttempts` consecutive attempts (equivalent failing checks /
empty-or-equal diff / unchanged file set / repeated error class / worker reports
no path forward); user pause or stop; or unsafe workspace state. Manual
`run_next` can override a no-progress block once, with the override recorded; a
budget block (`budget-exhausted` or `changed-files-exceeded`) is overridden only
by raising the relevant limit.

### D-14 — Logging / retention
The state file holds bounded data only: the last `retainAttempts` attempts with
truncated summaries. Full command output, diffs, and worker responses go to
artifact files under the state dir and are referenced by path. `LogPolicy`
controls `retainAttempts`, `retainArtifacts`, and `maxInlineOutputBytes`.

### D-15 — Parent session for workers
**Correction/addition:** `host.subagents.runStructured` requires a
`parentSessionId` ([02 §Subagents](02-integration-seams.md#subagents)). The
coordinator supplies the loop's bound `sessionId` when one exists; otherwise it
uses a stable synthetic orchestrator session id per loop
(`orchestrator:<loopId>`) so live-output subscriptions and aborts correlate.
This id is recorded on the attempt.

### D-16 — Recursion guardrails
Orchestrator-generated workers **may not** create, modify, or run Orchestrator
loops. The **enforced** guard is coordinator-side: the coordinator rejects any
`requestAction` whose invocation source is an orchestrator worker session.
**Correction to the analysis:** worker tool policy cannot, by itself, hide the
bridged `orchestrator.*` commands — `platformTools: "all"` exposes the whole
`sero-cli` surface and there is no per-command CLI filter today. A worker can
therefore *invoke* `orchestrator.*`, but the coordinator refuses it. Building a
filtered `sero-cli` surface that omits `orchestrator.*` for worker sessions is
optional defense-in-depth (Phase 6), not the primary guard.

### D-17 — Run budgets
`maxAttempts` bounds *count*, not *cost or blast radius*. Every loop also carries
an optional `RunBudget` ([01](01-data-model.md#run-budget)) with both cumulative
and per-attempt limits, enforced by the coordinator:

- **Cumulative (per loop):** `maxWallClockMs` (summed attempt durations) and
  `maxTotalTokens` / `maxCostUsd` (summed background-worker usage). Checked before
  each attempt starts and after each completes. When a cumulative limit is reached
  the loop transitions to `blocked` with reason `budget-exhausted` — recoverable:
  raising the budget and resuming re-activates it.
- **Per attempt:** when an attempt's diff exceeds `maxChangedFiles`, the
  coordinator **keeps the changes and blocks the loop for review** (reason
  `changed-files-exceeded`) rather than discarding work — a large change may be
  legitimate. `baseRef` stays available for manual rollback; resume by raising the
  limit, or stop. `maxAttemptWallClockMs` is the hard per-attempt timeout (passed
  as the worker `timeoutMs` / active-session turn-wait cap), enforced via the
  subagent `AbortSignal`.
- **Per command:** `maxCommandRuntimeMs` is the default timeout applied to every
  check/command run (`host.verification.runCommands` / `host.workspace.runCommand`
  `timeoutMs`).

Consumption is **derived** from attempt records, not a separate counter
(Principle 3). Token/cost limits bound background-worker spend; active-session
turns are attributed best-effort from the observed turn result. Budgets are
independent of `maxAttempts` — whichever limit trips first stops the loop. The
verification planner's spend (D-19) folds into the cumulative token/cost budget.

### D-18 — LLM-authored verification (spec 05)
A loop's definition of "done" is **derived by the LLM from the plain-English goal
alone** — never typed by a user, supplied by a test, or hard-coded as a heuristic.
A `verificationPlan` ([01](01-data-model.md#verification-plan)) holds **success
criteria**, each with an LLM-chosen **evaluation strategy** (evidence to gather +
a `decision`), plus LLM-derived stop conditions. This replaces the rolled-back
mechanical `eval` check. Litmus test: if a human or a test has to type a
check/command/threshold/path for the loop to know it succeeded, it is wrong.

### D-19 — The verification planner
The planner is a read-only `WorkerRole: 'planner'` subagent. It runs **at create**
(loop starts `draft` → derive → `active`) and **on goal change** (provenance via
`derivedFrom.goalHash`), reachable via the `edit` (change title/goal) and `replan`
(force re-derive) actions. It returns *data* only; the coordinator writes the plan
inside its own `host.appState` mutation (single-writer). It uses the host default
model; its usage is recorded on `derivedFrom.usage` and folded into the run budget
(D-17). On derivation failure the loop stays `draft` with a reason — it never runs
with no definition of done.

### D-20 — Mechanical-when-conclusive-else-judge
The planner classifies each criterion by what settles it: `exit-zero` /
`threshold` are **mechanical** (a command's exit status, or a number compared to an
LLM-authored threshold); `judge` is an **LLM** read-only verdict over gathered
evidence for inherently judgemental criteria. Mechanical when the evidence is
conclusive, judge when it is a judgement — and the **planner** decides which. A
measurement whose number cannot be cleanly extracted falls back to a judge. Two
LLM-derived stop conditions map onto the engine: `verification-unavailable` (no
sound way to verify → block, do not run blind) and `approval-required` (criteria
met but needs sign-off → block + notify; Resume is the approval, latched).

### D-21 — Reflective revision (advisory; the redefined P-E)
A loop does **not** rewrite its own success criteria when it stalls — that would be
a conflict of interest (a stuck loop could "win" by weakening its bar). Instead an
**independent read-only LLM critic** assesses a loop's health from its real history
(verdict + plain-English summary + an advisory suggestion). It is an observer, not a
contestant: **advisory only** — it stores a `LoopReflection` and notifies, but never
rewrites the plan or control state. The user acts on suggestions via `edit` /
`replan` / `resume`. It runs per-loop on a `blocked` (non-approval) / `stopped`
transition (push) and on an on-demand cross-loop `health` check; no background poll.
The critic is read-only (no `sero-cli` → cannot recurse, D-16), like the judge.

## Key risks (and the decision that contains each)

| Risk | Containment |
| --- | --- |
| Background and active-session modes blur safety | Separate adapters, shared state only (Principle 4) |
| Tools/UI/runtime all execute → races | Single-executor registry boundary (D-01) |
| Workers and checks hit different trees | Canonical attempt cwd (D-06) |
| Live session edits base tree while checks hit a worktree | Active-session restricted to workspace-root; worktrees force background-worker (D-06) |
| External worktrees break path mapping | In-workspace worktrees only until mounts change (D-06) |
| Scheduling drops closed-workspace work | Compute-on-open for cron; event-while-closed missed + logged; supervisor later (D-04) |
| `maxAttempts` can't bound cost or noise | Per-loop `RunBudget`: wall-clock, tokens/cost, changed-files, command-runtime (D-17) |
| Treating subagent output as schema-validated | Orchestrator-level JSON parse/validate (D-08) |
| No pre-attempt rollback target / committing user dirty work | Pre-attempt `baseRef` + git reset; dirty-root baseline commit (D-07) |
| Recursion guardrail relies on absent CLI filter | Coordinator-side rejection is the enforced guard; filtered CLI optional (D-16) |
| Cloning pi-tasks up front | Tasks stay loop-scoped (Phase 7 deferred) |
