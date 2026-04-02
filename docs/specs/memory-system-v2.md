# Memory System v2 — Comprehensive Spec

> **Date:** 2026-03-31
> **Status:** Draft
> **Sources:** [Hermes/Honcho comparison](analysis/memory-comparison-hermes-honcho.md), [Cortex Engine comparison](analysis/cortex-engine-memory-comparison.md), [Current memory docs](memory.md)
> **Scope:** Full roadmap across 4 phases — local-first only (no cloud/Honcho)

---

## Problem Statement

Sero's memory system has strong foundations (rich file taxonomy, QMD semantic
search, activity observer, git-tracked memory, priority-ordered context budget).
However, comparative analysis against Hermes Agent, Honcho/OpenClaw, and Cortex
Engine reveals systematic gaps in **curation ergonomics**, **retrieval quality**,
**memory intelligence**, and **lifecycle management** that degrade long-term
agent effectiveness.

### Core Issues

1. **Unbounded growth → silent quality loss.** Memory files grow without limits.
   MEMORY.md gets middle-truncated at ~1.6K chars during injection — the agent
   has no signal that content is being dropped and no incentive to curate.

2. **Blunt write operations.** Only `append` and `overwrite` modes exist. To
   update a single fact, the agent must overwrite the entire file — so it
   doesn't, and stale facts accumulate.

3. **Single-shot retrieval.** QMD searches with the raw user prompt only.
   Memories that would match a rephrased query are missed. Search also runs
   synchronously, adding latency to every turn.

4. **No conversation recall.** QMD searches memory *files* but not past
   *conversations*. If a user asks "what did we discuss about auth last week?",
   the agent can only find it if it was manually saved to MEMORY.md.

5. **Flat, untyped content.** Facts, questions, hypotheses, and decisions are
   all mixed together in MEMORY.md with equal weight. No recency signal, no
   type-based prioritisation, no automated consolidation of stale daily logs.

6. **No safety net.** Memory entries are injected into the system prompt with no
   validation — no duplicate detection, no prompt injection scanning.

---

## Goals

- **Force high-quality, curated memory** through capacity limits and surgical
  edit operations
- **Improve recall** via multi-anchor retrieval, async prefetch, and session
  transcript search
- **Add memory intelligence** with typed entries, recency scoring, and automated
  consolidation
- **Harden the system** with duplicate prevention and security scanning
- **Maintain local-first, markdown-based, git-trackable design** throughout

---

## Current Architecture (Unchanged)

```
plugins/sero-memory-plugin/extension/
├── index.ts              — Extension entry, hooks + registration
├── bootstrap.ts          — First-run questionnaire
├── memory-manager.ts     — File I/O (read/write/append/search/list)
├── memory-tool.ts        — `memory` tool (read/write/search/list)
├── search-tool.ts        — `memory_search` tool (QMD semantic search)
├── context-injector.ts   — System prompt injection (priority-ordered)
├── activity-observer.ts  — Auto-logging of significant work
├── session-lifecycle.ts  — Compaction handoff + exit summary
├── scratchpad.ts         — Persistent checklist tool
└── qmd.ts                — QMD SDK integration
```

All files live in `~/.sero-ui/workspaces/global/`. The 8K-char priority-ordered
budget (identity → scratchpad → QMD search → long-term memory) remains the
injection backbone. Changes in this spec modify behaviour *within* this
architecture, not replace it.

---

## Phase 1: Memory Curation & Quality (P0)

> **Theme:** Give the agent the tools and signals to manage its own memory quality.
> **Dependency:** None — ships first, everything else builds on it.

### 1.1 Capacity Management with Hard Limits

**What:** Enforce configurable character limits per memory file. Display usage
metadata in the injected context header. Block writes that would exceed the cap.

**Limits:**

| File | Max chars | Rationale |
|------|-----------|-----------|
| `MEMORY.md` | 4,000 | ~1,000 tokens — forces tight curation of long-term facts |
| `USER.md` | 2,000 | ~500 tokens — user profile is bounded |
| `IDENTITY.md` | 2,000 | ~500 tokens — persona rarely changes |
| `SCRATCHPAD.md` | 2,000 | ~500 tokens — working memory, not archival |

**Behaviour:**

- On every `memory write`, check if the result would exceed the limit.
- If it would, return an error:
  ```
  Error: MEMORY.md would exceed capacity (4,312/4,000 chars).
  Current usage: 96%. Use `sero memory replace` or `sero memory remove`
  to free space before adding new content.
  ```
- The agent must consolidate, replace, or remove entries to make room.

**Injected header format:**
```markdown
## Memory

### MEMORY.md [87% — 3,480/4,000 chars] (last updated: 2026-03-30 14:22)
```

**Upgrade migration:** On first load after upgrade, if any file exceeds its
limit, run an automatic one-time LLM-powered consolidation (see §3.1) to bring
it under the cap. Log the action to the daily log. Preserve the original as
`MEMORY.md.pre-v2-backup`.

**Files changed:** `memory-manager.ts`, `memory-tool.ts`, `context-injector.ts`

### 1.2 Entry IDs + Replace & Remove Operations

**What:** Add stable entry IDs to structured memory entries and make `replace`
and `remove` operate on those IDs. Keep substring matching only as a temporary
migration fallback.

**Why:** The current write path prepends timestamp comments and permits freeform
multi-line blocks. ID-based edits are the only reliable surgical primitive once
`MEMORY.md` grows beyond a handful of entries.

**New actions:**

| Action | Parameters | Behaviour |
|--------|-----------|-----------|
| `replace` | `--target`, `--entry_id`, `--content` | Replace the exact entry block identified by `entry_id` |
| `remove` | `--target`, `--entry_id` | Remove the exact entry block identified by `entry_id` |
| `read` | `--target memory --with_ids` | Return entries with visible IDs so the agent can edit them precisely |

**Entry format (v2 structured entries):**
```markdown
§ [fact] Project uses PostgreSQL 17 with pgvector <!-- id: mem-a1b2 -->
§ [decision] Deploy target is Fly.io <!-- id: mem-c3d4 -->
§ [preference] User prefers Zustand over Redux <!-- id: mem-e5f6 -->
```

**Migration / normalisation:**
- On first v2 load, normalise `MEMORY.md` into one-entry-per-block structured
  form.
- Assign an ID to every migrated entry.
- Convert legacy per-append timestamp comments in `MEMORY.md`, `USER.md`, and
  `IDENTITY.md` into a single file-level `last updated` header. Daily logs
  remain freeform and keep per-entry timestamps.
- Preserve the original as `MEMORY.md.pre-v2-backup`.

**Fallback matching (migration window only):**
- `--old_text` remains available only for legacy entries that have not yet been
  normalised into structured blocks.
- Matching is against whole entries after normalisation, not arbitrary file
  substrings.
- **0 matches** → error: `"No entry match found for: '...'. Use \`sero memory read --with_ids\` to inspect entries."`
- **>1 matches** → error: `"Ambiguous legacy match: '...' matches N entries. Prefer \`--entry_id\`."`
- **1 match** → perform the operation, assign an ID if missing, report new usage %.

**Files changed:** `memory-tool.ts`, `memory-manager.ts`, new `migration.ts`

### 1.3 Duplicate Prevention

**What:** Guard against appending duplicate or near-duplicate content.

**On every `memory write` (append mode):**

1. **Exact duplicate check** — normalise (lowercase, strip whitespace/timestamps)
   and compare against all existing entries. Auto-reject exact matches:
   ```
   Error: This content already exists in MEMORY.md (line 12).
   Use `sero memory replace` if you want to update it.
   ```

2. **Near-duplicate warning** — if any existing entry shares >80% of tokens
   (bag-of-words Jaccard similarity), warn but allow:
   ```
   Warning: Similar content exists in MEMORY.md (line 8):
     "User prefers Zustand for state management"
   Consider using `sero memory replace` to update instead of duplicating.
   ```

**Implementation:** ~80 LOC utility in a new `memory-guards.ts`. Called from
`handleWrite()` in `memory-tool.ts`.

### 1.4 Memory Context Metadata Enrichment

**What:** Enrich injected memory headers with capacity, freshness, and
truncation signals so the agent can reason about its own memory state.

**Current header:**
```markdown
### MEMORY.md (long-term)
```

**New header:**
```markdown
### MEMORY.md [87% — 3,480/4,000 chars] (updated: 2026-03-30 14:22)
```

**Additional signals:**
- Truncation notice when content is cut: `_[middle-truncated: showing 1,600 of 3,480 chars]_`
- Per-file last-modified timestamp (from filesystem `mtime`)
- Entry count where applicable: `(14 entries)`

**Files changed:** `context-injector.ts`

---

## Phase 2: Retrieval & Recall (P1)

> **Theme:** Find the right memories faster and search things that were previously invisible.
> **Dependency:** Phase 1 (capacity metadata, entry delimiters)

### 2.1 Multi-Anchor Retrieval

**What:** Generate 2–3 query variants before QMD search and rank results by
cross-variant appearance. This is the single highest-impact retrieval
improvement from the Cortex analysis.

**Algorithm:**
```
Input: raw user prompt
  → Variant 1: extract keywords (strip stop words, keep nouns/verbs)
  → Variant 2: rephrase as a question ("What do I know about X?")
  → Variant 3: expand abbreviations / synonyms (TS→TypeScript, DB→database)

For each variant:
  → QMD keyword search (top 5, ~30ms each)

Score each result:
  → base_score = QMD relevance score
  → anchor_bonus = +0.3 per additional variant that returned this result
  → final_score = base_score + anchor_bonus

Return top 3 by final_score
```

**Variant generation:** Use a lightweight regex/heuristic approach (not LLM) to
keep latency under 5ms. The variants don't need to be perfect — even crude
rephrasings significantly improve recall when aggregated.

**Cost:** ~90ms total (3 × 30ms QMD searches) vs current ~30ms. Well within the
3s timeout. No LLM calls.

**Files changed:** `qmd.ts` (new `multiAnchorSearch()`), `context-injector.ts`

### 2.2 Speculative Retrieval Cache

**What:** Keep a session-local cache of prior-turn retrieval results and topic
fingerprints, but never use it as the sole source of turn `N+1` injection. The
current prompt always gets its own search.

**Why:** Reusing the previous turn's prompt as the next turn's retrieval query
produces stale injections on topic shifts, corrections, and session forks.

**Interface:**
```typescript
// New file: prefetch.ts

interface PrefetchCache {
  /** Store final ranked results used for a turn */
  prefetch(
    sessionId: string,
    prompt: string,
    results: RankedMemoryResult[],
    fingerprint: TopicFingerprint,
  ): void;

  /** Retrieve prior-turn cache (returns null on first turn / cache miss) */
  consume(sessionId: string): CachedRetrieval | null;

  /** Clear cache for a session */
  clear(sessionId: string): void;
}
```

**Lifecycle:**
1. `before_agent_start` — always run `multiAnchorSearch(currentPrompt)` as the
   authoritative retrieval path.
2. In parallel, call `consume(sessionId)`. If the cached topic fingerprint has
   meaningful overlap with the current prompt fingerprint (shared entities /
   Jaccard threshold), merge cached hits into the candidate set before final
   ranking. If overlap is weak, ignore the cache entirely.
3. On timeout or QMD miss, overlapping cached hits may be used as a fallback
   carry-over block labelled as previous-turn context.
4. `agent_end` — call `prefetch(sessionId, prompt, rankedResults, fingerprint)`
   to persist the final results actually used for the turn.
5. `session_shutdown` — call `clear(sessionId)`.

**Tradeoff:** This no longer promises zero-latency injection for every
follow-on turn. It preserves correctness on topic shifts while still helping
iterative conversations reuse obviously-related results instead of starting cold.

**Files changed:** New `prefetch.ts`, `context-injector.ts`, `index.ts` (hook
registration)

### 2.3 Session Transcript Search

**What:** Index past session transcripts into QMD so the agent can search
everything that was ever discussed — not just what it remembered to save.

**Pipeline:**
1. **On `session_shutdown`** (after exit summary): export the session transcript
   as a markdown file to `memory/sessions/<date>-<session-id-short>.md`.
2. **Format:** Human-readable markdown with speaker labels and timestamps:
   ```markdown
   # Session 2026-03-30 (abc123)

   <!-- source: transcript -->
   <!-- session-id: abc123 -->

   ## User (14:22)
   Can you set up auth with Clerk?

   ## Assistant (14:22)
   I'll integrate Clerk for authentication...
   ```
3. **QMD collection:** Add `memory/sessions/` to the existing `sero-memory`
   collection pattern. QMD indexes it automatically under a dedicated sessions
   path context, separate from `/memory/daily`.
4. **Source metadata:** Every transcript export carries `source: transcript`
   and `session-id` metadata so retrieval can group related artifacts.
5. **New tool:** `session_search` (or extend `memory_search` with a
   `--scope sessions` flag) for targeted conversation search.
6. **Retention:** Retain transcript exports indefinitely by default. Optional
   archival after 90 days moves files to `memory/sessions/archive/YYYY/MM/`,
   but archived files remain indexed. Deletion is opt-in only via explicit user
   configuration — the default must preserve "everything ever discussed."

**Deduplication / ranking:**
- Group hits by `session-id` before final injection.
- Keep at most one transcript hit and one daily-summary hit per session.
- If both transcript export and auto daily summary match the same session,
  prefer:
  - transcript for conversation-recall prompts (`discuss`, `said`,
    `conversation`, `last week`, `quote`)
  - daily summary for broad project-state prompts where a shorter recap is enough
- Apply a ranking penalty to duplicate source types from the same session so
  one long conversation cannot flood the top results.

**Backfill:** On first run after upgrade, offer to export existing `.jsonl`
sessions as markdown. Run as a background task with
progress logging to avoid blocking startup.

**Files changed:** `session-lifecycle.ts` (export pipeline), `qmd.ts`
(collection pattern update), new `session-search-tool.ts` or extended
`search-tool.ts`

### 2.4 Memory Security Scanning

**What:** Validate all memory writes against known threat patterns before
persisting.

**Blocked patterns:**
- **Prompt injection:** "ignore previous instructions", "system: you are now",
  "IMPORTANT: override", role-play injection phrases
- **Credential exfiltration:** `curl`/`wget` with `$ENV_VAR`, SSH key paths,
  API key patterns (`sk-`, `ghp_`, `AKIA`)
- **Invisible Unicode:** zero-width joiners (U+200D), zero-width spaces
  (U+200B), RTL overrides (U+202E), invisible separators

**Scanner outcomes:**
- **Block** — active prompt-injection directives intended as instructions,
  unredacted live credentials, invisible Unicode obfuscation
- **Sanitize + allow** — incident reports / forensics that contain risky
  strings as quoted evidence rather than instructions
- **Allow** — benign content

**Legitimate security-memory handling:**
- Prompt-injection incidents are allowed when stored as inert quoted evidence,
  fenced code, or tagged notes such as `#security-incident`.
- Credential forensics are allowed only in redacted form. If the input contains
  a live secret pattern, redact it before write (for example `ghp_abcd...wxyz`
  or `<redacted:openai:sha256:...>`).
- Raw live secrets are never persisted into injected memory, even if the user
  asks to save them.

**Behaviour:**
- On `block`, reject the write with a clear error:
```
Error: Memory write blocked — content matches a known security pattern
(prompt injection phrase detected). Review and rephrase the content.
```
- On `sanitize + allow`, persist the redacted / inert version and return a warning:
  ```
  Warning: Memory content contained forensic security material. Stored a
  redacted inert version instead of the raw text.
  ```

**Implementation:** ~100 LOC regex-based scanner in a new `memory-guards.ts`
(co-located with duplicate prevention from §1.3). Runs on the write path in
`memory-tool.ts` before any file I/O.

**Files changed:** `memory-guards.ts` (new), `memory-tool.ts`

---

## Phase 3: Memory Intelligence (P1–P2)

> **Theme:** Make memory smarter — typed, scored, and self-maintaining.
> **Dependency:** Phase 1 (capacity limits, entry delimiters), Phase 2 (multi-anchor search)

### 3.1 Memory Consolidation

**What:** Automated LLM-powered consolidation of stale daily logs into curated
MEMORY.md entries — Cortex's "dream cycle" adapted for Sero's markdown
architecture.

**Three triggers (combined for optimal coverage):**

| Trigger | When | Scope | Effort level |
|---------|------|-------|-------------|
| **Session start** | First prompt of a new session | Quick scan: daily logs older than 7 days not yet processed | `reasoning_effort: low` |
| **Cron job** | Weekly (via sero-cron-plugin) | Deep scan: all unprocessed logs, cross-cutting theme extraction | `reasoning_effort: medium` |
| **Manual** | `sero memory consolidate` | On-demand, user-scoped | `reasoning_effort: medium` |

**Algorithm (all triggers share this core):**

```
1. Identify unprocessed daily logs (no `<!-- consolidated -->` marker)
2. For each log (or batch of logs):
   a. Extract key facts, decisions, preferences, lessons not already in MEMORY.md
   b. Generate typed entries (see §3.2) with § delimiters and stable IDs
   c. Check against MEMORY.md for duplicates/contradictions
   d. If MEMORY.md has capacity: append new entries
   e. If at capacity: suggest replacements (merge old + new into tighter entries)
3. Mark processed logs with `<!-- consolidated: YYYY-MM-DD -->`
4. Re-index QMD
```

**Session-start variant** is lightweight: scan only, skip if no stale logs,
complete in <2s. Does NOT block the first turn — runs concurrently and results
appear on turn 2.

**Cron variant** is thorough: processes all unprocessed logs, discovers themes
across sessions ("user has been working on auth for 3 days — consolidate into
one project summary").

**LLM prompt (consolidation):**
```
Review these daily logs and extract durable facts worth remembering long-term.
For each fact, classify as: [fact], [decision], [preference], or [lesson].
Skip ephemeral details (specific commands run, transient errors).
Format each entry on its own line with a § prefix and type tag:
  § [decision] Switched from REST to tRPC for the API layer <!-- id: mem-... -->
  § [fact] Project uses pnpm workspaces with turbo for builds <!-- id: mem-... -->
```

**Files changed:** New `consolidation.ts`, `index.ts` (session_start hook),
cron job registration in `package.json` sero.app manifest

### 3.2 Typed Memory Entries

**What:** Add structured type tags to memory entries for priority-based
injection and smarter retrieval.

**Types:**

| Tag | Purpose | Injection priority | Example |
|-----|---------|-------------------|---------|
| `[fact]` | Verified information | Normal | `§ [fact] Project uses PostgreSQL 17 <!-- id: mem-... -->` |
| `[decision]` | Choices made and rationale | High (always inject) | `§ [decision] Chose Clerk over Auth.js for auth <!-- id: mem-... -->` |
| `[preference]` | User/project preferences | High | `§ [preference] User prefers explicit error handling over try/catch <!-- id: mem-... -->` |
| `[lesson]` | Things learned the hard way | Normal | `§ [lesson] node-pty needs rebuild after pnpm install <!-- id: mem-... -->` |
| `[question]` | Open questions / unknowns | High (surface proactively) | `§ [question] Should we add rate limiting before launch? <!-- id: mem-... -->` |
| `[hypothesis]` | Unverified beliefs | Low (deprioritise) | `§ [hypothesis] The auth bug might be a race condition <!-- id: mem-... -->` |

**Injection behaviour:**
- When truncating MEMORY.md for injection, preserve `[decision]`, `[preference]`,
  and `[question]` entries first (they're the most actionable).
- `[hypothesis]` entries are only injected if they match the QMD search query.
- Untagged entries (legacy content) are treated as `[fact]`.

**Adoption:** Tags are optional. The agent is instructed to use them for new
entries. The consolidation process (§3.1) adds tags automatically. Existing
untagged content continues to work.

**Memory tool updates:**
```
sero memory write --target memory --type decision --content "Chose Clerk for auth"
```
If `--type` is omitted, defaults to `[fact]`.

**Files changed:** `memory-tool.ts`, `context-injector.ts` (type-aware
truncation), `consolidation.ts`

### 3.3 Memory Strength & Recency Scoring

**What:** Score memory entries by access frequency and recency so injection
prioritises the most relevant content.

**Approach:** Simple `access_count × recency_decay` scoring — no FSRS
scheduling. This is the pragmatic choice: capacity limits (§1.1) force curation
of stale content, consolidation (§3.1) handles archival, and recency scoring
handles injection ranking. Together they cover what FSRS would solve, with far
less complexity.

**Metadata storage:** Sidecar JSON outside the git-tracked workspace:
`~/.sero-ui/state/memory/entry-stats.json`
```json
{
  "mem-a1b2": { "hits": 12, "last": "2026-03-30T14:22:00Z" },
  "mem-c3d4": { "hits": 3, "last": "2026-03-15T09:10:00Z" }
}
```

**Why sidecar:** Access stats are derived operational data, not durable
user-authored memory. Keeping them out of markdown avoids noisy git diffs and
checkpoint churn caused by normal reads and retrieval.

**Scoring formula:**
```typescript
function entryScore(hits: number, lastAccess: Date): number {
  const daysSince = (Date.now() - lastAccess.getTime()) / 86_400_000;
  const recency = Math.exp(-0.05 * daysSince); // half-life ≈ 14 days
  return hits * recency;
}
```

**When to update `hits`:**
- When an entry appears in QMD search results consumed by context injection
- When the agent reads MEMORY.md via the `memory read` tool
- Flush updates to the sidecar file with a short debounce
- NOT on every injection (would inflate scores for always-injected entries)

**Injection change:** When MEMORY.md exceeds the injection budget, sort entries
by `entryScore` descending before truncating. High-scoring entries survive;
low-scoring entries are the first to be cut.

**Files changed:** New `memory-scoring.ts`, `context-injector.ts`, new
`memory-state.ts`

---

## Phase 4: Advanced (P2–P3)

> **Theme:** Strategic improvements for power users and long-term quality.
> **Dependency:** Phases 1–3

### 4.1 Per-Workspace Memory Isolation

**What:** Scope QMD search and daily logs by active workspace so project A's
memories don't pollute project B's context.

**Scoping model:**
- **Global (default):** Current behaviour — single memory namespace.
- **Per-workspace:** Daily logs written to `memory/daily/<workspace-id>/`.
  MEMORY.md supports workspace-scoped sections:
  ```markdown
  ## Global
  § [fact] User is based in Sydney, Australia

  ## project:sero
  § [fact] Uses pnpm workspaces + turbo
  § [decision] Chose Electron with castlabs fork for Widevine
  ```
- **Per-repo:** Alias for per-workspace, keyed by git remote URL.

**Core identity files** (`IDENTITY.md`, `USER.md`) remain global always.

**QMD search** filters results by active workspace scope (pass workspace ID as
a path context filter). Global entries are always included.

**Configuration:** `sero memory config --scope per-workspace` (stored in
the memory plugin's config, not the memory files themselves).

### 4.2 Lightweight Graph via Tags & Links

**What:** Build a simple adjacency index from `#tags` and `[[wiki-links]]` in
memory entries to enable relationship-based retrieval.

**On every write:**
1. Extract `#tags` and `[[links]]` from the new entry.
2. Update a JSON adjacency index: `memory/.index/graph.json`
   ```json
   {
     "tags": { "auth": ["entry-3", "entry-7"], "postgres": ["entry-1"] },
     "links": { "Clerk": ["entry-3", "entry-5"] }
   }
   ```
3. New tool: `sero memory related --query "auth"` — returns entries sharing
   tags/links with the query, complementing QMD's semantic similarity.

**Context injection integration:** After QMD search returns results, optionally
expand with 1–2 graph-adjacent entries (entries that share tags with the search
results but weren't directly matched).

### 4.3 Belief Tracking with Confidence Scores

**What:** Allow the agent to express uncertainty about memories and evolve
beliefs over time.

**New type tag:** `[belief:0.8]` with a 0.0–1.0 confidence score:
```markdown
§ [belief:0.8] User prefers functional components over class components
§ [belief:0.4] The auth bug is a race condition in the session middleware
```

**Operations:**
- `sero memory believe --content "..." --confidence 0.8` — create a belief
- `sero memory validate --query "auth bug"` — boost confidence to 1.0 →
  converts to `[fact]`
- `sero memory invalidate --query "auth bug"` — set confidence to 0.0 →
  marks as `[invalidated]` (kept for history, never injected)

**Injection:** Beliefs with confidence < 0.5 are only injected if directly
relevant to the current query (matched by QMD search). Beliefs ≥ 0.5 are
treated like facts.

### 4.4 Frozen Snapshot for Prefix Cache Optimisation

**What:** Optional mode where identity + user + long-term memory are injected
once at session start as a frozen block. Only QMD search results vary per turn.

**Tradeoff:** Mid-session memory writes won't appear in the system prompt until
the next session. This is acceptable for users who prioritise response speed
(prefix caching gives ~50% TTFT reduction on long system prompts).

**Configuration:** `sero memory config --snapshot frozen|live` (default: `live`,
preserving current behaviour).

**Implementation:** Cache the Priority 1 + 4 blocks on `session_start`. On
`before_agent_start`, use cached blocks for those priorities and only
recompute Priority 2 (scratchpad) and Priority 3 (QMD search).

### 4.5 Contradiction Detection

**What:** Flag conflicting statements in memory when new entries are written.

**On `memory write`:**
1. Run QMD semantic search for the new entry against existing MEMORY.md.
2. For top-3 similar results, check if the new entry contradicts the existing
   one (simple heuristic: negation words, opposite adjectives, conflicting
   versions/numbers).
3. If contradiction detected, warn:
   ```
   Warning: New entry may contradict existing memory (line 14):
     Existing: "Project uses PostgreSQL 15"
     New:      "Project uses PostgreSQL 17"
   Use `sero memory replace` to update, or proceed if both are correct.
   ```

**Phase 2 enhancement:** Use a lightweight NLI (natural language inference)
model for higher-accuracy contradiction detection.

### 4.6 Epistemic Foraging ("Memory Wander")

**What:** Proactively surface forgotten or under-utilised knowledge.

**Tool:** `sero memory wander` — randomly sample entries from MEMORY.md and
older daily logs, weighted toward entries with low access counts and old
`last` timestamps (from §3.3 scoring metadata).

**Trigger options:**
- On session start (inject 1–2 "did you know?" entries)
- On explicit tool call
- On idle (if the agent has no pending work)

**Output format:**
```
🔮 Surfaced from memory (low recent access):
  § [lesson] Container rebuild needed after switching Node versions (noted 2026-02-15)
  § [question] Should we add rate limiting before launch? (open since 2026-03-01)
```

---

## Implementation Plan

### Phase 1: Memory Curation & Quality (P0)

| # | Task | Files | Effort |
|---|------|-------|--------|
| 1.1a | Add capacity constants + limit checking to memory-manager | `memory-manager.ts` | S |
| 1.1b | Enforce limits in memory-tool write handler | `memory-tool.ts` | S |
| 1.1c | Add usage % + timestamp to injected headers | `context-injector.ts` | S |
| 1.1d | Auto-consolidation on upgrade (migration) | New `migration.ts` | M |
| 1.2a | Add entry-ID parsing + exact block replace/remove helpers | `memory-manager.ts` | S |
| 1.2b | Register `replace` / `remove` actions with `--entry_id` support | `memory-tool.ts` | S |
| 1.2c | Update system prompt instructions for new operations | `context-injector.ts` | S |
| 1.3 | Duplicate prevention (exact + near-duplicate) | New `memory-guards.ts`, `memory-tool.ts` | M |
| 1.4 | Metadata enrichment (entry counts, truncation notices) | `context-injector.ts` | S |

**Estimated effort:** ~3–4 days

### Phase 2: Retrieval & Recall (P1)

| # | Task | Files | Effort |
|---|------|-------|--------|
| 2.1 | Multi-anchor retrieval (query variants + ranking) | `qmd.ts` | M |
| 2.2 | Speculative retrieval cache with current-prompt search | New `prefetch.ts`, `context-injector.ts`, `index.ts` | M |
| 2.3a | Session transcript export on shutdown | `session-lifecycle.ts` | M |
| 2.3b | QMD collection + archive path contexts for sessions | `qmd.ts` | S |
| 2.3c | Session search tool / scope flag + per-session dedupe | `search-tool.ts` or new `session-search-tool.ts` | M |
| 2.3d | Backfill existing sessions (background) | New `session-backfill.ts` | M |
| 2.4 | Memory security scanning | `memory-guards.ts`, `memory-tool.ts` | S |

**Estimated effort:** ~5–7 days

### Phase 3: Memory Intelligence (P1–P2)

| # | Task | Files | Effort |
|---|------|-------|--------|
| 3.1a | Consolidation core (LLM-powered log → MEMORY.md) | New `consolidation.ts` | L |
| 3.1b | Session-start trigger (lightweight scan) | `index.ts` | S |
| 3.1c | Cron job registration | `package.json` manifest, cron config | S |
| 3.2a | Type tag parsing + writing | `memory-tool.ts`, `memory-manager.ts` | M |
| 3.2b | Type-aware truncation in injection | `context-injector.ts` | M |
| 3.3a | Sidecar scoring state (entry IDs + debounced flush) | New `memory-scoring.ts`, new `memory-state.ts` | M |
| 3.3b | Score-based injection ranking | `context-injector.ts` | S |

**Estimated effort:** ~5–7 days

### Phase 4: Advanced (P2–P3)

| # | Task | Files | Effort |
|---|------|-------|--------|
| 4.1 | Per-workspace memory isolation | Multiple files | L |
| 4.2 | Lightweight graph index | New `graph-index.ts`, `memory-tool.ts` | M |
| 4.3 | Belief tracking | `memory-tool.ts`, `context-injector.ts` | M |
| 4.4 | Frozen snapshot mode | `context-injector.ts` | M |
| 4.5 | Contradiction detection | `memory-guards.ts`, `qmd.ts` | M |
| 4.6 | Epistemic foraging | New `wander.ts` | S |

**Estimated effort:** ~7–10 days

---

## Updated Memory File Format (Post-v2)

```markdown
<!-- last updated: 2026-03-30 14:22 -->
<!-- v2 format: typed entries with § delimiters -->

# Memory

## Technical Facts
§ [fact] Project uses pnpm workspaces + turbo for builds <!-- id: mem-1a2b -->
§ [fact] PostgreSQL 17 with pgvector extension <!-- id: mem-3c4d -->
§ [fact] Deploy target: Fly.io, 2 regions (SYD, NRT) <!-- id: mem-5e6f -->

## Decisions
§ [decision] Chose Clerk over Auth.js — better DX, hosted dashboard <!-- id: mem-7g8h -->
§ [decision] Switched from REST to tRPC for internal API <!-- id: mem-9i0j -->

## Preferences
§ [preference] User prefers Zustand over Redux <!-- id: mem-1k2l -->
§ [preference] Explicit error handling, no silent catches <!-- id: mem-3m4n -->

## Lessons
§ [lesson] node-pty needs rebuild after pnpm install <!-- id: mem-5o6p -->
§ [lesson] Container DNS fails if VPN is active <!-- id: mem-7q8r -->

## Open Questions
§ [question] Rate limiting strategy before launch? <!-- id: mem-9s0t -->

## Beliefs
§ [belief:0.7] Users will want per-project memory scoping <!-- id: mem-1u2v -->
```

**Backwards compatibility:** Legacy untagged entries (no `§` prefix, no
`[type]` tag) are treated as `[fact]` during the one-time v2 normalisation
migration. Existing `MEMORY.md` files remain valid inputs, but v2 rewrites them
into structured entries with IDs so later edits and scoring are reliable.

**Derived state example (not stored in MEMORY.md):**
```json
{
  "mem-1a2b": { "hits": 8, "last": "2026-03-30T14:22:00Z" },
  "mem-7g8h": { "hits": 12, "last": "2026-03-30T14:25:00Z" }
}
```

---

## Updated System Prompt Instructions (Post-v2)

```
## Memory System

All memory files live in `~/.sero-ui/workspaces/global/`.

Commands:
- `sero memory read --target memory|identity|user|daily`
- `sero memory write --target memory|daily|user --content "..." [--type fact|decision|preference|lesson|question|hypothesis]`
- `sero memory replace --target memory --entry_id "mem-..." --content "..."`
- `sero memory remove --target memory --entry_id "mem-..."`
- `sero memory search --query "..."`
- `sero memory consolidate` — consolidate stale daily logs into MEMORY.md
- `sero memory_search --query "..." [--mode keyword|semantic|deep] [--scope memory|sessions|all]`
- `sero scratchpad add|done "..."`

Memory curation rules:
- Check capacity before writing. If near limit, replace or consolidate first.
- Use type tags: [fact], [decision], [preference], [lesson], [question], [hypothesis]
- Prefer `--entry_id` for edits; read with IDs before replacing or removing
- Prefix entries with § and preserve their ID comment for clean targeting
- Search before writing — update existing entries, don't duplicate
- Save proactively: preferences, decisions, corrections, project structure
- Daily logs are for session-specific progress; durable facts go to memory
```

---

## What This Spec Explicitly Excludes

| Excluded | Rationale |
|----------|-----------|
| **Honcho / cloud memory** | Local-first, git-trackable design is a feature. Cross-device sync can be solved by git. |
| **Full GNN / spreading activation** | Graph database complexity far exceeds value for a markdown-based system. Lightweight tags/links (§4.2) get 80% of the benefit. |
| **FSRS spaced repetition** | Capacity limits + consolidation + simple recency scoring cover the same ground with far less complexity. |
| **Prediction error signals** | Interesting cognitive science but no clear UX benefit for a desktop agent. |
| **AI self-representation (dual-peer)** | IDENTITY.md already serves this role. Separate agent modeling adds complexity without clear user value. |

---

## Success Metrics

| Metric | Current | Target (Phase 1+2) | How to measure |
|--------|---------|-------------------|----------------|
| Memory recall (relevant context injected) | ~60% (single-shot search) | ~85% (multi-anchor + sessions) | Manual eval: sample 20 prompts, check if relevant memory was injected |
| Stale/duplicate entries in MEMORY.md | Unbounded growth | <5% duplicates, 0 stale after consolidation | Periodic audit of memory files |
| Context injection latency | ~30ms (sync, turn 1+N) | ~30ms turn 1, lower p50 on iterative turns via speculative cache without correctness loss | Measure `before_agent_start` hook duration and iterative-turn p50 |
| Memory file quality | Flat text, no structure | >80% typed entries after 2 weeks | Count `§ [type]` entries vs untagged |
| Security incidents | No scanning | 0 injected threats | Count blocked writes in logs |
