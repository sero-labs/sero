# 10 · Release-readiness backlog (post-redesign)

Status: **planned** — execute in a later session. This captures the gaps found
reviewing the Orchestrator after the wireframe-aligned UI redesign
([09-ui-redesign.md](09-ui-redesign.md)). All functional requirements (FR-01…23,
FR-L1…L9) are ✅ and the runtime is well covered; the items here are the missing
edges, not new features.

## How to use this (fresh session)

Each item is self-contained: **Problem → Approach → Files → Acceptance**. Pick by
priority. Keep the project rules: no polling (push via watched files / host
seams), no heuristics for LLM tasks, ≤500 LOC per file, Conventional Commits,
`pnpm typecheck` clean before commit, plain-English user copy. Branch from the
current orchestrator branch.

Priorities: **P0** = fix before an initial release · **P1** = soon after ·
**P2** = polish/backlog.

---

## P0 — fix before initial release

### RR-1 · Home overview: pagination + search — ✅ done
**Problem.** The home `LoopsOverview` renders *every* loop in every status group
with no pagination and no search — contradicts the "paginate, don't scroll" rule.
The sidebar `LoopList` already does this correctly (last 10 + Load more + search).
**Approach.** Add a search box to `HomeView` (filters the loops passed to
`LoopsOverview` by title/summary/prompt) and cap the overview (e.g. last-N overall
or per-group with a "Show more"). Reuse the `LoopList` pattern; no new state store.
**Files.** `ui/components/HomeView.tsx`, `ui/components/LoopsOverview.tsx`.
**Acceptance.** With many loops the home shows a search field and bounded lists
with Load/Show more; the attention queue is unaffected; no unbounded scroll.
**Done.** `HomeView` owns a `query` (no store) that filters only the overview by
title/summary/prompt — the "Needs you" queue still sees every loop. The search box
appears once there are >10 loops; a no-match search shows "No loops match your
search". `LoopsOverview` now bounds each status group to the 9 most recent (a
`StatusGroup` sub-component holding its own count) with an incremental "Show N
more" — no unbounded scroll.

### RR-2 · Completion & blocked notifications — ✅ done
**Problem.** `notifyAsked` fires a host notification when a loop asks a question
([runtime/human-input.ts](../../../../plugins/sero-orchestrator-plugin/runtime/human-input.ts)),
but nothing notifies when a loop **completes** or **blocks** (error/limit) without
a question. A user away from the panel never learns the outcome.
**Approach.** Call `host.notify(...)` when a run finalizes to a completion signal
or a loop-wide block. Likely seam: the run engine's `finalize` / where
`runtime.completion` and `runtime.block` are set. Notify once per transition (not
per persist), with the loop title + outcome; `info` for complete, `warning` for
blocked. Reuse the existing `host.notify` seam — no new infra.
**Files.** `runtime/run-engine.ts` (and wherever block/completion are set);
maybe a small `notifyOutcome` helper next to `notifyAsked`.
**Acceptance.** Completing or blocking a loop emits exactly one notification with
the loop title and outcome; re-persisting the same state does not re-notify; a
unit test covers the transition.
**Done.** New pure helper `runtime/notify-outcome.ts` (`outcomeNotification` +
`notifyOutcome`) maps a finalized loop to a one-line message — `info` "Loop \"X\"
finished." on complete, `warning` "Loop \"X\" is blocked — <reason>." on block,
`null` otherwise. `RunEngine.finalize` calls it once. Because a run only starts
from an `active` loop and a terminal loop can't run again, "fired at finalize" is
"fired once per transition" — re-persisting never routes through here. A pending
question keeps the loop `active`, so it's untouched (it already notifies via
`notifyAsked`); a recurring loop's per-iteration complete stays `active`, so cron
ticks don't spam. Tests: `notify-outcome.test.ts` (pure transition cases) plus
three `run-engine.test.ts` cases (complete ⇒ one info, block ⇒ one warning,
plain success ⇒ none).

### RR-3 · Verify the loop context override actually applies — ✅ verified (control kept)
**Problem.** The "Context" override stores `contextOverrides`; the executor wires
`disabledTools`/`disabledSkills`
([runtime/executors/common.ts](../../../../plugins/sero-orchestrator-plugin/runtime/executors/common.ts)),
but the **custom system prompt** previously relied on pi's `systemPromptSuffix`,
which pi 0.78 ignored (see prior testing notes). Risk: the system-prompt override
is a silent no-op for background-agent steps.
**Approach.** Trace `contextOverrides.systemPrompt` from `set_loop_context` →
executor → `host.subagents` call. Confirm whether the current pi seam
(`systemPromptOverride` vs suffix) actually applies it; fix the wiring if it
doesn't. If pi genuinely can't honor it, remove/relabel the option and note the
limitation in the Context dialog copy and the guide (don't ship a dead control).
**Files.** `runtime/executors/common.ts`, `runtime/host-adapter.ts`,
`runtime/host.ts`, `ui/components/LoopContextControl.tsx`; verify against the pi
SDK docs for subagent system-prompt overrides.
**Acceptance.** A loop with a custom system prompt demonstrably uses it in a
background-agent step (manual `/run` verification), **or** the option is removed
with the limitation documented. Tools/skills disabling stays working.
**Verified — the control works; nothing removed.** The dead `systemPromptSuffix`
was already replaced (orchestrator commit `05aa053aa`, validated by a real run —
see the `orchestrator-subagent-context-bugs` note). Traced the live chain end to
end: `contextOverrides.systemPrompt` → `executors/common.ts` passes it as
`systemPromptOverride` (and `STEP_SYSTEM_PROMPT` as the always-on `systemPrompt`)
→ `host-adapter` → `subagents.runStructured` → `single-run` (`resolveAgent` turns
`systemPrompt` into `agent.systemPrompt`) → `runner` sets the loader's
`systemPromptOverride` (replaces base) and `appendSystemPrompt: [agent.systemPrompt]`
(step contract rides on top) → pi 0.78 `DefaultResourceLoader`, whose typed
options confirm both `systemPromptOverride: (base) => …` and `appendSystemPrompt`
are honored (and `systemPromptSuffix` is gone). Covered at both layers: the
desktop `runner.test.ts` (override replaces base, agent prompt on `appendSystemPrompt`,
no suffix) and the orchestrator `executors.test.ts` ("applies the loop context
override" + a new "empty override ⇒ excludes base prompt" guard on the fragile
`?? undefined`). Tools/skills disabling is asserted in the same tests. No
`/run` needed: the chain is proven by types + tests at every hop.

---

## P1 — soon after

### RR-4 · UI component / logic tests — ✅ done
**Problem.** The renderer is almost untested (only `answer-draft`, `format`,
`plan-levels`); the redesign added a lot of derived display logic.
**Approach.** Add focused unit tests for the pure/derived bits first: the
create-wizard stage selector (no-plan+pendingInput ⇒ clarify; plan ⇒ review),
`use-library-link` divergence + `hasActions`, `LoopsOverview` status-line/progress
logic, `AttemptHistory` `summarizeRun`, and the `status-style` maps. Extract any
inline logic that's hard to test into small pure helpers.
**Files.** new `ui/__tests__/*.test.ts(x)`; minor refactors to expose pure logic.
**Acceptance.** Meaningful coverage of the new derived logic; suite stays green.
**Done.** Extracted four inline bits into pure, testable helpers: the wizard stage
selector (`ui/lib/create-stage.ts` `deriveCreateStage`), the library-link
resolution (`use-library-link.ts` `deriveLibraryLink`, split out of the hook), the
card status line (`ui/lib/loop-card.ts` `loopCardStatus`), and the run summary
(`ui/lib/run-summary.ts` `summarizeRun`, moved out of `AttemptHistory.tsx`). New
tests under `ui/__tests__/`: `create-stage`, `library-link`, `loop-card`,
`run-summary`, `usage-summary` (RR-6), plus `formatTokens`/`formatCost` and a
status-style completeness check added to `format.test.ts`. Suite green (423 tests).

### RR-5 · Docs refresh — ✅ done
**Problem.** The docs-site guide's **"Inspect a loop"** section predates the
redesign (collapsible plan/history, live-activity strip, library header badge,
compact run-history table, "Update plan"). `specs/09` is still marked "in build".
**Approach.** Rewrite "Inspect a loop" to the new detail layout in plain English;
flip `09-ui-redesign.md` status to Done.
**Files.** `apps/docs-site/docs/guide/orchestrator.md`, `specs/09-ui-redesign.md`.
**Acceptance.** The guide matches what ships; spec 09 reads Done.
**Done.** Rewrote "Inspect a loop" to the calm single-column layout (header +
badges, the summary line incl. the RR-6 usage/budget chip, the attention-first
order, the live-activity strip, and the collapsible Plan / Attempt-history
sections). Also fixed the stale slash-command block (the removed
`pause`/`resume`/`stop` → the real `disable`/`enable`/`run_again`/`delete`, verified
against `extension/commands.ts`) and added the RR-7 schedule/limits notes. Spec 09
flipped to **done**.

### RR-6 · Per-loop aggregate cost / budget — ✅ done
**Problem.** History shows per-run tokens/cost, but there's no loop **total** or a
budget-vs-limit indicator, despite `maxCostUsd`/`maxTotalTokens` limits existing.
**Approach.** Aggregate usage across the watched `runs/index.json` (already loaded
in the detail) and show a small "total: X tok · $Y" — and, when a cost/token limit
is set, a remaining-budget hint. Pure derivation in the renderer; no new data.
**Files.** `ui/components/LoopDetail.tsx` (or the Attempt-history header /
meta strip), `ui/lib/format.ts`.
**Acceptance.** The detail shows lifetime tokens/cost and, when limited, how much
budget remains.
**Done.** New pure `ui/lib/usage-summary.ts` (`summarizeLoopUsage` + `formatLoopUsage`)
rolls the watched `runs/index.json` up with `shared/usage.ts` `aggregateUsage` —
the same per-run rollup the engine sums for limit enforcement, so the remaining-budget
hint lines up exactly with when `maxTotalTokens`/`maxCostUsd` would block. Shown as a
usage chip in `LoopMetaStrip` ("45.2k tok · $1.20" and, when limited, "… · 55k tok
left · $3.80 left"); the token/cost caps moved off the operational-limits chip into
this one to avoid duplication. `formatTokens` moved to `ui/lib/format.ts` (shared
with `AttemptHistory`). Tested in `ui/__tests__/usage-summary.test.ts`.

### RR-7 · Decide: direct schedule/limit editing — ✅ decided (a: intentional, documented)
**Problem.** Schedule, triggers, and limits are read-only in the UI; they change
only via natural-language "Update plan". Consistent with LLM-authoring, but some
users expect to tweak a cron time or cost cap directly.
**Approach.** Make a conscious call. Either (a) document that this is intentional
(refine in plain English), or (b) add a minimal editor that maps to a dedicated
coordinator action (kept off the model's authoring path per the no-rails rule).
Recommended: ship (a) for the initial release, note it in the guide.
**Files.** decision note in this spec / the guide; optional new action + editor.
**Acceptance.** A documented decision; if (b), an editor with validation + a test.
**Decision: (a) — intentional, no direct editor.** Loops are authored in plain
language, not dialled in through forms — the no-rails principle. Verified the
actual behaviour before documenting: the **schedule** is derived from the loop's
prompt and **is** adjustable later via **Refine** (`runtime/revise.ts` re-runs
`extractSchedule` + `reapplySchedule` when the refinement changes the goal). The
**limits** are set once at creation (`mergeLimits(suggestedLimits, options)` over
`DEFAULT_LIMITS`); `revise` does **not** touch them, so they're effectively fixed
after creation — there is intentionally no UI editor. The guide's **Triggers** and
**Management limits** sections now state this; the detail summary line shows the
schedule/triggers/limits read-only (with remaining budget once a limit is set). No
editor shipped.

---

## P2 — polish / backlog

- **RR-8 · Troubleshooting/FAQ** in the guide: "how do I stop a runaway loop",
  cost behavior, "loop is stuck blocked", "a step keeps failing". Optionally add
  screenshots (this is a visual feature).
- **RR-9 · Accessibility pass**: keyboard nav beyond cards, focus rings, ARIA on
  the plan spine and the home grids; verify the role=button cards announce well.
- **RR-10 · Web-remote / mobile responsiveness** of the new grids (home overview,
  attention 2-col, plan spine) — audit at narrow widths.
- **RR-11 · Empty first-run**: starter templates/examples (the Library is empty
  until the user saves something) so a brand-new workspace has somewhere to begin.

---

## Out of scope (tracked elsewhere — not part of this backlog)

- Plan-viz **C4 node graph**, **token-by-token live streaming**, **B2 inspector** —
  spec 09 §8.
- Loop Library: **activate-after-load**, **version metadata in the browser**,
  **version pruning**, **file export/import** — spec 08 "Out of scope (v1)".

## Suggested sequence

1. RR-1, RR-2, RR-3 (P0) — one PR; they make the feature safe to hand to users.
2. RR-5 + RR-4 (docs honest + safety net).
3. RR-6, RR-7 (cost visibility + the editing decision).
4. P2 as capacity allows.
