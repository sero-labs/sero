# 03 — Execution and scheduling

How the coordinator advances a loop: the state machine, the two execution
adapters, and how triggers schedule work. The control-plane rule (D-01) holds
throughout — only the coordinator executes.

## Coordinator state machine

A loop moves through states driven by events, never by polling (Principle 6).

```text
        create
draft ─────────► active ──run_next/trigger──► (attempt running)
  │                ▲  │                              │
  │ pause          │  │ resume                       │ attempt result
  ▼                │  ▼                              ▼
paused ◄───────────┘  blocked ◄──no-progress / unsafe─┤
                                                      │
            all required checks pass ─► complete      │
            maxAttempts / user stop  ─► stopped ◄─────┘
```

State transitions:

| From | Event | To |
| --- | --- | --- |
| `draft` | `create` finalized | `active` |
| `active` | `run_next` / trigger due, lock acquired | attempt `running` |
| attempt `running` | required checks pass + stop rule satisfied | `complete` |
| attempt `running` | checks fail, attempts remain | `active` (next attempt) |
| attempt `running` | no-progress over threshold / unsafe workspace | `blocked` |
| attempt `running` | `maxChangedFiles` exceeded | `blocked` (reason `changed-files-exceeded`), changes kept |
| `active` | `RunBudget` cumulative limit exhausted | `blocked` (reason `budget-exhausted`) |
| `active`/`blocked` | `maxAttempts` reached / user `stop` | `stopped` |
| any non-terminal | user `pause` | `paused` |
| `paused` | user `resume` | `active` |
| `blocked` | `run_next` with `overrideNoProgress` | attempt `running` (override recorded) |

### Per-loop execution lock

Before starting an attempt the coordinator acquires an in-process lock keyed by
`loopId`. If held, the request is rejected (or queued for triggers). This is
what guarantees attempts within a loop never overlap (D-11); `host.appState`
serialization alone cannot provide it ([02 §App state](02-integration-seams.md#app-state)).
A workspace-level semaphore (default 2) bounds concurrent attempts across loops.

### Cancellation

`stop`/`pause` aborts a running background worker via its `AbortSignal`
(propagated to `host.subagents` abort) and marks the attempt `cancelled`. For an
active-session attempt, the coordinator stops observing the turn (unsubscribes
`onTurnComplete`) but never aborts the user's live session.

## Shared loop flow

1. Create loop goal with checks and stop rule.
2. If the user gave no checks, seed them from
   `host.verification.detectVerificationCommands(cwd)`.
3. Resolve the attempt workdir — workspace root or a worktree (D-06).
   Active-session attempts must resolve to workspace-root; a worktree forces
   background-worker mode.
4. Capture the pre-attempt baseline `baseRef`. On a clean tree `baseRef = HEAD`.
   On a **dirty** workspace root, run the start gate (D-07): prompt with
   auto-save / isolate / defer, defaulting to auto-save if unanswered. Auto-save
   commits the dirty work as the baseline; isolate reroutes to a worktree; defer
   stops here and retries next trigger. `baseRef` is the rollback target — not a
   post-attempt checkpoint.
5. If no task plan exists, run a generated **planner** worker.
6. Execute the attempt through the selected adapter (below).
7. Run required checks against the attempt cwd; normalize to `CheckResult`.
8. On failure: `summarizeFailure` + truncated tail → `learned` / `nextAction`;
   start the next attempt if the stop rule allows.
9. On pass: run optional **reviewer** workers.
10. Complete when required checks pass and the stop rule is satisfied.
11. Block or stop on exhausted attempts, an exhausted run budget (D-17),
    no-progress, or unsafe workspace.

## Adapter: background-worker

The coordinator owns the loop; the actor is a generated subagent.

1. Build a `WorkerInstruction` from goal, active task, prior failures, changed
   files, check output, and stop rule. Tool policy by role (D-10).
2. Run via `host.subagents.runStructured({ task, systemPrompt, cwd, platformTools,
   isolated, parentSessionId, model, thinking, timeoutMs, signal })`.
   `parentSessionId` is the loop session or `orchestrator:<loopId>` (D-15).
3. Stream live output through
   `host.subagents.onLiveOutput(workspaceId, parentSessionId, cb)` to the UI.
4. Parse the worker's fenced JSON against `outputSchema` (D-08). On parse
   failure, record raw text to an artifact and mark a soft failure.
5. Record worker metadata — model, duration, usage, response artifact path — on
   the attempt.
6. Run checks and diff against the **same** attempt cwd; restore to `baseRef`
   via `git reset --hard` when an attempt must be rolled back (D-07).
7. Compute next-attempt context.

## Adapter: active-session

The coordinator tracks the loop; the actor is the user's live session.

0. **Precondition:** `workdir.mode === "workspace-root"` (D-06). A worktree
   attempt is never routed here — there is no seam to repoint a live session's
   tool cwd at a worktree.
1. Resolve the `SessionTarget` (D-05) → `sessionId`.
2. `host.session.getState(sessionId)`; proceed only if idle and no pending
   messages. Otherwise defer (do not silently fall back unless `HybridPolicy`
   says so).
3. Build the steer from goal, active task, prior failures, check output, and
   stop rule.
4. Send it: `host.session.sendUserSteer(sessionId, content, { deliverAs,
   source: "orchestrator" })` for a user-visible steer, or `sendContextMessage`
   to inject context with explicit `triggerTurn`. Record the returned `turnId`
   on `attempt.sessionTurnId`. Hold the attempt lock.
5. Observe completion via `host.session.onTurnComplete(sessionId, cb)`,
   correlating by `turnId`; update the attempt with the turn result.
6. Run checks and diff against the attempt cwd (= workspace root).
7. Compute next-attempt context.

The lock stays held across the externally-driven turn so no other attempt
advances the loop meanwhile.

## Budget enforcement

The coordinator enforces `RunBudget` (D-17) around every attempt:

1. **Before starting:** if a cumulative limit (`maxWallClockMs`, `maxTotalTokens`,
   `maxCostUsd`) is already met, do not start — block the loop with reason
   `budget-exhausted`. Otherwise set the attempt's hard timeout to
   `min(maxAttemptWallClockMs, remaining maxWallClockMs)`, passed as the worker
   `timeoutMs` (background) or the turn-wait cap (active-session).
2. **During:** trip the attempt's `AbortSignal` when its timeout elapses. After a
   background worker reports its diff, if `changedFiles.length > maxChangedFiles`,
   stop and block the loop for review with the changes left in place (reason
   `changed-files-exceeded`); `baseRef` stays available for manual rollback. Each
   check/command runs with `timeoutMs = maxCommandRuntimeMs`.
3. **After:** accumulate the attempt's duration, `usage`, and changed-file count
   (derived from attempt records). If a cumulative limit is now met, block the
   loop.

Token/cost limits bound background-worker spend; active-session turns are
attributed best-effort from the observed turn result.

## Scheduling

Triggers mark work **due**; they never run detached prompts. Loop progress comes
from durable transitions: trigger due, worker complete, check complete, session
idle, user pause/resume/stop, workspace safety change.

### Trigger types

- `manual` — user/tool runs the next eligible attempt (`run_next`).
- `cron` — a schedule marks the loop due.
- `event` — a workspace/VCS/check/task/session lifecycle event marks it due.
- `hybrid` — event trigger with a cron safety net.

### Evaluation

`runtime/scheduler.ts` copies cron's debounce/missed-run shape behind an adapter
(D-02): a coarse tick evaluates `cron` triggers per minute with carry-over
(`LoopTrigger.lastFireAt`/`fireCount` persisted), while `event` triggers fire
from subscriptions. Marking a loop due enqueues a `run_next` request to the
coordinator; the coordinator still gates on the per-loop lock and stop rule.

### Decisions for the scheduler

- **Closed workspaces (D-04):** with no always-on watcher, nothing records a due
  trigger at its due time for a closed workspace. Behavior is **compute-on-open**:
  when a workspace runtime starts, each `cron` trigger's missed fires are
  recomputed from `lastFireAt` + `schedule` (collapsed to a single catch-up).
  `event` triggers fired while the workspace was closed are missed — no listener
  existed — which is logged, never silent.
- **Missed cron fires:** collapse into a single due mark (one catch-up attempt),
  not a backlog of attempts.
- **Event during a running attempt:** does not start a second attempt; it sets a
  "due again" flag the coordinator consumes after the current attempt resolves
  (respecting the per-loop lock).
- **Long-busy session (active-session):** the attempt stays pending behind the
  lock; if the session stays busy past `timeoutMs`, the attempt is marked
  `blocked` with reason `session-busy` and retried on the next trigger.
- **Debounce across restart:** persisted on the trigger, mirroring cron's
  carry-over.
- **Scheduler locking:** the per-loop execution lock prevents two runtimes from
  executing the same loop; the supervisor (when present) holds the cross-process
  due-marking authority.

## Worktree strategy

Start with checkpoints in the workspace root; add worktree isolation after the
checkpoint-based loop works. When added, use `host.git.createWorktree` with an
attempt id as `cardId` — accepting the card-flavored naming until Phase 6
neutralizes it ([02 §VCS](02-integration-seams.md#vcs-checkpoints-worktrees)).
In-workspace worktrees under `.sero/worktrees/` work with existing verification,
command execution, and subagent cwd mapping. External worktrees need runtime
mount changes first (D-06).

## UI strategy

Functional and compact, no long explanatory copy:

- Goal list and goal detail.
- Checks with latest results.
- Attempt timeline (status, mode, checks, learned, next action).
- Pause / resume / stop / run-next controls.
- Current blocker or next action.

The UI reads state via `host.appState` watch and issues actions through bridged
commands — it owns no execution (D-01).
