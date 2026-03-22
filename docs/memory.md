# Memory System

> Reference documentation for the Sero memory extension (`packages/pi-memory-extension`).
> For the QMD semantic search spec, see [qmd-semantic-memory-spec.md](qmd-semantic-memory-spec.md).
> For the original integration analysis, see [memory-integration-analysis.md](memory-integration-analysis.md).

## Overview

The memory system gives Sero persistent, cross-session recall. It stores
long-term facts, user profile, agent identity, daily activity logs, and a
working scratchpad — all as markdown files in the global workspace. Content is
injected into the system prompt before each turn, so the agent always has
relevant context without being asked.

## Architecture

```
packages/pi-memory-extension/
├── extension/
│   ├── index.ts              — Extension entry point, hooks + registration
│   ├── bootstrap.ts          — First-run questionnaire setup
│   ├── memory-manager.ts     — File I/O (read/write/append/search/list)
│   ├── memory-tool.ts        — `memory` tool (read/write/search/list)
│   ├── search-tool.ts        — `memory_search` tool (QMD semantic search)
│   ├── context-injector.ts   — System prompt injection (priority-ordered)
│   ├── activity-observer.ts  — Auto-logging of significant work per turn
│   ├── session-lifecycle.ts  — Compaction handoff + exit summary
│   ├── scratchpad.ts         — Persistent checklist tool
│   └── qmd.ts                — QMD SDK integration (keyword/semantic/deep)
├── shared/
│   └── types.ts              — Shared type definitions
└── package.json
```

## Storage Layout

All files live in `~/.sero-ui/workspaces/global/`:

| File | Purpose |
|------|---------|
| `MEMORY.md` | Long-term facts, decisions, preferences, lessons learned |
| `IDENTITY.md` | Agent persona, behavioural rules, communication style |
| `USER.md` | User profile (name, role, location, tech stack, preferences) |
| `SCRATCHPAD.md` | Persistent checklist with checkbox items |
| `memory/daily/YYYY-MM-DD.md` | Append-only daily logs with timestamps |

Files are git-tracked via Sero's existing checkpoint system.

## Tools

All tools are registered via `pi.registerTool()` and bridged into `sero-cli`
(AD-020). The agent invokes them as `sero <tool> <args>`.

### `memory` — CRUD operations

| Action | Usage | Description |
|--------|-------|-------------|
| `read` | `sero memory read --target memory` | Read a memory file |
| `write` | `sero memory write --target daily --content "..."` | Append (default) or overwrite a file |
| `search` | `sero memory search --query "..."` | Grep-style keyword search across all files |
| `list` | `sero memory list` | List root files + recent daily logs |

**Targets:** `memory`, `identity`, `user`, `daily`
**Write modes:** `append` (default), `overwrite`

### `memory_search` — QMD semantic search

| Mode | Speed | Description |
|------|-------|-------------|
| `keyword` | ~30ms | BM25 full-text search, best for #tags and [[links]] |
| `semantic` | ~2s | Vector embedding search, finds related concepts |
| `deep` | ~10s | Hybrid search with reranking |

Usage: `sero memory_search --query "..." --mode keyword`

Gracefully degrades if QMD is unavailable — returns install instructions.

### `scratchpad` — Persistent checklist

| Action | Usage |
|--------|-------|
| `add` | `sero scratchpad add "Fix auth bug"` |
| `done` | `sero scratchpad done "auth bug"` (substring match) |
| `undo` | `sero scratchpad undo "auth bug"` |
| `clear_done` | `sero scratchpad clear_done` |
| `list` | `sero scratchpad list` |

## Context Injection

On every `before_agent_start` event, the extension injects memory context into
the system prompt using a **priority-ordered budget** (8K chars total, ~2K tokens):

| Priority | Content | Budget | Truncation |
|----------|---------|--------|------------|
| 1 | IDENTITY.md + USER.md | 2.0K | From start |
| 2 | Open scratchpad items | 1.5K | From start |
| 3 | QMD search results (auto-retrieved) | 2.5K | From start |
| 4 | MEMORY.md (long-term) | 2.0K | Middle (preserve head + tail) |

Daily logs are **not** injected directly — they surface through QMD selective
injection (priority 3) when relevant to the current prompt.

### Memory context visibility

The injected memory context is also sent to the renderer as a `memory_context`
event, which attaches it to the next assistant message. Users can toggle
visibility of memory context blocks in the ChatPanel using the Database icon
in the prompt area toolbar — similar to how thinking blocks work.

**Data flow:**
```
Extension (before_agent_start)
  → pi.sendMessage({ customType: 'memory-context', display: false })
  → agent-subscription.ts intercepts → sendEvent({ type: 'memory_context' })
  → agent-utils.ts stashes in pendingMemoryContext map
  → Attached to next ChatAssistantMessage as memoryContext field
  → MemoryContextBlock component renders (collapsed by default)
```

## Proactive Memory

The system is designed to save memories **without being asked**. This is
achieved through two mechanisms:

### 1. System prompt instructions

The agent receives detailed instructions on WHEN and WHAT to save:

- **Save without being asked** — don't wait for "remember this"
- **Save early** — when the user describes their work, save context immediately
- **Save after work** — log what was done and lessons learned
- **Save corrections** — when the user corrects the approach
- **Save project discoveries** — structure, patterns, conventions
- **Update, don't duplicate** — search before writing

### 2. Activity observer (`activity-observer.ts`)

Hooks into `tool_call` and `agent_end` events to automatically log significant
work to the daily log. Tracks only what matters — files modified and notable
commands:

```typescript
interface TurnSummary {
  editedPaths: Set<string>;          // shortened file paths
  notableCommands: string[];         // git, build, test commands
  hasBash: boolean;                  // whether bash was used
}
```

**Output format** (one line per turn, under `## Activity (auto)` heading):
```
- modified: .../src/foo.ts, .../bar.ts | ran: `git commit -m "..."`
```

**Filtering rules:**
- Only logs turns with file edits or notable bash commands
- 1-minute cooldown between auto-logs
- Notable commands: git, npm, pnpm, cargo, make, test runners, build, deploy, docker
- File paths shortened to last 3 segments, capped at 5 paths

## Session Lifecycle

### Compaction handoff (`session_before_compact`)

When the context window compacts, the extension captures:
- Open scratchpad items
- Recent daily log tail (last 15 lines)

Writes a "Session Handoff" section to today's daily log so context survives
the reset.

### Exit summary (`session_shutdown`)

On session close, generates an LLM-powered summary (using `reasoning_effort: low`)
with four sections:
- **Decisions** — choices made during the session
- **Lessons Learned** — things discovered or corrected
- **Notes** — general observations
- **Follow-ups** — open items for next session

Appended to today's daily log, then QMD is re-indexed immediately.

## Bootstrap

On first run (when `MEMORY.md` doesn't exist), the extension triggers a
3-step questionnaire flow:

1. **Identity** — agent name, personality, rules → writes `IDENTITY.md`
2. **User profile** — name, role, location, tech stack, communication style → writes `USER.md`
3. **Long-term memory** — technical knowledge, coding preferences, active projects → writes `MEMORY.md`

The bootstrap uses the Pi SDK's `questionnaire` tool with predefined questions
and allows custom answers.

## QMD Integration

QMD provides semantic search via the `@tobilu/qmd` SDK (not CLI).

- **Database:** `~/.cache/qmd/index.sqlite`
- **Collection:** `sero-memory` pointing at the global workspace
- **Path contexts:** `/memory/daily` → daily logs, `/` → curated long-term memory
- **Debounced re-indexing:** 500ms after every write, fire-and-forget
- **Graceful degradation:** All features work without QMD; search falls back to grep
- **Selective injection:** Before each turn, searches memory using the user's prompt
  (keyword mode, 3s timeout, top 3 results) and injects into system prompt

## Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `SERO_HOME` | `~/.sero-ui` | Base directory for all Sero state |
| `SERO_MEMORY_NO_SEARCH` | unset | Set to `1` to disable QMD selective injection |

## Adding to TOOLS_TO_BRIDGE

All memory tools are already in `TOOLS_TO_BRIDGE` in `apps/desktop/electron/cli/index.ts`:
- `memory`
- `memory_search`
- `scratchpad`

No manual registration is needed — the extension auto-registers tools via
`pi.registerTool()` and the CLI bridge picks them up.

## Key Design Decisions

1. **Priority-ordered context budget** — persona always fits; long-term memory
   gets middle-truncated so both the start (structure) and end (recent entries)
   are preserved
2. **Daily logs are search-only** — not injected directly to avoid wasting
   budget on stale content
3. **Compact auto-logging** — one map-based line per turn instead of verbose
   per-file entries; groups under a single heading per day
4. **Memory context visibility** — users can inspect what memories the agent
   sees, improving trust and debuggability
5. **Proactive save instructions** — the system prompt aggressively encourages
   saving without being asked
6. **Graceful QMD degradation** — core memory works with grep alone; QMD adds
   semantic recall as an enhancement
