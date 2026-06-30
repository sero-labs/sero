# pi-tasks clean-room guide

## Purpose

`pi-tasks` adds structured task tracking to Pi. It is modeled after Claude Code-style task/todo tooling and provides:

- A task list with statuses, metadata, dependencies, ownership, and persistent storage.
- A persistent widget showing task progress and active execution state.
- Reminder injection when task tools have not been used recently.
- Turn-based cleanup of completed tasks.
- Background process output tracking.
- Integration with `pi-subagents` so tasks can be executed by specialized background agents.
- Event-bus RPC so other extensions, notably `pi-loop`, can create tasks and query pending task state.

## User-facing tools

### TaskCreate

Creates a task with status `pending`.

Parameters:

| Parameter | Meaning |
|---|---|
| `subject` | Brief title. |
| `description` | Detailed context and acceptance criteria. |
| `activeForm` | Optional present-continuous label shown while active. |
| `agentType` | Optional subagent type used by `TaskExecute`. |
| `metadata` | Optional arbitrary key/value data. |

If `agentType` is provided, it is stored in metadata. Creation resets auto-clear countdown and updates the widget.

### TaskList

Lists all tasks sorted pending first, then in-progress, then completed; within each group by numeric ID. Each line includes ID, status, subject, owner if set, and open blockers. Completed blockers are hidden from the summary so the list focuses on actionable constraints.

### TaskGet

Returns full details for one task, including subject, status, owner, full description, open blockers, tasks blocked by this task, and metadata if present.

### TaskUpdate

Updates status or fields.

Parameters:

| Parameter | Meaning |
|---|---|
| `taskId` | Required task ID. |
| `status` | `pending`, `in_progress`, `completed`, or `deleted`. |
| `subject` | Optional new title. |
| `description` | Optional new description. |
| `activeForm` | Optional active spinner label. |
| `owner` | Optional owner string, often an agent ID. |
| `metadata` | Shallow merge; null values delete keys. |
| `addBlocks` | Add tasks that this task blocks. |
| `addBlockedBy` | Add tasks that block this task. |

Important behavior:

- Setting status to `deleted` permanently removes the task and cleans dependency edges pointing at it.
- Dependency edges are bidirectional. Adding one side updates the other side if the target exists.
- Warnings are returned for self-dependencies, missing task IDs, and simple cycles.
- Marking a task in-progress sets it as active in the widget and resets auto-clear.
- Marking a task completed clears active state and starts auto-clear tracking.

### TaskOutput

Retrieves output for background task processes or subagent-backed tasks.

Parameters:

| Parameter | Meaning |
|---|---|
| `task_id` | Task ID or agent ID/prefix. |
| `block` | Whether to wait for completion. Default true. |
| `timeout` | Max wait in milliseconds. |

For shell processes, it returns captured output and terminal status. For subagent tasks, it waits for subagent completion/failure events when blocking and returns task/subagent status metadata.

### TaskStop

Stops a running background task process or subagent-backed task.

Behavior:

- For shell processes, sends graceful termination, waits five seconds, then force-kills.
- For subagent tasks, calls the `pi-subagents` stop RPC.
- Stopped tasks are marked completed and tracked for auto-clear.

### TaskExecute

Executes one or more tasks as background subagents.

Parameters:

| Parameter | Meaning |
|---|---|
| `task_ids` | Array of task IDs. |
| `additional_context` | Extra context appended to each subagent prompt. |
| `model` | Optional model override. |
| `max_turns` | Optional max turns per agent. |

Requirements for each task:

- It must exist.
- It must be pending.
- It must have `agentType` in metadata.
- All blockers must be completed.

For each eligible task, the extension marks it in-progress, builds a self-contained prompt, spawns a background subagent over RPC, stores the returned agent ID in metadata, maps agent ID to task ID in memory, and sets the task active in the widget.

## Slash command

`/tasks` opens an interactive task menu with options to view tasks, create a task, clear completed tasks, clear all tasks, and edit settings. The settings menu persists display and behavior preferences.

## Core data model

A task stores:

| Field | Purpose |
|---|---|
| ID | Numeric string allocated from store counter. |
| Subject | Brief human-readable task title. |
| Description | Detailed task body. |
| Status | Pending, in-progress, or completed. |
| Active form | Optional text for the active spinner. |
| Owner | Optional owner/agent ID. |
| Metadata | Arbitrary key/value object. |
| Blocks | IDs of tasks waiting on this task. |
| Blocked by | IDs of tasks this task waits on. |
| Created and updated timestamps | Milliseconds since epoch. |

Stored data contains a next-ID counter plus an array of tasks.

## Task lifecycle

Normal lifecycle is pending to in-progress to completed. `deleted` is accepted as an update command but is not a stored status; it removes the task.

Operational conventions:

- The agent is guided to create task lists for complex multi-step work.
- The agent is guided to mark a task in-progress before starting and completed only when fully done.
- After completing a task, the agent is guided to list tasks again to find the next unblocked task.

## Dependency management

Dependencies are represented as bidirectional ID arrays:

- `blocks` means this task must complete before the listed tasks can proceed.
- `blockedBy` means listed tasks must complete before this task can proceed.

When an edge is added through either side, the target task is updated with the inverse edge if it exists. Missing targets are still recorded on the source and produce a warning. Deleted tasks are removed from all other tasks' dependency arrays.

Task list display suppresses blockers that are already completed, while full task details preserve and show raw edge information.

## Persistence and configuration

### Storage resolution

Storage is controlled by environment and settings.

`PI_TASKS` values:

| Value | Behavior |
|---|---|
| `off` | In-memory store only. |
| Absolute path | Use exact JSON path. |
| Relative path beginning with dot | Resolve from current working directory. |
| Other string | Use as a named list under the user's Pi tasks directory. |
| Unset | Use configured `taskScope`. |

`taskScope` settings:

| Scope | Behavior |
|---|---|
| `memory` | In-memory only. |
| `session` | Per-session file under `.pi/tasks/tasks-<sessionId>.json`. Default. |
| `project` | Shared project file under `.pi/tasks/tasks.json`. |

Session scope starts in memory until a session ID is available, then upgrades to the session file. On new sessions, if all persisted tasks are completed, they are auto-cleared. On resume, completed tasks are shown for review.

### File locking

File-backed task storage uses:

- A sibling lock file.
- PID stored in the lock file.
- Stale PID detection.
- Retry loop with short waits.
- Reload before mutation.
- Temporary-file write and atomic rename.

### Settings file

Project settings are stored in `.pi/tasks-config.json` and include:

| Setting | Meaning |
|---|---|
| `taskScope` | memory/session/project. |
| `autoCascade` | Whether subagent completion launches newly unblocked dependent tasks. |
| `autoClearCompleted` | never, on-list-complete, or on-task-complete. |
| `showAll` | Whether widget ignores visible limit. |
| `maxVisible` | Widget task line cap. |
| `sortOrder` | ID, status, recent, or oldest. |
| `hiddenAt` | Whether overflow marker appears at top or bottom. |

## Widget behavior

The widget displays a compact persistent task list above the editor:

- Summary count of total, done, in-progress, and pending tasks.
- Completed tasks use a completed icon and strikethrough/dim styling.
- In-progress but not actively executing tasks use an in-progress icon.
- Pending tasks use an open icon.
- Actively executing tasks use an animated spinner, active-form text, elapsed time, and token counts.
- Overflow is collapsed according to settings.

The widget also tracks per-turn token usage from assistant messages and displays it for active tasks.

## Reminder injection

`pi-tasks` includes a cadence-based reminder system. It tracks turns and recent use of task tools.

Behavior:

1. A turn counter advances on each turn start.
2. Task tool use resets the cadence.
3. If non-task tools are used for enough turns while tasks exist, a reminder is queued.
4. The reminder is injected through the Pi `context` hook as an extra transient user message for the upcoming LLM request.
5. The reminder is not appended to tool results and is not persisted in the session transcript.

The reminder tells the model that task tools have not been used recently and suggests using task creation/status updates only if relevant. It also instructs the model not to mention the reminder.

## Auto-clear behavior

Completed tasks can be cleared automatically after a turn delay.

Modes:

| Mode | Behavior |
|---|---|
| `never` | Completed tasks stay until manually cleared. |
| `on_list_complete` | When all tasks are completed, start one countdown and clear completed tasks as a batch. Default. |
| `on_task_complete` | Each completed task gets its own countdown and is deleted individually. |

The delay is turn-based to let users briefly see completed work before it disappears. Creating tasks or reverting tasks resets relevant countdown state.

## Background process tracking

The process tracker can associate a child process with a task ID. It buffers stdout and stderr, records running/completed/error/stopped status, exit code, timestamps, waiters, and command. It supports blocking waits with timeout and graceful stop.

In the analyzed public tools, process tracking is exposed through `TaskOutput` and `TaskStop`, but this extension does not register a public task-spawn tool for arbitrary shell processes. The tracker is infrastructure for compatible task-process workflows.

## Subagent integration

`pi-tasks` integrates with `pi-subagents` over event-bus RPC.

### Detection

On startup and when `subagents:ready` fires, `pi-tasks` sends `subagents:rpc:ping` with a request ID and waits for a scoped reply. It expects a protocol version. The analyzed `pi-tasks` expects protocol version 2. If versions mismatch, it stores a warning to show in the UI and disables subagent execution until compatible.

### Spawn flow

Task execution uses `subagents:rpc:spawn` with:

- Agent type from task metadata.
- Prompt built from task subject/description.
- Options including description, background execution, optional model, and optional max turns.

The returned agent ID is mapped to the task ID and stored in task owner/metadata.

### Prompt construction

The prompt includes:

- The task ID and subject.
- The task description.
- Stored results from completed dependency tasks, truncated if very large.
- Additional context supplied to `TaskExecute`.
- An instruction to complete the task fully and not manage tasks itself.

### Completion handling

On `subagents:completed`:

- Find the corresponding task through the in-memory agent-task map.
- Mark the task completed.
- Store the subagent result in task metadata.
- Clear active widget state.
- Track auto-clear.
- If auto-cascade is enabled, find pending dependents blocked by this task whose blockers are now all completed and spawn them.

On `subagents:failed`:

- If status is `stopped`, mark the task completed and preserve partial result.
- Otherwise, revert the task to pending and store the error in metadata.
- Clear active widget state and reset batch auto-clear countdown for errors.

## Cross-extension RPC exposed by pi-tasks

`pi-tasks` is expected by `pi-loop` to expose at least these event-bus RPC channels:

| Channel | Purpose |
|---|---|
| `tasks:rpc:ping` | Discovery and version response. |
| `tasks:rpc:create` | Create task from another extension. |
| `tasks:rpc:pending` | Return count of pending tasks. |
| `tasks:rpc:clean` | Sweep completed tasks. |
| `tasks:ready` | Broadcast that handlers are registered. |

The analyzed `pi-loop` depends on these channels. `pi-tasks` emits task creation events for local creates as well.

## Session lifecycle

Important hooks:

- `turn_start`: advances reminder cadence, captures UI context, upgrades session store, handles auto-clear.
- `turn_end`: collects token usage for widget.
- `tool_result`: updates reminder cadence without mutating tool output.
- `context`: injects transient reminder if queued.
- `before_agent_start`: captures UI context, upgrades store, shows persisted tasks, shows pending subagent compatibility warning.
- `session_switch`: resets session-scoped state, reminder cadence, auto-clear, and memory-mode tasks on new sessions; reloads tasks for resume.
- `tool_execution_start`: refreshes latest context and UI context.

## Limits and defaults

- Reminder interval: four turns without task tool use.
- Auto-clear delay: four turns.
- Widget max visible default: ten.
- Task scope default: session.
- Auto-cascade default: disabled.
- Auto-clear default: on-list-complete.

## Tests and verification surface

Tests cover task store behavior, dependency management, widget rendering, reminder cadence, auto-clear, process tracking, and subagent integration behavior.

## Clean-room implementation checklist

To replicate:

1. Implement task model with status, metadata, owner, dependency edges, timestamps, and active-form label.
2. Implement file-backed store with PID locks, atomic writes, edge cleanup, and sorting modes.
3. Register task tools with compatible parameter names, especially `taskId` for full `pi-tasks` updates.
4. Implement reminder cadence using a transient context hook, not by altering tool outputs.
5. Implement turn-based auto-clear.
6. Implement widget summary and active-task rendering.
7. Implement subagent RPC detection, spawn, stop, result mapping, and auto-cascade.
8. Expose task RPC channels for `pi-loop` compatibility.
9. Add tests for dependencies, storage, reminders, subagent completion/failure, settings, and session switching.
