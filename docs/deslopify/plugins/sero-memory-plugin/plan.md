# Refactoring Plan — plugins/sero-memory-plugin

_Plan drafted: 2026-04-13_

## Executive Summary
`plugins/sero-memory-plugin/` is a valuable core plugin with a thoughtful overall shape: AD-020 tool registration is correct, the context-injection split is deliberate, and the codebase is already broken into focused modules instead of a single giant extension file. The debt is in boundary truthfulness and startup/runtime hygiene. The most serious issue is that the plugin directly rewrites the cron plugin’s persisted state through a mirrored local contract and fail-open JSON reads, which can clobber unrelated scheduler data. The next tier is profile/path drift (`~/.pi/agent` fallback inside QMD), duplicated startup migration work, and a heavy hot path that still relies on sync file I/O plus zero direct tests. The right outcome is one truthful shared contract for cross-plugin scheduling, one canonical profile-scoped agent-dir resolver, single-pass startup maintenance, thinner hot-path persistence helpers, and targeted tests around the core behavior surfaces.

## Issues Found (prioritized)
- **High** — Auto-consolidation mutates the cron plugin through a mirrored fail-open state contract — `plugins/sero-memory-plugin/extension/cron-types.ts:1-33` locally duplicates the cron plugin’s persisted types, while `plugins/sero-memory-plugin/extension/automation-state.ts:47-88` reads any JSON failure as a default empty state and `plugins/sero-memory-plugin/extension/automation-state.ts:155-191` writes the merged result back to `SERO_HOME/apps/cron/state.json`. In Sero specifically, this means a malformed or partially-written cron state can be treated as “empty schedule” and then rewritten by the memory plugin, wiping unrelated reminders/jobs. It also repeats the cross-plugin contract drift already documented in the cron review instead of converging on a canonical shared owner. Effort: **M**.

- **High** — QMD index fallback still points at `~/.pi/agent`, not the Sero-managed agent dir — `plugins/sero-memory-plugin/extension/qmd.ts:20-30` falls back to `join(homedir(), '.pi', 'agent')` when `PI_CODING_AGENT_DIR` is unset, while `plugins/sero-memory-plugin/extension/session-transcripts.ts:29-36` and Sero’s desktop architecture expect profile-scoped data under `SERO_HOME/agent`. For Sero specifically, that breaks the “never use `~/.pi/agent/`” rule and can split transcript exports and QMD indexes across different roots if the env bridge is absent or late. Effort: **S**.

- **Medium** — Phase-1 migration runs twice on the hot path — `plugins/sero-memory-plugin/extension/index.ts:85-104` runs `runPhase1Migration(ctx)` during `session_start` / `session_switch`, then `plugins/sero-memory-plugin/extension/context-injector.ts:206-217` runs the same migration again on the first `before_agent_start`. The second pass usually becomes a no-op, but it still adds duplicate startup I/O and model-bound compaction work to one of Sero’s most latency-sensitive paths. Effort: **S**.

- **Medium** — Hot-path persistence/logging still relies on synchronous file I/O and silent failure — `plugins/sero-memory-plugin/extension/logger.ts:1-79` uses `mkdirSync` / `statSync` / `renameSync` / `appendFileSync` on every log write, `plugins/sero-memory-plugin/extension/prompt-debug.ts:42-73` repeats the same pattern for debug logs, and `plugins/sero-memory-plugin/extension/automation-state.ts:47-59` plus `plugins/sero-memory-plugin/extension/memory-config.ts:21-41` keep separate sync JSON helper stacks. This extension logs and reads config during `session_start`, `before_agent_start`, and other frequent hooks; blocking sync I/O plus blanket catch-all fallbacks makes diagnosis harder and adds avoidable main-process work. Effort: **M**.

- **Medium** — The foundational behavior surface is effectively untested — `plugins/sero-memory-plugin/package.json:8-10` only defines package-local typecheck, and the package contains no `*.test.*` or `*.spec.*` files. That leaves migration, consolidation, transcript export, retrieval ranking, cron integration, and memory file CRUD unprotected even though this plugin mutates prompt context and persistent state for every session. Effort: **M**.

- **Low** — `memory-tool.ts` is becoming the next everything-hub — `plugins/sero-memory-plugin/extension/memory-tool.ts:49-466` owns schema definitions, structured memory normalization, CRUD actions, capacity enforcement, security scanning, config/admin dispatch, and TUI rendering in one near-cap file. It is still under the 500-LOC rule, but it is already the package’s largest operational hub and will keep attracting behavior unless it is split deliberately. Effort: **M**.

## Proposed Refactoring
1. **~~Extract the cron auto-consolidation seam into a truthful shared contract and fail closed on malformed cron state.~~ ✅ 2026-04-13 (`336b790a`, `d885ff2d`)**
   - Stop letting the memory plugin own a mirrored copy of cron’s persisted shape.
   - Target structure:
     - move the minimal shared cron state/job contract needed by both plugins to `@sero/common` (or another neutral shared package)
     - replace `extension/cron-types.ts` with imports from that canonical module
     - change `automation-state.ts` so malformed/unreadable cron state returns an explicit error instead of silently defaulting to `DEFAULT_CRON_STATE`
   - If the cron file cannot be parsed, the memory plugin should skip sync and surface a clear warning rather than rewriting the scheduler file.
   - This aligns with the plugin guide’s neutral-contract rule and complements the cron plugin’s own deslopify plan.

2. **~~Unify agent-dir resolution around Sero’s profile-scoped agent home.~~ ✅ 2026-04-14 (`a3f625be`)**
   - Introduce one small helper for resolving the active agent dir from `PI_CODING_AGENT_DIR` with a Sero-safe fallback to `SERO_HOME/agent`.
   - Use it from both `qmd.ts` and `session-transcripts.ts` so transcript exports, session discovery, and QMD indexes cannot drift to different roots.
   - Preserve Pi compatibility only if it is explicitly intended; otherwise keep the runtime truthful to Sero’s documented `SERO_AGENT_DIR` ownership.
   - This directly aligns with the desktop architecture rule for agent-directory ownership.

3. **~~Run startup migration once per session entrance, not again on first turn.~~ ✅ 2026-04-14 (`86342e2a`)**
   - Choose one owner for phase-1 migration — either the session-enter path in `index.ts` or the first-turn path in `context-injector.ts`.
   - Preferred shape: run migration during session enter, persist the result in a small in-memory session bootstrap state, and let `before_agent_start` consume that state instead of re-running maintenance.
   - Keep the existing “bootstrap can flip from done to needed” re-check semantics if migration materially changes managed files.

4. **~~Replace the sync state/logging helpers with a small async persistence layer.~~ ✅ 2026-04-14 (`86342e2a`)**
   - Target structure:
     - `extension/state-paths.ts` (shared `SERO_HOME` / agent-dir / state-file path helpers)
     - `extension/json-state.ts` (async read/write helpers with explicit `ENOENT` vs parse-error behavior)
     - `extension/log-writer.ts` (serialized async append/rotate queue)
   - Keep the “logging must never crash the extension” rule, but stop swallowing every failure as if it were a first-run case.
   - This reduces duplicated helper logic and makes automation/config/debug behavior more diagnosable.

5. **Split `memory-tool.ts` by action family before it crosses the 500-LOC cap.**
   - Suggested shape:
     - `extension/memory-actions/read.ts`
     - `extension/memory-actions/write.ts`
     - `extension/memory-actions/structured-edit.ts`
     - `extension/memory-tool-render.ts`
     - `extension/memory-tool.ts` reduced to schema + dispatch composition
   - Keep the external tool API unchanged; this is a maintainability cleanup, not a behavior redesign.

6. **~~Add targeted tests around the package’s real risk surfaces.~~ ✅ 2026-04-14 (`f74a9800`)**
   - Added a package-local Vitest setup plus focused extension tests for:
     - malformed cron state refusing auto-consolidation rewrites
     - QMD/session transcript path resolution staying profile-scoped
     - phase-1 migration state preventing duplicate first-turn maintenance
     - `memory` CRUD preserving IDs/capacity/duplicate detection for `MEMORY.md`
     - transcript export producing stable markdown and respecting unchanged-session skips
   - Kept the first pass on pure/helper layers so the package now has direct coverage without forcing a larger integration harness.

## Benefits & Trade-offs
- Benefits: removes a real cross-plugin state-corruption risk, restores truthful profile scoping for search/transcript data, shortens startup latency by eliminating duplicate maintenance work, and gives the most critical memory behaviors actual regression coverage.
- Trade-offs: moving the cron contract to a neutral shared package touches multiple packages at once, and making malformed cron/config state fail closed will surface user-visible warnings where the plugin is currently silent.

## Dependencies & Risks
- The cron-state fix depends on coordinating with `plugins/sero-cron-plugin/` so both reviews converge on one canonical persisted contract instead of creating a second migration seam.
- Agent-dir cleanup is runtime-sensitive. If Pi-CLI compatibility is still a hard requirement for this package, the fallback story needs to be explicit rather than accidentally drifting to `~/.pi/agent` in Sero.
- Startup-migration cleanup must preserve bootstrap correctness and QMD reindex timing. Removing the duplicate call is safe only if the remaining path still guarantees post-migration prompt context sees the normalized files.
- Async logging/state helpers must preserve the current “never fail the agent turn because of diagnostics” behavior even while surfacing real failures.
- New tests should focus on pure/helper layers first so the package gains coverage without forcing an oversized integration harness in one pass.

## Next Steps
1. Treat the plugin’s High + Medium backlog as complete after the focused test-surface pass.
2. Keep the remaining Low follow-up scoped to splitting `memory-tool.ts` before it becomes a 500-LOC hotspot.
3. Revisit broader integration-style coverage only if the memory runtime grows new cross-plugin behavior beyond the helper-layer tests added here.

Verification checklist:
- With a deliberately malformed `SERO_HOME/apps/cron/state.json`, memory-plugin startup no longer rewrites the scheduler file; it reports a clear failure instead.
- QMD DB path and session transcript store both resolve inside the active profile (`SERO_HOME/agent/**` / `PI_CODING_AGENT_DIR/**`), never `~/.pi/agent` in Sero.
- A normal session start triggers phase-1 migration once, not again on the first `before_agent_start`.
- `sero memory write/replace/remove` still preserves entry IDs, duplicate detection, and capacity limits after the `memory-tool.ts` split.
- Transcript backfill still indexes prior sessions and does not rewrite unchanged transcript exports.

## Execution log
- `336b790a` — `fix(plugins): harden persisted state integrity`
- `d885ff2d` — `refactor(contracts): centralize plugin bridge ownership`
- `a3f625be` — `fix(plugins): align profile-scoped path ownership`
- `86342e2a` — `refactor(plugins): land E4 runtime semantics batch` *(memory: phase-1 migration is now single-owner per session entrance, and config/log persistence moved onto shared async helpers)*
- `f74a9800` — `test(memory): add package-local extension coverage`
