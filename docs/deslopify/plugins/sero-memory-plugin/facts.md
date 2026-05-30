# Facts — plugins/sero-memory-plugin

_Last reviewed: 2026-04-13_

## What this code does
`plugins/sero-memory-plugin/` is Sero’s foundational persistence extension for long-term memory. It owns the bridged `memory` and `memory_search` tools; injects identity/user/memory context into the system prompt; exports searchable session transcripts; writes daily activity and shutdown summaries; manages QMD indexing; and schedules automatic consolidation of stale daily logs into `MEMORY.md`.

## Shape & metrics
- Total reviewable files: 31
- Total reviewable LOC: 6,285
- Largest source file: `plugins/sero-memory-plugin/extension/memory-tool.ts` (466 LOC)
- Files over 500 LOC: none
- Near-cap files (≥300 LOC):
  - `plugins/sero-memory-plugin/extension/memory-tool.ts` (466)
  - `plugins/sero-memory-plugin/extension/retrieval.ts` (360)
  - `plugins/sero-memory-plugin/extension/priority-context.ts` (337)
  - `plugins/sero-memory-plugin/extension/consolidation.ts` (335)
  - `plugins/sero-memory-plugin/extension/migration.ts` (334)
- External dependencies of note:
  - Pi SDK extension/session APIs (`@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, `@earendil-works/pi-tui`)
  - `@tobilu/qmd` for ranked search/indexing
  - `date-fns` for date formatting
  - Global Sero workspace files under `SERO_HOME/workspaces/global`
  - Global/profile sidecars under `SERO_HOME/state/memory/**`
  - Cron plugin state at `SERO_HOME/apps/cron/state.json`
- Upstream callers / consumers of note:
  - Loaded as a Pi extension via `plugins/sero-memory-plugin/package.json`
  - AD-020 bridges `memory` and `memory_search` through `sero-cli`
  - `before_agent_start`, `context`, `session_*`, `tool_*`, and `agent_*` hooks all depend on this package’s runtime behavior
  - Search/transcript recall depends on `PI_CODING_AGENT_DIR` / profile-scoped agent storage staying truthful
- Downstream dependencies:
  - `MEMORY.md`, `IDENTITY.md`, `USER.md`
  - `memory/daily/*.md` and `memory/sessions/*.md`
  - `SERO_HOME/state/memory/{automation,config,entry-stats,transparency}.json`
  - `SERO_HOME/debug/{memory-plugin.log,memory-prompt-debug.jsonl}`
  - `SERO_HOME/apps/cron/state.json` for auto-consolidation job scheduling
- Test surface:
  - No package-local tests (`*.test.*` / `*.spec.*` absent)
  - Package-local `typecheck` only (`plugins/sero-memory-plugin/package.json`)

## Architectural notes
- This is an extension-only core plugin: it ships no `sero.app` UI surface, but it is still a platform-level dependency because it mutates prompt context, daily logs, transcript exports, and search infrastructure for every session.
- The package owns multiple persistence layers at once: git-tracked workspace memory files, profile-scoped state sidecars, profile-scoped agent/session data, and a cron-plugin integration point. That makes ownership boundaries and failure behavior more important here than in a typical single-surface plugin.
- Context injection is split intentionally: durable blocks go into the system prompt while prompt-specific search hits are sent as a hidden per-turn message. Future cleanup must preserve that prompt-caching-friendly split.
- `extension/automation-state.ts` is currently a cross-plugin seam: it reads and writes the cron plugin’s global `state.json` using plugin-local mirrored types from `extension/cron-types.ts`.
- Agent-directory resolution is inconsistent inside the package today: transcript export follows `SERO_HOME/agent`, while QMD indexing falls back to `~/.pi/agent` when `PI_CODING_AGENT_DIR` is unset.

## Runtime-sensitive surfaces
- `memory-tool.ts` is the truth surface for managed memory files. IDs, timestamps, duplicate detection, sanitization, capacity enforcement, and QMD update scheduling must stay aligned.
- `priority-context.ts` is prompt-cache-sensitive: frozen/live snapshot behavior, hidden search-context messages, and entry-hit scoring all affect what the model actually sees.
- Transcript export and backfill must preserve profile scoping and avoid regressing search recall across session switch, fork, shutdown, and first-run backfill.
- Auto-consolidation is not plugin-local. It mutates the cron plugin’s scheduler state and therefore must not wipe unrelated reminders/jobs or drift from cron’s canonical persisted contract.
- Migration/compaction paths are behavior-sensitive because they may rewrite `MEMORY.md`, `IDENTITY.md`, and `USER.md` automatically on startup.

## Surprising discoveries
- `extension/qmd.ts` still falls back to `~/.pi/agent`, even though `extension/session-transcripts.ts` resolves the session store from `SERO_HOME/agent`. Search index and transcript recall can therefore diverge if the env bridge is missing.
- Phase-1 migration currently runs twice in a normal session lifecycle: once during `session_start` / `session_switch`, then again on the first `before_agent_start`.
- The auto-consolidation scheduler bridge rewrites `SERO_HOME/apps/cron/state.json` through a local mirrored `CronState` shape, not a canonical shared contract.
- Despite being one of the most behavior-heavy core plugins in the repo, the package has zero direct tests.

## Post-fix snapshot — 2026-04-13

### Metrics after fixes
- Total reviewable files: 29 in the current TS/JS scan
- Largest source file: `plugins/sero-memory-plugin/extension/memory-tool.ts` (466 LOC)
- Files over 500 LOC: none
- Type escape hatches remaining: unchanged; D1 only touched the cron auto-consolidation corruption seam

### What changed
- `extension/automation-state.ts` now treats malformed/unreadable cron state as an explicit failure instead of silently defaulting to an empty scheduler snapshot.
- Auto-consolidation sync now skips rewriting `SERO_HOME/apps/cron/state.json` when the cron file is corrupted.
- `extension/memory-tool-admin.ts` now returns a recovery-oriented `Error:` result when cron auto-consolidation sync is blocked by malformed state.
- Package-local `typecheck` still passes after the guardrail change.

### Still outstanding
- The mirrored cron persisted contract still lives locally in `extension/cron-types.ts`; D1 cleared the corruption risk but not the ownership drift.
- The other High item (`~/.pi/agent` fallback in QMD) is still pending.
- Medium startup-migration, sync I/O, and test-surface work remain pending.

## Post-fix snapshot — 2026-04-13 (D2)

### Metrics after fixes
- Largest source file: `plugins/sero-memory-plugin/extension/memory-tool.ts` (466 LOC)
- Files over 500 LOC: none
- Type escape hatches remaining: unchanged outside the still-pending QMD/profile-path seam

### What changed
- Added a neutral shared cron persistence contract in `@sero-ai/common`.
- Replaced the memory plugin’s mirrored cron contract copy with imports from the neutral shared owner.
- Preserved the existing runtime default state locally while moving contract ownership out of the plugin.
- Package-local `typecheck` and monorepo `pnpm typecheck` still pass after the shared-contract move.

### Still outstanding
- The remaining High item is still the `~/.pi/agent` fallback in QMD.
- Medium startup-migration, async persistence/logging, and test-surface work remain pending.

## Post-fix snapshot — 2026-04-14 (D4)

### Metrics after fixes
- Largest source file: `plugins/sero-memory-plugin/extension/memory-tool.ts` (466 LOC)
- Files over 500 LOC: none
- Package-local `typecheck`: still green

### What changed
- Added `extension/agent-dir.ts` as the canonical profile-scoped agent-dir resolver for the package.
- Rebased both QMD DB resolution and transcript session-store resolution on the same Sero-first agent home.
- Removed the memory plugin’s last `~/.pi/agent` fallback on the D4 High seam while preserving `PI_CODING_AGENT_DIR` support.
- Package-local `typecheck` and monorepo `pnpm typecheck` still pass.

### Still outstanding
- High items are cleared for this plan.
- Medium startup-migration, async persistence/logging, and test-surface work remain pending.

## Post-fix snapshot — 2026-04-14 (E4)

### Metrics after fixes
- Total reviewable files: 34
- Largest source file: `plugins/sero-memory-plugin/extension/memory-tool.ts` (466 LOC)
- Files over 500 LOC: none
- Targeted validation: package-local `typecheck` and monorepo `pnpm typecheck` both pass

### What changed
- Added `phase1-migration-state.ts` so phase-1 migration is now recorded once per session entrance instead of re-running on the first `before_agent_start` after every normal session start.
- Added `state-paths.ts`, `json-state.ts`, and `log-writer.ts` as shared async owners for profile-scoped state/debug file paths, JSON state persistence, and serialized rotating log writes.
- Rebased memory config, automation state, transparency state, logger, and prompt-debug persistence onto the new async helpers while keeping non-fatal diagnostics behavior.
- Kept the bootstrap edge case truthful: if memory setup completes mid-session and no entrance migration ran yet, `before_agent_start` still performs the one required migration pass.

### Still outstanding
- The foundational Medium test-surface gap is still pending.
- The Low `memory-tool.ts` split is still pending.

## Post-fix snapshot — 2026-04-14 (Medium test surface)

### Metrics after fixes
- Total reviewable files: 40
- Largest source file: `plugins/sero-memory-plugin/extension/memory-tool.ts` (466 LOC)
- Files over 500 LOC: none
- Targeted validation: package-local `test` + `typecheck`, monorepo `pnpm typecheck`, and `cd apps/desktop && pnpm test` all pass

### What changed
- Added `vitest.config.ts` plus package test scripts so the extension-only memory plugin now has a package-local regression harness instead of relying on desktop-host tests alone.
- Added focused extension tests for malformed cron auto-consolidation guards, profile-scoped agent/QMD/session-store paths, phase-1 migration state reuse, memory CRUD/capacity semantics, and transcript export stability/unchanged-session skips.
- Kept runtime source unchanged while excluding `extension/__tests__` from the package runtime `tsc` pass so the existing extension typecheck stays truthful to shipped code.

### Still outstanding
- Medium items are cleared for this plan.
- The Low `memory-tool.ts` split remains deferred.
