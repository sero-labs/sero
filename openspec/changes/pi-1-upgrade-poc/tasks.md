## 1. Baseline on main

- [x] 1.1 Recheck the facts in design.md against current `main`: the Pi pins in `pnpm-workspace.yaml`, the three private reaches in `sdk-private-adapter.ts`, and the `createAgentSession` call sites. Verify by listing any difference in the upgrade pull request description, or stating that there is none.
- [x] 1.2 Create a temp profile with `SERO_HOME_OVERRIDE` and `pnpm dev:isolated` on `main`. Create one chat session with a prompt override, a disabled tool, a fork, an undo and a compaction, then copy its session files aside. Verify the copies exist and open on `main`.
- [x] 1.3 Record the `run_code` start-up size on `main` with the `token-baseline.test.ts` method (system prompt characters and tool schema characters for a host chat). Verify the numbers are in the pull request description.

## 2. Dependency move (branch `poc/pi-1-upgrade`)

- [x] 2.1 Pin the four `@earendil-works/pi-*` catalog entries to `1.0.2`, remove the Dependabot ignore entry for `@earendil-works/*`, and install with the repository's pinned pnpm. Verify `pnpm why @earendil-works/pi-coding-agent` shows 1.0.2 only and the lockfile holds one version of each Pi package.
- [x] 2.2 Run `pnpm typecheck --force` and group the errors by cause in the pull request description. Verify every error maps to a row of the compatibility matrix, and add a row for any cause the design does not list.
- [x] 2.3 Compile `apps/agent-node` with its Bun build. Verify the binary starts and prints its version. If the `chord` or `esbuild` dependency stops the compile, record it as an open risk and continue.

## 3. Compatibility fixes

- [x] 3.1 Move the prompt override to the host extension's `before_agent_start` handler and read the base prompt from `session.systemPrompt` (design D3). Remove `getBaseSystemPrompt` and `setBaseSystemPrompt` from the adapter. Verify with the existing context override tests, and in the temp profile that an edited prompt reaches the model request and a reset restores the base prompt.
- [x] 3.2 Replace the message assignment in the legacy checkpoint restore and the push in `agent-prompt.ts` with `SessionManager` writes followed by `session.refreshContext()` (design D4). Verify `agent-checkpoint.test.ts` and `direct-cli-prompt.test.ts` pass, and that the next request after a legacy restore holds only the restored branch.
- [x] 3.3 Fix tool definitions that fail the JSON-compatible `details` rule or have no parameter schema, in desktop, packages and in-repo plugins, without casts. Verify the typecheck errors from 2.2 in this group are gone. If a plugin needs a data shape change, stop and ask.
- [x] 3.4 Test whether `appendCustomEntry` reaches the session file without `_rewriteFile`. If it does, remove `rewriteSessionManagerFile`. Set the adapter's version constant to 1.0.2. Verify by reopening a session after an override change with no other message in between.
- [x] 3.5 Adapt the custom providers in `shared/providers/` and the provider manifest code to `TranscriptContext`. Verify `custom-provider-propagation.test.ts` and `isolated-completion.test.ts` pass with an Alibaba-style custom provider.
- [x] 3.6 Make the session readers tolerate `system` message entries, `context_edit` entries and `usage` entries: the history window, the session list, the gateway, and `parseSessionEntries` in agent-node. Verify `agent-history-window.test.ts` passes and that a 1.0.2 session shows no system entry as a chat message.
- [x] 3.7 Set cache warming to `"off"` through one shared settings helper used by every `createAgentSession` site (design D6). Verify with the stub model that a session with a long tool call sends no extra request.
- [x] 3.8 Fix the remaining type errors: the `steer()` and `followUp()` return value, `pi.on()` return value, renamed pi-ai types and the `pi-ai/bun-oauth` and `pi-ai/providers/faux` subpaths. Verify `pnpm typecheck --force` passes with no error and no new `any`, `@ts-ignore` or `@ts-expect-error`.

## 4. Behaviour checks on the upgrade branch

- [x] 4.1 Open the session copies from 1.2 on the upgrade branch. Verify each opens, shows the same messages, and keeps its prompt override and disabled tool.
- [x] 4.2 In the temp profile, exercise direct message insertion, undo, legacy restore, fork, clear, manual compaction, extension reload and branch navigation. Verify each one against the request the stub model receives, and record one matrix row for each.
- [x] 4.3 Check lifecycle and streaming: `agent_settled` ordering in the orchestrator goal loop, streamed tool arguments in the chat card, cancellation mid-tool, and auto-compaction between a tool result and the next response. Verify with `agent-session-events.test.ts`, `session-lifecycle.test.ts` and the orchestrator extension tests, and record any SDK event that differs from 0.84.2.
- [x] 4.4 Run the Sero MCP plugin on the upgrade branch. Verify `e2e/mcp.contract.spec.ts` passes after a build, that no session registers a Pi `mcp` extension, and that the session tool list holds no second MCP tool surface.
- [x] 4.5 Build the packaged app. Unset `ELECTRON_RUN_AS_NODE` and verify `--doctor --quick --json` reports healthy, that a chat turn with a `run_code` call completes, and that a plugin extension loads through jiti.
- [x] 4.6 List what external plugin repositories would meet, from a read of their tool definitions and provider code. Verify the list is in the pull request description. Do not change those repositories.

## 5. Upgrade pull request

- [x] 5.1 Run the closest existing checks after a build: the desktop unit tests for `agent/`, `features/code-mode/`, `features/subagent/` and `container/`, plus `e2e/session-tools.contract.spec.ts`, `e2e/agent-ipc.contract.spec.ts` and `e2e/memory.contract.spec.ts`. Verify all pass, or record each failure with its cause.
- [x] 5.2 If the branch changed source in `@sero-ai/common` or `@sero-ai/extension-runtime`, bump that package's version. Verify with `git diff --stat main` on `packages/`.
- [x] 5.3 Open a draft pull request for `poc/pi-1-upgrade` with the compatibility matrix: one row for each item, with the break, the fix or open risk, and the command that shows it. Verify every checkbox of candidate 1 in issue #594 maps to a row.

## 6. Native Code Mode (branch `poc/pi-1-native-features`, stacked)

- [ ] 6.1 Wire `createCodemodeExtension({ mode: "on" })` into the chat resource loader, remove `run_code` from the chat tool list, and add `codemode` to the base tools (design D7). Verify with the stub model that one `codemode` script calls `read` and returns its value, and that no Pi MCP or tool-search extension is registered.
- [ ] 6.2 Forward `tool_execution_*` events that carry `parentToolCallId` from `agent-subscription.ts`, with the parent id on the stream event type in `src/types/`. Verify with a projection test that an inner call is not emitted as a top-level tool call, and record the event sequence for a script with two calls.
- [ ] 6.2a Attach inner calls to their parent call in the renderer store, and list them as rows inside the `codemode` card with the existing tool call row (design D8). Verify in the temp profile, with a stub-model script that makes three calls with a delay between them, that each row appears when its call starts and settles when it ends, that a failed call shows as failed, and that no inner call shows as its own card. Save a screen recording to the pull request.
- [ ] 6.2b Reopen that session. Verify the card lists the inner calls from Pi's `nestedCalls` record, and record what the reloaded card lacks against the live one.
- [ ] 6.3 Compare `run_code` and `codemode` with scripted calls: TypeScript source, tool identifiers, text and structured return shapes, a thrown nested error, an image result, a limit breach, and `Promise.all` concurrency. Verify the pull request holds one table row for each, with both outcomes.
- [ ] 6.4 Run the restriction check from design D9 on a host workspace and a container workspace: a context-disabled tool, a tool dropped for the session kind, and a tool blocked by a `tool_call` handler, each by direct call, `tools.<name>()`, `searchTools()` and `describeTool()`. Verify every route fails or returns nothing, and that nested `bash` runs inside the container.
- [ ] 6.5 Test cancellation mid-script and a failing `bash` inside a script. Verify the nested call receives the abort, and record whether the `agent.afterToolCall` wrapper in `bash-result-error-status.ts` still sets the error status.
- [ ] 6.6 Test `store()` and `load()` across a fork and an undo. Verify each branch sees only values written on its own path.
- [ ] 6.7 Measure start-up size for `codemode` in mode `"on"` and mode `"only"` against the baseline from 1.3. Run the three-task comparison on `deepseek/deepseek-flash` and record token use for both tools. Verify the numbers are in the pull request.
- [ ] 6.8 Build the packaged app on this branch and run one `codemode` script. Verify it completes. If the worker or WASM file fails to load, add the `asarUnpack` entries, rebuild, and record them.
- [ ] 6.9 List the code a replacement would delete (`features/code-mode/`, the `run` dependency, its tests) and what would remain (the `run_code_` prefix contract in `@sero-ai/common`, the output optimizer's nested handling, the container tool prompts, the MCP plugin's `run_code` gate, subagent and persistent sessions, the `programmatic-tool-calling` spec differences). Verify each item names its file.

## 7. Prompt and tool history

- [ ] 7.1 Show the branch defect: write an override on one branch, switch to a sibling branch, and read the override. Then change the lookup to the current branch path on the stacked branch. Verify the sibling no longer sees it, and that reload and resume keep the editor's choices.
- [ ] 7.2 Read a 1.0.2 session file after a prompt edit and a tool toggle. Verify which data Pi records natively as `system` entries and which data the `sero-context-overrides` entry must still hold for the editor, and record the split.
- [ ] 7.3 Assess `appendContextEdit` and `refreshContext()` against the places where Sero edits or restores context. Verify the pull request states, for each place, whether the append-only route can replace it.
- [ ] 7.4 With the stub model, record the requests for a prompt change mid-session on a provider that accepts mid-conversation system messages and on one that does not. Verify the pull request shows where the prefix changes in each case. Do not send a live request to measure caching (design D10).

## 8. MCP and other native capabilities

- [ ] 8.1 Compare Pi's `pi-mcp` package and `createMcpExtension` options with the Sero MCP plugin, one row for each capability: transports including legacy SSE, OAuth and credential isolation, discovery, resources, MCP Apps and UI resources, Tasks, remote skills and approvals, agent-plugin sources, shared connections, desktop management, configuration precedence and tool restrictions. Verify each row says present, missing or more complex in Pi.
- [ ] 8.2 Assess cache warming from the Pi source and the stub model: settings, the cost threshold, `usage` entries, provider reach, and how it differs from MCP keep-alive. Verify the pull request states the conditions in which it sends a request, and that no live measurement was made (design D10).
- [ ] 8.3 Assess virtual-model routing against `sero.modelTiers`, the native classifier and image operations against Sero's current callers, and per-model compaction budgets against the orchestrator's thresholds. Verify each has one paragraph that names the Sero code it overlaps, or says there is none.

## 9. Decisions and follow-up

- [ ] 9.1 Open a draft pull request for `poc/pi-1-native-features` with the tables from groups 6 to 8 and an adopt, retain or defer decision for candidates 1 to 5, each with its benefit and its migration cost. Verify every checkbox of candidates 2 to 5 in issue #594 maps to a table row or a stated limit.
- [ ] 9.2 Run `pnpm typecheck --force` on both branches. Verify both pass.
- [ ] 9.3 After Dan confirms the decisions, open one follow-up issue for each adopt decision, and post a summary comment on issue #594 that links both pull requests and the issues. Verify the comment states that Pi Durable and remote agents stay open as separate changes.
