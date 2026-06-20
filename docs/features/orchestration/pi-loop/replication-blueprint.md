# Clean-room replication blueprint

This document outlines how to build a functionally similar system in another project without reusing source code.

## Recommended module boundaries

### Shared primitives

Create these independently reusable primitives first:

1. Event-bus RPC helper with request IDs, scoped reply channels, timeout, and success/error envelopes.
2. File-backed JSON store abstraction with optional in-memory mode, PID lock files, stale lock removal, load-before-mutate, and atomic rename writes.
3. Small reducer/coordinator abstraction if you want deterministic state transitions and testable effects.
4. UI status/widget abstraction so each feature can update status without knowing terminal details.
5. Time utilities for turn counters, deadlines, durations, and schedule parsing.

### Task package

Build task tracking as the middle layer:

- Task model and store.
- Task CRUD tools.
- Dependency graph management.
- Widget and settings.
- Reminder cadence using transient context injection.
- Auto-clear behavior.
- RPC server for task discovery, creation, pending count, and cleanup.
- Optional subagent execution client.

### Subagent package

Build subagent execution as a worker layer:

- Agent type registry and custom agent loader.
- Prompt builder.
- Tool/extension scoping.
- Agent session runner.
- Agent manager with queue and lifecycle records.
- Background notification manager.
- RPC server for spawn/stop/ping.
- Optional schedule, memory, skill, model-scope, and worktree modules.

### Loop package

Build loop/monitor automation as an orchestration layer:

- Loop model and store.
- Trigger parser and scheduler.
- Event subscription manager with filter matching and debounce.
- Notification queue with safe idle delivery.
- Monitor process manager and events.
- Task RPC client and native fallback task system.
- Backlog worker logic.
- Status widget.

## Behavioral requirements by feature

### Storage

A clean-room implementation should match these behaviors:

- In-memory mode when persistence is disabled or session ID is not yet known.
- Session-scoped files that switch on session ID.
- Project-scoped shared files.
- Environment variable path overrides.
- Atomic writes to reduce corruption risk.
- Lock files for shared stores.
- Stale lock detection using process liveness.
- Corrupt JSON does not crash the extension.

### Session lifecycle

Replicate the lifecycle separation:

- Initialize lightweight in-memory state at extension load.
- Upgrade session-scoped stores once context/session ID is available.
- On new sessions, clear memory-scoped state and reset reminder/notification queues.
- On resume, load persisted state without clearing completed history unless feature semantics require it.
- On agent start/end, update delivery guards.
- On shutdown, clear timers, subscriptions, and running background processes/agents.

### Re-wake delivery

Do not deliver scheduled wake messages directly at trigger time without checks. Instead:

1. Record that a wake is pending.
2. Re-check task relevance or other preconditions at delivery time.
3. Confirm the agent is idle or choose an explicit steer mode.
4. Inject a hidden/custom message that triggers a turn.
5. Ensure recurring wake keys coalesce stale pending notifications.

### Background work

For shell monitors:

- Treat stdout and stderr uniformly as output lines.
- Emit line events immediately.
- Store bounded output for summaries.
- Track terminal status and exit code.
- Support graceful stop with force-kill fallback.
- Delay pruning so terminal state can be inspected briefly.

For subagents:

- Assign durable IDs.
- Track status, session, result, error, tool uses, token usage, timestamps, and notification state.
- Support background queue with concurrency limit.
- Support stop/abort and parent abort propagation.
- Emit lifecycle events for other extensions.

### Task execution

For task/subagent integration:

- Store agent type in task metadata.
- Only execute pending, unblocked tasks.
- Mark tasks in-progress before spawning.
- Store agent ID as owner/metadata.
- On success, mark completed and store result.
- On error, revert to pending and store error.
- On intentional stop, mark completed with partial result.
- For cascade, only launch dependents when every blocker is completed.

## Suggested implementation order

1. Implement event-bus RPC helper and tests.
2. Implement file-backed store helper and tests.
3. Implement task store and task tools.
4. Add task widget/settings/reminders.
5. Implement subagent registry and a minimal foreground/background runner.
6. Add subagent RPC and lifecycle events.
7. Connect tasks to subagents through RPC.
8. Implement loop store and scheduler.
9. Add event triggers and notification queue.
10. Add monitor manager and monitor tools.
11. Connect loops to task RPC and native fallback.
12. Add backlog worker automation.
13. Add advanced subagent features: custom agent files, schedules, memory, skills, model scope, worktrees, group join.
14. Add comprehensive integration tests.

## Public compatibility matrix

| Surface | Required for compatibility |
|---|---|
| `pi-loop` tools | `LoopCreate`, `LoopList`, `LoopDelete`, `MonitorCreate`, `MonitorList`, `MonitorStop`; native task tools when full tasks absent. |
| `pi-tasks` tools | `TaskCreate`, `TaskList`, `TaskGet`, `TaskUpdate`, `TaskOutput`, `TaskStop`, `TaskExecute`. |
| `pi-subagents` tools | `Agent`, `get_subagent_result`, `steer_subagent`. |
| Task RPC | `tasks:rpc:ping`, `tasks:rpc:create`, `tasks:rpc:pending`, `tasks:rpc:clean`, `tasks:ready`. |
| Subagent RPC | `subagents:rpc:ping`, `subagents:rpc:spawn`, `subagents:rpc:stop`, `subagents:ready`. |
| Monitor events | `monitor:output`, `monitor:done`, `monitor:error`. |
| Subagent events | Created, started, completed, failed, steered, compacted, scheduled, scheduler ready, settings loaded/changed. |
| Loop events | `loop:fire`. |

## Edge cases to test

### Store and session

- Two processes mutate the same file-backed store.
- Stale lock file from dead process.
- Corrupt JSON file.
- Session starts without ID and later upgrades.
- Session switch between new and resume.
- Memory mode state clears on new session.

### Loops

- Human interval parsing and rounding.
- Five-field cron matching.
- Expired loops are deleted.
- Event loops from prior session are expired.
- Hybrid debounce coalesces rapid events.
- Recurring notification supersedes undelivered prior wake.
- `maxFires` stops recurring loops.
- Auto-task loop does not wake when pending count is zero.

### Monitors

- stdout and stderr line handling.
- Zero exit versus nonzero exit.
- Process spawn error.
- Timeout stop.
- Manual stop.
- `onDone` delivers exactly once.
- Already completed monitor with `onDone` delivers or expires correctly.

### Tasks

- Dependency edges update both sides.
- Deleting a task cleans other edges.
- Missing dependency warnings.
- Completed blockers hidden in list but preserved in detail.
- Reminder injection only through context hook.
- Auto-clear modes and turn delays.
- Session-scope auto-clear of all-completed new sessions.

### Subagents

- Unknown type fallback.
- Disabled agent cannot spawn.
- Frontmatter fields lock callsite overrides as intended.
- Extension/tool scoping mismatches produce warnings.
- Background queue drains on completion.
- Result retrieval cancels notification.
- Group join sends full and partial results appropriately.
- Max-turn steer and hard abort.
- Stop before session readiness with queued steer/abort cases.
- Worktree failure is hard error.
- Custom working directory validation.
- Scheduled job restrictions.

## Clean-room guardrails

- Do not copy tool descriptions verbatim. Preserve semantics with newly written descriptions.
- Do not copy default agent prompt text. Write fresh prompts that impose equivalent constraints.
- Keep interface names only where compatibility requires them.
- Reimplement algorithms independently. For cron scheduling, consider using a maintained cron library if license-compatible instead of recreating minute-scan logic.
- Use independent tests written from behavior in these documents, not from source fixtures.
- If exact UI glyphs are not needed for compatibility, choose your own icons and layout while preserving state information.
