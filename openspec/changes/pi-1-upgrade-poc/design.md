## Context

See proposal.md for the motivation and scope. The facts below come from Sero `main` at `481e6c960` and the Pi source at `v1.0.2`.

**How Sero uses Pi today**

- `pnpm-workspace.yaml` pins `pi-agent-core`, `pi-ai`, `pi-coding-agent` and `pi-tui` at 0.84.2. The peer catalog is `>=0.84.2`, which already admits 1.0.2.
- Pi is not bundled into the Electron main process. `build-electron.mjs` marks `@earendil-works/*` external and `build-release.sh` ships it as production `node_modules` inside the asar archive.
- About 150 files under `apps/desktop/electron` import Pi, plus `apps/agent-node`, `packages/common`, `packages/extension-runtime` and 14 plugin directories.
- `createAgentSession` has seven call sites: chat, subagent, tool catalogue warm-up, app agent, persistent sessions (Rooms and Architect), isolated completion and cron. `apps/agent-node` uses `createAgentSessionServices`.
- `sdk-private-adapter.ts` reaches three private members: `session._baseSystemPrompt` (read and write), `sessionManager._rewriteFile()` and `agent.state.model` (write). Its version constant still says 0.80.6.
- `run_code` is 487 lines in `features/code-mode/` on the `run@2.1.5` QuickJS package. It takes a snapshot of `agent.state.tools`, calls `agent.beforeToolCall` and `agent.afterToolCall` itself for each nested call, and returns a trace of at most 50 entries in `details.calls`. Nested calls emit no events. Chat and subagent sessions register it.
- Context overrides are a `sero-context-overrides` custom entry. The lookup reads `sessionManager.getEntries()`, which is the whole file, so a branch can pick up an override written on another branch.
- Sero has no prompt-cache warming code. Its only keep-alive is the MCP server lifecycle.

**Confirmed changes in Pi 1.0.2**

| Area | Change | Sero code it reaches |
|---|---|---|
| Prompt | `_baseSystemPrompt` is gone. `agent.state.systemPrompt` is a getter with no setter. | `setBaseSystemPrompt` throws. `getBaseSystemPrompt` returns `undefined`. |
| Context | `SessionManager` is the source of provider context. Each request rebuilds its messages from the session projection. | `agent-checkpoint.ts:143` assigns `agent.state.messages`. `agent-prompt.ts:313` pushes to it. |
| Tools | `ToolCall.arguments` is `JsonObject`. Tool result `details` must be JSON-compatible. A tool with no parameter schema is rejected at registration. | About 52 `registerTool` sites and every `ToolDefinition`. |
| Hooks | `AgentSession` installs its own `beforeToolCall` and `afterToolCall`. Nested calls use the private methods with a parent id, not the public fields. | `bash-result-error-status.ts` reassigns `agent.afterToolCall`. |
| Events | `tool_execution_*`, `tool_call` and `tool_result` carry an optional `parentToolCallId`. `pi.on()` returns an unsubscribe function. | `agent-subscription.ts` and five other subscribers. |
| Providers | Stream functions receive `TranscriptContext`. The prompt and tools come from `getCurrentSystemPrompt()` and `getCurrentTools()`. | `shared/providers/`, custom provider manifests. |
| Session file | New `system` message entries, `context_edit` entries and `usage` entries. The file version stays 3. | History readers, the gateway, `parseSessionEntries` in agent-node, the usage plugin. |
| Session API | `steer()` and `followUp()` return `"queued"` or `"handled"`. `agent_settled` handlers finish before the next run starts. Auto-compaction can run between a tool result and the next response. | Prompt queueing, the orchestrator goal loop, the `compaction_end` history reload. |
| Cache | `CacheWarmer` is wired in `createAgentSession`. The default mode is `"streaming"`. It applies only to models with `promptCache`, which the catalog sets for Anthropic alone. | Every session on an Anthropic model would send warm requests. |
| Packages | `pi-coding-agent` depends on `pi-codemode`, `pi-mcp`, `chord` and `quickjs-wasi`. `chord` depends on `esbuild`. The shrinkwrap file is gone. | Release packaging and the Bun compile of agent-node. |
| pi-agent-core | The harness exports and subpaths are removed. | None. Sero imports types only. |

Code Mode and MCP are opt-in for SDK sessions. Neither loads unless Sero passes `createCodemodeExtension()` or `createMcpExtension()`.

## Goals / Non-Goals

**Goals:**

- An upgrade branch that passes the required checks with all custom Sero code kept, so that it can merge on its own if Dan decides to.
- Evidence for each native feature that a reviewer can reproduce from the pull request.
- A measured comparison of `run_code` and `codemode`. No number from Pi's announcement is used.

**Non-Goals:**

- A final design for nested calls in the chat. The POC builds a working mockup (D8). The approved design belongs to the follow-up.
- A fix for branch-unaware overrides on `main`. The POC shows the defect and the supported fix.
- Changes to external plugin repositories or to published package APIs.

## Decisions

### D1. Two stacked draft pull requests

`poc/pi-1-upgrade` holds the dependency move and the compatibility fixes. `poc/pi-1-native-features`, stacked on it, holds the Code Mode and context experiments.

The issue requires the ordinary upgrade and the adoption of native features to be separate decisions. Two branches make that literal: the first can merge while the second stays evidence. One branch with an environment flag was the alternative. It puts experiment code behind a switch in a branch that may merge, and the switch needs removal later.

### D2. Target 1.0.2, exact pins

Pin the four catalog entries to `1.0.2` and keep the peer range as it is. The local Pi source is at `v1.0.2`, and 1.0.1 and 1.0.2 contain no breaking entry. Remove the Dependabot ignore entry for `@earendil-works/*` in the upgrade branch, as its comment instructs. Pi removed its shrinkwrap, so `pnpm-lock.yaml` is now the only pin on Pi's transitive packages.

### D3. The prompt override moves to `before_agent_start`

The Sero host extension (`create-sero-extension.ts`) already handles `before_agent_start`. When a session has a prompt override or disabled skills, the handler returns `{ systemPrompt }`, built from `event.systemPrompt`. The context editor reads the base prompt from the public `session.systemPrompt` getter.

The host extension is the first factory, so plugin handlers that append their blocks run after it and see the override. That is the order Sero has today.

Alternatives rejected:
- Write `_baseSystemPromptOptions`. It is another private reach and it is structured, so it does not fit a free-text override.
- `systemPromptOverride` on the resource loader plus `session.reload()`. A reload turns every extension tool on again, and `reloadWithContextOverrides` exists to undo that.

This removes two of the three private reaches in the adapter. It also means candidate 3's main replacement lands in the upgrade branch, because the old route cannot work at all.

### D4. Context writes go through `SessionManager`, then `refreshContext()`

- Legacy checkpoint restore: keep `sessionManager.branch(id)`, then call `session.refreshContext()`. It still emits no tree events, which is the current behaviour.
- `appendMessage` in `agent-prompt.ts`: append through `sessionManager`, then `refreshContext()`. Remove the push.

`navigateTree` for the legacy restore was the alternative. It fires `session_before_tree` and `session_tree`, which is a behaviour change for a path that only old sessions use.

### D5. Keep the model write and the file rewrite until they are proven unnecessary

`agent.state.model` is still a plain writable field, so `setRuntimeSessionModel` stays. `_rewriteFile` still exists. The upgrade branch tests whether `appendCustomEntry` now reaches the file without it, and removes the call only if the test shows that. Update the adapter's version constant to 1.0.2.

### D6. Cache warming is off in the upgrade branch

Set `cacheWarming` to `"off"` for every Sero session through one shared settings helper. An upgrade must not add model requests or cost that nobody chose. Whether to turn it on is a candidate 5 decision with its own evidence.

### D7. Native Code Mode is wired into chat sessions only

On the stacked branch, the chat loader gets `createCodemodeExtension({ mode: "on" })`, the chat tool list drops `run_code`, and `codemode` joins the base tools so that the context editor can disable it. Subagent and persistent sessions keep `run_code`. No `createMcpExtension()` and no `createToolSearchExtension()`.

One session kind is enough to answer every question in candidate 2, and chat is the kind that the stub-model contract harness and the context editor both reach.

### D8. The chat shows inner calls inside the script's card as they occur

Dan expects to deprecate `run_code`, so the POC shows what native Code Mode gives the user. `agent-subscription.ts` forwards `tool_execution_*` events that carry a `parentToolCallId`, with that id on the stream event. The renderer store attaches each one to its parent `codemode` call, and the card lists the inner calls as rows that appear and settle live: tool name, a short argument summary, and running, done or failed.

The mockup reuses the existing tool call row from `src/components/layout/` and adds no new visual language. It is working code on the stacked branch with real events, not a styleguide page, because the question it answers is whether the events arrive in an order and at a rate that the chat can show. It is not an approved design. The follow-up that replaces `run_code` starts with a `sero-prototype` for Dan's approval.

All four layers change together on the stacked branch: the stream event type in `src/types/`, the main-process projection, the Zustand store, and the card component. A reloaded session has no live events, so its card shows the bounded `nestedCalls` record that Pi keeps on the parent result (at most 256 calls, no results).

Filtering the inner events so that the chat stays as it is today was the alternative. It was the smaller change, and Dan rejected it because it hides the main user-visible difference of the native route.

### D9. Comparison method

- **Behaviour.** Use the local stub model from `e2e/session-tools.contract.spec.ts`. It scripts the model's tool call, so a `codemode` script and a `run_code` program run with no model cost. Each row of the comparison is one scripted call.
- **Tool restrictions.** For a tool disabled in the context editor, a tool dropped for the session kind, and a tool that a `tool_call` handler blocks, try four routes: a direct call, `tools.<name>()`, `searchTools()` and `describeTool()`. All four must fail or return nothing.
- **Start-up size.** Use the method in `token-baseline.test.ts` (characters of system prompt plus tool schemas) for three configurations: `run_code`, `codemode` with mode `"on"`, and mode `"only"`.
- **Real model.** One small run on `deepseek/deepseek-flash` checks that a model writes working scripts for both tools on the same three tasks, and records token use.

### D10. No live cache measurement

Cache warming works only on Anthropic models in the default catalog. The assessment is done from source and with the stub model. A live cache measurement needs an Anthropic model, which the paid-run rule forbids, so the POC does not make one. Dan validates live cache behaviour separately. The cache warming decision in the pull request states that it has no live measurement behind it.

### D11. Isolated profile for every run

All POC runs use `SERO_HOME_OVERRIDE` with a temp profile. A session file written by 1.0.2 holds entry types that 0.84.2 does not know, so a POC run in the real profile could leave sessions that `main` cannot read. Old-session tests use copies of 0.84.2 session files.

### D12. Evidence lives in the pull requests

Each pull request description holds its part of the compatibility matrix (item, break, fix or open risk, evidence command). The stacked pull request also holds the comparison tables, the list of removable code and the decision for each candidate. A summary comment on issue #594 links both and lists the follow-up issues. No new documentation file is added.

## Risks / Trade-offs

- [The Code Mode worker and `quickjs.wasm` resolve through `require.resolve` into the asar archive, and a worker thread may not load from it] → Build the packaged app on the stacked branch and run one script. If it fails, add `asarUnpack` entries for `@earendil-works/pi-codemode` and `quickjs-wasi` and record them.
- [`chord` brings `esbuild`, a native binary, into the agent-node Bun compile] → Compile agent-node early in the upgrade branch. If the compile fails, record it as an open risk and do not work around it in the POC.
- [The JSON-compatible `details` rule can surface many type errors across plugins] → Fix the types at the tool definition. Do not add casts. If one plugin needs a data shape change, record it and ask before the change.
- [The turbo cache can hide type errors] → Run `pnpm typecheck` once with `--force` before each pull request is reported.
- [Playwright runs the built Electron main process] → Build before every e2e run on either branch.
- [`codemode` accepts raw JavaScript only and has no default timeout, while `run_code` accepts TypeScript and stops at 30 seconds] → Both are recorded as spec differences. Neither is fixed in the POC.
- [The `run_code_` call-id prefix is a contract in `@sero-ai/common` that the output optimizer plugin reads, and native nested ids are `<parent>/<n>`] → Record the affected code. Do not change the published contract in the POC.
- [The `agent.afterToolCall` wrapper does not see nested Code Mode calls] → Test a failing `bash` inside a script on the stacked branch and record whether the error status is lost. The supported fix is a `tool_result` handler.
- [External plugins load against the host's Pi at run time] → The POC lists the breaks they would meet. It does not change them.

## Migration Plan

1. The upgrade pull request stays a draft until Dan decides to merge it. Rollback is a revert of the catalog pins and the fixes in one commit range.
2. The stacked pull request is evidence. It is closed, not merged, after the decisions are recorded.
3. Each adopt decision becomes one follow-up issue. A follow-up that changes `programmatic-tool-calling` starts as its own OpenSpec change.

## Open Questions

- Does `appendCustomEntry` persist without `_rewriteFile` in 1.0.2? Task 3.4 answers it and decides whether the last private call goes.
- Do `usage` entries need a line in the usage plugin's totals? It matters only if cache warming is adopted.
