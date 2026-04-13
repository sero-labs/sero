# Facts — plugins/sero-memory-plugin

_Last reviewed: 2026-04-13_

## What this code does
`plugins/sero-memory-plugin/` is Sero’s foundational persistence extension for long-term memory. It owns the bridged `memory`, `memory_search`, and `scratchpad` tools; injects identity/user/memory/scratchpad context into the system prompt; exports searchable session transcripts; writes daily activity and shutdown summaries; manages QMD indexing; and schedules automatic consolidation of stale daily logs into `MEMORY.md`.

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
  - Pi SDK extension/session APIs (`@mariozechner/pi-coding-agent`, `@mariozechner/pi-ai`, `@mariozechner/pi-tui`)
  - `@tobilu/qmd` for ranked search/indexing
  - `date-fns` for date formatting
  - Global Sero workspace files under `SERO_HOME/workspaces/global`
  - Global/profile sidecars under `SERO_HOME/state/memory/**`
  - Cron plugin state at `SERO_HOME/apps/cron/state.json`
- Upstream callers / consumers of note:
  - Loaded as a Pi extension via `plugins/sero-memory-plugin/package.json`
  - AD-020 bridges `memory`, `memory_search`, and `scratchpad` through `sero-cli`
  - `before_agent_start`, `context`, `session_*`, `tool_*`, and `agent_*` hooks all depend on this package’s runtime behavior
  - Search/transcript recall depends on `PI_CODING_AGENT_DIR` / profile-scoped agent storage staying truthful
- Downstream dependencies:
  - `MEMORY.md`, `IDENTITY.md`, `USER.md`, `SCRATCHPAD.md`
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
- Migration/compaction paths are behavior-sensitive because they may rewrite `MEMORY.md`, `IDENTITY.md`, `USER.md`, and `SCRATCHPAD.md` automatically on startup.

## Surprising discoveries
- `extension/qmd.ts` still falls back to `~/.pi/agent`, even though `extension/session-transcripts.ts` resolves the session store from `SERO_HOME/agent`. Search index and transcript recall can therefore diverge if the env bridge is missing.
- Phase-1 migration currently runs twice in a normal session lifecycle: once during `session_start` / `session_switch`, then again on the first `before_agent_start`.
- The auto-consolidation scheduler bridge rewrites `SERO_HOME/apps/cron/state.json` through a local mirrored `CronState` shape, not a canonical shared contract.
- Despite being one of the most behavior-heavy core plugins in the repo, the package has zero direct tests.
