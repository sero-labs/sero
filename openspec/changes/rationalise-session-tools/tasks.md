## 1. Baseline in a fresh profile

- [x] 1.1 Start Sero with `SERO_HOME_OVERRIDE=/Users/danielcarter/Documents/Dev/projects/sero/temp/profiles/session-tools pnpm dev:isolated`, finish onboarding, and create one host workspace and one container workspace. Verify that `temp/profiles/session-tools/profiles.json` exists and that both workspaces open.
- [x] 1.2 Capture `window.sero.agent.getContext(sessionId)` for a host chat and a container chat, and save each to `temp/profiles/session-tools/baseline/<kind>.json`. Verify each file records the system prompt length, the tool list and the tool schema length.
- [x] 1.3 Record the baseline table (chars for each prompt block and tool) in the PR description. Verify it lists the numbers for both workspaces.

## 2. Callability harness

- [x] 2.1 Add an e2e helper that starts a local OpenAI-compatible stub model server and seeds a temp profile's `models.json` with a custom provider id pointing at it. Verify with a helper unit test that one scripted request returns a tool call.
- [x] 2.2 Add the probe table (valid read-only arguments for each tool and each Sero CLI command) and the result classifier (callable, or which error kind). Verify that a probe for an unknown name fails and names it.
- [x] 2.3 Add `e2e/session-tools.contract.spec.ts` for chat on host and container, and for a subagent reached through the chat `subagent` tool. Verify it runs green on the checks that already pass and fails on known defects 1–5 and 10 from design.md.
- [x] 2.4 Extend the spec to an Architect session, a Room member (reuse the setup in `agent-rooms.agent.spec.ts` and `architect.agent.spec.ts`) and a cron job run through `sero cron`. Verify it fails on known defects 6 and 7.
- [x] 2.5 Have the spec write each kind's recorded start-up size to its output. Verify that the chat numbers match the baseline from 1.2 within 2%.

## 3. Skills

- [x] 3.1 Delete `packages/templates/skills/taste/`. Verify that a new temp profile's skills folder has no taste-pack skills, and that an existing profile's taste folder is unchanged after a launch.
- [x] 3.2 Add `packages/templates/skills/pi-docs/SKILL.md`, adapted from `.agents/skills/pi-docs/SKILL.md`: keep the topic map and reading rules, and point at the `Pi docs:` line instead of `node_modules`. Verify that it appears in a fresh profile's session skills.
- [x] 3.3 Filter skills under `~/.agents/skills` out of the shared skill pipeline, and use the same filter for the Skills UI list in `ipc/agent/handlers/skills.ts`. Verify with a unit test that user-global skills are dropped and project `.agents/skills` skills are kept.

## 4. Bridge plugin tools into sero-cli

- [x] 4.1 Add `design_library_assets` and `design_library_settings` to the Design Library `bridgeTools`. Verify that they are gone from the chat tool list, run through `sero-cli`, and that the Design Library image import and a settings change still work in the UI.
- [x] 4.2 Add `mcp_manager` to the MCP plugin `bridgeTools` and check that `toolArguments` and `toolResult` pass through the bridge as JSON. Update `e2e/mcp.contract.spec.ts` to expect it absent from chat tools. Verify that `sero mcp_manager` runs a status action.
- [x] 4.3 In chat sessions, register `automation_browser` as a session-scoped CLI command built from the runtime tool, and keep it direct where an allowlist names it. Verify that the chat tool list has no `automation_browser`, that `sero automation_browser` launches and closes a page on host, and that a subagent allowlisting it still gets the direct tool.
- [x] 4.4 Write "use when" `cliBridge.summary` lines for the four moved commands, and change `bridgeTool` summaries to end at a word boundary within 100 chars. Verify with a unit test on the summary function and by reading the CLI block in the harness output.
- [x] 4.5 Shrink the MCP prompt block to two lines naming `sero mcp` and `sero mcp_manager` as `sero-cli` commands. Verify in the harness output.

## 5. Goal terminal tools

- [x] 5.1 Add `sero.plugin.toolSessionKinds` to the bridge policy reader, and drop tools not declared for the session's kind in the chat bridge step, the subagent loader and the member bridge step, including when an allowlist names them (design D11). Verify with a unit test on a fixture plugin that a chat-only tool is missing from subagent and member sessions, a member-only tool is missing from chat, and an undeclared tool is in all three.
- [x] 5.1a Declare the Orchestrator's session kinds per design D11. Verify in the harness that the default subagent and a workflow step whose allowlist names `goal` have no goal or Rooms tools, that the Room member has `room` and no `goal`, and that chat has `goal` and `rooms` but not `room`.
- [x] 5.2 Deactivate the goal terminal tools at session start with no goal, activate them on goal start or reattach, and deactivate them on complete, block or park. Merge with user context overrides, and skip activation where an allowlist excludes them. Verify with orchestrator extension tests: no goal means no tools, a goal cycle adds and removes them, and a user-disabled tool stays disabled.

## 6. Prompt names only reachable tools

- [x] 6.1 Add the Sero CLI block only when `sero-cli` is an active tool, in both `create-sero-extension.ts` and the subagent loader. Verify that a subagent with `platformTools: 'none'` has no CLI block in the harness.
- [x] 6.2 Gate the memory, MCP and graphify `before_agent_start` blocks on their command or tool being reachable. Verify that the cron case in the harness has no memory or MCP block and that chat still has both.
- [x] 6.3 Move the `sero app` and `sero browser` tips from `buildCliPromptBlock` into `sero help app` and `sero help browser`, and leave the one-line pointer. Verify the help output contains the tips and the CLI block does not.

## 7. Runtime environment blocks and Pi docs

- [x] 7.1 Pass the real container state into `createSeroExtensionFactory` from `agent-session-open.ts`, `wiring.ts` and the subagent loader. Verify that a container chat in the harness has the container block.
- [x] 7.2 Rewrite the container block per design D7 with correct image facts from `Dockerfile.sero-node`. Verify the harness container chat prompt and the `token-baseline.test.ts` block size.
- [x] 7.3 Trim the host block per design D7: add `sero devserver register`, and add the `5173` line only when not packaged. Verify the host chat prompt in the harness.
- [x] 7.4 Remove Pi's "Pi documentation" section in the Sero `before_agent_start` hook with a marker match, and add one `Pi docs: <root>` line to each runtime block. Verify with a unit test against Pi's real `buildSystemPrompt` that the section is removed, and with the harness that each prompt has exactly one Pi docs location.

## 8. Member sessions

- [x] 8.1 Build `read`, `write` and `edit` through the workspace runtime in `createMemberRuntimeTools` when the allowlist has them. Verify that the harness Room member writes a file in a container workspace and sees it with `bash`.
- [x] 8.2 Confirm that no Architect or Orchestrator member flow calls a bridged slash command, then stop bridging slash commands into private registries. Verify that every command in the member CLI list passes the harness probe.
- [x] 8.3 Record each plugin tool's source package in the subagent tool catalogue. Verify with a unit test that a warmed catalogue entry for `web_search` names its package.
- [x] 8.4 Load the package behind every approved plugin tool into the member session, and log approved tools that cannot be provided (design D10). Verify in the harness that a Room member approved for `web_search` with network access runs a search through `sero-cli`, and that one approved for a tool whose plugin is removed opens with a log line naming it.
- [x] 8.5 Filter the member approval catalogue by `toolSessionKinds`. Verify with a clamp unit test that `goal`, `goals`, `rooms` and the goal terminal tools are dropped from a member proposal.

## 9. Profile AGENTS.md template

- [x] 9.1 Edit `packages/templates/profile/AGENTS.md`: remove the `kanban` line, replace `register_dev_server` with `sero devserver register`, rewrite the memory section to match `sero memory`, and remove text the CLI block already gives. Verify that a fresh profile's `AGENTS.md` meets the spec scenario.

## 10. Measure and check in Sero

- [x] 10.1 Run `e2e/session-tools.contract.spec.ts` for all kinds. Verify it is green.
- [x] 10.2 Update `__tests__/agent/token-baseline.test.ts` for the new blocks. Verify that the chat start-up in the harness output is at or below 32,000 chars on a fresh profile, and record before and after for each kind in the PR description.
- [x] 10.3 Add `e2e/session-tools.agent.spec.ts` with the four plain-language requests from design D8 on the cheap LLM mode (`openai/gpt-5.6-luna`). Run it once and verify that the model picks each moved command and reads the `pi-docs` skill for the Pi question.
- [x] 10.4 Manual pass in Sero in the `temp/profiles/session-tools` profile, on a host and a container workspace. Ask a chat to use the Pi docs and confirm it finds the docs folder from its prompt and reads the README. Ask for an MCP server list and a Design Library setting change and confirm it uses `sero-cli`. Start and finish a goal and confirm the terminal tools appear only during it. Import an image in the Design Library UI. Record the results in the PR description.
- [x] 10.5 Update `apps/docs-site/docs/reference/sero-cli.md` and the plugin `bridgeTools` guidance (bridge by default; say that `~/.agents/skills` is not loaded). Verify the docs site builds.
- [x] 10.6 Run `pnpm typecheck` from the monorepo root once with `--force`, and check that every changed source file is at or below 500 LOC. Verify that both pass.

## 11. Subagent plugin tools (added at the owner's request)

- [x] 11.1 In the subagent loader, bridge plugin tools through `sero-cli` when the session has `sero-cli` and no allowlist, scoped to the subagent's id and cleared when the run ends. Verify in the harness that a default subagent has only the core tools plus `sero-cli`, that `web_search`, `git_manager`, `graphify_query` and `mcp_manager` are commands, that every listed command passes the probe, and that its start-up size falls.
