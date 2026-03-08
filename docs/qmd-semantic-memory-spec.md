# QMD Semantic Memory — Specification

## Overview

- **Problem**: The existing memory extension (MEMORY.md, IDENTITY.md, USER.md, daily logs) uses basic grep search and injects full file contents up to a 4K cap. As memory grows, relevant older entries get truncated away. There's no way to surface buried decisions or old daily logs that match the current conversation.
- **Solution**: Add a QMD-powered semantic search layer to the existing memory system. QMD provides BM25 keyword, vector semantic, and hybrid search across all markdown memory files. Before each agent turn, the user's prompt is searched and relevant results are injected alongside the standard context.
- **Success Criteria**: Relevant past memories surface automatically without the agent explicitly searching. Old daily log entries (3+ days) are discoverable. Graceful degradation when QMD is unavailable.
- **Key Stakeholders**: End users (get better memory recall), the agent (sees relevant context per turn), maintainers (Sero team).

## Decisions from Interview

| Decision | Choice | Rationale |
|----------|--------|-----------|
| QMD installation | CLI dependency with auto-install via Bun | QMD is a full search engine (SQLite FTS5 + embeddings); not practical to vendor. Same pattern as git — shell out, parse JSON. |
| QMD location | Host only | Global workspace is not containerised; memory files live on host filesystem |
| Scratchpad | Yes — add SCRATCHPAD.md | Highest-priority working context; checklist of things to fix/remember |
| Scratchpad location | Global workspace root | `~/.sero-ui/workspaces/global/SCRATCHPAD.md` alongside MEMORY.md |
| Search tool | Separate `memory_search` tool, bridged into sero-cli | Distinct from basic `sero memory search` (grep); supports keyword/semantic/deep modes |
| Selective injection | On by default, `SERO_MEMORY_NO_SEARCH=1` to disable | Surfaces relevant past context automatically; fail-safe with 3s timeout |
| Context budget | 8K chars total | Double current 4K; room for search results without dominating prompt |
| Daily log injection | Don't inject directly; rely on QMD search | Selective injection surfaces relevant daily entries; avoids wasting budget on stale content |
| Identity/User priority | Highest (before scratchpad) | Persona/prefs should never be truncated |
| Session handoff | Yes — auto-capture on compaction | Write open scratchpad + recent context to daily log on `session_before_compact` |
| Exit summary | Yes — LLM-powered session summary on exit | Appended to daily log; uses `reasoning_effort: low` for cost control |
| Tags & links | Yes — encourage `#tags` and `[[links]]` | Free with full-text search; improves keyword recall |
| QMD re-indexing | Debounced background (500ms) | Non-blocking, fire-and-forget after writes |

## Detailed Requirements

### Functional Requirements

1. **QMD auto-install**: On first session start, detect QMD on PATH. If missing, attempt `bun install -g https://github.com/tobi/qmd`. If Bun is missing, show install instructions and degrade gracefully.
2. **QMD collection auto-setup**: On session start (if QMD available), ensure `sero-memory` collection exists pointing at the global workspace memory root. Create path contexts for `/memory/daily` and `/` (root).
3. **`memory_search` tool**: New tool with keyword (BM25, ~30ms), semantic (vector, ~2s), and deep (hybrid + reranking, ~10s) modes. Bridged into CLI as `sero memory_search --query "..." --mode keyword`.
4. **Selective injection**: Before each agent turn, search memory using the user's prompt (keyword mode, 3s timeout, top 3 results). Inject formatted results into system prompt under "Relevant memories" section.
5. **SCRATCHPAD.md**: New file at global workspace root. Tool actions: add, done, undo, clear_done, list. Open items injected into system prompt at second-highest priority.
6. **Session handoff**: On `session_before_compact`, auto-write open scratchpad items + recent daily log tail to today's daily log as a handoff entry.
7. **Exit summary**: On `session_shutdown`, generate LLM summary (decisions, lessons, notes, follow-ups) and append to daily log. Use `reasoning_effort: low`.
8. **Debounced QMD re-index**: After every memory/scratchpad write, schedule `qmd update` with 500ms debounce. Fire-and-forget, non-blocking.
9. **Tags & links**: Update system prompt instructions to encourage `#tags` and `[[wiki-links]]` in memory content.
10. **Graceful degradation**: All QMD features fail silently. Core memory tools (read/write/list) work without QMD.

### Non-Functional Requirements

- Selective injection must complete within 3 seconds or be skipped silently
- QMD re-index must not block tool responses
- Exit summary must not block session shutdown (best-effort)
- All new files under 500 LOC per project rules

## Technical Design

### New Context Injection Priority Order

```
Priority    Section                      Budget    Truncation
--------    -------                      ------    ----------
1 (high)    IDENTITY.md + USER.md        2.0K      from start
2           Open scratchpad items        1.5K      from start
3           QMD search results           2.5K      from start
4           MEMORY.md (long-term)        2.0K      from middle
                                        ------
                                         8.0K (total cap)
```

Daily logs are NOT injected directly — they're surfaced through selective injection (priority 3) when relevant to the current prompt.

### New Files

```
packages/pi-memory-extension/
├── extension/
│   ├── index.ts              # Updated — register new tools + hooks
│   ├── context-injector.ts   # Updated — priority ordering + search results
│   ├── memory-manager.ts     # Unchanged
│   ├── memory-tool.ts        # Unchanged
│   ├── bootstrap.ts          # Unchanged
│   ├── qmd.ts                # NEW — QMD detection, install, collection setup, search
│   ├── scratchpad.ts         # NEW — scratchpad tool + parse/serialize
│   ├── search-tool.ts        # NEW — memory_search tool registration
│   ├── session-lifecycle.ts  # NEW — handoff on compact, exit summary on shutdown
│   └── tsconfig.json
├── shared/
│   └── types.ts              # Updated — add scratchpad + search types
└── package.json
```

### QMD Integration (`qmd.ts`)

- `detectQmd()` — check if `qmd` is on PATH via `qmd status`
- `installQmd()` — run `bun install -g https://github.com/tobi/qmd`
- `detectBun()` — check if `bun` is on PATH
- `setupCollection()` — `qmd collection add <path> --name sero-memory`
- `runSearch(mode, query, limit)` — execute `qmd search|vsearch|query` and parse JSON
- `scheduleUpdate()` — debounced `qmd update` (500ms)
- `searchRelevantMemories(prompt)` — sanitise + keyword search + format results (3s timeout)

All QMD interaction is via `execFile` (child process), same as the reference extension.
Collection name: `sero-memory` (not `pi-memory`).

### Scratchpad (`scratchpad.ts`)

- Parse/serialize `SCRATCHPAD.md` (markdown checklist format)
- Tool: `scratchpad` with actions: add, done, undo, clear_done, list
- Bridged into sero-cli: `sero scratchpad add "Fix auth bug"`

### CLI Bridge Updates

Add to `TOOLS_TO_BRIDGE` in `electron/cli/index.ts`:
- `memory_search`
- `scratchpad`

### Modified Files

- `electron/cli/index.ts` — add `memory_search` + `scratchpad` to TOOLS_TO_BRIDGE
- `extension/context-injector.ts` — new priority ordering, accept search results, inject scratchpad
- `extension/index.ts` — register new tools/hooks, QMD lifecycle
- `shared/types.ts` — add ScratchpadItem, QmdSearchResult types

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Bun not installed on user's system | QMD can't be auto-installed | Show clear install instructions; all core features degrade gracefully |
| QMD search latency on cold start | Selective injection exceeds 3s timeout | Fail silently; agent proceeds without search results |
| QMD collection gets corrupted | Search returns errors | Re-create collection on next session start; `qmd update` rebuilds index |
| Exit summary API call fails | No summary in daily log | Fallback to "Auto-summary unavailable" placeholder |
| 8K context budget too large for some models | Wastes tokens on small-context models | Individual section caps ensure proportional use; truncation from lowest priority up |

## Implementation Phases

### Phase 1: QMD Integration Core
1. `qmd.ts` — detection, auto-install, collection setup, search, update
2. `search-tool.ts` — `memory_search` tool registration
3. Update `context-injector.ts` — selective injection + new priority ordering
4. Update `electron/cli/index.ts` — bridge `memory_search`
5. Update `shared/types.ts` — search types

### Phase 2: Scratchpad
1. `scratchpad.ts` — parse/serialize + tool
2. Update `context-injector.ts` — inject open items
3. Update `electron/cli/index.ts` — bridge `scratchpad`

### Phase 3: Session Lifecycle
1. `session-lifecycle.ts` — handoff on compact + exit summary
2. Update `index.ts` — register lifecycle hooks

### Phase 4: Polish
1. Tags & links guidance in system prompt ✅
2. Env var support (`SERO_MEMORY_NO_SEARCH`) ✅
3. Testing + verification

## Implementation Status

All phases implemented. Files created/modified:

**New files:**
- `extension/qmd.ts` (291 LOC) — QMD detection, auto-install, collection setup, search, re-indexing
- `extension/search-tool.ts` (164 LOC) — memory_search tool (keyword/semantic/deep)
- `extension/scratchpad.ts` (189 LOC) — scratchpad tool + parse/serialize + injection helpers
- `extension/session-lifecycle.ts` (197 LOC) — compaction handoff + exit summary

**Modified files:**
- `extension/context-injector.ts` — new priority ordering (8K budget), selective injection
- `extension/index.ts` — wires QMD init, search, scratchpad, lifecycle hooks
- `extension/memory-tool.ts` — added QMD re-index on writes
- `extension/memory-manager.ts` — added SCRATCHPAD.md to root files set
- `shared/types.ts` — added ScratchpadItem type
- `apps/desktop/electron/cli/index.ts` — added memory_search + scratchpad to TOOLS_TO_BRIDGE
