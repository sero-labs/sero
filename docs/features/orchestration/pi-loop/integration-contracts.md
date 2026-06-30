# Cross-extension integration contracts

This document describes how `pi-loop`, `pi-tasks`, and `pi-subagents` communicate. It is written as a clean-room behavioral contract, not as source code.

## Event bus style

The extensions use Pi's event bus for loose coupling. RPC-like calls follow this pattern:

- Caller generates a unique request ID.
- Caller subscribes to a reply channel that includes the request ID.
- Caller emits a request event containing the request ID and parameters.
- Callee emits a reply event on the scoped reply channel.
- Reply envelope contains success plus optional data, or failure plus error message.
- Callers enforce timeouts and treat timeout as unavailable or failed.

This allows extensions to discover each other without imports and avoids shared package singletons for most cross-extension use.

## pi-loop to pi-tasks

### Discovery

`pi-loop` checks whether full task support is available by emitting `tasks:rpc:ping` and waiting for `tasks:rpc:ping:reply:<requestId>`. It also listens for `tasks:ready` and retries discovery when that event fires.

A reply with version data marks `pi-tasks` available. If no reply arrives within the timeout, `pi-loop` waits a startup grace period and registers native fallback task tools.

### Task creation

When a loop fires with `autoTask`, `pi-loop` emits `tasks:rpc:create` with:

| Field | Meaning |
|---|---|
| `requestId` | Correlation ID. |
| `subject` | Loop prompt truncated to a short title. |
| `description` | Mentions the source loop. |
| `metadata` | Includes loop ID and trigger. |

Expected successful data includes the created task ID.

### Pending count

For task-aware loop decisions, `pi-loop` emits `tasks:rpc:pending`. Expected successful data includes a pending task count. On timeout or failure, callers use a sentinel unknown value and avoid destructive cleanup.

### Cleanup

When a backlog loop finds no pending work or when a git commit completes, `pi-loop` emits `tasks:rpc:clean`. This asks `pi-tasks` to sweep completed tasks according to its cleanup behavior.

### Task events

`pi-loop` can create event/hybrid loops watching `tasks:created`. `pi-tasks` emits this event when tasks are created. Native fallback task creation in `pi-loop` also emits `tasks:created` for consistency.

## pi-tasks to pi-subagents

### Discovery and versioning

`pi-tasks` emits `subagents:rpc:ping` and waits for `subagents:rpc:ping:reply:<requestId>`. It expects protocol version 2 in the analyzed implementation. It also listens for `subagents:ready` to retry detection.

Version behavior:

- Missing or older version: warn that subagents is outdated.
- Remote version newer than expected: warn that tasks is outdated.
- Matching version: enable subagent execution.

### Spawn

`TaskExecute` calls `subagents:rpc:spawn` with:

| Field | Meaning |
|---|---|
| `requestId` | Correlation ID. |
| `type` | Agent type from task metadata. |
| `prompt` | Self-contained task prompt. |
| `options.description` | Task subject. |
| `options.isBackground` | True for task execution. |
| `options.maxTurns` | Optional max-turn cap. |
| `options.model` | Optional model override. |

Expected successful data includes an agent ID. `pi-tasks` maps that agent ID to the task ID.

### Stop

`TaskStop` can call `subagents:rpc:stop` with request ID and agent ID. Stop failures are ignored or transformed into task-level errors depending on caller path.

### Completion events consumed by pi-tasks

`pi-tasks` listens for:

| Event | Task behavior |
|---|---|
| `subagents:completed` | Mark mapped task completed and store result. |
| `subagents:failed` | If stopped, mark completed with partial result; otherwise revert task to pending and store error. |

If auto-cascade is enabled, a completed task can trigger dependent pending tasks whose blockers are all completed.

## pi-subagents public RPC

### Ping

Request event: `subagents:rpc:ping`.

Request fields:

| Field | Meaning |
|---|---|
| `requestId` | Correlation ID. |

Reply channel: `subagents:rpc:ping:reply:<requestId>`.

Successful data includes protocol version.

### Spawn

Request event: `subagents:rpc:spawn`.

Request fields:

| Field | Meaning |
|---|---|
| `requestId` | Correlation ID. |
| `type` | Agent type. |
| `prompt` | Agent task prompt. |
| `options` | Spawn options. |

Important spawn options:

| Option | Meaning |
|---|---|
| `description` | UI summary and agent record description. |
| `run_in_background` / `isBackground` | Background mode depending on caller convention. |
| `model` | Model object or provider/model string. |
| `maxTurns` | Turn cap. |
| `cwd` | Absolute existing working directory, or unset. |
| `isolated` | No extension tools. |
| `isolation` | Worktree isolation. |

Successful data includes agent ID. Failures return a message in the error envelope.

### Stop

Request event: `subagents:rpc:stop`.

Request fields:

| Field | Meaning |
|---|---|
| `requestId` | Correlation ID. |
| `agentId` | Agent to stop. |

The handler stops/aborts the agent if possible and replies success or failure.

## pi-subagents lifecycle events

Other extensions can observe:

| Event | Meaning | Key data |
|---|---|---|
| `subagents:ready` | RPC handlers registered. | None required. |
| `subagents:created` | Background record created. | ID, type, description, background flag. |
| `subagents:started` | Agent enters running state. | ID, type, description. |
| `subagents:completed` | Successful terminal state. | ID, type, duration, tokens, tool uses, result. |
| `subagents:failed` | Error, stopped, or aborted. | Same as completed plus status/error. |
| `subagents:steered` | Steering message sent or queued. | ID and message. |
| `subagents:compacted` | Agent session compacted. | ID, reason, tokens before, compaction count. |
| `subagents:scheduled` | Schedule lifecycle changes. | Type-specific job/agent/error fields. |
| `subagents:scheduler_ready` | Scheduler initialized. | Session ID and job count. |
| `subagents:settings_loaded` | Settings loaded at init. | Merged settings. |
| `subagents:settings_changed` | Settings changed. | Settings and persistence flag. |

## pi-loop monitor events

`pi-loop` emits:

| Event | Meaning | Data |
|---|---|---|
| `monitor:output` | A stdout/stderr line was produced. | Monitor ID, line, timestamp. |
| `monitor:done` | Process exited successfully. | Monitor ID, exit code, output line count. |
| `monitor:error` | Process errored or nonzero exit. | Monitor ID, error or exit code, output line count where available. |

Loops can subscribe to these event sources, and `MonitorCreate` with `onDone` uses a callback-backed one-shot loop for exact once delivery.

## pi-loop loop events

`pi-loop` emits `loop:fire` when a loop is due. Data includes loop ID, prompt, trigger, timestamp, read-only flag, recurring flag, and auto-task flag. The event is both externally observable and internally consumed by the notification runtime.

## Compatibility notes

- Full `pi-tasks` uses `taskId` for `TaskUpdate`; `pi-loop` native fallback uses `id`. This difference matters for tool-call guidance and clean-room compatibility.
- `pi-subagents` RPC options historically use both camel-case and snake-case conventions depending on tool versus RPC caller. A compatible implementation should accept the forms used by existing callers.
- Request-scoped reply channels are essential; generic shared reply channels can cross-talk under concurrent calls.
- Timeouts should degrade gracefully. `pi-loop` should not block forever waiting for `pi-tasks`; `pi-tasks` should not expose `TaskExecute` as available unless `pi-subagents` version is compatible.
- Background notifications should be cancelable briefly so explicit result retrieval does not cause duplicate model/user messages.
