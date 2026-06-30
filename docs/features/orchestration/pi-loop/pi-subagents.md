# pi-subagents clean-room guide

## Purpose

`pi-subagents` adds autonomous subagents to Pi. A parent agent can spawn specialized agents with separate sessions, tools, prompts, models, memories, and execution modes. Agents can run foreground or background, be steered mid-run, resumed, grouped for notifications, scheduled for later execution, and isolated in git worktrees.

## User-facing tools

### Agent

Launches a subagent or schedules one for later.

Parameters:

| Parameter | Meaning |
|---|---|
| `prompt` | Self-contained task prompt. |
| `description` | Short UI summary. |
| `subagent_type` | Agent type from defaults or custom files. |
| `model` | Optional model override by full ID or fuzzy name. |
| `thinking` | Optional thinking level. |
| `max_turns` | Optional turn cap. |
| `run_in_background` | If true, return ID immediately and notify later. |
| `resume` | Resume an existing agent by ID. |
| `isolated` | Disable extension/MCP tools and skills. |
| `inherit_context` | Fork parent conversation into prompt. |
| `isolation` | Worktree filesystem isolation when set to worktree. |
| `schedule` | Optional delayed/recurring schedule when feature enabled. |

Main modes:

- Foreground: parent blocks until result is returned; progress streams in the tool result UI.
- Background: returns agent ID immediately; completion sends a later notification into the parent session unless result was already consumed.
- Resume: sends a new prompt to an existing agent session.
- Schedule: creates a session-scoped scheduled job and does not spawn immediately.

### get_subagent_result

Retrieves status and result for a background agent. It can optionally wait for completion and optionally include a verbose conversation transcript. Fetching a completed result marks it consumed and cancels pending notification delivery.

### steer_subagent

Sends a user message to a running agent. If the agent record exists but session is not ready yet, the steering message is queued and delivered after session initialization. Steering emits a lifecycle event.

## Slash command

`/agents` opens an interactive UI for:

- Viewing running/queued/completed agents and their live conversations.
- Managing agent types.
- Creating new custom agents.
- Managing scheduled jobs.
- Adjusting settings such as concurrency, max turns, grace turns, join mode, scheduling, model scope, default agents, and tool description mode.

## Default agent types

The extension embeds three default agents:

| Type | Purpose | Tool scope | Prompt mode | Model |
|---|---|---|---|---|
| `general-purpose` | Broad research and multi-step execution. | All built-ins by default. | Append to parent prompt. | Inherits parent unless overridden. |
| `Explore` | Fast read-only code search. | Read-only/search tools. | Replace prompt. | Prefers Haiku if available. |
| `Plan` | Read-only architecture and implementation planning. | Read-only/search tools. | Replace prompt. | Inherits parent. |

Default agents can be overridden by custom files with the same name, disabled individually, or globally suppressed by settings.

## Custom agent files

Agents are loaded from:

1. Project `.pi/agents/<name>.md`.
2. Global `$PI_CODING_AGENT_DIR/agents/<name>.md`, defaulting to the Pi agent directory.

Project files override global files. Filename becomes agent type. Markdown body becomes the agent system prompt. Frontmatter configures behavior.

Supported frontmatter concepts:

| Field | Meaning |
|---|---|
| `description` | Description in tool lists and UI. |
| `display_name` | UI name. |
| `tools` | Built-in tool allowlist and optional extension-tool selectors. |
| `extensions` | Which extensions load. |
| `exclude_extensions` | Extension denylist after includes. |
| `skills` | Inherit all, none, or named skills to preload. |
| `memory` | Persistent memory scope: project, local, or user. |
| `disallowed_tools` | Tool denylist after other allowlists. |
| `isolation` | Worktree filesystem isolation default. |
| `model` | Model ID or fuzzy model label. |
| `thinking` | Thinking level. |
| `max_turns` | Default turn cap. |
| `prompt_mode` | Replace or append parent prompt. |
| `inherit_context` | Default context inheritance. |
| `run_in_background` | Default background mode. |
| `isolated` | Hermetic built-in-tool-only mode. |
| `enabled` | Disable/hide from spawnable registry when false. |

Frontmatter is authoritative for strategy fields when present; call parameters fill gaps rather than overriding locked fields.

## Tool and extension scoping

Tool scoping is split into two questions:

1. Which extensions load.
2. Which tools are visible to the subagent.

Built-in tools are selected by `tools`. Extension loading is selected by `extensions`; `ext:` entries in `tools` do not load extensions by themselves. If any `ext:` selector is present, extension tools become opt-in: loaded extensions not named by a selector expose no tools. `ext:name/tool` narrows an extension to one tool; `ext:name` exposes that extension's tools.

`exclude_extensions` wins over includes and `ext:` selectors. It suppresses handler binding and tool registration, but it is not a security sandbox for extension factory side effects.

`isolated` disables extensions and skills and drops extension selectors, leaving built-in tools only.

Subagents never inherit the subagent management tools themselves; `Agent`, `get_subagent_result`, and `steer_subagent` are excluded from subagent tool scopes.

## Agent record model

An agent record stores:

| Field | Purpose |
|---|---|
| ID | Short random ID. |
| Type | Agent type. |
| Description | UI summary. |
| Status | Queued, running, completed, steered, aborted, stopped, or error. |
| Result/error | Terminal output or failure text. |
| Tool use count | Counted from tool execution events. |
| Started/completed timestamps | For duration display. |
| Session | Agent session object when available. |
| Abort controller | Used to stop execution. |
| Promise | Running completion promise. |
| Group/join metadata | Used for grouped background notifications. |
| Result consumed flag | Suppresses redundant notifications. |
| Pending steers | Messages queued before session readiness. |
| Worktree metadata | Path, branch, base SHA, and mapped working path. |
| Output file | Streaming transcript path. |
| Lifetime usage | Input/output/cache-write totals. |
| Compaction count | Number of successful compactions. |
| Invocation snapshot | Resolved UI-facing options. |

## Agent manager and concurrency

The manager owns all agent records and a background queue.

Behavior:

- Default maximum concurrent background agents is four.
- Background agents beyond the limit are queued.
- Foreground agents bypass the queue because the parent is blocked anyway.
- Scheduled jobs can bypass the manual queue so firing is not delayed by long-running manual agents.
- Queued agents start as running agents complete.
- Completed records are periodically cleaned after a retention window, but sessions are kept long enough for resume where possible.
- Parent abort signals propagate to the subagent.
- Session shutdown aborts all agents and clears notification timers.

## Agent execution flow

For each run:

1. Resolve custom/default agent config.
2. Resolve effective model, thinking level, max turns, context inheritance, isolation, tool scope, and prompt mode.
3. Optionally create a git worktree and adjust working directory.
4. Detect environment information for prompt context.
5. Build system prompt from agent body, parent prompt if append mode, environment, memory block, and preloaded skill blocks.
6. Configure Pi resource loader with selected extensions, extension filters, skill handling, and prompt overrides.
7. Build allowed tool list from built-ins plus selected extension tools minus disallowed and subagent-management tools.
8. Create an in-memory Pi agent session with selected model, tools, resource loader, settings manager, and working directory.
9. Bind selected extensions.
10. Subscribe to session events for tool activity, text deltas, turn count, token usage, and compactions.
11. Optionally prepend parent conversation context to the prompt.
12. Prompt the subagent session.
13. Collect the final assistant text.
14. Apply status: completed, steered after soft turn limit, aborted after hard grace limit, stopped, or error.
15. Clean up streaming output file and worktree.
16. Emit lifecycle events and deliver notification if background.

## Max-turn behavior

A max-turn limit is graceful, not an immediate hard kill:

- At the configured max turns, the agent is steered to wrap up immediately.
- It receives a grace window of additional turns.
- If it finishes during grace, status is `steered` and treated as successful wrapped-up completion.
- If it exceeds grace, the session is aborted and status becomes `aborted`.

Grace turns default to five and are configurable.

## Background notifications and join modes

Background completion can notify in three modes:

| Mode | Behavior |
|---|---|
| `async` | Each agent sends an individual notification. |
| `smart` | Agents spawned together in the same short batch are grouped if there are two or more; solo agents notify individually. Default. |
| `group` | Forces grouping behavior even when the caller expects a group. |

Implementation concepts:

- Newly spawned background agents are collected in a short debounce window.
- Smart/group batches register with a group join manager.
- Group completion waits for all group members, but sends partial notifications after a timeout.
- Result notifications are held briefly so `get_subagent_result` can cancel redundant delivery.
- Notifications are sent as custom messages with human-friendly rendering and structured model-visible content.

## Output transcript files

Background agents can stream their conversation to an output file under `.pi/output/`. The initial entry records prompt/session context, then session events append as the run progresses. Completion notifications include transcript path when available.

## Scheduling

The `schedule` parameter on `Agent` creates a scheduled subagent job instead of spawning immediately.

Supported schedule forms:

- Six-field cron with seconds.
- Repeating intervals like minutes/hours/days.
- Relative one-shot schedules using a leading plus.
- Absolute ISO timestamps.

Restrictions:

- Scheduling cannot be combined with resume.
- Scheduling cannot be combined with inherit-context because no parent conversation exists at fire time.
- Scheduled jobs always run in background.
- Scheduled jobs bypass the manual concurrency queue.
- Scheduling can be disabled in settings, in which case the tool schema omits the parameter on next session load.

Scheduled jobs are session-scoped, stored under `.pi/subagent-schedules/<sessionId>.json`, and protected with PID-style file locking. Firing a job spawns a normal background agent and completion arrives through the same notification path.

## Cross-extension RPC

The extension registers event-bus handlers for other extensions:

| Channel | Purpose |
|---|---|
| `subagents:rpc:ping` | Discovery and protocol version. |
| `subagents:rpc:spawn` | Spawn a background subagent and return ID. |
| `subagents:rpc:stop` | Stop a running subagent. |
| `subagents:ready` | Broadcast that handlers are registered. |

Replies are scoped by request ID and use a success/error envelope. Spawn options can include model, description, background mode, max turns, working directory, and isolation controls. A caller-supplied working directory must be an absolute existing directory. When a custom working directory is used, tools operate there but project configuration remains from the parent session.

## Lifecycle events

The extension emits Pi events for:

- Created background agents.
- Started agents, including queued agents becoming running.
- Completed agents.
- Failed/stopped/aborted agents.
- Steering messages.
- Session compactions.
- Schedule changes and scheduler readiness.
- Settings loaded/changed.
- Extension readiness.

Token totals include input, output, and cache writes. Cache reads are intentionally excluded from lifetime totals to avoid over-counting.

## Model resolution and scope enforcement

Model selection priority:

1. Call parameter if allowed by frontmatter authority rules.
2. Agent config/frontmatter model.
3. Parent model.

Model strings can be full provider/model IDs or fuzzy names resolved against the model registry.

Optional scope enforcement reads Pi enabled-model settings from global and project settings. If enabled:

- Caller-supplied out-of-scope models produce a hard error.
- Frontmatter-pinned or parent-inherited out-of-scope models show a warning but proceed.
- Empty or missing allowed set is treated as no-op.

## Persistent memory

Custom agents can declare memory scope:

| Scope | Location concept |
|---|---|
| Project | Project `.pi/agent-memory/<agent>/`. |
| Local | Project local `.pi/agent-memory-local/<agent>/`. |
| User | User-level Pi agent memory directory. |

Memory uses an index file plus individual memory files. Agents with write/edit tools receive read-write memory helpers. Read-only agents receive a read-only memory prompt and only the read tool if needed. The disallowed-tool list is considered when deciding write capability.

## Skill preloading

Agents can preload named skills from project and user roots. Resolution supports Pi-standard directory skills and flat markdown files, plus Agent Skills-style roots. Traversal is deterministic, avoids dot directories and node modules, and rejects symlinks and path-traversal names.

Preloaded skills are injected into the agent system prompt. If skills are explicitly listed, upstream skill loading is disabled to avoid duplicate injection.

## Worktree isolation

When worktree isolation is requested:

1. The manager validates that the base directory is a git repository with commits and can create a worktree.
2. A temporary worktree and branch name are prepared for the agent.
3. The agent runs in the worktree, or in a mapped subdirectory if the caller requested a subdirectory working directory.
4. On completion, if no changes exist, the worktree is cleaned up.
5. If changes exist, they are committed or preserved on a branch named for the agent ID and the result explains how to merge it.
6. If the agent already committed work, the branch preserves those commits; uncommitted leftovers are committed on top.
7. Failure to create a worktree is a hard error, not a silent fallback.

## Settings

Settings are merged from global and project JSON files. Project settings override global settings. Runtime settings include:

- Max concurrent background agents.
- Default max turns.
- Grace turns.
- Default join mode.
- Scheduling enabled/disabled.
- Model scope enforcement.
- Disable default agents.
- Agent tool description mode: full, compact, or custom template.

Settings changes emit events and persist to the project settings file when possible.

## UI behavior

The extension provides:

- A persistent widget for running/queued agents with spinner, type, description, turns, tool count, tokens, context utilization, compaction count, duration, and current activity.
- Custom rendering for Agent tool calls/results.
- Custom rendering for background completion notifications.
- A live conversation viewer accessible from `/agents`, with scrolling and stop controls.
- Menus for agent type management, settings, and scheduled jobs.

## Tests and verification surface

Tests cover agent manager concurrency and lifecycle, agent runner settings and E2E behavior, custom agent loading, model resolution, enabled-model scope, settings, prompts, output files, memory, skills, worktree behavior, group join, conversation viewer, schedule store/scheduler, RPC, print mode, and tool description templates.

## Clean-room implementation checklist

To replicate:

1. Implement agent registry merging defaults, global custom files, and project custom files with case-insensitive resolution.
2. Implement frontmatter parsing and independent prompt construction.
3. Implement tool/extension scoping as two separate stages.
4. Implement an agent manager with records, queue, concurrency, aborts, completion callbacks, and lifecycle events.
5. Implement session creation using Pi APIs, event subscriptions, max-turn steering, usage tracking, and result collection.
6. Implement background notification hold/cancel and group join behavior.
7. Implement RPC handlers with request-scoped replies.
8. Implement scheduled jobs with session-scoped persistence and schedule parsing.
9. Implement memory, skill preloading, model resolution/scope, and worktree isolation.
10. Implement `/agents` UI and widget behavior.
11. Add tests for all public flows and edge cases.
