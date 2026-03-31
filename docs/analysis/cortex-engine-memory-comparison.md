# Cortex Engine vs Sero — Memory System Comparison

> **Date:** 2026-03-26
> **Purpose:** Compare Cortex Engine's memory architecture against Sero's memory system and identify improvements we can adopt.

## Reference Documentation

### Sero (internal)
- [docs/memory.md](../memory.md) — Sero memory system architecture
- [docs/qmd-semantic-memory-spec.md](../qmd-semantic-memory-spec.md) — QMD semantic search spec
- [docs/memory-integration-analysis.md](../memory-integration-analysis.md) — Original integration analysis

### Cortex Engine (external)
- [README](https://github.com/Fozikio/cortex-engine/blob/9e4bcfee2764e8c95a596589a6973a7bc94a8d3f/README.md)
- [Architecture](https://github.com/Fozikio/cortex-engine/wiki/Architecture)
- [Quick Start](https://github.com/Fozikio/cortex-engine/wiki/Quick-Start)
- [Cognitive Architecture](https://github.com/Fozikio/cortex-engine/wiki/Cognitive-Architecture)
- [Configuration](https://github.com/Fozikio/cortex-engine/wiki/Configuration)
- [Installation](https://github.com/Fozikio/cortex-engine/wiki/Installation)
- [Plugin Authoring](https://github.com/Fozikio/cortex-engine/wiki/Plugin-Authoring)
- [Tool Reference](https://github.com/Fozikio/cortex-engine/wiki/Tool-Reference)

---

## What Sero Does Well Today

- Markdown-based storage (human-readable, git-trackable)
- Priority-ordered context injection with budget management (8K chars)
- Proactive memory saving via system prompt instructions
- Activity observer for auto-logging significant work per turn
- Session lifecycle handling (compaction handoff, exit summaries)
- QMD semantic search with graceful degradation (keyword, semantic, deep modes)
- Scratchpad for persistent working memory
- Memory context visibility in the UI (users can inspect what the agent sees)

## Where Cortex Engine Pulls Ahead

Cortex Engine implements a neuroscience-grounded cognitive architecture with graph-based memory, biological consolidation, and sophisticated retrieval. Key differentiators:

- **Graph-based memory** with typed edges and spreading activation retrieval
- **Memory strength & decay** using FSRS-6 spaced repetition scheduling
- **Two-phase consolidation** (NREM compression + REM integration) mirroring biological sleep
- **Belief tracking** with 0.0-1.0 confidence scores that evolve with evidence
- **Contradiction detection** via NLI (natural language inference)
- **Multi-anchor retrieval** generating query rephrasings for broader recall
- **Epistemic foraging** for uncertainty-driven memory exploration
- **Structured observation types** (observe, wonder, speculate, reflect, believe)
- **Prediction error signals** (novelty PE + forward PE) driving consolidation

---

## Recommendations

### 1. Multi-Anchor Retrieval

| | |
|---|---|
| **Effort** | Low |
| **Impact** | High |
| **Priority** | **P0** |

**Cortex has it:** Generates 3 rephrasings of the query, runs parallel retrievals, and ranks memories appearing across multiple formulations highest.

**Sero gap:** Selective injection searches with the raw user prompt only (keyword mode, top 3). Single-shot retrieval misses memories that would match a rephrased query.

**Implementation:** Before context injection, generate 2-3 query variants (extract keywords, rephrase as question, expand abbreviations). Run QMD search for each variant. Rank results by how many variants they appear in. This is cheap — QMD keyword search is ~30ms per query.

---

### 2. Memory Strength & Decay (FSRS Scheduling)

| | |
|---|---|
| **Effort** | Medium |
| **Impact** | High |
| **Priority** | **P0** |

**Cortex has it:** Every memory has a strength score that strengthens on access and decays over time using FSRS-6 (spaced repetition). A `surface` tool shows memories due for review.

**Sero gap:** All memories are equal weight. A fact from 6 months ago has the same injection priority as one from yesterday.

**Implementation:** Add a lightweight access-count + last-accessed timestamp to memory entries. Use recency-weighted scoring during context injection so frequently-referenced and recent memories rank higher. No need for full FSRS — a simple `score = access_count * recency_decay_factor` would be a big win.

---

### 3. Memory Consolidation ("Dream" Cycle)

| | |
|---|---|
| **Effort** | Medium |
| **Impact** | High |
| **Priority** | **P1** |

**Cortex has it:** A two-phase consolidation process: NREM (cluster observations, refine definitions, promote orphans) and REM (discover connections, apply spaced repetition, synthesize cross-domain patterns). Runs periodically via `dream` tool.

**Sero gap:** Daily logs accumulate forever. MEMORY.md grows until it hits the budget cap and gets middle-truncated. There's no automatic synthesis or compression of old memories.

**Implementation:** Add a periodic consolidation job (could be a cron extension task or on session start):
1. Scan daily logs older than N days
2. Use an LLM call (`reasoning_effort: low`) to extract key facts/decisions not already in MEMORY.md
3. Append distilled entries to MEMORY.md
4. Optionally archive/compress old daily logs

This extends the existing exit-summary pattern to work retroactively across accumulated logs.

---

### 4. Structured Observation Types

| | |
|---|---|
| **Effort** | Low |
| **Impact** | Medium |
| **Priority** | **P1** |

**Cortex has it:** Distinct tools for different memory types: `observe` (facts), `wonder` (questions), `speculate` (hypotheses), `reflect` (synthesis). Each is stored and retrieved differently.

**Sero gap:** Everything goes into MEMORY.md as flat text. Questions, facts, hypotheses, and reflections are all mixed together.

**Implementation:** Add lightweight type prefixes to memory entries: `[fact]`, `[question]`, `[hypothesis]`, `[decision]`. The memory tool could support `--type fact|question|hypothesis|decision`. Context injection could then prioritize by type (e.g., always include open questions, deprioritize resolved hypotheses).

---

### 5. Lightweight Graph via Tags/Links

| | |
|---|---|
| **Effort** | Medium |
| **Impact** | Medium |
| **Priority** | **P2** |

**Cortex has it:** Memories are nodes in a knowledge graph with typed edges. Retrieval uses spreading activation and GNN neighborhood aggregation. A `neighbors` tool lets you explore connections.

**Sero gap:** Memories are flat text files. The only structure is file-level (MEMORY.md vs daily logs). No explicit relationships between facts.

**Implementation (lightweight version):** Rather than building a full graph database, leverage the existing `#tags` and `[[wiki-links]]` system more aggressively:
1. Auto-extract tags/links from memory entries during writes
2. Build a simple adjacency index (tag -> entries, link -> entries) stored as JSON
3. Add a `sero memory related --query "..."` tool that finds entries sharing tags/links
4. Use this during context injection to pull in related context beyond pure semantic similarity

Gets 80% of the graph value without the graph database complexity.

---

### 6. Belief Tracking with Confidence Scores

| | |
|---|---|
| **Effort** | Medium |
| **Impact** | Medium |
| **Priority** | **P2** |

**Cortex has it:** Beliefs are stored with 0.0-1.0 confidence scores. They strengthen when supported by evidence, weaken through contradiction, and can be explicitly validated or invalidated.

**Sero gap:** MEMORY.md is flat text. There's no way to express "I think X but I'm not sure" vs "X is confirmed." Outdated beliefs persist indefinitely.

**Implementation:** Add a `beliefs` section to MEMORY.md (or a separate `BELIEFS.md`) with structured entries: `- [0.8] User prefers Zustand over Redux`. The memory tool could support `sero memory believe --content "..." --confidence 0.8` and `sero memory validate/invalidate --query "..."` to update confidence. Low-confidence beliefs get deprioritized during injection.

---

### 7. Contradiction Detection

| | |
|---|---|
| **Effort** | High |
| **Impact** | Medium |
| **Priority** | **P3** |

**Cortex has it:** A `contradict` tool uses NLI (natural language inference) to detect conflicting statements in memory, plus a `resolve` tool to reconcile them.

**Sero gap:** The system prompt says "update, don't duplicate" but there's no automated detection. Contradictory facts can coexist silently in MEMORY.md.

**Implementation:** During context injection or on memory write, run a lightweight similarity check against existing entries. If a new entry is semantically similar but contradictory to an existing one, flag it to the agent (or user) for resolution. QMD's semantic search already provides the similarity backbone — add an NLI check on top-N similar results.

---

### 8. Epistemic Foraging

| | |
|---|---|
| **Effort** | Low |
| **Impact** | Low-Medium |
| **Priority** | **P3** |

**Cortex has it:** A `wander` tool does information-gain-weighted random walks through memory, surfacing under-explored, low-confidence, goal-adjacent, and stale knowledge.

**Sero gap:** Memory retrieval is purely reactive (responds to the current prompt). There's no mechanism to proactively surface forgotten or under-utilized knowledge.

**Implementation:** Add a `sero memory wander` tool that randomly samples entries from MEMORY.md and older daily logs, weighted toward entries that haven't been accessed recently. Could be triggered at session start or periodically. Surfaces "did you know you noted X three weeks ago?" style reminders.

---

## Priority Summary

| # | Recommendation | Effort | Impact | Priority |
|---|---------------|--------|--------|----------|
| 1 | Multi-anchor retrieval | Low | High | **P0** |
| 2 | Memory strength & decay | Medium | High | **P0** |
| 3 | Memory consolidation | Medium | High | **P1** |
| 4 | Structured observation types | Low | Medium | **P1** |
| 5 | Lightweight graph via tags/links | Medium | Medium | **P2** |
| 6 | Belief tracking with confidence | Medium | Medium | **P2** |
| 7 | Contradiction detection | High | Medium | **P3** |
| 8 | Epistemic foraging | Low | Low-Med | **P3** |

## What to Skip

- **Full GNN / spreading activation** — Cortex's graph neural network retrieval requires a graph database and embedding infrastructure far beyond Sero's markdown-first approach. The lightweight tag/link graph (Rec 5) gets most of the value.
- **Firestore / cloud memory** — Sero's local-first, git-tracked approach is a feature, not a limitation. Users own their data.
- **Prediction error / surprise signals** — Interesting cognitive science but adds complexity without clear UX benefit for a desktop agent.
