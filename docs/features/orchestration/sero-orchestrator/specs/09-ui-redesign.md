# 09 · UI redesign — wireframe-aligned shell

Status: **in build** (all phases, one pass). Source design:
`design/Sero_Orchestrator_Wireframes.html` (mid-fi, dark). The wireframe is the
**source of truth** for layout and visual language. Where it conflicts with the
shipped UI, we redesign to match it; where it is silent (Loop Library, post-dated
the wireframe) we fold existing functionality into the new layouts without losing
behaviour.

This is a **renderer-and-index** change. The engine, coordinator actions, planner,
recovery, and library runtime are untouched except for one additive data-model
field (the index attention payload, below).

## 1. Decisions

Resolved with the user before build:

| Axis | Wireframe options | Decision |
| --- | --- | --- |
| **A · Navigation** | A1 list+detail · A2 mission-control | **Hybrid** — cross-loop "Needs you" inbox as the home view; selecting a loop opens the list+detail working surface. |
| **B · Loop detail** | B1 calm column · B2 canvas+inspector · B3 activity-led | **B1 + B3 touches, no B2** — calm single column, input request top-weighted, live-activity strip while running. Per-step tuning is a progressive-disclosure expander inside each step card (no separate inspector). |
| **C · Plan viz** | C1 list · C2 lanes · C3 spine · C4 node graph | **C3 spine + C1 grouping** — vertical top→bottom spine where parallel steps are boxed together and branches are grouped (C1's clarity), not just indented. No React-Flow dependency. |
| **D · Create flow** | D1 describe · D2 clarify · D3 review | **Full D1→D2→D3** — describe → planner clarifies if needed → review & refine before activating. |
| Inbox data source | — | **Enrich `index.json`** with a compact attention payload (single watched file; inline answer/approve). |
| Live activity scope | — | **Push from persisted state** — strip updates as each step completes; no streaming infra in v1. |
| Sequencing | — | **All in one pass**, typecheck + tests at the end. |

## 2. Visual language (the wireframe's core asset)

The most-repeated signal in the product is **state**, and the wireframe codifies
a single vocabulary. It already matches the shipped data model — this is a
styling/consistency change, not new behaviour.

- **Loop status (5):** Draft, Active, Blocked, Complete, Disabled.
- **Needs-you (independent of status):** `?N` pending input, `✦N` pending suggestions.
- **Step status (8):** pending, ready, running, done (succeeded), blocked, failed, recovering (needs-revision), skipped.

Palette (mapped onto existing `@sero-ai/ui` tokens where they exist; only the
state accents are new): canvas/panel/border via tokens; **green `#5fb878`**
active/done/running, **amber `#d9a441`** needs-you/blocked-attention, **blue
`#6f9bd1`** suggestions/info; tinted state backgrounds for running/done/branch
cards; 6–9px radii. One status-styling source feeds every surface so a status
looks identical in the list, the home inbox, the detail header, and the plan.

## 3. Data-model change — index attention payload

Today `index.json` (`LoopSummary`) carries only **counts** (`pendingInput`,
`pendingSuggestions`). The cross-loop home inbox needs the **content** to render
questions with inline answers and suggestions with approve/reject — without
opening each loop. We enrich the summary so the home watches a single file
(push model preserved). New types live in `shared/attention-types.ts` (types.ts
is at the 500-LOC cap) and are re-exported from `shared/types.ts`.

```ts
// shared/attention-types.ts
import type { HumanQuestion } from './human-input-types';
import type { SuggestionConfidence } from './reflection-types';

export interface LoopAttentionInput {
  /** runtime.pendingInput.id — pass to answer_input. */
  requestId: string;
  source: 'planner' | 'step';
  questions: HumanQuestion[];
}

export interface LoopAttentionSuggestion {
  id: string;
  rationale: string;
  confidence: SuggestionConfidence;
  changedStepCount: number;
}

/** Compact "needs you" content embedded in a loop summary for the home inbox. */
export interface LoopAttention {
  input?: LoopAttentionInput;
  suggestions?: LoopAttentionSuggestion[];
}
```

`LoopSummary` gains `attention?: LoopAttention`. `toSummary` (runtime/store.ts)
populates it from `loop.runtime.pendingInput` and pending `loop.suggestions`. The
existing `pendingInput`/`pendingSuggestions` counts stay (list badges). The index
rewrites only when attention content changes (a question asked/answered, a
suggestion raised/decided) — exactly the moments the home should update.

`LoopSummary` also gains `progress?: LoopProgress` (`{ total, done, running }`,
derived from the plan + step states) so the home overview can show a live progress
bar on running loops without reading each loop file.

Inbox actions reuse existing coordinator actions verbatim, both invokable with
just `loopId` + ids:
- `answer_input` — `{ loopId, requestId, answers }`
- `choose_suggestion` — `{ loopId, suggestionId, decision, rejectionReason? }`

## 4. View model

```text
OrchestratorApp
├─ Home (default)            cross-loop "Needs you" queue + loops overview
│   ├─ AttentionQueue        questions (inline answer) + suggestions (approve/reject)
│   └─ LoopsOverview         status-grouped loop cards → open detail
├─ Detail (loop selected)    LoopList (sidebar) + LoopDetail (B1 + B3 strip)
├─ Create (D1→D2→D3)         describe → clarify → review/refine
└─ Library                   existing LibraryBrowser (restyled)
```

Navigation: Home is the landing view. A persistent header gives Home / New loop /
Library / Reflect all. Selecting a loop from Home or the sidebar opens Detail;
the sidebar list stays available in Detail for fast loop-to-loop movement.

## 5. Components

### New
| File | Purpose | LOC budget |
| --- | --- | --- |
| `ui/lib/status-style.ts` | Single status→{label, dot, badge, tint} map for loop + step + needs-you. | <120 |
| `ui/components/StatusBadge.tsx` | Loop-status badge + `NeedsYouBadge` (`?N`/`✦N`) + `StepStatusPill`. | <90 |
| `ui/views/HomeView.tsx` | Landing: attention queue + loops overview. | <150 |
| `ui/components/AttentionQueue.tsx` | Cross-loop questions + suggestions with inline actions. | <160 |
| `ui/components/LoopsOverview.tsx` | Status-grouped loop cards (home). | <120 |
| `ui/components/LiveActivityStrip.tsx` | Running step + accumulated tokens/cost/elapsed (push). | <110 |
| `ui/components/StepCard.tsx` | Extracted spine step card + tuning expander (keeps PlanView under cap). | <170 |
| `ui/components/CreateLoopWizard.tsx` | D1→D2→D3 guided flow wrapper. | <180 |

### Rewritten / restructured
- `PlanView.tsx` → C3 spine + C1 grouping (parallel boxed, branch grouped); delegates each step to `StepCard`.
- `LoopDetail.tsx` → B1 calm column; input request top-weighted; `LiveActivityStrip` when `runtime.activeRunId`; plan + history collapsible; Library folded in.
- `OrchestratorApp.tsx` → adds Home view + nav; routes Create through the wizard.
- `LoopList.tsx`, `LibraryBrowser.tsx`, controls → restyled to the visual system.

### Unchanged behaviour, reused
`InputRequestCard`, `SuggestionsInbox`, `LoopControls`, `LoopContextControl`,
`StepModelControl`, `StepToolsControl`, `RefinePlan`, `AttemptHistory`,
`LibrarySaveControl`, `LibraryLinkSection` — re-skinned, same actions.

## 6. Live-activity strip (push, no new infra)

Derived entirely from the watched `loop.json`, which persists after each step:
- **Running step:** the step whose `runtime.stepStates[id].status === 'running'`.
- **Accumulated stats:** sum of completed `stepAttempts[].usage` for the active run (tokens, cost), elapsed since the run's `startedAt`.
- Visible only while `runtime.activeRunId` is set. Token-by-token streaming is a
  later enhancement (would wire `host.runStructured`'s `onUpdate` to a push
  channel); out of scope here.

## 7. Guided create (D1→D2→D3)

Backed entirely by existing behaviour — the planner already parks clarifying
questions (`pendingInput.source === 'planner'`).

1. **D1 Describe** — restyled create form: prompt first; safety options (worktree, dirty, activate) secondary.
2. **D2 Clarify** — after `create`, if the new draft has `runtime.pendingInput` with `source: 'planner'`, render the questions inline (reuse `InputRequestCard` → `answer_input`); planner re-runs on submit.
3. **D3 Review** — when the draft has a populated plan, show the read-only spine + `RefinePlan` + **Save draft** / **Activate**. A validation block surfaces here with refine/restart.

The wizard tracks which stage the watched loop is in (no plan + pendingInput ⇒ D2; plan present ⇒ D3) and transitions on file updates — no polling.

## 8. Out of scope (this pass)
- React-Flow node graph (C4) — revisit only if a graph view is wanted later.
- B2 canvas + inspector — explicitly dropped.
- Token-by-token live streaming — push-after-step only in v1.
- Any change to planner/engine/recovery/library runtime logic.

## 9. Acceptance
- Every shipped capability remains reachable (controls, context, library save/load/version, reflect, refine, retry, branching display).
- Home surfaces all cross-loop questions + suggestions and resolves them inline.
- Plan shows parallel groups and branches with taken/not-taken/skipped styling.
- Create walks describe → (clarify) → review before activation.
- All files ≤ 500 LOC; `pnpm typecheck` clean; orchestrator test suite green.
