# Plan — Subagent context fixes + per-step tool selection

> **STATUS (2026-06-27, feat/sero-orchestrator-2):** Issue 3 ✅ and Issue 1 ✅
> (commit `05aa053aa`); per-step tool selection ✅ (commit `f641e9c8a`).
> **Issue 2 — NOT A BUG** ❌: the provider payload (`model-messages.jsonl`
> `provider_request`) shows memory injected exactly once (in `instructions`);
> the `memory-context` custom message is stripped by the memory plugin's
> `context` hook before the model sees it. The apparent duplication was an
> artifact of reading `turn-context.json` (captured at `turn_start`, pre-strip).
> All validated via a real run; `pnpm typecheck` 18/18, orchestrator 273 tests,
> desktop subagent 81 tests.


Covers three subagent bugs (dropped step contract, stub tool list, duplicated
memory) **and** a new feature decided with Dan: **per-step tool selection** (the
planner picks each step's tools; the user can override) — the productized,
granular version of "lean subagents".

Follow-up to the loop **context override** feature. While testing it (loop
`loop_0901aab8-19cb-4c23-ac98-462b46e1daaa` in workspace `orchestratortest`,
custom prompt = "You are a helpful story writer…", all skills + `browser`
disabled) three problems surfaced in the subagent's actual system prompt. The
context-override feature itself works — the custom prompt correctly replaced the
base — but it exposed pre-existing subagent bugs.

These fixes are **cross-cutting** (the shared subagent runner + the memory
plugin), not orchestrator-only — verify cron/factory subagents too.

## Evidence (already gathered, keep for the new session)

- Extracted turn context: `~/.sero-ui/debug/turn-context.json` (the captured
  `systemPrompt` + first message).
- Full provider log (ground truth of what is actually sent):
  `~/.sero-ui/debug/model-messages.jsonl`.
- Findings from `turn-context.json`:
  - System prompt = **9,799 chars**. The custom prompt is only 71 of them and
    correctly replaced the base intro.
  - **No within-prompt duplication** (0 repeated long lines), BUT the memory
    files (`IDENTITY.md` / `USER.md` / `MEMORY.md`, ~2.7 KB) appear **both** in
    the system prompt **and** in message[0] (role `custom`) — identical text.
  - The session has **29 tools** (`mcp`, `memory`, `cron`, `git_manager`,
    `web_search`, `code_search`, `graphify_*`, `orchestrator`, `question`,
    `reminder`, … + `bash`/`read`/`write`/`edit`/`sero-cli`/`automation_browser`)
    — the editor showed only 6.
  - The orchestrator's `STEP_SYSTEM_PROMPT` (worktree contract + StepOutcome
    rules) is **entirely absent** (0 occurrences of "StepOutcome" / "executing
    ONE step" / "WORKING DIRECTORY IS SHARED").

---

## Issue 3 — `STEP_SYSTEM_PROMPT` (and every agent `.md` body) is silently dropped

**Do this first — it's the most contained and highest-correctness fix, and it
makes the context-override behave as designed.**

**Root cause.** `runtime/runner.ts` passes the agent prompt via
`systemPromptSuffix: agent.systemPrompt` on `createAgentSession`. That option is
a **stale desktop type augmentation** (`electron/types/pi-coding-agent.d.ts`);
pi **0.78.0 never reads it** (`grep systemPromptSuffix` across the SDK `dist`
returns nothing). So for the orchestrator the step contract is dropped, and for
ordinary subagents the agent's `.md` body is dropped too. Outcomes still mostly
work because `buildStepTask` separately appends a short "end with a StepOutcome
JSON block" reminder to the task message.

**Fix.** Deliver the agent prompt through the resource loader's **working**
`appendSystemPrompt` option instead of the dead `systemPromptSuffix`:
- In `runner.ts`, drop `systemPromptSuffix` from `sessionOptions`; add
  `appendSystemPrompt: agent.systemPrompt ? [agent.systemPrompt] : undefined` to
  the `new DefaultResourceLoader({ … })` options. (`DefaultResourceLoaderOptions`
  has `appendSystemPrompt?: string[]`; `_rebuildSystemPrompt` reads it via
  `getAppendSystemPrompt()`.)
- Remove the now-unused `systemPromptSuffix` augmentation in
  `electron/types/pi-coding-agent.d.ts`.

**Why this also fixes the override.** The context override is applied as the
loader's `systemPromptOverride` (the **base** `customPrompt`); `appendSystemPrompt`
is a **separate** slot. So once the step prompt rides on `appendSystemPrompt`, a
base override replaces only the base and the step contract is always preserved —
exactly the design the executor test already asserts
(`systemPrompt` = `STEP_SYSTEM_PROMPT`, `systemPromptOverride` = user text).

**Blast radius.** ALL subagents (orchestrator, cron jobs, factory). Their prompts
will grow by the (previously-dropped) agent body / step contract — this is the
intended content, but validate cron/factory output didn't depend on it being
absent.

**Validation.** Re-run a step; confirm `STEP_SYSTEM_PROMPT` text now appears in
the subagent system prompt; with an override set, confirm the base is replaced
**and** the step contract is still present.

---

## Issue 1 — Editor shows a hardcoded 6-tool stub; disabling silently fails

**Root cause.** `electron/ipc/agent/handlers/subagent-context.ts` returns a
hardcoded `PLATFORM_TOOLS` list of 6. The real subagent loads ~29 (the installed
Sero **plugins'** tools, discovered by `DefaultResourceLoader`, not by the
reduced `createSubagentExtensionFactory`). Also the stub names the browser
`browser`, but the real tool is `automation_browser` — so disabling "browser"
removed nothing (the runner filters `customTools` by exact name).

**Fix — enumerate the real tool set.** Options, recommend a hybrid:
- **(baseline) correct the static platform names** so a never-run loop still
  shows the core tools accurately: `bash`, `read`, `write`, `edit`, `sero-cli`,
  `automation_browser`.
- **(real set) capture from actual runs (recommended, push-model, zero extra
  cost).** In `runner.ts`, after the session is created, read the resolved active
  tool names (`session.getActiveToolNames()` / the tool registry) and persist
  them to a small per-workspace cache (e.g.
  `…/apps/orchestrator/subagent-tools.json`, or a neutral location). The editor's
  context query returns the cached real set (merged with the static baseline).
  Accurate after the first run, no transient session needed.
  - Alternative if a pre-run-accurate list is required: a transient enumeration
    session in the IPC handler (heavier; Dan declined this for the *prompt*
    display, but it is the only way to be accurate before any run — get a
    decision).
- Skills already enumerate correctly via the resource loader — leave as-is.

**Validation.** Editor lists ~29 tools incl. `automation_browser`; toggling a
tool off and running a step shows that tool absent from the run's
`turn-context.json` tools.

---

## Issue 2 — Memory is injected twice (~2.7 KB duplicated) — RESOLVED: NOT A BUG

**Conclusion (verified against ground truth).** Memory is injected **once**. The
true provider payloads (`model-messages.jsonl`, `_type: "provider_request"`,
responses-API fields `instructions`/`input`) carry memory only in `instructions`
across all 13 subagent requests; the `display:false` `memory-context` custom
message never reaches `input` — the memory plugin's `context` hook
(`context-injector.ts`) strips it. The apparent duplication came from
`turn-context.json`, a debug snapshot taken at `turn_start` (before the `context`
hook runs). No code change. The original (incorrect) analysis follows for the
record.



**Root cause (to confirm).** The memory plugin's `before_agent_start`
(`plugins/sero-memory-plugin/extension/context-injector.ts`,
`return { systemPrompt: event.systemPrompt + addition }`) appends the memory
files to the **system prompt**. A second path injects the **same** memory as a
`custom` **message** (investigate `priority-context.ts` / `prefetch.ts` /
`session-lifecycle.ts`). In the subagent both fire.

**First: confirm against ground truth.** `turn-context.json` is a debug view —
check `model-messages.jsonl` (the actual provider payload) to confirm the memory
is genuinely sent twice, and identify the exact second injection point.

**Fix direction.** Ensure memory is injected **once** for a subagent run — pick
the system-prompt path or the message path, not both. (See Issue 4: a coding
subagent may not need user memory at all.)

**Validation.** Memory content appears exactly once in the provider request.

---

## Feature — Per-step tool selection (replaces the blunt "lean surface" idea)

**Decided with Dan.** The lean-subagent goal is productized as **per-step tool
selection**, mirroring the existing **per-step model tier** pattern: the planner
picks each step's tools automatically; the user can override per step. This makes
leanness granular and gives each step exactly the surface it needs.

**Decisions (locked):**
- **Tools are per-step**, picked by the planner, user-overridable per step. The
  per-loop context editor (`LoopContextControl`) keeps **System Prompt + Skills
  only** — its **Tools section is removed**. Mental model: "tools are chosen per
  step; prompt & skills are set per loop."
- **Default = lean coding baseline** (`bash`, `read`, `write`, `edit`,
  `sero-cli`) when a step has no tools assigned. The planner adds extras
  (`web_search`, `git_manager`, …) per step as needed.

**Data model** (`shared/types.ts`): add `tools?: string[]` to
`BackgroundAgentTarget` (next to `model?`/`thinking?`). Allowlist of tool names
for that step. Per-step only (model steps have no tools; active-session steps run
in the user's live session).

**Planner** (`planner-prompt.ts`, `schema.ts`): the planner prompt includes the
**tool catalog** (names + descriptions — from Issue 1's enumeration) and, for
each background-agent step, picks the minimal `tools` it needs (LLM judgment — no
heuristics; validate names against the catalog, strip/warn unknowns like the
model-fallback path). Instruct: lean by default, include what the step plausibly
needs.

**Runtime** (`executors/common.ts` → host → runner): pass the step's allowlist
(`step.execution.tools ?? LEAN_BASELINE`) as a new `tools?: string[]` run param.
The runner sets it as the session **tool allowlist** (`{ noTools: 'builtin',
tools: allowlist }` in `sessionToolOptions`/`createAgentSession`). The SDK builds
tool guidance only from **active** tools (`_rebuildSystemPrompt` uses
`validToolNames`), so a lean allowlist also **shrinks the per-tool prompt
guidance** — this is the main size win, per step.

**UI** (`PlanView`): a per-step tool multi-select (a `StepToolsControl`, sibling
to the existing `StepModelControl`) showing the catalog with the step's allowlist
checked; dispatches a new `set_step_tools` action (mirror `set_step_model`:
coordinator case + `plan-mapping` `applyStepTools` + `extension/tools.ts` +
`OrchestratorApp` dispatch). Remove the Tools section from `LoopContextControl`.

**Important scope note.** The tool allowlist trims tool **guidance** and restricts
**capability**, but it does NOT stop **extensions** from loading — so the memory
plugin still injects (Issue 2 is still needed). Fully stopping unneeded extension
injections (memory, etc.) per step would require controlling which extensions
load (`extensionsOverride`/`noExtensions`), which is a separate, harder lever —
note as a possible follow-up, not in this scope.

**Migration.** Existing loops have no `tools` field → they fall back to the lean
baseline, which may under-provision a step that needed more; re-planning assigns
proper per-step tools. Acceptable on the dev branch; call it out.

**Depends on Issue 1** (real tool enumeration) for the planner + UI catalog.

---

## Sequencing

1. **Issue 3** (dead `systemPromptSuffix` → `appendSystemPrompt`) — contained,
   restores correctness, validates the override design.
2. **Issue 1** (real tool enumeration + correct names) — prerequisite for the
   per-step tool catalog (planner + UI).
3. **Per-step tool selection** (planner picks + user override + runner allowlist;
   remove the per-loop Tools section). Delivers the lean goal granularly.
4. **Issue 2** (memory dedupe) — still needed; not solved by the tool allowlist.

## Verification method (per fix)

Reproduce the test loop, run one step, then inspect the run's debug output
(`~/.sero-ui/debug/…` turn context + `model-messages.jsonl`): system-prompt
size, the tool list, memory-content occurrence count, and presence of the step
contract. Plus `pnpm typecheck` (18/18) and the affected suites
(`sero-orchestrator-plugin`, desktop `features/subagent`). Keep every touched
file < 500 LOC.

## Key files

- `apps/desktop/electron/features/subagent/runtime/runner.ts` — prompt suffix →
  `appendSystemPrompt`; capture active tool names.
- `apps/desktop/electron/types/pi-coding-agent.d.ts` — remove dead
  `systemPromptSuffix` augmentation.
- `apps/desktop/electron/ipc/agent/handlers/subagent-context.ts` — real tool
  enumeration; fix `browser` → `automation_browser`.
- `apps/desktop/electron/features/subagent/runtime/loader.ts` — extension/tool
  surface (Issue 4).
- `plugins/sero-memory-plugin/extension/context-injector.ts` (+ `priority-context.ts`,
  `prefetch.ts`) — memory double-injection.
- `plugins/sero-orchestrator-plugin/runtime/executors/common.ts`,
  `runtime/host.ts`, `runtime/host-adapter.ts` — already pass
  `systemPromptOverride`; re-verify after Issue 3; add the per-step `tools`
  allowlist param.
- Per-step tools feature: `shared/types.ts` (`BackgroundAgentTarget.tools`),
  `runtime/planner-prompt.ts` + `runtime/schema.ts` (catalog in, validate
  `tools` out), `runtime/plan-mapping.ts` (`applyStepTools`),
  `runtime/coordinator.ts` + `extension/tools.ts` (`set_step_tools` action),
  `ui/components/PlanView.tsx` + new `ui/components/StepToolsControl.tsx`
  (mirror `StepModelControl`), `ui/components/LoopContextControl.tsx` (remove the
  Tools section).
