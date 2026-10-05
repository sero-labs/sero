## Context

See proposal.md for the problem and the evidence. The facts below shape the approach.

- Pi creates one extension runtime for each session. The extension loader imports modules with `moduleCache: false` and caches factories only for one working folder at a time. As a result, module-level state in the memory plugin is not shared between sessions, and every opened session re-runs the plugin factory. The debug log shows `extension_loaded` 379 times in one profile.
- The desktop host creates sessions with `createAgentSession()` and never calls `session.bindExtensions()`. `bindExtensions()` is the only place that emits `session_start`, so no extension receives it (#570). `createAgentSession()` accepts a `sessionStartEvent` with a reason, and `bindExtensions()` emits that event. `session.dispose()` does not emit `session_shutdown`. Sero emits it only for chat sessions (`agent.ts` `closePoolEntry`). Subagent, app-agent and persistent sessions call `dispose()` without it.
- Where sessions are created, and which extensions they load:

  | Site | Session kind | Loads the memory plugin today |
  |---|---|---|
  | `ipc/agent/core/agent-session-open.ts` | chat | yes, with tools bridged into `sero-cli` for that session |
  | `features/subagent/runtime/runner.ts` | subagents and orchestrator steps | yes, with tools exposed directly (not bridged) |
  | `ipc/agent/handlers/app-agent.ts` | plugin app agents | no (`noExtensions: true`, own app only) |
  | `features/apps/runtime/capabilities/persistent-sessions/host.ts` | Architect, Rooms | no (the grant app's packages only) |

  `features/subagent/runtime/tool-catalog.ts` builds a probe session that must not start extension work.
- A chat session's `cwd` is the workspace path, so the plugin can use `ctx.cwd` as the workspace root.
- Pi's `before_agent_start` can return a persistent `message` and a `systemPrompt`. Pi 0.84.2 appends returned messages *after* the user message (`dist/core/agent-session.js`, in `prompt()`). A message sent while the agent is running goes through `session.steer()` (`agent-prompt.ts:148`), which does not emit `before_agent_start`. Compaction emits `session_before_compact` and `session_compact`.
- Sero's resource reload (`agent.ts`, `reloadResources`) calls only `entry.loader.reload()`, with no session events.
- App sessions are disposed synchronously on plugin unload (`ipc/integrations/plugins.ts`), plugin dev refresh (`features/plugins/dev-sessions/refresh.ts`) and app quit (`app-agent.ts`, `before-quit`).
- `host.toolchains.sharedToolsDir` exists only for background app runtimes (`features/apps/runtime/capabilities/create-host.ts`). Pi extensions cannot reach it.
- QMD runs in-process through node-llama-cpp. The current collection indexes the whole memory folder (`**/*.md`) and returns a file plus its best chunk.
- The fff plugin shares a native resource across sessions with a `globalThis` registry under `Symbol.for(...)`, with reference counts per session (`plugins/sero-fff-plugin/extension/search-context.ts`, `sdk.ts`).
- The `.sero/` exclude rule is written to `.git/info/exclude` only when the git app refreshes a workspace (`git-service-core.ts`). The git plugin's refresh at session start is one of the dead `session_start` handlers.

## Goals / Non-Goals

**Goals:**

- Memory in chat sessions only, with no memory in any other session kind.
- One QMD instance and one embedding model for the whole app, whatever the number of chat sessions.
- A system prompt that stays byte-identical for a session, except at compaction.
- Memory work that runs on events: session start, save, and compaction. No per-turn checks that repeat work with nothing new to find.
- A tidy-up that is safe with no user watching.
- Measurements that give a baseline for every part.

**Non-Goals:**

- Memory in subagent, orchestrator, Architect, Rooms or app-agent sessions.
- Changing which Sero tools Architect, Rooms and workflows may use. That is a separate issue.
- Conversation recall and search over Pi session files.
- A reranker. It is deferred until the measurements show a need.
- Deleting existing `memory/daily/` and `memory/sessions/` files.
- Build gates based on the evaluation results.
- Changing what each audited `session_start` handler does, beyond what it needs to run correctly.

## Decisions

### D1. One file per memory entry

Each memory is one markdown file with frontmatter: `id`, `type` (`preference`, `decision`, `lesson`, `reference`), `scope`, `created`, `confirmed`, an optional `replaces` list, and a `terms` line with the words a future task would use. The body states the fact and how it changes behaviour. The file's folder sets its delivery mode:

```
<global-root>/memory/entries/{pinned,on-match,unsorted}/<id>.md
<global-root>/memory/trash/<id>.md
<workspace-root>/.sero/apps/memory/entries/{pinned,on-match}/<id>.md
<workspace-root>/.sero/apps/memory/trash/<id>.md
<workspace-root>/.sero/apps/memory/scratchpad.md
```

- QMD indexes files, so one file per entry gives whole-entry results and one result per memory, with no chunk boundaries to manage.
- A folder per delivery mode means the search collection covers only `on-match/`, so pinned and unsorted entries never appear in results. Pinning or unpinning moves the file.
- A removed entry moves to `trash/` with its evidence in the frontmatter. `trash/` is outside every collection. A restore moves it back.
- Alternatives: one `MEMORY.md` with QMD chunking, where chunk boundaries do not follow entries; a SQLite table, which loses readable files and needs its own index. Both were rejected.

### D2. Memory only in chat sessions

The memory plugin is loaded only in chat sessions. The subagent resource loader (`features/subagent/runtime/resource-loader.ts`) leaves the memory plugin out when it filters plugin extensions. It identifies the plugin by its package identity, not by a path fragment. App agents and persistent sessions already do not load it. So the plugin itself needs no session-kind logic, and it uses `ctx.cwd` as the workspace root.

Alternatives:

- Give the plugin a session-kind signal from the host and gate features inside it. Rejected, because it adds a host service and a code path for sessions that should get nothing.
- Inject pinned memories into non-chat sessions from the host. Rejected by the owner, because autonomous sessions run on their own instructions and memories could conflict with them.

### D3. Session events host fix

Each real creation site passes `sessionStartEvent` with the correct reason (`startup`, `resume` or `fork`) to `createAgentSession()`. It then calls `await session.bindExtensions({ uiContext: createSeroUIContext() })` in place of `extensionRunner.setUIContext(...)`. The UI context must go through the binding: `bindExtensions()` re-applies its bindings and would reset a UI context that was set beforehand.

- The tool-catalog probe does not call `bindExtensions()`.
- Subagent, app-agent and persistent sessions emit `session_shutdown` (reason `quit`) through the existing `emitSessionShutdown()` before `dispose()`, and await it. Now that those extensions receive `session_start`, they also get a matching end. `disposeAppSessionsForApp()` becomes async, and its callers await it: plugin unload, plugin dev refresh, and the app-agent `before-quit` path, which joins the main graceful-shutdown sequence.
- The resource reload emits `session_shutdown` (reason `reload`) before `loader.reload()`, and `session_start` (reason `reload`) after it, to the extension copies that the session then uses. The implementation first confirms whether `loader.reload()` gives the live session new extension copies. The events must reach the copies that will handle the next turn.
- Sero's chat `session_shutdown` and `session_before_switch` emits stay as they are.
- A test at the session-open seam proves an extension receives `session_start` once, before the first `before_agent_start`, and that `ctx.ui.notify` still works.

### D4. One QMD instance for each process

A registry on `globalThis[Symbol.for('@sero-ai/plugin-memory/qmd')]` holds the QMD store, the imported module, one write queue, a per-workspace Git check result (D8), and the set of consumer session IDs. This follows the fff plugin.

- `session_start` registers the session and starts the warm-up in the background. The warm-up is one shared promise.
- `before_agent_start` awaits that promise, or starts it if `session_start` was missed.
- `session_shutdown` releases the session. The store closes when the last consumer leaves.
- The QMD module import is cached on the same global object, so a re-evaluated plugin module does not re-import the native graph.
- Collections: `memory-global`, and `memory-ws-<hash of workspace root>` for each workspace. Each covers only its `entries/on-match/` folder. The old collection over the whole memory folder is removed during conversion (D12).
- The index updates through the write queue after each save, replace, remove, unpin or tidy-up change.
- Embedding models stay in QMD's default per-machine cache (`~/.cache/qmd`), never in a profile. This meets the "once per machine, never in a profile" rule. It is an exception to the "use `host.toolchains.sharedToolsDir`" part, because Pi extensions cannot reach that API, and a host bridge only to pass a folder path is not worth its cost. Until embeddings are ready, search uses keyword mode only.
- Whether the embedding model loads exactly once must be validated during implementation, with several chat sessions open.

### D5. The session snapshot

The snapshot is built once per session, at `session_start` or at the first `before_agent_start` if it does not exist. It is added to the system prompt, byte-identical on every turn:

1. `IDENTITY.md` and `USER.md`.
2. Pinned global entries (cap 10) and pinned workspace entries (cap 5). The caps are plugin settings.
3. Unsorted legacy entries, until the tidy-up sorts them.
4. Open scratchpad items.
5. Short memory instructions: what the tools are for and when to save. The full save rule lives in the tool descriptions, where the model reads it when it saves.

If the old `MEMORY.md` exists and conversion has not finished, building the snapshot waits for the conversion (D12). The snapshot is rebuilt at `session_compact`. Compaction already rewrites the start of the conversation, so the rebuild costs no extra cache. Alternative: rebuild on every change. Rejected, because each rebuild voids the prompt cache for the whole conversation.

### D6. On-match recall

`before_agent_start` runs a hybrid search (keyword plus vector, no rerank) with the user's prompt over `memory-global` and the current workspace's collection.

- Results below the score threshold are dropped. The threshold is a setting whose first value comes from the offline search test.
- There are two thresholds, both settings set from the offline search test: 0.6 for hybrid search, and 0.5 until the search model has loaded. Before the model loads, search matches only the saved terms, and one matching term scores 0.5, so 0.6 would recall almost nothing (owner decision, 2026-09-27).
- Entries already added in this session are dropped.
- If anything remains, the handler returns one persistent `message` of type `memory-recall`. Pi appends it after the user's message in the same turn, so the model reads it with the request. Earlier recall messages are never removed.
- The "already added" set is rebuilt at `session_start` from the recall messages in the session after the latest compaction. It is cleared at `session_compact`. After an app restart, a resumed session therefore does not add a memory twice.
- Accepted limit: a message sent while the agent is running goes through `steer()`, which does not emit `before_agent_start`, so it gets no recall. The next message that starts a new run does. Covering steering would need a change to how the host queues messages.
- Alternatives:
  - Place the recall before the user's message. Rejected, because Pi does not support it, and placement after the message works the same for the model.
  - Keep the current approach, which strips the previous recall message each turn. Rejected, because it rewrites history and breaks the cache.

### D7. Saving, the pinned cap and forgetting

The `memory` tool exposes `save`, `replace`, `remove`, `restore`, `pin`, `unpin` and `list` for entries. It also keeps `read` and `write` for `--target identity|user`, with overwrite only, because onboarding and profile changes use them and the file guard blocks direct edits. Profile writes skip entry validation.

- **Save** validates the format: type, scope, delivery, a body that says how it changes behaviour, and terms. Before writing, it searches the same scope for close entries. If one exists, the tool does not save. It returns the entry and asks the model to call `replace` or to save again with `distinct: true`. The model decides whether the fact is a duplicate. The code only reports the candidate.
- **Miss signal.** If the model replaces an entry that was not added in this session, and the entry was on-match, the metrics log records a miss. If the entry was pinned, it records a pinned-rule break.
- **Pin** when the cap is full is refused. The tool lists the pinned entries and asks the model to unpin or replace one. **Unpin** moves the entry to `on-match/`, never to trash.
- **Remove** moves the entry to `trash/`. **Restore** moves it back.
- Tool results render in chat as one compact line (D13).

The `scratchpad` tool (`add`, `done`, `undo`, `list`) edits the workspace checklist. It returns the full current list, so the conversation holds the current state between snapshots.

### D8. Keeping workspace memory out of Git

`ensureGitStateIgnored` moves from `git-service-core.ts` into `@sero-ai/extension-runtime`, and the git app uses it from there. On the first workspace-memory write in each app run, the memory plugin:

1. Checks whether the workspace is a Git repository. If it is not, the result is "safe".
2. Ensures that the exclude rule exists.
3. Runs `git ls-files -- <memory folder>`. Any output means Git tracks a file under the folder, and the result is "tracked".

The plugin stores only a definitive result ("safe" or "tracked") in the D4 registry, for that workspace, for the rest of the app run. If Git fails or the exclude rule cannot be written, the write is refused, nothing is stored, and the next write checks again (fail closed). If the result is "tracked", every workspace write in that app run is refused with a message that says why. Alternative: check on every save. Rejected, because a force-add has already staged the file, so repeating the check adds cost and little protection.

### D9. Automatic tidy-up

At `session_start`, the tidy-up runs in the background for each scope if the last run for that scope was more than 7 days ago, or if unsorted entries exist.

- **Lock.** A state lock (`withStateLock` from `@sero-ai/extension-runtime`) keeps one tidy-up per scope across sessions.
- **Model call.** One isolated completion receives the entries and returns JSON decisions: `keep`, `merge`, `remove`, `sort` (unsorted to pinned or on-match), and `recheck` (for on-match entries not added in 60 days).
- **Merge.** The model writes one new entry that lists the merged IDs in `replaces`. The code writes the new entry first, then moves the merged entries to `trash/`. Superseded facts are handled as merges: the newer fact becomes the merged entry.
- **Remove.** Only a workspace entry can be removed for a missing file. The remove must name a file path from the entry's text. The code resolves it against that entry's own workspace root and removes the entry only if the path is inside that workspace and does not exist. A global entry is never removed for a missing file, because a file path does not belong to any one workspace. A path outside the workspace, or a command or package name, is not evidence, and the entry stays.
- **Validation.** A decision that is not valid is dropped. If the whole output is not valid, nothing changes. `sort` respects the pinned caps, and an entry that does not fit goes to on-match.
- **Concurrent changes.** The tidy-up records a content hash for each entry it reads. Its decisions are applied through the D4 write queue, and a decision is dropped if any entry it touches no longer matches its hash. A correction made while the model call is pending is therefore never overwritten or trashed.
- **Record.** Each change goes to the tidy log with its evidence. Removals go to `trash/`.

The model interprets the text. The code only checks format and evidence, following the no-heuristics rule.

### D10. Removed code

These go, with their tests: `activity-observer.ts`, `session-transcripts.ts`, `transparency-state.ts`, `retrieval.ts`, `prefetch.ts`, `memory-scoring.ts`, `search-tool.ts`, `consolidation.ts`, `consolidation-helpers.ts`, `automation-state.ts`, `cron-types.ts`, `migration.ts`, `phase1-migration-state.ts` and `prompt-debug.ts`. Also removed: the daily and session parts of `session-lifecycle.ts`, `memory-manager.ts` and `priority-context.ts`, the `memory` tool's `daily` target and `search`, `consolidate` and `config` actions, and the `snapshot` and `auto_retrieve` settings. The cron job that the old plugin registered is removed from cron state during conversion.

### D11. Logging and metrics

`logger.ts` keeps errors only. Metrics go to `debug/memory/metrics-YYYY-MM-DD.jsonl` in the profile, one JSON line per event: `save`, `replace`, `remove`, `restore`, `pin`, `unpin`, `recall` (IDs, scores, latency), `recall-empty`, `miss`, `pinned-break`, `tidy` (decision and evidence), `scratchpad`, and `snapshot` (pinned counts). The metrics writer is built first, and each feature emits its events when it is built. A script under `scripts/` summarises a date range into the baseline report. The desktop memory logging setting is removed.

### D12. Conversion of existing memory

Conversion runs once per profile, at the first `session_start` of a chat session, under the state lock. A marker file records completion.

1. Parse `MEMORY.md` with the formats the current parser reads (`memory-format.ts`): v2 lines (`§ [type] text <!-- id: ... -->`, taking the first ID on a line), legacy bullets, and prose under headings. No model is used.
2. Skip entries whose text exactly matches a known onboarding "none" label, such as "Not specified" or "Nothing specific right now".
3. Give each remaining entry a stable ID: its existing v2 ID, or else a hash of its normalised text. Write each one as a global file named by that ID into a temporary folder. Because IDs are stable, a retry writes the same files and cannot create duplicates.
4. Verify that every non-empty source line appears in a converted entry, after whitespace normalisation. Headings, metadata comments and skipped "none" entries are the only exceptions. If not, stop, log an error, and leave everything as it was. The snapshot then uses the unchanged `MEMORY.md` as the unsorted block, so no fact disappears.
5. Move the temporary folder's files into `entries/unsorted/`, overwriting any file with the same ID.
6. Write the chosen backup path to a small conversion state file, then rename `MEMORY.md` to that path without changing its content. The path is `MEMORY.md.v2-backup`, with a timestamp added if that name exists.
7. Remove the old QMD collection and the old cron job. Each removal succeeds if the item is already gone.
8. Write the completion marker last.

Recovery: if the marker is missing at startup, conversion runs again. A leftover temporary folder is deleted. If `MEMORY.md` still exists, the conversion restarts from step 1. If it was already renamed, the plugin reads the backup path from the state file, checks the unsorted entries against the backup (step 4), repeats steps 5 to 7, and writes the marker. Every step can be repeated safely. Then the first tidy-up (D9) sorts the unsorted entries. `memory/daily/` and `memory/sessions/` are not touched.

### D13. Chat display

The `memory-recall` message and `memory` tool results render as one compact, collapsed line each: "Recalled 2 memories", which expands to show the entries, and "Saved: ...". `MemoryBlocksToggle`, the `memory-context` display message and its handling in `agent-subscription.ts` are removed. The exact look is prototyped with the `sero-prototype` skill and approved before implementation.

### D14. Onboarding

Bootstrap has two steps. The user step gains a multi-select `Coding style` question, with the options of the old `explorer_prefs` question, written as a `USER.md` field. Bootstrap no longer writes `MEMORY.md`.

### D15. Handler audit

Every `session_start` handler that starts to run is checked for four things:

- it runs correctly in each session kind that loads it;
- it is idempotent across resume and reload;
- it does not duplicate work done elsewhere;
- it releases what it starts when `session_shutdown` arrives.

The result for each handler is recorded in tasks.md as works, redundant (remove it) or fixed. The plugin template and the `sero-plugin` skill describe `session_start` as a "warm fallback", and they are updated to describe it as a real lifecycle event.

## Risks / Trade-offs

- [Waking 27 handlers at once, 11 in this repo and 16 external, could slow session open or cause errors.] → The audit (D15) comes before the host fix ships. Measure session open time before and after.
- [Subagents lose the memory tools they have today.] → Intended. The parent chat agent passes the context a subagent needs.
- [jiti may re-evaluate `@tobilu/qmd` and load a second model.] → Cache the import on `globalThis` (D4), and validate with several chat sessions open.
- [The first use downloads an embedding model.] → Keyword-only search until embeddings are ready. Models go in the shared tools folder, once per machine.
- [Search misses a relevant memory.] → Accepted, and measured by the miss signal and the offline test. The reranker stays deferred.
- [Steering messages get no recall.] → Accepted (D6). The next new message gets recall.
- [Embedding models sit outside Sero's managed tools folder.] → They stay in QMD's per-machine cache, never in a profile (D4). This is a stated exception to the `sharedToolsDir` rule.
- [The tidy-up model returns bad decisions.] → Schema validation, narrow evidence rules, write-before-trash for merges, content-hash checks against concurrent changes, restorable trash, and a lock. Invalid output changes nothing.
- [The conversion misses a legacy format.] → The completeness check (D12 step 4) stops the conversion, and the unchanged `MEMORY.md` stays in the prompt.
- [Several chat sessions save at once.] → One write queue in the process registry, and a file lock for the tidy-up and the conversion.
- [A plugin source file passes 500 lines.] → Split by the decisions above: storage, tools, snapshot, recall, tidy-up, conversion.

## Migration Plan

1. Ship the host fix, the handler audit and the subagent exclusion together with the new plugin. The old plugin must not receive `session_start`, because it would start QMD, transcript backfill and consolidation in every session.
2. Conversion (D12) runs by itself at the first chat session after the update.
3. Rollback: revert the release. The old plugin ignores the new entry folders. Rename `MEMORY.md.v2-backup` back to `MEMORY.md` to restore the old state.
4. Publish `@sero-ai/extension-runtime` with pnpm, following the publishing rule, before external plugins depend on the new export.

## Open Questions

- The first score threshold for recall. The offline search test sets it, and it is a setting, so it does not change the approach.
