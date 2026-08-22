# Sero Orchestrator

A workspace-scoped built-in plugin that runs durable **Workflows** and **Rooms**.

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

### Diagnose and recover a Room

1. Record the Room ID and affected member ID.
2. Check Sero logs for the Room ID and `room metric wake_latency_ms`.
3. Check the Room timeline, provider availability, approvals, limits, active
   turn capacity, and member worktree.
4. Restart Sero after an interrupted state write. The redo journal completes
   the accepted split-file transaction before Room state loads.
5. Pause and resume a Room to reopen a stale member session from its standard Pi
   session file.
6. Keep member worktrees during recovery. Resolve or collect their commits
   through the host Git service. Do not delete uncommitted work.

If disk space is exhausted, stop new Rooms, restore space, and restart. Do not
remove `rooms/transaction.json`; it is the recovery record.

For an emergency rollback, set `SERO_ROOMS=0`, restart Sero, and back up the
workspace `rooms/` data plus Room member session files before destructive
maintenance. This does not change Workflow behavior.

User guidance lives in `apps/docs-site/docs/guide/workflows.md`,
`apps/docs-site/docs/guide/rooms.md`, and
`apps/docs-site/docs/reference/rooms.md`.
