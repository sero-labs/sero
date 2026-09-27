## 1. Cut down the memory plugin

Do this first. The old plugin must never receive `session_start` (design Migration Plan).

- [ ] 1.1 Delete the modules listed in design D10 and their tests. Verify that `pnpm --filter @sero-ai/plugin-memory typecheck` and the remaining plugin tests pass.
- [ ] 1.2 Remove the daily and session parts of `session-lifecycle.ts`, `memory-manager.ts` and `priority-context.ts`, and the `snapshot` and `auto_retrieve` settings in `memory-config.ts`. Verify that a chat session with commands and edits writes nothing under `memory/daily/` or `memory/sessions/`.
- [ ] 1.3 Remove the `memory_search` tool, and the `memory` tool's `daily` target and `search`, `consolidate` and `config` actions. Verify that `sero memory --help` no longer lists them.
- [ ] 1.4 Cut `logger.ts` to errors only. Verify that a normal session writes no info lines to `debug/memory/*.log`.

## 2. Host: session events and subagent exclusion

- [ ] 2.1 Pass `sessionStartEvent` with the correct reason (`startup`, `resume`, `fork`) to `createAgentSession()` in `agent-session-open.ts`, `handlers/app-agent.ts`, `persistent-sessions/host.ts` and `subagent/runtime/runner.ts`. Verify with a session-open test that the reason matches for new, resumed and forked sessions.
- [ ] 2.2 Replace `extensionRunner.setUIContext(...)` with `await session.bindExtensions({ uiContext: createSeroUIContext() })` at each site in 2.1. Verify with a test at the session-open seam that a test extension receives `session_start` once, before the first `before_agent_start`, and that `ctx.ui.notify` still reaches the UI.
- [ ] 2.3 Make sure the tool-catalog probe in `subagent/runtime/tool-catalog.ts` does not bind extensions. Verify with a test that building the catalog delivers no `session_start`.
- [ ] 2.4 Emit and await `session_shutdown` through `emitSessionShutdown()` before `dispose()` in the subagent runner, the app-agent pool and the persistent-session host, on completion, failure and abort. Make `disposeAppSessionsForApp()` async, and await it from plugin unload (`ipc/integrations/plugins.ts`), plugin dev refresh (`features/plugins/dev-sessions/refresh.ts`) and the app-agent `before-quit` path, which joins the main graceful-shutdown sequence. Verify with tests that a test extension's async `session_shutdown` handler finishes once for each case before disposal.
- [ ] 2.5 Find out whether `loader.reload()` in `reloadResources` (`agent.ts`) gives the live session new extension copies. Then emit `session_shutdown` and `session_start` (reason `reload`) so that the copies handling the next turn have received `session_start`. Verify with a test through the real reload IPC route.
- [ ] 2.6 Leave the memory plugin out of subagent sessions in `subagent/runtime/resource-loader.ts`, identified by package identity. Verify with a test that a subagent with the full tool policy has no `memory` or `scratchpad` tool and no memory text in its system prompt.
- [ ] 2.7 Measure session-open time for a chat session before and after 2.2, with all monorepo plugins installed. Record both numbers in the PR description.

## 3. Audit session_start handlers in this repo

For each handler, check that it runs correctly in every session kind that loads it, is idempotent across resume and reload, does not duplicate other work, and releases what it starts on `session_shutdown`. Record the result here as works, redundant (removed) or fixed, and verify it in a running app with the host fix.

- [ ] 3.1 `apps/desktop/electron/features/apps/extensions/git-turn-undo-capture.ts` (links the session to the current commit)
- [ ] 3.2 `plugins/sero-cron-plugin/extension/index.ts` (starts the cron runtime; must not start one per subagent)
- [ ] 3.3 `plugins/sero-fff-plugin/extension/index.ts` (warms the file search index)
- [ ] 3.4 `plugins/sero-git-plugin/extension/index.ts` (syncs git state and writes the `.sero/` exclude rule)
- [ ] 3.5 `plugins/sero-graphify-plugin/extension/auto-context/index.ts` (resets per-session graph context)
- [ ] 3.6 `plugins/sero-graphify-plugin/extension/refresh-on-edit.ts` (queues a sync for an unknown workspace)
- [ ] 3.7 `plugins/sero-mcp-plugin/extension/index.ts` (registers the session and starts the MCP runtime)
- [ ] 3.8 `plugins/sero-orchestrator-plugin/extension/goal-loop.ts` (reattaches an active goal)
- [ ] 3.9 `plugins/sero-output-optimizer-plugin/extension/index.ts` (prepares the optimizer)
- [ ] 3.10 `plugins/sero-web-plugin/extension/index.ts` (marks the session active)
- [ ] 3.11 Update the `session_start` guidance in `packages/templates/skills/sero-plugin/` (`SKILL.md`, `references/templates.md`, `references/conversion-guide.md` and the example `sero-notes-plugin`), which calls it a "warm fallback". Verify that the guidance describes it as a lifecycle event that fires in every session kind, paired with `session_shutdown`.

## 4. Audit session_start handlers in external plugins

Apply the same checks as group 3 to each handler in `../plugins/`. Record the result here, and commit any fix in the plugin's own repo.

- [ ] 4.1 `sero-calc-plugin`
- [ ] 4.2 `sero-daily-quote-plugin`
- [ ] 4.3 `sero-google-plugin`
- [ ] 4.4 `sero-imagegen-plugin`
- [ ] 4.5 `sero-kanban-plugin`
- [ ] 4.6 `sero-logbook-plugin`
- [ ] 4.7 `sero-loom-plugin`
- [ ] 4.8 `sero-notes-plugin`
- [ ] 4.9 `sero-openai-plugin`
- [ ] 4.10 `sero-plan-mode-plugin`
- [ ] 4.11 `sero-research-plugin`
- [ ] 4.12 `sero-signal-desk-plugin`
- [ ] 4.13 `sero-slopzilla-plugin`
- [ ] 4.14 `sero-starling-plugin`
- [ ] 4.15 `sero-todo-plugin-main`
- [ ] 4.16 `sero-weight-tracker-plugin`

## 5. Shared Git exclude helper

- [ ] 5.1 Move `ensureGitStateIgnored` and its rules from `git-service-core.ts` into `@sero-ai/extension-runtime`, and use it from the git app. Verify that the existing git service tests pass and that a refresh still writes `**/.sero/` to `.git/info/exclude`, including from a linked worktree.
- [ ] 5.2 Bump the `@sero-ai/extension-runtime` version. Verify with `pnpm typecheck` from the monorepo root.

## 6. Metrics

- [ ] 6.1 Add the metrics writer per design D11 (`debug/memory/metrics-YYYY-MM-DD.jsonl`, one JSON line per event). Each later task emits its own events. Verify with a unit test that events are appended as valid JSON lines.
- [ ] 6.2 Add the report script under `scripts/` that summarises a date range. Verify by running it on a fixture metrics file.

## 7. Entry storage and conversion

- [ ] 7.1 Add entry storage per design D1: frontmatter parse and write (including `replaces`), folders by scope and delivery, and `trash/`, with `ctx.cwd` as the workspace root. Verify with unit tests for round-trip format and folder moves.
- [ ] 7.2 Add the one-time conversion per design D12: marker, lock, parsing of every current format (v2 lines with the first ID, legacy bullets, prose under headings), skipping onboarding "none" labels, stable IDs (the v2 ID or a hash of the normalised text), a temporary folder, the completeness check, moving into `unsorted/`, the conversion state file with the backup path, renaming with a timestamp on collision, and cleanup of the old QMD collection and cron job that succeeds if they are already gone. Verify with fixtures copied from real profiles, including the triple-ID line, filler entries and prose under headings.
- [ ] 7.3 Add conversion recovery per design D12. Verify with tests that simulate a stop after each step, in the middle of the file-move loop, and between the two cleanup steps. The next run must end with every fact present exactly once, the backup in place, and both cleanups done. A failed completeness check must leave `MEMORY.md` in place with its content in the prompt, and a second completed run must change nothing.

## 8. Tools

- [ ] 8.1 Rewrite the `memory` tool per design D7 (`save`, `replace`, `remove`, `restore`, `pin`, `unpin`, `list`, and profile `read` and `write` for `identity` and `user`). Put the save triggers and the save rule in the tool description. Emit save, replace, remove, restore, pin and unpin metrics. Verify with tests: missing fields are rejected, a close entry blocks the save until `replace` or `distinct: true`, pin is refused at the cap, unpin keeps the entry, remove then restore returns the same entry, and profile writes succeed without entry fields. Verify fresh onboarding and a later profile edit through the real `sero-cli` bridge.
- [ ] 8.2 Add the Git guard per design D8: repository check, exclude rule, `git ls-files` on the memory folder, a stored result only when definitive, and fail closed on errors. Verify with tests: the rule is added when missing, a tracked file in a subfolder refuses writes, a non-git workspace passes, a Git error refuses the write and is checked again on the next write, and a definitive result is not checked again.
- [ ] 8.3 Add the `scratchpad` tool (`add`, `done`, `undo`, `list`), which returns the full list and emits scratchpad metrics. Verify with tests on the checklist file.
- [ ] 8.4 Emit miss and pinned-break metrics from `replace` per design D7. Verify with a test that replacing an on-match entry not recalled in the session records a miss.

## 9. Snapshot, instructions and onboarding

- [ ] 9.1 Build the session snapshot per design D5, waiting for the conversion when the old `MEMORY.md` exists, and rebuild it at `session_compact`. Verify with tests: the prompt is byte-identical across turns after a save, the first session after the update contains the old facts, and compaction includes new pinned entries and scratchpad items.
- [ ] 9.2 Shrink `memory-instructions.ts` to a few lines, with no mention of search or daily logs. Verify that the `eval:snapshot` prompt stability check passes, after updating its expected prompt.
- [ ] 9.3 Remove onboarding step 3 and add the `Coding style` question to the user step per design D14. Verify that onboarding writes the field to `USER.md` and creates no long-term memory.

## 10. Shared QMD, search test and recall

- [ ] 10.1 Add the process-wide QMD registry per design D4: the cached module import, the store, the write queue, consumers counted by session, warm-up at `session_start`, await in `before_agent_start`, and release at `session_shutdown`. Keep the embedding models in QMD's per-machine cache. Verify in the running app, with three chat sessions open and one app reload, that the embedding model loads exactly once (check process memory and the QMD load logs), and that no model file is written under the profile.
- [ ] 10.2 Create one collection per scope over `entries/on-match/` only, updated through the write queue. Verify with a test that pinned, unsorted, daily and session files never appear in results.
- [ ] 10.3 Add the offline search test: a promptfoo config on fixed entries and queries with expected and unexpected matches, and no model calls. It reports hit rate and false-hit rate for a range of thresholds. Verify by running it, and set the default threshold from its result.
- [ ] 10.4 Add recall in `before_agent_start` per design D6: hybrid search, the threshold setting, the once-per-session set rebuilt from session history after the last compaction and cleared at `session_compact`, one persistent `memory-recall` message after the user's message, keyword-only search until embeddings are ready, and recall metrics. Verify with tests: no match adds nothing, a repeat match is not added twice, it is added again after compaction, a resumed session does not add it again, and a steering message adds no recall and raises no error.

## 11. Automatic tidy-up

- [ ] 11.1 Add the tidy-up per design D9: the trigger at `session_start` (7 days, or unsorted entries present), the state lock, one isolated completion, a JSON schema, merges written before the originals move to trash, missing-file evidence only for workspace entries in their own workspace, content-hash checks applied through the write queue, pinned caps on `sort`, trash for removals, the tidy log, and tidy metrics. Verify with tests and stub model outputs:
  - a removal without evidence is dropped;
  - command, package and outside-workspace path evidence is dropped;
  - a global entry that names a missing file is kept;
  - an entry replaced while the model call is pending is not changed;
  - a merge writes the new entry before trashing the originals;
  - invalid output changes nothing;
  - an unused 60-day entry is kept;
  - two sessions do not run it at the same time.

## 12. Chat display

- [ ] 12.1 Prototype the collapsed "Recalled N memories" and "Saved: ..." lines with the `sero-prototype` skill, and get approval. Verify that the prototype link is approved in the PR discussion.
- [ ] 12.2 Implement the approved lines. Remove `MemoryBlocksToggle`, the `memory-context` display message and its handling in `agent-subscription.ts`, `ChatPanelHelpers.tsx` and `ChatPromptArea.tsx`. Verify with screenshots of a recall turn, a save turn and a quiet turn, compared frame by frame against the prototype.

## 13. Desktop touchpoints

- [ ] 13.1 Remove `memory_search` from the bridged tool list in `electron/cli/index.ts` and from `container/tools/system-prompt.ts`. Verify that `pnpm typecheck` passes and that the CLI help has no `memory_search`.
- [ ] 13.2 Update `memory-file-guard.ts` to protect the entry folders, `trash/`, the scratchpad and workspace memory, and drop `daily/` and `sessions/`. Verify with the guard tests.
- [ ] 13.3 Remove `shared/settings/memory-logging-settings.ts` and its use in `app-main.ts`. Verify that `pnpm typecheck` passes.

## 14. Save-recall evaluation

- [ ] 14.1 Add a promptfoo save-recall config on the `eval/seroProvider.ts` harness, with fixed conversations containing a correction, a stated preference, a decision with a reason, a surprise, and a conversation with nothing save-worthy. Verify that it reports saved and missed moments and noise saves.

## 15. Tests, docs and final validation

- [ ] 15.1 Update `apps/desktop/e2e/memory.contract.spec.ts` and `memory-snapshot.contract.spec.ts` to the new contract, and delete desktop memory tests for removed modules. Verify that `pnpm e2e:contract` passes after a build.
- [ ] 15.2 Rewrite `apps/docs-site/docs/guide/memory.md` for the new behaviour: chat-only memory, scope, delivery, saving, forgetting, the scratchpad, the tidy-up and conversion.
- [ ] 15.3 Check that no memory plugin source file passes 500 lines. Run `pnpm typecheck` and `pnpm test` from the monorepo root, and `openspec validate rework-memory-plugin --strict`.
- [ ] 15.4 Smoke-test on a copy of a real profile: conversion keeps today's facts in the prompt, the first tidy-up sorts them, "remember X" saves, "forget X" removes, a subagent started from chat has no memory, and an app reload warms QMD before the first message.
