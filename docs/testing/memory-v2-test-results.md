# Memory v2 — Manual Test Results & Findings

> **Date:** 2026-04-02
> **Tester:** Daniel Carter
> **Branch:** `feat/memory-improvements` (PR #117)
> **Build:** `SERO_DEV_PLUGINS=memory bash scripts/dev.sh`

---

## Test Results

| # | Feature | Result | Notes |
|---|---|---|---|
| 1 | Basic read/write | ✅ Pass | |
| 2 | Type tags | ✅ Pass | |
| 3 | Replace & remove by ID | ✅ Pass | |
| 4 | Duplicate detection | ✅ Pass | |
| 5 | Security blocking | ✅ Pass | |
| 6 | Capacity enforcement | ⚠️ Misunderstood | Guide was wrong — capacity counts visible chars not raw bytes. File was 5,138 bytes but only 3,935 visible chars (under 4,000 limit). **Fixed in guide.** |
| 7 | Memory search | ✅ Pass | |
| 8 | Session transcript export | ❌ Fail | `session_before_switch` never fired. **Fixed in code.** |
| 9 | Scope filtering | ❌ Fail | Agent used bash/grep instead of `sero memory_search`. **Prompt issue — not a code bug.** |
| 10 | Daily logs | ✅ Pass | |
| 11 | Consolidation | ❌ Fail | Two issues: timeout (30s) and missing model context. **Both fixed in code.** |
| 12 | Context injection | ⚠️ Misunderstood | Guide pointed to wrong log file. Injection was working fine (`contextChars:2630`). **Fixed in guide.** |
| 13 | Legacy migration | ✅ Pass | |

---

## Issues Found & Fixes Applied

### Issue 1 — Duplicate assistant message at capacity

**Symptom:** When memory was at capacity, the agent repeated its response
text: "Your memory is at capacity. Would you like me to replace an older
entry…Your memory is at capacity. Would you like me to replace an older
entry…"

**Diagnosis:** LLM behavior (Claude Haiku 4.5 repeating itself when
constrained). Not a rendering bug — the model produced duplicate text
in a single response.

**Status:** Not a code bug. No fix needed.

---

### Issue 2 — Session transcripts never exported

**Symptom:** Switching sessions (same workspace or different), and even
restarting Sero, did not produce new transcript files in
`~/.sero-ui/workspaces/global/memory/sessions/`. The most recent
transcript was from the previous day.

**Root cause — three separate problems:**

1. **`dispose()` doesn't fire `session_shutdown`** — The Pi SDK's
   `AgentSession.dispose()` just disconnects listeners. It never emits
   `session_shutdown` to extensions. So `closePoolEntry()` silently
   discarded the session without notifying the memory plugin.

2. **`session_before_switch` never fires** — Sero's architecture keeps
   sessions in a pool and focuses different ones. The SDK's `newSession()`
   (which fires `session_before_switch`) is never called because there's
   no "switching" — sessions are independent pool entries.

3. **No notification on focus change** — When the user clicks a different
   session in the sidebar, the renderer just changes `focusedSessionId`
   in the Zustand store. Nothing told the main process or extensions.

**Fixes (commit `c913529`):**

- `closePoolEntry()` (`electron/ipc/agent/core/agent.ts`) now manually
  emits `session_shutdown` before calling `dispose()`
- New `notifySessionSwitch` IPC endpoint
  (`sero:agent:notify-session-switch`) emits `session_before_switch` on
  the previous session when the renderer switches focus
- `focusSession()` and `clearFocus()` in `src/stores/agent.ts` call
  `notifySessionSwitch` so extensions export transcripts on every
  session change
- Added `session_before_switch_start` and `session_shutdown_start` log
  events to `plugins/sero-memory-plugin/extension/session-lifecycle.ts`

**Debug command:**
```bash
grep "session_before_switch\|session_shutdown" ~/.sero-ui/debug/memory-plugin.log | tail -10
```

---

### Issue 3 — Agent uses bash instead of memory_search for session searches

**Symptom:** Asking "Search my session transcripts for notifications" made
the agent run `find`, `ls`, and `grep` via bash instead of calling
`sero memory_search --query "notifications" --scope sessions`.

**Diagnosis:** The agent's system prompt doesn't strongly instruct it to
prefer `memory_search` for session/transcript searches. The tool is
available but the agent defaults to familiar bash commands.

**Status:** Fixed in commit `fe5e5e2`. Root causes were:
1. System prompt instructions were write-focused — listed commands but never said when to prefer them over bash
2. Container prompt actively encouraged direct file access to `MEMORY.md` via absolute paths
3. Tool descriptions didn't state they should be preferred over bash

Fixes: extracted `memory-instructions.ts` with structured retrieval rules
and concrete example mappings; added "ALWAYS prefer this tool" to tool
descriptions; carved memory files out of the container prompt's
"direct file access" guidance.

**Further hardening (post-review):**
- Memory instructions now explicitly route these commands through `sero-cli`
  and still require `memory_search` even when QMD/search indexing is
  unavailable (the agent should surface the limitation instead of falling
  back to bash)
- The CLI prompt now contains a dedicated high-priority routing rule for
  Sero memory files/history, which matters because bridged tool
  descriptions are not otherwise visible to the model upfront
- Container `bash`, `read`, `write`, and `edit` now reject direct access
  to managed memory files and point the agent back to `sero memory`,
  `sero memory_search`, or `sero scratchpad`
- The non-container host-tool fallback now enforces the same guardrails,
  so memory remains first-class even when a workspace is not running in a
  container

---

### Issue 4 — Consolidation: model not available + timeout

**Symptom (model):** `sero memory consolidate` failed with
`"Memory consolidation requires an active model."` even though a model
was selected and the agent was responding to prompts normally.

**Root cause:** The CLI bridge (`schema-bridge.ts`) passed only
`{ cwd: ctx.cwd }` as the tool's `ExtensionContext`, so `ctx.model`
was always `undefined`. The bridge comment even documented this:
*"the CLI bridge only passes `{ cwd }`"*.

**Fix (commit `9a0c0c5`):** Added `agentContext` to `CliCommandContext`
with `model`, `modelRegistry`, `sessionManager`, etc. The sero-cli
tool's execute handler now populates it from the SDK's
`ExtensionContext`, and `bridgeTool()` forwards it to extension tools.
This also fixes any other bridged tool that needs model access.

**Symptom (timeout):** After the model fix, consolidation hit
`ERROR: Command timed out after 30s`. Consolidation runs multiple LLM
calls (one per daily-log batch) which easily exceeds 30 seconds.

**Fix (commit `c913529`):** Added `memory: 180_000` (3 minutes) to
`TOOL_TIMEOUT_OVERRIDES_MS` in `schema-bridge.ts`.

**User feedback:** Consolidation needs better progress indication — there's
nothing obvious in the UI to show it's working during the multi-minute
LLM calls. Filed as follow-up work.

---

### Issue 5 — Test guide errors

Several test instructions in the manual guide were incorrect:

| Test | Problem | Fix |
|---|---|---|
| 6 (capacity) | Said to check `wc -c` — counts raw bytes, not visible chars | Explain visible-char counting, use log or agent header |
| 8 (transcripts) | Said "click New Session" — doesn't trigger export | Clarify which actions trigger `session_before_switch` |
| 11 (consolidation) | No prerequisite about needing an active model | Added prerequisite + troubleshooting |
| 12 (injection) | Pointed to `/tmp/sero-electron.log` | Corrected to `~/.sero-ui/debug/memory-plugin.log` |

All fixed in `docs/testing/memory-v2-manual-testing.md`.

---

## Follow-up Work

- [x] ~~**Prompt tuning:** Instruct the agent to prefer `sero memory_search --scope sessions` for session/transcript searches instead of bash~~ (fixed in `fe5e5e2`)
- [x] **Memory-search efficiency:** Added prompt/tool guidance to start with one precise `memory_search` query and only re-search when the first result misses or is ambiguous
- [ ] **Consolidation progress:** Add UI feedback (streaming updates or a progress notification) during the multi-minute LLM consolidation process
- [ ] **Duplicate LLM responses:** Investigate whether Claude Haiku 4.5 is systematically repeating at capacity boundaries, or if this was a one-off
