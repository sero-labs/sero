# Context Bloat Reduction — Analysis & Plan

**Date:** 2026-04-03
**Source:** `~/.sero-ui/profiles/dantestprofile/debug/turn_context.json`

---

## 1. Current State

A minimal "tell me a joke" turn sends **~14,450 chars of system prompt** and
**~11,930 chars of tool definitions** before a single user message.

### 1.1 System Prompt Breakdown

| Section | Chars | Source |
|---|---:|---|
| Pi base prompt | 2,535 | Pi SDK default |
| AGENTS.md (global workspace) | 3,228 | `~/.sero-ui/.../workspaces/global/AGENTS.md` |
| Memory snapshot (IDENTITY + USER + MEMORY) | 2,410 | `context-injector.ts` → `buildPriorityContext()` |
| Memory instructions | 3,462 | `memory-instructions.ts` → `getMemoryInstructions()` |
| CLI prompt block | 2,068 | `cli/index.ts` → `buildCliPromptBlock()` |
| Subagents block | 747 | `create-sero-extension.ts` → `buildSubagentPromptBlock()` |
| **Total system prompt** | **14,450** | |

### 1.2 Tool Definition Breakdown

| Tool | Chars | Bridged? | Why standalone |
|---|---:|---|---|
| **kanban** | 3,405 | ❌ `NEVER_BRIDGE` | "nested structured params" |
| **subagent** | 1,765 | ❌ standalone | AD-021 exception |
| **questionnaire** | 1,492 | ❌ `NEVER_BRIDGE` | "user input, no CLI timeout" |
| **interview** | 994 | ❌ `NEVER_BRIDGE` | "user input, no CLI timeout" |
| **question** | 892 | ❌ `NEVER_BRIDGE` | "user input, no CLI timeout" |
| **create_agent** | 678 | ❌ `NEVER_BRIDGE` | listed alongside kanban |
| read | 689 | n/a | core explorer tool |
| edit | 557 | n/a | core explorer tool |
| sero-cli | 503 | n/a | the bridge itself |
| bash | 496 | n/a | core explorer tool |
| write | 437 | n/a | core explorer tool |
| **Total** | **11,930** | | |
| *Unbridged non-core* | *9,226* | | *78% of tool context* |

### 1.3 Message-Level Duplication

The memory snapshot (IDENTITY + USER + MEMORY) is sent **three ways simultaneously**:

1. **In the system prompt** — injected by `context-injector.ts` `before_agent_start`
2. **As `memory-context` custom messages** — sent by `pi.sendMessage()` in the same handler
3. **Repeated per turn** — a new `memory-context` message is injected before each user turn

In the analysed session (3 user turns), 3 identical 2,408-char `memory-context`
messages appear in the message history, each a full duplicate of content already
in the system prompt. That's **~7,224 chars of pure waste** in the messages array.

---

## 2. Problem 1 — System Prompt Duplication

Memory-related instructions are stated **across four independent sources**, each
injecting into the system prompt with no coordination:

### Source Map

| Source | What it says | Chars |
|---|---|---:|
| **AGENTS.md** (global workspace) | "Memory Habits" — managed files, when to use each tool, save/don't-save guidelines, retrieval/writing habits | 3,228 |
| **Memory instructions** (`memory-instructions.ts`) | "Memory System" — managed files, retrieval instructions, storage instructions, exact CLI syntax | 3,462 |
| **CLI prompt block** (`buildCliPromptBlock`) | "High-priority routing" — use memory tools, search-first rule, never use bash on managed files | ~400 |
| **Container prompt** (`system-prompt.ts`) | "Cross-workspace access" exception — use memory tools not bash for memory files | ~340 |

### Specific Duplications Found

| Concept | Occurrences | Locations |
|---|---:|---|
| "Never use bash/read/write/edit on memory files" | 4× | AGENTS.md, memory-instructions.ts, CLI block, container prompt |
| "Use `memory_search` for past conversations" | 5× | AGENTS.md (2×), memory-instructions.ts (2×), CLI block |
| "Start with one precise search query" | 3× | AGENTS.md, memory-instructions.ts, CLI block |
| Managed file list (MEMORY.md, IDENTITY.md, etc.) | 5× | AGENTS.md, memory-instructions.ts (2×), CLI block, container prompt |
| "Direct file access bypasses IDs/timestamps..." | 2× | memory-instructions.ts, container prompt |
| When to save to memory vs daily | 2× | AGENTS.md, memory-instructions.ts (implied via guidelines) |

### Root Cause

These four sources were written at different times and have no mechanism to
detect or prevent overlap:

- **AGENTS.md** was written first as a workspace-level instruction file
- **memory-instructions.ts** was added later as the "canonical" memory guide
- **CLI prompt block** added routing rules independently when the CLI bridge was built
- **Container prompt** added its own memory exception within the cross-workspace section

Each author assumed the LLM needed reminding. The result is ~3,000 chars of
pure duplication.

---

## 3. Problem 2 — Unbridged Tool Schemas

Six tools remain standalone (outside `sero-cli`) consuming **9,226 chars** of
tool definitions. The original `NEVER_BRIDGE_TO_CLI` rationale was:

> Tools that either require nested structured params that are awkward/error-prone
> in shell syntax, or wait on interactive user input and therefore must not
> inherit the CLI's per-command timeout behavior.

### Per-Tool Analysis

| Tool | Chars | Real Blocker | Can Bridge? |
|---|---:|---|---|
| **kanban** | 3,405 | Has arrays (`blockedBy`, `acceptance`, `filePaths`) and enums — but all params are simple strings/arrays, not deeply nested. The schema bridge already handles `Type.Array(Type.String())` via JSON parsing. | ✅ Yes — arrays of strings work fine with `--param '["a","b"]'` |
| **question** | 892 | Waits on user input (indefinite). Options array has nested objects. | ⚠️ Timeout is the real issue, not schema complexity |
| **questionnaire** | 1,492 | Waits on user input. Deeply nested: array of question objects, each with array of option objects. | ⚠️ Timeout + genuinely complex nesting |
| **interview** | 994 | Waits on user input. Array of `{id, prompt}` objects. | ⚠️ Timeout is the real issue |
| **create_agent** | 678 | All flat string params. No user input wait. No complex nesting. | ✅ Yes — should have been bridged already |
| **subagent** | 1,765 | AD-021 exception. Has nested task arrays with per-task model overrides. | ❌ Intentional — structured params essential for orchestration |

### The Two Distinct Blockers

1. **Schema complexity** — the CLI bridge converts TypeBox schemas to
   positional args + `--flags`. Arrays/objects are passed as JSON strings and
   auto-parsed. This already works for tools like `memory` and `kanban`. The
   only tools where this genuinely breaks are those with **arrays of objects
   with heterogeneous fields** (questionnaire options, subagent task arrays).

2. **Timeout incompatibility** — `question`, `questionnaire`, and `interview`
   block indefinitely waiting for user input. The CLI bridge enforces a 30s
   per-command timeout. Bridging these tools would cause them to time out
   before the user could respond.

### What Can Be Done

**Bridgeable now (no code changes to bridge infrastructure):**
- `kanban` — all params are flat strings, string enums, or `string[]`. The
  schema bridge handles these correctly. Move from `NEVER_BRIDGE` to
  `CORE_TOOLS_TO_BRIDGE`.
- `create_agent` — all flat string params. Trivially bridgeable.

**Savings:** ~4,083 chars removed from tool definitions.

**Bridgeable with timeout exemption:**
- `question`, `questionnaire`, `interview` — these could be bridged if the CLI
  bridge supported a **timeout exemption** for user-interactive tools. The
  schema bridge can handle the parameter shapes (the nested options are passed
  as JSON). The blocker is purely the 30s per-command timeout.

  **Proposed solution:** Add an `interactive: true` flag to `CliCommand` that
  disables the per-command timeout (like `source: 'terminal'` already does).
  This preserves the bridge's rate limiting and output truncation while
  allowing indefinite-wait tools.

  However, the nested object arrays in `questionnaire` options would need the
  LLM to construct valid JSON strings in the CLI command. This is more
  error-prone than structured tool parameters. For these three tools,
  **keeping them standalone is the pragmatic choice** — they're user-facing
  UX tools where parameter correctness matters more than context savings.

**Cannot bridge:**
- `subagent` — intentional AD-021 exception. Nested task arrays with per-task
  model/thinking overrides are essential for orchestration quality.

### CLI Prompt Block — Missing Command Summaries

The current `buildCliPromptBlock()` output lists commands grouped but gives
**no summaries** — just bare names:

```
Commands by group:
- App Commands: context, git, google-account, interview, kanban, memory-log
- Apps: code_search, context_checkout, context_log, ...
```

This forces the LLM to call `sero help <command>` on every turn to discover
what a command does, wasting a tool call. Adding a one-line summary per
command would let the LLM route correctly on the first attempt.

---

## 4. Problem 3 — Memory Context Message Duplication

The `context-injector.ts` `before_agent_start` handler both:
1. Appends the memory snapshot to the **system prompt** (via `return { systemPrompt }`)
2. Sends it as a **`memory-context` custom message** (via `pi.sendMessage()`)

The code comment says:
> Non-fatal — the same content is already injected into the system prompt.

This is intentional redundancy (system prompt for reliability, message for
conversation-level visibility), but it means the LLM sees the same ~2,400
chars twice per turn — and the messages accumulate. In a 3-turn conversation,
there are 3 `memory-context` messages (7,224 chars total) that are all
identical to the system prompt content.

---

## 5. Proposed Solutions

### 5.1 Deduplicate Memory Instructions (System Prompt)

**Approach:** Establish a single source of truth for each memory concept.
Remove duplication by assigning ownership:

| Concept | Single Owner | Remove From |
|---|---|---|
| Full memory tool syntax + guidelines | `memory-instructions.ts` | AGENTS.md, CLI block, container prompt |
| "Use memory tools, not bash" | `memory-instructions.ts` (one sentence) | AGENTS.md, CLI block, container prompt |
| "Use memory_search for recall" | `memory-instructions.ts` | AGENTS.md, CLI block |
| Managed file list | `memory-instructions.ts` | AGENTS.md, CLI block, container prompt |
| When to save (memory vs daily) | `memory-instructions.ts` | AGENTS.md |
| Retrieval/writing habits | `memory-instructions.ts` | AGENTS.md |

**Changes:**

1. **`AGENTS.md` (global workspace)** — Strip the entire "Memory Habits"
   section. Replace with a 1-line pointer:
   ```
   Memory tools and habits are documented in the system prompt's Memory System
   section. Always use `sero memory`, `sero memory_search`, or `sero scratchpad`
   — never bash/read/write/edit on managed files.
   ```
   _Note: AGENTS.md is user-editable per-workspace. The memory plugin should
   detect whether the workspace AGENTS.md contains memory instructions and skip
   injecting if it finds them, OR better — the AGENTS.md template for new
   workspaces should reference the system section instead of duplicating it._

2. **`buildCliPromptBlock()`** — Remove the "High-priority routing" memory
   subsection entirely. Memory routing is the memory plugin's responsibility.
   Keep only the one line about `question`/`questionnaire`/`interview` being
   standalone tools (but move it to a "Notes" section).

3. **`buildContainerPromptBlock()`** — Shorten the cross-workspace memory
   exception from 4 lines to 1 line referencing the Memory System section:
   ```
   - **Memory files** — always use `sero memory`/`memory_search`/`scratchpad`
     commands (see Memory System section above), never direct file access.
   ```

4. **`memory-instructions.ts`** — This becomes the canonical single source.
   Tighten the text to remove redundancy within the file itself (the
   "retrieving" and "storing" sections repeat some concepts). Target: reduce
   from 3,462 to ~2,200 chars.

**Estimated savings:** ~3,000 chars removed from system prompt.

### 5.2 Bridge `kanban` and `create_agent` into sero-cli

**Changes:**

1. Remove `kanban` and `create_agent` from `NEVER_BRIDGE_TO_CLI` in
   `electron/cli/index.ts`.

2. For `kanban`: add to `CORE_TOOLS_TO_BRIDGE` or let the plugin manifest
   `bridgeTools: true` handle it. The schema bridge already handles all its
   parameter types (strings, string enums, `Type.Array(Type.String())`).

3. For `create_agent`: already uses all flat string params. Add to
   `CORE_TOOLS_TO_BRIDGE`.

4. Update the `kanban` tool description to be more concise — the current
   3,405 chars include verbose per-action documentation that belongs in
   `sero help kanban`, not in every LLM turn.

**Estimated savings:** ~4,083 chars removed from tool definitions.

### 5.3 Add Summaries to CLI Prompt Block

**Change:** Modify `buildCliPromptBlock()` to include each command's
`summary` field (already available on every `CliCommand`) alongside its name.

Current:
```
- Apps: code_search, context_checkout, context_log, cron, ...
```

Proposed:
```
- Apps:
  code_search — Search code across the workspace
  context_checkout — Restore a tagged context snapshot
  context_log — View context tag history
  cron — Manage scheduled jobs
  ...
```

This adds ~1,000 chars but saves the LLM from needing `sero help` calls,
which is a net win in practice (each `sero help` call costs a full tool
round-trip plus the help output in the response).

**Trade-off:** The CLI block grows from ~2,068 to ~3,000 chars, but total
system prompt still shrinks due to deduplication savings from 5.1.

### 5.4 Split Context Injection + Auto-Retrieve

The old code sent the entire `buildPriorityContext()` output (static memory +
QMD search results) in both the system prompt AND as a `memory-context`
message — full duplication.

**New approach — split injection:**

| Content | Destination | When |
|---|---|---|
| Static memory (IDENTITY, USER, SCRATCHPAD, MEMORY.md) | System prompt | Every turn |
| Memory instructions (retrieval/storage commands) | System prompt | Every turn |
| QMD search results (prompt-specific) | Per-turn `memory-search-context` message | Only when auto-retrieve is on AND results found |

**Changes:**
- `buildPriorityContextSplit()` returns `{ staticContext, searchContext }`
  separately instead of combining them
- `context-injector.ts` appends `staticContext + instructions` to system
  prompt, sends `searchContext` as a message (type `memory-search-context`)
- `context` event filter strips prior-turn search messages so only the latest
  reaches the LLM
- New `auto_retrieve` config: `sero memory config --auto_retrieve on|off`
  (default: on). Agent can disable when search results are unhelpful.
- `buildPriorityContext()` preserved as a compatibility wrapper that combines both parts

**Savings vs old approach:**
- Static memory no longer duplicated in messages (~2,400 chars/turn removed)
- Search results are only sent as a message (not also in system prompt), eliminating the
  remaining duplication
- When QMD has no results or auto-retrieve is off, zero message overhead

### 5.5 Keep `question`/`questionnaire`/`interview`/`subagent` Standalone

These tools should remain standalone (not bridged) for different reasons:

- **question/questionnaire/interview** — User-interactive tools that wait
  indefinitely. The CLI timeout model is incompatible. Additionally,
  `questionnaire` has genuinely complex nested parameters (arrays of objects
  with nested option arrays) that would be error-prone as JSON strings in CLI
  syntax. The cost is 3,378 chars — acceptable for tools that the LLM needs
  precise control over.

- **subagent** — Intentional AD-021 exception. Structured nested parameters
  are essential for orchestration quality. 1,765 chars is acceptable.

---

## 6. Impact Summary

| Change | System Prompt | Tool Defs | Messages/Turn |
|---|---:|---:|---:|
| 5.1 Deduplicate memory instructions | **−3,000** | — | — |
| 5.2 Bridge kanban + create_agent | — | **−4,083** | — |
| 5.3 Add CLI command summaries | +1,000 | — | — |
| 5.4 Remove duplicate memory messages | — | — | **−2,400** |
| **Net change** | **−2,000** | **−4,083** | **−2,400/turn** |

**Before:** 14,450 (system) + 11,930 (tools) + 2,400×N (messages) = ~28,780+ chars on turn 1
**After:** ~12,450 (system) + 7,847 (tools) + 0 (messages) = ~20,297 chars on turn 1

**~30% reduction in per-turn context overhead.**

Over a multi-turn session, the message deduplication compounds — a 10-turn
session avoids ~24,000 chars of redundant memory snapshots in messages.

---

## 7. Implementation Order

| Phase | Change | Risk | Effort |
|---|---|---|---|
| 1 | 5.4 Remove duplicate memory messages | Low — just delete the `sendMessage` call | ~30 min |
| 2 | 5.1 Deduplicate memory instructions | Medium — multiple files, test memory behaviour | ~2 hrs |
| 3 | 5.2 Bridge kanban + create_agent | Low — move between sets, verify schema bridge handles params | ~1 hr |
| 4 | 5.3 Add CLI command summaries | Low — modify `buildCliPromptBlock()` output format | ~1 hr |

Each phase is independently shippable and testable. Phase 1 is zero-risk
and gives immediate savings.

---

## 8. Implementation Status

**All four phases implemented.** Changes:

| File | Change |
|---|---|
| `plugins/sero-memory-plugin/extension/context-injector.ts` | Split injection: static memory → system prompt, QMD search → per-turn message. `context` filter strips prior-turn search messages. |
| `plugins/sero-memory-plugin/extension/priority-context.ts` | Added `buildPriorityContextSplit()` returning `{ staticContext, searchContext }` separately |
| `plugins/sero-memory-plugin/extension/memory-config.ts` | Added `autoRetrieve` setting (`on`/`off`, default: `on`) with getter/setter/describer |
| `plugins/sero-memory-plugin/extension/memory-tool-admin.ts` | `handleMemoryConfig` now accepts `auto_retrieve` param alongside `snapshot` |
| `plugins/sero-memory-plugin/extension/memory-tool.ts` | Added `auto_retrieve` param to MemoryParams schema |
| `plugins/sero-memory-plugin/extension/memory-instructions.ts` | Tightened to single source of truth; renamed sections to `### Retrieval` / `### Storage` |
| `apps/desktop/electron/cli/index.ts` | Moved `kanban` + `create_agent` to `CORE_TOOLS_TO_BRIDGE`; removed from `NEVER_BRIDGE_TO_CLI`; rewrote `buildCliPromptBlock()` with per-command summaries; removed memory routing duplication |
| `apps/desktop/electron/features/container/tools/system-prompt.ts` | Shortened memory exception to 1-line reference |
| `packages/templates/profile/AGENTS.md` | Replaced 60-line memory habits section with 3-line pointer |

### New tests

| File | Tests | Covers |
|---|---|---|
| `electron/__tests__/cli/context-dedup.test.ts` | 6 | Verifies no duplication across AGENTS.md, memory-instructions, CLI block, container block |
| `electron/__tests__/cli/tool-bridge-policy.test.ts` | 7 | Verifies kanban/create_agent are bridged, question/questionnaire/interview are not |
| `electron/__tests__/plugins/memory-auto-retrieve.test.ts` | 9 | Auto-retrieve config: defaults, toggle, env var, handleMemoryConfig integration |
| `electron/__tests__/plugins/memory-split-context.test.ts` | 6 | Split context: static vs search separation, empty states, compatibility wrapper |

### Updated tests

| File | Change |
|---|---|
| `electron/__tests__/cli/prompt-block.test.ts` | Rewritten to test summaries format and absence of memory routing |
| `electron/__tests__/plugins/memory-context-injection.test.ts` | Updated assertions for new section headers |
| `electron/__tests__/agent/token-baseline.test.ts` | Adjusted CLI block budget from 400 → 600 (summaries add ~80 tokens) |

## 9. Validation

To verify after deployment, regenerate `turn_context.json` (send a test
prompt in the debug profile) and check:

1. System prompt char count decreased (~2,000 chars reduction)
2. Tool definitions: `kanban` and `create_agent` no longer appear as standalone tools
3. No `memory-context` custom messages in the messages array
4. `sero kanban list` works via sero-cli
5. `sero help` shows command summaries
6. Memory tools still work (save, recall, search)
