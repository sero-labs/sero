## Context

See proposal.md for the motivation. The facts below come from the captured chat context (`temp/turn_context.json`, a host workspace on a QA profile) and from reading the assembly code.

Start-up cost of that chat session, in characters:

| Part | Chars | Notes |
|---|---|---|
| Pi base prompt and tool guidelines | 4,927 | Includes a Pi docs section of about 1,100 chars |
| Global `AGENTS.md` | 3,293 | Seeded from `packages/templates/profile/AGENTS.md` |
| Skills list (21 skills) | 12,126 | 12 taste-pack skills, 2 from `~/.agents/skills` |
| MCP usage block | 1,059 | |
| Memory blocks | 906 | |
| Sero CLI block | 5,754 | 47 commands, plus about 1,300 chars of `sero app` and browser tips |
| Host runtime block | 2,252 | Includes a second Pi docs pointer |
| Subagent block | 747 | |
| Tool schemas (17 tools) | 27,379 | Largest: `automation_browser` 4,965, `mcp_manager` 3,510, `design_library_assets` 2,291, `design_library_settings` 1,825 |

How each session kind is assembled today:

| Kind | Entry | Direct tools | `sero-cli` | Prompt blocks |
|---|---|---|---|---|
| Chat (includes gateway, web-remote and goal sessions) | `ipc/agent/core/agent-session-open.ts:174` | runtime bash/read/write/edit, `sero-cli`, `automation_browser` if available, `run_code`, `subagent`, and every plugin tool its manifest does not bridge | shared registry | all |
| Workflow step, subagent, `host.subagents.runStructured` | `features/subagent/runtime/runner.ts:285` | from the tool policy or allowlist; plugin tools are direct because this loader does not bridge | shared registry scoped to the subagent id, only when the policy includes it | CLI block always (`loader.ts:46`), skills if `read` is active, AGENTS.md, plugin hooks |
| Architect and Room member | `persistent-sessions/host.ts:347`, inputs in `wiring.ts` | approved allowlist; `bash` and `automation_browser` through the runtime; `read`/`write`/`edit` are Pi built-ins on the host cwd | private registry: help plus the owning app's bridged tools and slash commands | CLI block (private), room skills, AGENTS.md |
| Plugin app agent | `ipc/agent/handlers/app-agent.ts:177` | `read` plus its own package tools | none | base, AGENTS.md, own hooks |
| Cron job | `plugins/sero-cron-plugin/extension/session-runner.ts:193` | Pi built-ins read/bash/edit/write | none | all plugin `before_agent_start` hooks (memory, MCP, graphify) |
| Isolated completion | `packages/extension-runtime/src/isolated-completion.ts:67` | none | none | caller's prompt only |
| Agent Node | `apps/agent-node/src/pi-host.ts:88` | Pi built-ins | none | none |

Defects found:

1. `design_library_assets` and `design_library_settings` are direct chat tools because the plugin's `bridgeTools` list omits them. The Design Library UI calls them through `appAgent.invokeTool`, which runs the tool in the app agent session (`app-agent-tools.ts`) and never goes through the bridge. `e2e/mcp.contract.spec.ts` already shows a bridged tool (`mcp`) that the UI still calls this way.
2. `mcp_manager` is direct, and the MCP block then spends 1,059 chars telling the agent not to use it. The same block says "call `mcp` directly", but `mcp` is only reachable through `sero-cli`.
3. The goal terminal tools are always active. They fail with a caller error in any session with no goal (`goal-tools.ts:46-64`).
4. `buildContainerPromptBlock` is dead in production. Both callers of `createSeroExtensionFactory` and the subagent loader pass `undefined` for the container state (`agent-session-open.ts:145`, `wiring.ts:190`). This has been true since #177, so container chats get no environment block. The block's facts are also wrong: it says `node:22-slim`, but `Dockerfile.sero-node` is `ubuntu:24.04` with Node 24.15.0; `dig` and `netstat` are not installed; `gh`, `rg`, `fd` and `sqlite3` are.
5. The subagent loader adds the full Sero CLI block even when the session has no `sero-cli` tool.
6. Cron sessions get the memory block ("use `sero memory`") and the MCP block, but have no `sero-cli`.
7. Member sessions: bridged slash commands fail with "requires an active agent session", because `extension-session-bridge.ts` resolves sessions through the chat pool only. Their `read`/`write`/`edit` run on the host filesystem while `bash` runs in the workspace runtime.
8. Pi's package manager always adds `~/.agents/skills` (`package-manager.js:1968,2003`). On this machine that folder was filled by the `skills` CLI (`~/.agents/.skill-lock.json`, source `Leonxlnx/taste-skill`) for other agent tools.
9. `packages/templates/profile/AGENTS.md` names `kanban` (deprecated), a `register_dev_server` tool that does not exist (the command is `sero devserver register`), a `daily` memory, and "use the `write` tool for memory", which contradicts "never edit memory files directly".
10. Command summaries are cut at 80 chars mid-word (`schema-bridge.ts:389`), for example "brief, charter, milestone, decide, researc".
11. The Pi docs location appears in three places: Pi's base prompt, the host block fallback, and the container block.

## Goals / Non-Goals

**Goals:**
- One rule, testable per session kind: a tool or command a session is shown, it can call.
- Remove start-up text that most sessions do not use, while keeping a clear trigger for everything moved behind `sero-cli`.
- Target: chat start-up at or below 32,000 chars on a fresh profile, down from 58,443. Measure it, don't assume it.

**Non-Goals:**
- A unified access model across grants, tool policies, allowlists and `noExtensions`. That stays with wayfinder #574.
- Changing which capabilities an Architect or Room grant can approve, or the approval UI.
- Deleting skills or `AGENTS.md` content from existing profiles.
- Stopping removed bundled skills from being re-copied at launch.
- Giving cron jobs memory. If a job needs it later, that is a per-job option.
- Agent Node, plugin app agents and isolated completion. No defects were found there.
- Renaming CLI commands.

## Decisions

### D1. Bridge by default, and keep direct only what needs to be direct

Chat keeps these direct tools: `read`, `write`, `edit`, `bash`, `find`, `grep`, `multi_grep`, `run_code`, `subagent`, `sero-cli`. Every other plugin tool goes through `sero-cli`.

- Add `design_library_assets` and `design_library_settings` to the Design Library `bridgeTools`.
- Add `mcp_manager` to the MCP plugin `bridgeTools`. Check at apply time that its two object parameters (`toolArguments`, `toolResult`) pass through `bridgeTool`'s JSON argument path. If they do not, fix the bridge, not the tool.
- `automation_browser` becomes a session-scoped CLI command in chat sessions, built from the runtime tool definition with `bridgeTool`. Sessions that get it through an allowlist (subagents, members) keep it as a direct tool. An allowlist is an approval by tool name, and changing its shape would change the grant UI, which is a non-goal.

Alternative considered: a manifest flag for "UI only, never shown to the agent". Rejected, because bridging already removes the tool from the agent's list while leaving `appAgent.invokeTool` working, so no new mechanism is needed.

### D2. A trigger line for every moved command

The CLI block lists one line per command, and that line is the only thing that makes the agent reach for a moved command. So:

- Summaries end at a word or clause boundary, never mid-word. `bridgeTool` takes the first sentence and cuts at the last word boundary before 100 chars.
- Moved commands set `cliBridge.summary` to a "use when" line, for example `automation_browser — Test a page in a hidden headless browser (not the visible Browser panel)` and `mcp_manager — Add, remove, connect or authenticate MCP servers`.
- The MCP block shrinks to two lines naming `sero mcp` and `sero mcp_manager` as `sero-cli` commands.
- The live check (D8) proves a real model picks each moved command from its trigger line.

Alternative considered: collapsing `design_library_*` (6) and `graphify_*` (7) into one line per plugin. Rejected for now, because it saves about 600 chars and weakens the per-command trigger the user asked to keep clear.

### D3. Prompt text names only what the session can reach

- The host adds the Sero CLI block only when `sero-cli` is an active tool. This fixes the subagent loader and any allowlist without `sero-cli`.
- Each plugin's `before_agent_start` block checks reachability first. Memory and MCP check that `sero-cli` is active and their command resolves in that session's registry. Graphify checks its own tools or commands. This fixes cron without special-casing it.
- The `sero app` and `sero browser` tips move out of the CLI block into `sero help app` and `sero help browser`. The block keeps one line: "For app control and browser pages, run `sero help app` or `sero help browser` first."

### D4. Goal terminal tools switch on with the goal

The orchestrator plugin registers the three tools but removes them from the active set when a session starts with no goal. When a goal starts or reattaches, the plugin adds exactly those three names with `pi.setActiveTools([...pi.getActiveTools(), ...terminal])`. It removes them when the goal completes, blocks or parks. The existing `hiddenTerminalTools` pause stays as the guard for sessions where activation did not take. A goal can only start in a session that can run `sero goal`. Apply must list which session kinds can do that. Room members may be able to, because their private registry gets the Orchestrator's bridged tools and `goal` is one of them. Activation adds only the three terminal tools. In a session with an allowlist that does not name them, activation is skipped and the existing pause applies. So activation never widens an allowlist.

The change must merge with user context overrides (`agent-context-overrides.ts:132,158`) instead of replacing them. A test covers a session where the user disabled a tool before the goal started.

### D5. Skills

- Delete `packages/templates/skills/taste/`. `ensureDefaultSkills` copies only missing folders, so existing profiles keep theirs.
- Add a `pi-docs` bundled skill, adapted from `.agents/skills/pi-docs/SKILL.md`. It keeps the topic-to-file map and the reading rules. It does not hard-code a path, because the shared docs root depends on `SERO_HOST_ARTIFACTS_ROOT` and becomes `/mnt/<drive>/...` inside a Windows container. It says: "The docs root is on the `Pi docs:` line of the environment section."
- Filter out any skill whose file is under `path.join(os.homedir(), '.agents', 'skills')` in the shared skill pipeline, next to `filterCompatiblePluginSkills`. Chat, subagent, room and the Skills UI (`ipc/agent/handlers/skills.ts`) all go through that pipeline, so they list the same set. Project `.agents/skills` folders are untouched.

Alternative considered: the Pi setting that disables skill paths. Rejected, because it is stored per profile and would need seeding and repair in every profile.

### D6. One Pi docs pointer

- The Sero extension's `before_agent_start` removes Pi's "Pi documentation" section from the base prompt. It matches the section by its opening line and the end of its last bullet, and leaves the prompt unchanged if either marker is missing.
- The host and container blocks each add one line, `Pi docs: <root>`, from `getHostPiDocsPaths()` or `getRuntimePiDocsPaths()`.
- A unit test runs Pi's real `buildSystemPrompt` and checks that the section is removed. A Pi upgrade that changes the section's wording then fails that test instead of silently doubling the pointer. This is a cross-artifact version check, which `AGENTS.md` allows.

Alternative considered: `systemPromptOverride`. Rejected, because Pi's custom-prompt path also drops the `Available tools` list and every `promptGuidelines` entry (fff, `run_code`).

### D7. Runtime environment blocks

- Pass the real container state into `createSeroExtensionFactory` from `agent-session-open.ts`, `wiring.ts` and the subagent loader, taken from the runtime (`runtime.backend`, container IP). This is a bug fix, and it adds text back for container sessions.
- Container block, kept: workspace root and cwd, worktree note, dev servers on `0.0.0.0` with the container IP, `setsid` and log redirection, `sero devserver register`, `sero terminal read`, one line for the logs README. Changed: correct image facts, with no tool list. Removed: Pi docs (D6), the git section (the bash hook already returns full guidance, `git-turn-undo-capture.ts:162`), the memory line (already in the memory block), web tools (already in the CLI block), the `automation_browser` guidance (moves to `sero help automation_browser` and the `sero-browser` skill), and "Autonomous verification".
- Host block, kept: workspace root, access-roots line, the PATH rule, "use the URL the server prints", and `sero devserver register` (added, to match the container block). Changed: the `localhost:5173` warning is added only when `!app.isPackaged`. Removed: Pi docs (D6), the React types advice and the `npx tsc` advice.

### D8. Test: a stub model calls every tool it is shown

New `e2e/session-tools.contract.spec.ts`, which needs no API key:

- The test starts a local HTTP server that speaks the OpenAI chat-completions API, and seeds the temp profile's `models.json` with a custom provider pointing at it. The seeded provider is Alibaba-style (a custom provider id), because `builtinModels()` routing by provider id has broken custom providers before.
- On its first request in a session, the stub reads the request's `tools` and system prompt, records them, and answers with one tool call per tool, using probe arguments from a table in the test. For `sero-cli` it runs one read-only command for each command listed in that session's CLI block.
- On the next request it reads the tool results and marks each one callable or not. A result counts as not callable when it is an error of kind unknown tool, unknown command, "requires an active agent session", "No active agent session", or schema validation. Then it ends the turn.
- A tool or command with no probe entry fails the test and names it. New tools therefore need a probe.
- The spec asserts each kind's expected tool set and prompt blocks (see the specs). It drives chat directly, a subagent through the chat's `subagent` tool, and a Room member and the Architect with the setup helpers from `agent-rooms.agent.spec.ts` and `architect.agent.spec.ts`. The cron case runs a job through `sero cron`. Workspaces cover host and, where Docker is available, container.
- The recorded requests also give the start-up size for each kind, which replaces the partial sums in `token-baseline.test.ts` for the chat case.

The paid live check is a small `session-tools.agent.spec.ts` that uses the existing cheap LLM mode (`openai/gpt-5.6-luna` through OpenRouter). It gives four plain requests ("list my MCP servers' config", "change a Design Library setting", "headlessly test this page", "check where the Pi docs are") and asserts that the model called the matching `sero-cli` command or read the `pi-docs` skill. It is skipped when `SERO_E2E_LLM_MODE` is off.

Alternative considered: a production-gated faux provider (`@earendil-works/pi-ai` `faux`) registered in the main process. Rejected, because it needs a test-only seam in production code, while the HTTP stub needs none and sees exactly what a real provider sees.

### D9. Fresh profile for baseline and manual checks

Manual runs use `SERO_HOME_OVERRIDE=/Users/danielcarter/Documents/Dev/projects/sero/temp/profiles/session-tools pnpm dev:isolated`, which creates a fresh profile registry under that root. The baseline and final captures come from `window.sero.agent.getContext(sessionId)` in that profile for each session kind, saved beside it as JSON. Automated specs keep using `createTempSeroHome`.

### D10. Member sessions

- `createMemberRuntimeTools` also builds `read`, `write` and `edit` through the runtime when the allowlist has them, so all file access goes to the same filesystem as `bash`.
- `bridgeExtensionTools` with a private registry bridges tools only, not slash commands. Before removing them, apply checks that neither the Architect nor the Orchestrator plugin's member flows use a bridged slash command. They cannot today, because every such call fails.

## Risks / Trade-offs

- [Moving a tool behind `sero-cli` makes the agent less likely to use it] → A "use when" summary for each moved command (D2), and the live check (D8) fails if the model does not pick it.
- [Removing Pi's docs section depends on Pi's wording] → Marker match that leaves the prompt unchanged when a marker is missing, plus a unit test against Pi's real prompt builder (D6).
- [The goal tool toggle races with user context overrides or restored sessions] → Merge, never replace, the active set, and cover the disabled-tool case with a test (D4). The existing pause guard stays.
- [Reconnecting the container block adds about 2,000 chars to container sessions] → The trim in D7 removes about half of the old block. The additions are facts container agents currently lack (bind to `0.0.0.0`, `setsid`).
- [Users who relied on `~/.agents/skills` in Sero lose those skills] → The skills in that folder were installed for other tools. If a user wants one in Sero, they copy it into the profile skills folder. This goes in the docs.
- [The stub-model spec is a large new test] → It replaces hand checks across seven session kinds and guards every future tool addition. Keep the probe table as data, and keep the harness under 500 LOC per file.
- [Existing profiles keep the old `AGENTS.md` and the taste skills] → Accepted by the user. Fresh profiles get the new versions.

## Migration Plan

No data migration. Every change applies at session start. Rollback is a revert. A reverted `bridgeTools` entry shows the tool as direct again, and the UI path is unaffected either way.
