## 1. Cut down the memory plugin

Do this first. The old plugin must never receive `session_start` (design Migration Plan).

- [x] 1.1 Delete the modules listed in design D10 and their tests. Verify that `pnpm --filter @sero-ai/plugin-memory typecheck` and the remaining plugin tests pass.
- [x] 1.2 Remove the daily and session parts of `session-lifecycle.ts`, `memory-manager.ts` and `priority-context.ts`, and the `snapshot` and `auto_retrieve` settings in `memory-config.ts`. Verify that a chat session with commands and edits writes nothing under `memory/daily/` or `memory/sessions/`.
- [x] 1.3 Remove the `memory_search` tool, and the `memory` tool's `daily` target and `search`, `consolidate` and `config` actions. Verify that `sero memory --help` no longer lists them.
- [x] 1.4 Cut `logger.ts` to errors only. Verify that a normal session writes no info lines to `debug/memory/*.log`.

## 2. Host: session events and subagent exclusion

- [x] 2.1 Pass `sessionStartEvent` with the correct reason (`startup`, `resume`, `fork`) to `createAgentSession()` in `agent-session-open.ts`, `handlers/app-agent.ts`, `persistent-sessions/host.ts` and `subagent/runtime/runner.ts`. Verify with a session-open test that the reason matches for new, resumed and forked sessions.
- [x] 2.2 Replace `extensionRunner.setUIContext(...)` with `await session.bindExtensions({ uiContext: createSeroUIContext() })` at each site in 2.1. Verify with a test at the session-open seam that a test extension receives `session_start` once, before the first `before_agent_start`, and that `ctx.ui.notify` still reaches the UI.
- [x] 2.3 Make sure the tool-catalog probe in `subagent/runtime/tool-catalog.ts` does not bind extensions. Verify with a test that building the catalog delivers no `session_start`.
- [x] 2.4 Emit and await `session_shutdown` through `emitSessionShutdown()` before `dispose()` in the subagent runner, the app-agent pool and the persistent-session host, on completion, failure and abort. Make `disposeAppSessionsForApp()` async, and await it from plugin unload (`ipc/integrations/plugins.ts`), plugin dev refresh (`features/plugins/dev-sessions/refresh.ts`) and the app-agent `before-quit` path, which joins the main graceful-shutdown sequence. Verify with tests that a test extension's async `session_shutdown` handler finishes once for each case before disposal.
- [x] 2.5 Find out whether `loader.reload()` in `reloadResources` (`agent.ts`) gives the live session new extension copies. Then emit `session_shutdown` and `session_start` (reason `reload`) so that the copies handling the next turn have received `session_start`. Verify with a test through the real reload IPC route.
- [x] 2.6 Leave the memory plugin out of subagent sessions in `subagent/runtime/resource-loader.ts`, identified by package identity. Verify with a test that a subagent with the full tool policy has no `memory` or `scratchpad` tool and no memory text in its system prompt.
- [x] 2.7 Measure session-open time for a chat session before and after 2.2, with all monorepo plugins installed. Record both numbers in the PR description.
  - Measured 2026-09-27 (throwaway Playwright spec, all 14 monorepo plugins, 8 opens per run, main process rebuilt with only the 2.2 line swapped back for "before"): before 2.2, first open 830 ms and later opens 126–133 ms (median); after 2.2, first open 781–910 ms and later opens 136–147 ms (median). About +10 ms per open. Recorded in PR #575.

## 3. Audit session_start handlers in this repo

For each handler, check that it runs correctly in every session kind that loads it, is idempotent across resume and reload, does not duplicate other work, and releases what it starts on `session_shutdown`. Record the result here as works, redundant (removed) or fixed, and verify it in a running app with the host fix.

- [x] 3.1 `apps/desktop/electron/features/apps/extensions/git-turn-undo-capture.ts` (links the session to the current commit) — **redundant (removed)**: it appended a `git-workspace-link` entry that nothing reads, and with the host fix it would add one to the session file at every open, resume and reload, plus a git call.
- [x] 3.2 `plugins/sero-cron-plugin/extension/index.ts` (starts the cron runtime; must not start one per subagent) — **fixed**: the scheduler was a module-level singleton with a session reference count, but Pi evaluates extension modules again after a resource reload and when a session opens in another folder. In the running app a reload gave a second cron runtime (reference counts 3, then a new copy at 1), which with saved jobs and autostart starts a second scheduler and runs each job twice. The runtime now lives on `globalThis`, so every module copy shares it. New test in `extension/__tests__/index-lifecycle.test.ts`. Running app after the fix: counts 1, 2, 3, then 2 and 3 across the reload, then 0 at quit.
- [x] 3.3 `plugins/sero-fff-plugin/extension/index.ts` (warms the file search index) — **works**: each session holds a reference to a shared, counted index per folder, and shutdown releases only its own reference.
- [x] 3.4 `plugins/sero-git-plugin/extension/index.ts` (syncs git state and writes the `.sero/` exclude rule) — **redundant (removed)**: it ran a full git refresh (10+ git commands) at every session start, subagents included. The host already keeps git state fresh, and the memory plugin writes its own exclude rule.
- [x] 3.5 `plugins/sero-graphify-plugin/extension/auto-context/index.ts` (resets per-session graph context) — **works**: per-session state inside the extension closure; start and shutdown reset only that state.
- [x] 3.6 `plugins/sero-graphify-plugin/extension/refresh-on-edit.ts` (queues a sync for an unknown workspace) — **works**: queues one small sync only when the cwd is not a known workspace.
- [x] 3.7 `plugins/sero-mcp-plugin/extension/index.ts` (registers the session and starts the MCP runtime) — **fixed**: same fault as 3.2. The MCP runtime was a module-level singleton, so after a reload a second runtime started its own servers, and at quit both wrote `config.json` at once (`ENOENT` on rename in the main log). The runtime now lives on `globalThis`. Running app after the fix: no MCP error across three sessions, a reload and quit.
- [x] 3.8 `plugins/sero-orchestrator-plugin/extension/goal-loop.ts` (reattaches an active goal) — **works**: sessions with no goal runtime for their cwd, such as subagents, do nothing; reload happens only on an idle session.
- [x] 3.9 `plugins/sero-output-optimizer-plugin/extension/index.ts` (prepares the optimizer) — **works**: per-session state, started once, nothing to release.
- [x] 3.10 `plugins/sero-web-plugin/extension/index.ts` (marks the session active) — **fixed**: the session path, pending fetches and active flag were module-level, so one session ending aborted another session's fetches and cleared the shared result store. They are now per session; the result store is no longer cleared by one session, expired results are pruned, and a module copy removes its clone cache when its last session ends (each copy removes only the clones it made). New test in `extension/__tests__/session-lifecycle.test.ts`.
  - Running app (2026-09-27, throwaway Playwright specs, all 14 monorepo plugins loaded): three chat sessions, a resource reload, a window reload, quit, and a subagent started from chat (15.4 smoke test). No handler error in the main-process log after the 3.2 and 3.7 fixes. The memory plugin also keeps its index through a `reload` shutdown now, because the session goes on (found by the same run: a skills reload closed the index and unloaded the model of the only chat session).
- [x] 3.11 Update the `session_start` guidance in `packages/templates/skills/sero-plugin/` (`SKILL.md`, `references/templates.md`, `references/conversion-guide.md` and the example `sero-notes-plugin`), which calls it a "warm fallback". Verify that the guidance describes it as a lifecycle event that fires in every session kind, paired with `session_shutdown`.

## 4. Audit session_start handlers in external plugins

Apply the same checks as group 3 to each handler in `../plugins/`. Record the result here, and commit any fix in the plugin's own repo.

- [x] 4.1 `sero-calc-plugin` — **works**: the handler only stores the workspace state path from `ctx.cwd`. It is cheap, idempotent and starts nothing to release.
- [x] 4.2 `sero-daily-quote-plugin` — **works**: the handler only stores the workspace state path from `ctx.cwd`. It is cheap, idempotent and starts nothing to release.
- [x] 4.3 `sero-google-plugin` — **works**: the handler only stores the workspace state path from `ctx.cwd`. It is cheap, idempotent and starts nothing to release.
- [x] 4.4 `sero-imagegen-plugin` — **works**: the handler only stores the workspace state path from `ctx.cwd`. It is cheap, idempotent and starts nothing to release.
- [x] 4.5 `sero-kanban-plugin` — **works**: the handler only stores the workspace state path from `ctx.cwd`. It is cheap, idempotent and starts nothing to release.
- [x] 4.6 `sero-logbook-plugin` — **works**: the handler only stores the workspace state path from `ctx.cwd`. It is cheap, idempotent and starts nothing to release.
- [x] 4.7 `sero-loom-plugin` — **works**: the handler only stores `ctx.cwd` as the fallback cwd.
- [x] 4.8 `sero-notes-plugin` — **works**: the handler only stores the workspace state path from `ctx.cwd`. It is cheap, idempotent and starts nothing to release.
- [x] 4.9 `sero-openai-plugin` — **fixed** (commit 7abea53 on branch `fix/session-lifecycle`, not pushed): all sessions share one model runtime, so unregistering the Codex provider on every `session_shutdown` removed it from the chat when a subagent ended, and the copy closed sockets of other sessions. Now it closes only the ending session's sockets and unregisters only on reason `reload`. Plugin tests: 109 pass.
- [x] 4.10 `sero-plan-mode-plugin` — **fixed** (commit 05d5de4 on branch `fix/session-lifecycle`, not pushed): a session with nothing to restore (a subagent or a new chat) wrote normal mode over the shared workspace plan state. Now it writes only when a plan flag or a saved plan entry is restored. Checked with a one-off script; the repo has no tests.
- [x] 4.11 `sero-research-plugin` — **fixed** (commit b494af2 on branch `fix/session-lifecycle`, not pushed): each research agent is a subagent that loads the plugin, so its `session_start` marked the live run's agents as interrupted. Now the reconcile runs once per workspace per app run. Checked with a one-off script; the repo has no tests.
- [x] 4.12 `sero-signal-desk-plugin` — **works**: the handler only stores the workspace state path from `ctx.cwd`. It is cheap, idempotent and starts nothing to release.
- [x] 4.13 `sero-slopzilla-plugin` — **works**: the handler only stores the workspace state path from `ctx.cwd`. It is cheap, idempotent and starts nothing to release.
- [x] 4.14 `sero-starling-plugin` — **works**: the handler only stores the workspace state path from `ctx.cwd`. It is cheap, idempotent and starts nothing to release.
- [x] 4.15 `sero-todo-plugin-main` — **works**: the handler only stores the workspace state path from `ctx.cwd`. It is cheap, idempotent and starts nothing to release.
- [x] 4.16 `sero-weight-tracker-plugin` — **works**: the handler only stores the workspace state path from `ctx.cwd`. It is cheap, idempotent and starts nothing to release.

## 5. Shared Git exclude helper

- [x] 5.1 Move `ensureGitStateIgnored` and its rules from `git-service-core.ts` into `@sero-ai/extension-runtime`, and use it from the git app. Verify that the existing git service tests pass and that a refresh still writes `**/.sero/` to `.git/info/exclude`, including from a linked worktree.
- [x] 5.2 Bump the `@sero-ai/extension-runtime` version. Verify with `pnpm typecheck` from the monorepo root.

## 6. Metrics

- [x] 6.1 Add the metrics writer per design D11 (`debug/memory/metrics-YYYY-MM-DD.jsonl`, one JSON line per event). Each later task emits its own events. Verify with a unit test that events are appended as valid JSON lines.
- [x] 6.2 Add the report script under `scripts/` that summarises a date range. Verify by running it on a fixture metrics file.

## 7. Entry storage and conversion

- [x] 7.1 Add entry storage per design D1: frontmatter parse and write (including `replaces`), folders by scope and delivery, and `trash/`, with `ctx.cwd` as the workspace root. Verify with unit tests for round-trip format and folder moves.
- [x] 7.2 Add the one-time conversion per design D12: marker, lock, parsing of every current format (v2 lines with the first ID, legacy bullets, prose under headings), skipping onboarding "none" labels, stable IDs (the v2 ID or a hash of the normalised text), a temporary folder, the completeness check, moving into `unsorted/`, the conversion state file with the backup path, renaming with a timestamp on collision, and cleanup of the old QMD collection and cron job that succeeds if they are already gone. Verify with fixtures copied from real profiles, including the triple-ID line, filler entries and prose under headings.
- [x] 7.3 Add conversion recovery per design D12. Verify with tests that simulate a stop after each step, in the middle of the file-move loop, and between the two cleanup steps. The next run must end with every fact present exactly once, the backup in place, and both cleanups done. A failed completeness check must leave `MEMORY.md` in place with its content in the prompt, and a second completed run must change nothing.

## 8. Tools

- [x] 8.1 Rewrite the `memory` tool per design D7 (`save`, `replace`, `remove`, `restore`, `pin`, `unpin`, `list`, and profile `read` and `write` for `identity` and `user`). Put the save triggers and the save rule in the tool description. Emit save, replace, remove, restore, pin and unpin metrics. Verify with tests: missing fields are rejected, a close entry blocks the save until `replace` or `distinct: true`, pin is refused at the cap, unpin keeps the entry, remove then restore returns the same entry, and profile writes succeed without entry fields. Verify fresh onboarding and a later profile edit through the real `sero-cli` bridge. — Running app (2026-09-27, throwaway Playwright spec on a fresh profile): the first session's prompt had the setup section; `sero memory write` for identity and user wrote both files and created no memory entry; the next session had no setup section and showed both files; a later `write --target user` edit showed in the next session.
- [x] 8.2 Add the Git guard per design D8: repository check, exclude rule, `git ls-files` on the memory folder, a stored result only when definitive, and fail closed on errors. Verify with tests: the rule is added when missing, a tracked file in a subfolder refuses writes, a non-git workspace passes, a Git error refuses the write and is checked again on the next write, and a definitive result is not checked again.
- [x] 8.3 Add the `scratchpad` tool (`add`, `done`, `undo`, `list`), which returns the full list and emits scratchpad metrics. Verify with tests on the checklist file.
- [x] 8.4 Emit miss and pinned-break metrics from `replace` per design D7. Verify with a test that replacing an on-match entry not recalled in the session records a miss.

## 9. Snapshot, instructions and onboarding

- [x] 9.1 Build the session snapshot per design D5, waiting for the conversion when the old `MEMORY.md` exists, and rebuild it at `session_compact`. Verify with tests: the prompt is byte-identical across turns after a save, the first session after the update contains the old facts, and compaction includes new pinned entries and scratchpad items.
- [x] 9.2 Shrink `memory-instructions.ts` to a few lines, with no mention of search or daily logs. Verify that the `eval:snapshot` prompt stability check passes, after updating its expected prompt.
- [x] 9.3 Remove onboarding step 3 and add the `Coding style` question to the user step per design D14. Verify that onboarding writes the field to `USER.md` and creates no long-term memory.

## 10. Shared QMD, search test and recall

- [x] 10.1 Add the process-wide QMD registry per design D4: the cached module import, the store, the write queue, consumers counted by session, warm-up at `session_start`, await in `before_agent_start`, and release at `session_shutdown`. Keep the embedding models in QMD's per-machine cache. Verify in the running app, with three chat sessions open and one app reload, that the embedding model loads exactly once (check process memory and the QMD load logs), and that no model file is written under the profile. — Running app (2026-09-27, throwaway Playwright spec): three chat sessions, a resource reload and a window reload all used one store object; main-process memory rose once (563 → 1345 MB) when the model loaded and did not rise again after either reload; no `.gguf` or `.bin` file under the profile; the model is in `~/.cache/qmd/models`. QMD has no load log, so the check uses the store identity and process memory.
- [x] 10.2 Create one collection per scope over `entries/on-match/` only, updated through the write queue. Verify with a test that pinned, unsorted, daily and session files never appear in results. — Test: `pnpm test:qmd` (runs under Electron). Deviation: each scope also has a second collection over all entry folders, used only by the save-time close check.
- [x] 10.3 Add the offline search test: a promptfoo config on fixed entries and queries with expected and unexpected matches, and no model calls. It reports hit rate and false-hit rate for a range of thresholds. Verify by running it, and set the default threshold from its result. — Result (`pnpm eval:memory-search`, 24 queries): hybrid at 0.6 gives hit rate 0.89 and false-hit rate 0.08, the best pair in the table, so the default stays 0.6. Keyword-only mode needs 0.5 (one matched term scores 0.5); at 0.6 its hit rate is 0.22. Owner decision: keyword-only mode uses its own threshold, 0.5 (`keywordRecallThreshold`); the eval now checks each mode at its own threshold and both pass.
- [x] 10.4 Add recall in `before_agent_start` per design D6: hybrid search, the threshold setting, the once-per-session set rebuilt from session history after the last compaction and cleared at `session_compact`, one persistent `memory-recall` message after the user's message, keyword-only search until embeddings are ready, and recall metrics. Verify with tests: no match adds nothing, a repeat match is not added twice, it is added again after compaction, a resumed session does not add it again, and a steering message adds no recall and raises no error. — Steering test: `extension/__tests__/steering.test.ts` runs the extension in a real Pi session on Pi's faux provider; a message steered mid-turn adds no recall and logs no error, and the same words as a new prompt do recall.

## 11. Automatic tidy-up

- [x] 11.1 Add the tidy-up per design D9: the trigger at `session_start` (7 days, or unsorted entries present), the state lock, one isolated completion, a JSON schema, merges written before the originals move to trash, missing-file evidence only for workspace entries in their own workspace, content-hash checks applied through the write queue, pinned caps on `sort`, trash for removals, the tidy log, and tidy metrics. Verify with tests and stub model outputs:
  - a removal without evidence is dropped;
  - command, package and outside-workspace path evidence is dropped;
  - a global entry that names a missing file is kept;
  - an entry replaced while the model call is pending is not changed;
  - a merge writes the new entry before trashing the originals;
  - invalid output changes nothing;
  - an unused 60-day entry is kept;
  - two sessions do not run it at the same time.

## 12. Chat display

- [x] 12.1 Prototype the collapsed "Recalled N memories" and "Saved: ..." lines with the `sero-prototype` skill, and get approval. Verify that the prototype link is approved in the PR discussion. — Prototype `apps/styleguide/public/prototypes/memory-chat-lines.html` (styleguide archive: "Memory rework — recall and save lines in chat"). Approved by the owner on 2026-09-27 in the implementation session, with one change: the brain icon instead of the database icon. No PR exists yet, so the approval is recorded here.
- [x] 12.2 Implement the approved lines. Remove `MemoryBlocksToggle`, the `memory-context` display message and its handling in `agent-subscription.ts`, `ChatPanelHelpers.tsx` and `ChatPromptArea.tsx`. Verify with screenshots of a recall turn, a save turn and a quiet turn, compared frame by frame against the prototype. — Built 2026-09-27. The memory tool returns `details.memoryChange` for a save, replace or remove; the recall message carries each memory's fact and behaviour; the main process projects `memory-recall` as its own chat item; a finished memory change leaves its tool group and draws as one line. Screenshots from the running app and the prototype are in `apps/styleguide/public/prototypes/screenshots/memory-chat-lines/`. Differences from the prototype, all existing app behaviour: tool rows span the full chat width, so the memory lines line up with them; the `sero memory --help` row is named "memory"; a refused save is a normal tool row, because `sero-cli` marks an error only when the tool throws. A memory command inside a multi-line `sero-cli` batch stays a normal tool row.

## 13. Desktop touchpoints

- [x] 13.1 Remove `memory_search` from the bridged tool list in `electron/cli/index.ts` and from `container/tools/system-prompt.ts`. Verify that `pnpm typecheck` passes and that the CLI help has no `memory_search`.
- [x] 13.2 Update `memory-file-guard.ts` to protect the entry folders, `trash/`, the scratchpad and workspace memory, and drop `daily/` and `sessions/`. Verify with the guard tests.
- [x] 13.3 Remove `shared/settings/memory-logging-settings.ts` and its use in `app-main.ts`. Verify that `pnpm typecheck` passes.

## 14. Save-recall evaluation

- [x] 14.1 Add a promptfoo save-recall config on the `eval/seroProvider.ts` harness, with fixed conversations containing a correction, a stated preference, a decision with a reason, a surprise, and a conversation with nothing save-worthy. Verify that it reports saved and missed moments and noise saves.
  - Note: `eval/promptfoo-memory-save.yaml` with `eval/memorySaveProvider.ts` and `eval/assertions/memorySave.ts` (`pnpm eval:memory-save`). The provider is a sibling of `seroProvider.ts` with the same Pi SDK setup, because the save eval needs several user turns, the memory plugin and a `sero-cli` that routes `sero memory` and `sero scratchpad` to the plugin tools. First run on `deepseek/deepseek-v4-flash` (2026-09-27): 5/5, every moment saved, no noise saves.

## 15. Tests, docs and final validation

- [x] 15.1 Update `apps/desktop/e2e/memory.contract.spec.ts` and `memory-snapshot.contract.spec.ts` to the new contract, and delete desktop memory tests for removed modules. Verify that `pnpm e2e:contract` passes after a build.
- [x] 15.2 Rewrite `apps/docs-site/docs/guide/memory.md` for the new behaviour: chat-only memory, scope, delivery, saving, forgetting, the scratchpad, the tidy-up and conversion.
- [x] 15.3 Check that no memory plugin source file passes 500 lines. Run `pnpm typecheck` and `pnpm test` from the monorepo root, and `openspec validate rework-memory-plugin --strict`.
- [x] 15.4 Smoke-test on a copy of a real profile: conversion keeps today's facts in the prompt, the first tidy-up sorts them, "remember X" saves, "forget X" removes, a subagent started from chat has no memory, and an app reload warms QMD before the first message. — Run 2026-09-27 on a copy of the active profile's memory and settings in the scratchpad (credential files, the workspace list, app states and Sero.app package links left out; model `deepseek/deepseek-v4-flash`, other model keys removed from the app env). Old MEMORY.md: its two facts went to `entries/unsorted/` with a backup and showed in the prompt (the third line was a skipped "Not specified" answer); the first tidy-up sorted both; "remember" saved an on-match entry; "forget" got it as recall and moved it to trash; the subagent listed 50 tools with no `memory` or `scratchpad`, and only the chat session wrote a snapshot metric; after a restart the model was warm 1.9 s after open, before any message. No error in the main-process log.
