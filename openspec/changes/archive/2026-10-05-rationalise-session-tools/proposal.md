## Why

A new chat session sends about 58,400 characters before the user types anything: 31,064 of system prompt and 27,379 of tool schemas. At the 2.8 characters per token that `token-baseline.test.ts` is calibrated to, that is roughly 20,900 tokens, and much of it is irrelevant to most sessions, duplicated, stale, or names tools the session cannot call. Wayfinder issue #574 asks what each Sero agent kind may use. While debugging a session we also found that the tools and prompt text a session is shown do not match what it can actually call, and nothing tests that they do.

## What Changes

- Remove the bundled taste skill pack (12 skills under `packages/templates/skills/taste/`). Existing profiles keep their copies.
- Stop loading skills from the user-global `~/.agents/skills` folder, which another tool's skill installer owns. Project `.agents/skills` folders still load. The Skills UI does not list the user-global folder either. It lists the profile's skills, plugin skills and every project's own skills.
- Move `design_library_assets`, `design_library_settings`, `mcp_manager` and, in chat sessions, `automation_browser` behind `sero-cli`. Each moved command gets a summary that says when to use it.
- Activate the goal terminal tools (`goal_complete`, `goal_blocked`, `goal_wait`) only while a goal is attached to the session.
- A session's prompt names only tools and commands that session can call: the Sero CLI block needs the `sero-cli` tool, and plugin blocks (memory, MCP, graphify) need their command or tool.
- Reconnect the container environment block, which no production caller has passed since #177, and correct it (the image is `ubuntu:24.04` with Node 24, not `node:22-slim`).
- Trim the host and container blocks of duplicated and generic text. Replace the three Pi documentation pointers with one dynamic line plus a bundled `pi-docs` skill.
- Move the `sero app` and `sero browser` usage tips out of the prompt into `sero help app` and `sero help browser`. Stop cutting command summaries mid-word.
- Fix the profile `AGENTS.md` template: remove the deprecated `kanban` line, the nonexistent `register_dev_server` tool, and the memory advice that contradicts the memory rework.
- Architect and Room member sessions: run `read`, `write` and `edit` through the workspace runtime, like `bash`. Stop bridging slash commands into private CLI registries, where they always fail.
- Members get the plugin tools they were approved for, such as `web_search` or `git_manager`. Today the approval dialog offers them, but the member session never loads their plugins.
- Plugins declare, per tool, which session kinds may have it (chat, subagent, member), and the host enforces it. Goals and Rooms control become chat-only, `room` becomes member-only, and a Room member's only Orchestrator command is `room`. Subagents and workflow steps get no goal or Rooms tools.
- Add a contract test that opens each session kind in a fresh profile, uses a local stub model to call every tool and command the session is shown, and fails on any that cannot be called. Add a small paid check that a real model picks the moved commands.

## Capabilities

### New Capabilities
- `session-tool-surface`: which tools and `sero-cli` commands each agent session kind gets, and the rule that anything a session is shown it can call.
- `session-start-context`: what a session's system prompt and skill list contain at start, where skills are loaded from, and the accuracy of the runtime environment blocks.

### Modified Capabilities

None. `persistent-session-allowlist` and `programmatic-tool-calling` keep their requirements.

## Impact

- `apps/desktop/electron/cli/` (bridge, prompt block, summaries, help text)
- `apps/desktop/electron/ipc/agent/core/agent-session-open.ts`, `features/apps/extensions/create-sero-extension.ts`, `features/container/tools/` (runtime tools, prompt blocks)
- `features/subagent/runtime/` (loader prompt gating), `features/apps/runtime/capabilities/persistent-sessions/` (member tools, private registry)
- Skill pipeline: `features/agent-plugins/skills.ts`, `features/plugins/resource-compatibility.ts`, `ipc/agent/handlers/skills.ts`
- Plugins: design-library, mcp, orchestrator (goal tools), memory, graphify, cron (prompt gating) manifests and extensions
- `packages/templates/skills/`, `packages/templates/profile/AGENTS.md`
- Tests: `__tests__/agent/token-baseline.test.ts`, a new `e2e/session-tools.contract.spec.ts` and a small `*.agent.spec.ts`
- Docs: `apps/docs-site/docs/reference/sero-cli.md` and the plugin `bridgeTools` guidance
- No published npm package changes are expected. If one is touched, bump its version in the same PR.
