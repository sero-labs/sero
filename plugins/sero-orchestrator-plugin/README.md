# Sero Orchestrator

A workspace-scoped built-in plugin that runs durable **Workflows**, **Rooms**
and **Goals**.

A loop turns a user prompt into an LLM-authored step plan, then durably runs the
steps: starting ready steps (sequential or parallel), recording outcomes, asking
the LLM how to recover from failures, and completing only when a planned step
emits an explicit completion signal.

Orchestrator owns **management** (persistence, scheduling, locks, attempt and
token limits, workspace isolation, restart recovery). Sero performs the **work**
through standard background agents, active sessions, and model calls. Orchestrator
adds no second permission, approval, or tool-policy layer.

## Bounded feedback

Plans normally run forward through their dependency DAG. For genuinely iterative
work, the planner may add one bounded feedback transition, such as implement →
verify → implement. Each return creates a distinct durable visit, so retries stay
attached to the same visit while feedback passes appear as `Implement #1`,
`Implement #2`, and so on.

The repeated region must have one entry and one exit. Approval, delivery and
finalisation stay after it. When its declared traversal limit is reached, the
loop enters normal recovery instead of repeating again or silently continuing.
Scheduled and event-driven runs receive a fresh traversal budget each run.

## Layout

```
shared/      data model + defaults shared by runtime, extension, and UI
runtime/     coordinator, planner, scheduler, executors (Electron main)
extension/   `orchestrator` tool + `/orchestrator` slash command (bridged)
ui/          loop list, plan view, step status, attempts, controls (renderer)
```

## Actions

`create`, `list`, `show`, `activate`, `pause`, `resume`, `stop`, `run_next`,
`revise`, `choose_recovery` — all routed through the single per-workspace
coordinator via `requestAction`. UI, tools, and the slash command request
actions; only the coordinator starts steps or mutates loop runtime state.

## Rooms

A Room is a persistent Conductor-led team. It shares Orchestrator scheduling,
limits, Git, artifacts, and delivery infrastructure with Workflows, but it uses
separate Room records under `runtime/rooms/` and `shared/room-*`.

Room members run as host-managed persistent Pi sessions. The host validates the
member roster, tools, models, workspace access, and delivery authority against
the approved grant. Orchestrator cannot widen that grant. Room mode is enabled
by default when the host provides the capability. Set `SERO_ROOMS=0` or
`SERO_ROOMS=false` before startup to disable it without deleting Room data.

### Change a running Room

A running Room changes through a grant amendment, never a second grant. The
host side is `grant-amendments.ts` and `amendment-runner.ts` in the persistent
sessions capability. The Room side is `runtime/rooms/room-amend-plan.ts`
(what a revision means), `room-amendment.ts` (the driver) and
`shared/room-amendment-types.ts` (the saved intent).

- A change to a member's model, thinking level, tools or skills, a join and a
  replacement are amendments. Permissions and `needsWorktree` cannot change
  while the Room runs, and a joining member cannot need its own checkout.
- The driver saves intent, waits for each affected member's turn to end
  (`sessions.settled`; a turn is never aborted), asks the host with the
  revision's command id, saves the Room configuration with the new grant
  revision, reopens the same bound session and confirms.
- The host asks with `hold`. A change inside the approval applies. A change
  that adds authority returns `needs-approval`, the revision is `held`, and the
  user's approval asks the same amendment again with a dialog.
- A replaced member is retired with its history kept. The replacement starts
  from the handover.
- `reconcile()` runs at startup before anything affected is scheduled. It asks
  the host again with the same id, so a repeat never duplicates a change.

Members and Workflow workers share one tool rule. A session registers every
tool its approval allows, loads a small set, and uses Pi's `tool_search` to
load another. A tool outside the approval is never registered. A Workflow
worker whose step lists tools treats that list as its starting set
(`toolsAreLoadout`). Code Mode is available to workers and not to members.

### Diagnose and recover a Room

1. Record the Room ID and affected member ID.
2. Check Sero logs for the Room ID and `room metric wake_latency_ms`.
4. Check the Room timeline, provider availability, approvals, limits, active
   turn capacity, and member worktree.
5. Restart Sero after an interrupted state write. The redo journal completes
   the accepted split-file transaction before Room state loads.
6. Pause and resume a Room to reopen a stale member session from its standard Pi
   session file.
7. Keep member worktrees during recovery. Resolve or collect their commits
   through the host Git service. Do not delete uncommitted work.

If disk space is exhausted, stop new Rooms, restore space, and restart. Do not
remove `rooms/transaction.json`; it is the recovery record.

For an emergency rollback, set `SERO_ROOMS=0`, restart Sero, and back up the
workspace `rooms/` data plus Room member session files before destructive
maintenance. This does not change Workflow behavior.

User guidance lives in `apps/docs-site/docs/guide/workflows.md`,
`apps/docs-site/docs/guide/rooms.md`, and
`apps/docs-site/docs/reference/rooms.md`.

## Goals

A Goal is the third Orchestrator mode. It keeps ONE chat session working toward
one objective until a completion contract is satisfied, without an
LLM-authored plan. `/goal <objective>` in an ordinary chat session starts one;
the user never has to open Orchestrator to control it.

Goal mode shares Orchestrator limits, persistence and session arbitration with
Workflows and Rooms, and keeps separate records under
`.sero/apps/orchestrator/goals/`. It is enabled by default. Set `SERO_GOALS=0`
or `SERO_GOALS=false` before startup to disable it without deleting goal data.

### How the loop works

The extension knows what happened INSIDE the turn; the runtime knows what
happened outside it.

- `extension/goal-loop.ts` continues the session at `agent_settled` — after
  queued work, provider retries and compaction settle. `turn_end` fires inside
  the tool loop and would start overlapping continuations.
- `runtime/goals/goal-runtime.ts` answers one question per settled boundary:
  may this session continue itself now? It charges the turn, checks every
  budget, and applies a no-progress hold. The extension applies that verdict; it
  does not decide it.

A goal that is active but idle has no settled boundary to continue from. Pi
consumes a slash command instead of sending it as a prompt, so `/goal`, `/goal
resume` and a restored session all start the first turn through the starter
`registerGoalLoop` returns. That turn is the goal's own, and the goal pays for
it.

### Rules the loop keeps

1. A queued user message cancels the continuation. The user always wins.
2. Escape or cancel pauses the goal. A paused goal is never poked.
3. A turn the goal started is charged before either of those rules is applied,
   and a turn that ended the goal from inside itself is charged too. Cancelling
   a turn, overtaking it with a message, or finishing it with `goal_complete`
   does not refund the tokens it spent, so none of them hides those tokens from
   the budget. The turn's owner is remembered from when the loop asked for it,
   because a terminal tool can end the goal before that turn settles.
4. Stopping is an explicit tool call — `goal_complete`, `goal_blocked` or
   `goal_wait` — never silence. Each carries the current goal id, so a call
   from a replaced or cleared goal is refused.
5. The contract message supersedes every earlier one, and the objective travels
   as task data. Goal mode grants no tool, approval or permission. The record is
   authoritative, so the contract is re-stated after every transition and after
   compaction, and what it tells the model follows the status: only an active
   contract says to keep working. Every other status withdraws that instruction
   and names the way back.
6. Goal control never leaves the session that owns the goal. The runtime
   addresses goals by id, but the `/goal` command and the model-callable `goal`
   tool act only on the calling session's goal; a foreign id is refused.
7. Turn, token, cost and active-time budgets are separate axes. Reaching one is
   `limited`, never `complete`. A cost budget bounds the goal's own turns; it is
   not a guaranteed spend ceiling, because one turn can run a long tool loop.
8. Three identical visible outcomes that attempted no tool hold the goal.
9. One autonomous driver per session (`runtime/session-drivers.ts`). Starting a
   goal on a session an active-session Workflow step drives is refused with a
   reason, and the reverse holds too. The claim is held only while the goal is
   active: paused, waiting, blocked, limited and stopped goals give the session
   back, and `resume` takes it again. A goal that cannot re-take its session on
   restore is held rather than restored active, so it never drives a session a
   Workflow step holds. Ordinary user turns are never blocked.
10. A tool policy that hides a terminal tool stops the goal from starting, and
    pauses an active one on restore. Goal mode never widens a restrictive policy
    to keep itself running.

### What is not built yet

Phase 1 records the agent's completion claim and reports it as **reported
complete**. The verification gate, deterministic criteria and background-drain
awareness are phase 2.

A `goal_wait` with a reason only stays manual: it promises no wake and the user
restarts the goal. A `goal_wait` with `source: child` and a Workflow id in
`target`, and an optional `deadlineMinutes`, registers a wait
(`shared/goal-waits.ts`). `runtime/goals/goal-wait-watcher.ts` reads the
Workflow's saved state on a change, at startup and on one deadline timer. It
does not poll. On `satisfied`, `failed` or `expired` it reserves one wake and
signals the Goal loop through `goal-wake.ts`. The loop is the only thing that
starts a Goal turn. The wake goes through the same limit check and
one-driver claim as a user resume, and a stop moves the Goal's control revision
past every earlier wait. `process` and `ci` are refused. A failed or expired wait
is never completion.

An agent cannot raise or remove a Goal limit the user set. `changeGoalLimits`
in `runtime/goals/goal-limits.ts` refuses it and allows a lower value or a limit
the user left unset.

The chat banner and the Orchestrator Goals view are gated on the approved
prototypes (`goal-mode-chat.html`, `goal-mode-orchestrator.html`). The runtime
already emits a `goal-status` custom message for the host to intercept.

## Live work

The runtime keeps one bounded `WorkFeedback` snapshot per Workflow attempt,
model call and Room member, and pushes it on `orchestrator-feedback`. Rows,
Home, the Workflow page and the Room page read these snapshots through
`ui/lib/live-facts.ts`, so one wait is worded one way everywhere. A Room counts
only working time: the time is banked at a checkpoint and on shutdown, and a
restart closes the open period instead of counting the time Sero was off. A
Room that used its time is resumed from the "Add time" dialog with a larger
total. Its spend cap does not change.
