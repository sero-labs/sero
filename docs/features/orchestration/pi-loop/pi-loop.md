# pi-loop clean-room guide

## Purpose

`pi-loop` is a Pi extension that adds three related capabilities:

1. Scheduled agent re-wakes: a saved prompt can be delivered back into the Pi session on a cron-like schedule, in response to an event, or both.
2. Background monitors: shell commands can run outside the main agent turn, stream output as Pi events, and wake the agent on completion.
3. Task fallback and task automation: if the full `pi-tasks` extension is unavailable, `pi-loop` registers a smaller native task system; if task support exists, loops can create tasks and task backlog loops can process pending work.

The extension is designed to avoid raw shell polling loops. Instead of an agent running a long `sleep` loop, `pi-loop` persists intent, tracks triggers, and injects a later steer/follow-up message only when the session is idle enough to handle it.

## Package and runtime assumptions

- TypeScript extension loaded by Pi from `src/index.ts`.
- Uses TypeBox schemas for tool parameters.
- Uses the Pi extension API for tools, commands, event subscriptions, message injection, and UI status lines.
- Uses JSON files under `.pi/` or user-level Pi directories for persistence, depending on scope.
- Uses in-memory process tracking for monitors.
- Uses a reducer-oriented design for loops, tasks, monitors, notifications, and an experimental goal subsystem.

## User-facing tools

### LoopCreate

Creates a loop record and arms the relevant trigger.

Conceptual parameters:

| Parameter | Meaning |
|---|---|
| `trigger` | A human interval, five-field cron expression, Pi event source, or hybrid descriptor. |
| `prompt` | The message delivered to the agent when the loop fires. |
| `recurring` | Whether the loop repeats. Defaults to recurring except inferred event triggers default to one-shot behavior in some cases. |
| `autoTask` | If enabled, each fire creates a task via `pi-tasks` or the native fallback. |
| `taskBacklog` | Marks the loop as a backlog worker that should self-clean when no pending tasks remain. |
| `triggerType` | Optional explicit selection among cron, event, or hybrid. Otherwise inferred. |
| `debounceMs` | Debounce interval for hybrid event fires. |
| `readOnly` | Adds a read-only instruction to delivered wake messages. |
| `maxFires` | Caps recurring fires to avoid unbounded token use. |

Trigger inference behavior:

- Numeric duration strings like `5m`, `2h`, or `1d` are cron-like time triggers.
- Five-field cron strings are cron triggers.
- Other strings are treated as Pi event source names unless explicitly marked hybrid.
- Hybrid input combines a cron safety net with an event source and debounce.

Important behaviors:

- Validates cron field count and non-empty event sources before creating the loop.
- Stores loops with numeric string IDs.
- Adds active triggers immediately after storage.
- For monitor completion loops, it can detect already-finished monitors and delete stale one-shot loops.
- If the loop watches `tasks:created` and there are already pending tasks, it can bootstrap an immediate wake rather than waiting for a future event that has already happened.
- The tool response includes the loop ID for cancellation.

### LoopList

Lists stored loops, including ID, status, prompt preview, trigger description, next fire estimate for cron/hybrid loops, and flags such as auto-task or backlog worker.

### LoopDelete

Removes or pauses a loop. Delete removes the trigger and deletes the stored loop. Pause removes the active trigger but keeps the record with status `paused`. Resume support exists in the store but is not a separately registered tool.

### MonitorCreate

Starts a background shell command.

Conceptual parameters:

| Parameter | Meaning |
|---|---|
| `command` | Shell command run via the system shell. |
| `description` | Optional human label. |
| `timeout` | Auto-stop duration in milliseconds. Defaults to five minutes; zero disables timeout. |
| `onDone` | Optional prompt to wake the agent when the command exits. |

Important behaviors:

- Enforces a maximum of 25 running monitors.
- Captures stdout and stderr by line.
- Emits Pi events for output and terminal states.
- Keeps a bounded output buffer for listing recent output.
- If `onDone` is supplied, creates a one-shot loop record associated with the monitor ID. This loop is not subscribed through the normal event trigger system; instead, a monitor completion callback delivers it exactly once.

### MonitorList

Lists monitors with ID, status, command preview, output line count, age, exit code if known, and recent buffered lines for completed monitors. Finished monitors are pruned after a short delay.

### MonitorStop

Stops a running monitor. It attempts graceful termination first, waits five seconds, then force-kills if needed. It marks the monitor as stopped and prunes it later.

### Native TaskCreate, TaskList, TaskUpdate, TaskDelete

These are registered only if `pi-tasks` does not respond during startup detection. They provide a smaller task system than `pi-tasks`:

- Tasks have subject, description, status, timestamps, and optional metadata.
- Statuses are pending, in-progress, and completed.
- No dependency graph, owners, active form, or subagent execution.
- `TaskUpdate` uses `id`, not `taskId`.
- Native tasks integrate with backlog worker loop creation and the status widget.

## Slash commands

### `/loop`

Interactive and shortcut command for loop creation and management. With arguments, it treats the first argument as interval/trigger and the remainder as prompt. Without arguments, it opens a UI flow for loop operations.

### `/tasks`

Registered only with native fallback tasks. It opens an interactive viewer/manager or quick-creates a native task from command arguments.

## Core data model

### Loop entry

A loop record stores ID, prompt, trigger, status, recurring flag, creation/update/expiry timestamps, auto-task flag, task backlog flag, read-only flag, optional max fires, and current fire count. IDs are numeric strings allocated from a store counter. Expiry is seven days after creation.

### Trigger variants

Cron trigger stores type `cron` and a five-field schedule. Event trigger stores type `event`, a Pi event source, and optional filter string. Hybrid trigger stores type `hybrid`, a cron expression, an event source/filter, and debounce milliseconds.

### Monitor entry

A monitor record stores ID, command, optional description, timeout, status, timestamps, exit code, output line count, and a bounded output buffer. Internally, each running monitor also tracks child process handle, process ID, abort controller, waiters, and completion callbacks.

### Native task entry

Native fallback tasks store ID, subject, description, status, created/updated timestamps, optional completed timestamp, and metadata.

### Experimental goal entries

The repository includes a goal subsystem that is unit-tested but not wired into public tools in the analyzed entry point. It models a goal as title, description, status, verification status, scope, success/failure/blocked criteria, progress snapshot, verification counters, and metadata. Clean-room takeaway: this appears to be groundwork for higher-level goal tracking across tasks, loops, and monitors, not an exposed feature of the current extension.

## Persistence and scoping

Loop and native task storage is controlled by environment variables and scope.

`PI_LOOP` handling:

| Value | Behavior |
|---|---|
| `off` | Use in-memory storage only. |
| Absolute path | Use that exact JSON file. |
| Relative path beginning with dot | Resolve from current working directory. |
| Other string | Treated as a list ID under the default user Pi loops directory. |
| Unset | Use `PI_LOOP_SCOPE`. |

`PI_LOOP_SCOPE` values:

| Scope | Loop file behavior |
|---|---|
| `memory` | No disk persistence. |
| `session` | Per-session file under `.pi/loops/loops-<sessionId>.json`. Default. |
| `project` | Shared file under `.pi/loops/loops.json`. |

Native fallback tasks use the same scope policy as loops, except files live under `.pi/tasks/` and are not controlled by `PI_TASKS`.

File-backed stores use lock files containing the current process ID, stale lock detection, mutation under lock, temporary-file writes, and atomic rename. Reads use modification-time and size signatures to avoid unnecessary reloads. Corrupt JSON starts fresh rather than crashing.

## Reducer architecture

`pi-loop` has reducers for deterministic state transitions:

- Loop reducer: creation, pause, resume, fire, delete, expiry, max-fire cleanup, and backlog-empty cleanup.
- Monitor reducer: creation, output lines, completion, error, stop, pruning, and on-done registration.
- Native task reducer: creation, start, completion, reopen, detail updates, deletion, and pruning completed tasks.
- Notification reducer: queued wake notifications, agent-running state, pending-message guard, and delivery decisions.
- Goal reducer: experimental goal lifecycle and verification transitions.

Recurring loop notifications use a stable key per loop so newer fires supersede older undelivered wakes. One-shot loop notifications include timestamp in the key so they remain distinct.

## Scheduler and triggers

Human intervals are converted to simple cron schedules. Seconds shorter than a minute round to one minute. Common minute, hour, and day intervals map to five-field cron schedules. Five-field cron expressions are accepted directly. The next fire computation scans forward minute by minute and supports wildcard, list, range, and step field forms.

Each loop ID produces deterministic jitter to spread recurring wakes. Recurring schedules up to 30 minutes jitter by up to half the schedule period; longer recurring schedules jitter by up to 30 minutes; one-shot schedules jitter by up to roughly 90 seconds.

The scheduler stores next fire timestamps but does not use long-running timers for cron delivery. It is pumped from session lifecycle events, especially when the agent becomes idle or a new turn starts. It arms active cron/hybrid loops, fires due loops, rearms recurring loops, removes one-shot loops, deletes expired loops, and deletes loops that reach max fires.

The trigger system combines cron and event sources. Cron/hybrid loops are passed to the scheduler. Event/hybrid loops subscribe to Pi events. Event filters can be regex strings prefixed with `regex:` or JSON-style field matching. Hybrid event fires are debounced per loop. One-shot event loops delete themselves after firing.

## Loop delivery flow

1. A scheduler pump or event subscription selects an active loop.
2. The fire handler checks `maxFires` before doing work.
3. The loop's fire count is incremented in the store.
4. If `autoTask` is true, the task runtime bridge attempts to create a task.
5. The extension emits `loop:fire` with loop ID, prompt, trigger, timestamp, read-only flag, recurring flag, and auto-task flag.
6. A listener may drop auto-task wakes if no pending tasks remain.
7. The notification runtime queues the wake in memory.
8. The notification runtime flushes only when the agent is not running and, unless explicitly overridden, when no user messages are pending.
9. Delivery uses Pi message injection with a hidden custom message delivered as a steer and configured to trigger a turn.
10. Delivered content contains a short loop header, trigger description, optional read-only instruction, and the stored prompt.

The design avoids handing an irrevocable queued user message to Pi before final relevance checks.

## Background monitor flow

Monitor creation creates a running entry, spawns the command through the shell, listens to stdout/stderr, updates output count and buffer per line, emits `monitor:output`, marks completed or error on close, emits `monitor:done` or `monitor:error`, resolves callbacks/waiters, and schedules pruning.

Stopping marks status stopped, schedules pruning, sends graceful termination, waits up to five seconds, force-kills if needed, and resolves waiters.

`onDone` creates a one-shot event-typed loop record filtered by monitor ID. The loop is registered with the monitor completion runtime, not with the event trigger system. On monitor completion, the current loop is delivered through the same loop fire path and deleted. If the monitor already completed, delivery happens immediately; if it already errored or stopped, the loop is deleted.

## pi-tasks integration

At startup, `pi-loop` pings `pi-tasks` using `tasks:rpc:ping` and listens for `tasks:ready` to retry detection. If a versioned reply arrives, task support is available.

When `pi-tasks` is available:

- `autoTask` loop fires create tasks using `tasks:rpc:create`.
- Pending counts are requested using `tasks:rpc:pending`.
- Completed cleanup is requested using `tasks:rpc:clean`.
- Native task tools are not registered.

When `pi-tasks` is absent after a startup grace period:

- Native task store is constructed using loop scope.
- `/tasks` command is registered.
- Native task tools are registered.
- Native task counts appear in the status widget.

This choice is session-sticky.

## Task backlog automation

A task backlog loop is an active loop watching `tasks:created` and marked as a backlog worker, or matching the built-in auto-worker prompt. If the pending count reaches five, the extension creates a hybrid backlog worker loop if one does not already exist. The worker uses `tasks:created` plus a five-minute cron safety net, a fire cap of 30, and a prompt that tells the agent to pick pending tasks, mark them in progress, implement, validate, complete them, and delete its own loop when no tasks remain. If pending count drops to zero, backlog loops are removed and completed tasks can be swept.

## Session lifecycle behavior

Important lifecycle hooks:

- `before_agent_start`: obtain UI context, upgrade session-scoped store when session ID is known, load persisted loops, clear expired loops, expire stale event loops from prior sessions, start triggers, update widget.
- `turn_start`: update context/UI, upgrade store if needed, update widget, pump due cron/hybrid loops.
- `agent_start`: mark notification runtime as agent-running.
- `agent_end`: mark notification runtime idle, flush queued notifications while ignoring pending-message guard, clean backlog loops, pump due loops.
- `session_switch`: stop trigger subscriptions, clear queued notifications, reset session state, clear memory-scope loops on new sessions, recreate store for new/resumed session, show persisted loops.
- `session_shutdown`: clear queued notifications.
- Bash tool completion: if command was a successful `git commit`, request completed task cleanup.

Stale event loops are expired on new session start because event subscriptions cannot replay events that happened while the extension was not active.

## Widget behavior

The widget uses Pi UI status rather than a large persistent panel. It clears when no visible loops, monitors, or native tasks exist. Otherwise it shows compact counts and, for native tasks, a single focus item: active in-progress task if present, otherwise next pending task. Monitor status changes trigger repaint even without a tool call.

## Configuration and limits

| Variable | Meaning |
|---|---|
| `PI_LOOP` | Store override or `off`. |
| `PI_LOOP_SCOPE` | `memory`, `session`, or `project`; default `session`. |
| `PI_LOOP_DEBUG` | Diagnostic logging to stderr. |

Limits: 25 loops, 25 running monitors, 200 native fallback tasks, 200 experimental goals, seven-day loop expiry, and bounded monitor output buffers.

## Tests and verification surface

The repository tests stores, reducers, scheduler, interval parsing, trigger system, monitor manager, notification injection, backlog coordination, widget behavior, session/harness steering, and the experimental goal subsystem. There is also an end-to-end shell script for reminder injection behavior.

## Clean-room implementation checklist

To replicate the extension without source reuse: define the models independently; implement file stores with PID locks and atomic writes; implement interval parsing or use a cron library; implement idle-pumped scheduling; implement event subscriptions and hybrid debounce; implement in-memory queued notifications with final relevance checks; implement monitor process tracking and events; implement `pi-tasks` RPC detection and native fallback registration; implement backlog worker creation and cleanup; register compatible tools/commands; and add tests for state transitions, scheduling, event filters, monitor lifecycle, task fallback, and session switching.
