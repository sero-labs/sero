# Memory System Comparison: Sero vs Hermes Agent vs Honcho/OpenClaw

> Date: 2026-03-26
> Sources: Hermes Agent memory docs, Honcho integration spec, OpenClaw plugin docs, Honcho overview

## Reference Documentation
https://github.com/NousResearch/hermes-agent/blob/cbf195e8066c14ad09e35ce458e888108c5a56f8/website/docs/user-guide/features/memory.md
https://github.com/NousResearch/hermes-agent/blob/cbf195e8066c14ad09e35ce458e888108c5a56f8/website/docs/user-guide/features/honcho.md
https://github.com/NousResearch/hermes-agent/blob/cbf195e8066c14ad09e35ce458e888108c5a56f8/docs/honcho-integration-spec.md
https://github.com/plastic-labs/honcho/blob/9ee331f79bee6f5c88e703b9bd2d277bf891f7e1/docs/v3/guides/integrations/openclaw.mdx
https://github.com/plastic-labs/honcho/blob/9ee331f79bee6f5c88e703b9bd2d277bf891f7e1/docs/v3/documentation/introduction/overview.mdx
https://github.com/plastic-labs/honcho/blob/9ee331f79bee6f5c88e703b9bd2d277bf891f7e1/docs/v3/documentation/introduction/vibecoding.mdx

## Executive Summary

Sero's memory system is already strong in several areas (rich file taxonomy, QMD semantic search, activity observer, git-tracked memory). However, Hermes Agent and the Honcho ecosystem introduce patterns around **capacity management**, **memory curation ergonomics**, **conversation history search**, **async prefetch**, and **cloud-based reasoning over memory** that Sero should adopt.

---

## What Sero Does Well Today

| Capability | Description |
|---|---|
| **Rich file taxonomy** | MEMORY.md, IDENTITY.md, USER.md, SCRATCHPAD.md, daily logs (vs Hermes's just 2 files) |
| **QMD semantic search** | BM25 + vector + hybrid search across memory files; Hermes only has FTS5 keyword search natively |
| **Selective injection** | Auto-searches memory using the user's prompt each turn and injects relevant results |
| **Activity observer** | Auto-logs significant work (file edits, notable commands) without agent intervention |
| **Session lifecycle** | Compaction handoff + LLM-powered exit summary on session close |
| **Git-tracked memory** | Free versioning via Sero's checkpoint system (neither Hermes nor OpenClaw has this) |
| **Priority-ordered budget** | 8K char budget with priority ordering (identity > scratchpad > search > long-term) |
| **Memory context visibility** | Users can inspect injected memory in the ChatPanel UI |

---

## System-by-System Overview

### Hermes Agent (Native Memory)

- **Two files:** MEMORY.md (2,200 chars) + USER.md (1,375 chars) with strict character limits
- **Frozen snapshot:** System prompt injection captured once at session start, never re-fetched mid-session (preserves LLM prefix cache)
- **Curation tools:** `add`, `replace` (substring match), `remove` (substring match) — no `read` action since memory is always visible
- **Capacity display:** Usage % shown in system prompt header (`[67% -- 1,474/2,200 chars]`)
- **Duplicate prevention:** Auto-rejects exact duplicate entries
- **Security scanning:** Blocks prompt injection patterns, credential exfiltration, invisible Unicode
- **Session search:** All sessions stored in SQLite FTS5; searchable with LLM summarization via `session_search` tool
- **Proactive save:** Detailed instructions on what to save vs skip

### Honcho (Cloud Memory Layer)

- **AI-native reasoning:** Custom reasoning models perform formal logic over conversations to generate conclusions about users
- **Dual-peer architecture:** Separate user and AI peer representations, both built over time
- **Async prefetch pipeline:** Context fetched at turn end via background threads; consumed from cache next turn with zero HTTP latency
- **Dynamic reasoning levels:** Dialectic reasoning effort scales with message complexity (minimal → low → medium → high)
- **Per-peer memory modes:** Independent control over user vs agent memory (hybrid / honcho / local)
- **Session strategies:** per-session, per-directory, per-repo, global, manual map
- **Cross-platform persistence:** Memory follows the user across machines and platforms
- **AI peer identity:** Agent builds a representation of itself over time via `observe_me=True`
- **Tiered tools:** Fast retrieval (no LLM) + LLM-powered Q&A tools

### OpenClaw (Honcho Plugin)

- **Hook-based:** Registers against event bus; synchronous context injection per turn
- **Multi-agent support:** Parent observer hierarchy via `subagent_spawned` hook
- **Platform metadata stripping:** Cleans data before Honcho storage
- **Message dedup:** `lastSavedIndex` prevents re-sending messages
- **QMD passthrough:** Combines cloud memory with local file search
- **Legacy migration:** Non-destructive upload of existing memory files to Honcho

---

## Gap Analysis & Recommendations

### 1. Capacity Management with Forced Curation

**Gap:** Sero has no char/size limits on memory files. As MEMORY.md grows, content gets silently middle-truncated during injection. The agent has no signal that memory is full or needs consolidation.

**From:** Hermes Agent

**Recommendation:** Add configurable character limits per file (e.g. MEMORY.md: 4K chars, USER.md: 2K chars). Display usage percentage in the injected context header (e.g. `MEMORY [72% -- 2,880/4,000 chars]`). When writes would exceed the cap, return an error prompting the agent to consolidate/replace entries first.

**Why it matters:** Forces information-dense, curated memories instead of unbounded growth. The agent actively manages its own memory quality.

**Effort:** Low-medium. Changes to `memory-manager.ts` and `context-injector.ts`.

**Priority: P0**

---

### 2. Substring-Based Replace & Remove

**Gap:** Sero's `memory write` only supports `append` or `overwrite` modes. To update a single fact, the agent must overwrite the entire file.

**From:** Hermes Agent

**Recommendation:** Add `replace` and `remove` actions using short unique substring matching. Example: `sero memory replace --target memory --old_text "uses PostgreSQL 15" --content "uses PostgreSQL 17"`. Return an error if the substring matches 0 or >1 entries.

**Why it matters:** Pairs with capacity management to enable proper memory hygiene. Without this, the agent can't surgically update individual facts.

**Effort:** Low. New actions in `memory-tool.ts`.

**Priority: P0**

---

### 3. Frozen Snapshot Option for Prefix Cache Optimization

**Gap:** Sero injects memory context on every `before_agent_start` event. The system prompt changes every turn (especially with QMD selective injection results varying per prompt), defeating LLM prefix caching.

**From:** Hermes Agent

**Recommendation:** Add a configurable mode where identity + user + long-term memory are injected once at session start as a frozen block. Only QMD selective results would vary per turn, appended *after* the frozen block. Tradeoff: mid-session memory writes won't appear in the system prompt until next session.

**Effort:** Medium. New caching layer in `context-injector.ts`.

**Priority: P2**

---

### 4. Conversation History Search

**Gap:** Sero's QMD searches memory *files* but can't search past *conversations*. If a user asks "what did we discuss last week about auth?", the agent can only find it if it was manually saved to memory.

**From:** Hermes Agent (`session_search` tool with SQLite FTS5 + LLM summarization)

**Recommendation:** Index past session transcripts into a searchable store — either a dedicated SQLite FTS5 database or a new QMD collection pointing at session data. Add a `session_search` tool that returns relevant past conversation snippets, optionally with LLM summarization.

**Why it matters:** This is the biggest recall gap vs Hermes. Memory files only contain what the agent explicitly saved. Session search gives access to *everything* that was discussed.

**Effort:** High. New tool, new storage, session transcript export pipeline.

**Priority: P1**

---

### 5. Memory Security Scanning

**Gap:** Memory entries are injected into the system prompt with no validation. A corrupted or malicious entry could contain prompt injection attacks.

**From:** Hermes Agent

**Recommendation:** Add a lightweight security scanner on every `memory write`. Block entries matching known threat patterns:
- Prompt injection phrases ("ignore previous instructions", "system: you are now...")
- Credential exfiltration (`curl`/`wget` with env vars, SSH key references)
- Invisible Unicode characters (zero-width joiners, RTL overrides)

**Effort:** Low. ~100 LOC regex-based scanner in `memory-manager.ts`.

**Priority: P1**

---

### 6. Duplicate Prevention

**Gap:** Nothing prevents the agent from appending the same fact to MEMORY.md multiple times. System prompt says "search before writing" but compliance is inconsistent.

**From:** Hermes Agent

**Recommendation:** Before appending a new entry, do a normalized comparison against existing entries. Auto-reject exact duplicates. Warn on near-duplicates and suggest using `replace` instead.

**Effort:** Low. Guard in `memory-manager.ts` write path.

**Priority: P1**

---

### 7. Honcho-Style Cloud Memory / User Modeling

**Gap:** Sero's memory is entirely local and manually curated by the agent. It can't reason over conversation history to extract deeper insights. No cross-device persistence.

**From:** Honcho / OpenClaw

**Recommendation:** Integrate Honcho as an optional cloud memory layer (hybrid mode alongside local memory). This would add:
- **Automatic user modeling** — preferences, goals, communication style learned from conversations
- **Dialectic reasoning** — formal logic over conversations to extract insights beyond what grep/vector search surfaces
- **Cross-device persistence** — memory follows the user across machines
- **Dual-peer architecture** — separate user and agent representations
- **Dynamic reasoning levels** — reasoning effort scales with message complexity

Implementation as a new `pi-honcho-extension` that composes with `pi-memory-extension`.

**Effort:** High. New extension, Honcho SDK integration, config system.

**Priority: P2** (strategic — high impact but significant investment)

---

### 8. Async Prefetch for Context Injection

**Gap:** Sero's QMD selective injection runs synchronously in `before_agent_start` with a 3-second timeout, adding latency to every turn.

**From:** Hermes Agent (async prefetch pattern)

**Recommendation:** Fire the QMD search as a background task at the *end* of each turn (after `agent_end`). Cache results. At the start of the next turn, consume from cache with zero latency. Turn 1 gets no search results (cold cache); all subsequent turns are instant.

**Interface:**
```typescript
interface AsyncPrefetch {
  firePrefetch(sessionId: string, userMessage: string): void;
  popSearchResults(sessionId: string): QmdResult[] | null;
}
```

**Effort:** Medium. Restructure `context-injector.ts` + add cache in extension state.

**Priority: P1**

---

### 9. Per-Workspace Memory Isolation with Session Strategies

**Gap:** All Sero memory lives in the global workspace. No per-project memory isolation. When working on project A, memories from project B add noise.

**From:** Hermes Agent / Honcho (session naming strategies)

**Recommendation:** Add session strategies that scope QMD search and daily logs:
- `global` — current behavior (default)
- `per-workspace` — scope daily logs and MEMORY.md sections by active workspace
- `per-repo` — group by git repo root

Core identity files (IDENTITY.md, USER.md) stay global. MEMORY.md could support workspace-scoped sections or per-workspace memory files (`memory/projects/<name>.md`).

**Effort:** Medium. Changes to `memory-manager.ts`, `context-injector.ts`, QMD collection setup.

**Priority: P2**

---

### 10. Memory Context Metadata in System Prompt

**Gap:** The agent sees memory content but has no metadata about capacity, freshness, or truncation.

**From:** Hermes Agent (capacity headers with usage %)

**Recommendation:** Enrich injected memory headers with:
- Usage % and char counts per file
- Last-modified timestamps
- Truncation notices (how much was cut)
- Entry delimiters (like Hermes's `§`) for easier replace/remove targeting

**Effort:** Low. Formatting changes in `context-injector.ts`.

**Priority: P1**

---

## Priority Summary

| Priority | Recommendations | Theme |
|---|---|---|
| **P0** | #1 Capacity management, #2 Substring replace/remove | Memory curation ergonomics |
| **P1** | #4 Conversation history search, #5 Security scanning, #6 Duplicate prevention, #8 Async prefetch, #10 Metadata in prompt | Core quality & performance |
| **P2** | #3 Frozen snapshot, #7 Honcho integration, #9 Per-workspace isolation | Strategic / architectural |

---

## Feature Matrix

| Feature | Sero | Hermes | Honcho/OpenClaw |
|---|---|---|---|
| Memory files (MEMORY, USER, IDENTITY) | MEMORY + IDENTITY + USER + SCRATCHPAD + daily | MEMORY + USER only | Cloud-hosted representations |
| Character limits / capacity mgmt | No limits; silent truncation | Strict limits + usage % display | Token budgets on context injection |
| Memory curation (replace/remove) | Append or full overwrite | Substring match replace/remove | `honcho_conclude` for writes |
| Semantic search | QMD (BM25 + vector + hybrid) | SQLite FTS5 only | Honcho semantic search + dialectic |
| Conversation history search | Not available | SQLite FTS5 + LLM summarization | Full conversation history in Honcho |
| Auto context injection | Every turn (QMD selective) | Frozen at session start | Async prefetch (zero-latency after turn 1) |
| Activity auto-logging | Yes (activity observer) | No | No |
| Session lifecycle (compaction/exit) | Handoff + LLM exit summary | No | Session flush on reset/expiry |
| Security scanning | No | Yes (injection/exfiltration patterns) | Platform metadata stripping |
| Duplicate prevention | No | Yes (exact match) | Message dedup via lastSavedIndex |
| Git-tracked memory | Yes (checkpoint system) | No | No (cloud storage) |
| Cross-device persistence | No (local files only) | No (local files only) | Yes (Honcho cloud API) |
| AI self-representation | No | Yes (observe_me=True + SOUL.md seeding) | Yes (dual-peer architecture) |
| Per-project memory isolation | No (global only) | Yes (session strategies) | Yes (session strategies + workspaces) |
| Reasoning over memory | No (retrieval only) | No (retrieval only) | Yes (formal logic reasoning) |
| Memory UI visibility | Yes (memory context blocks in chat) | No | No |
| Bootstrap questionnaire | Yes (3-step flow) | No | No |
| Scratchpad / working memory | Yes (SCRATCHPAD.md) | No | No |
