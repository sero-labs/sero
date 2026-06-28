# 06 — Loop Reflection (self-improvement)

This file specifies **on-demand loop reflection**: a model pass that reads a
loop's own run history and proposes concrete improvements to its plan and step
instructions, which the user approves or rejects. It builds on the data model in
[01-data-model.md](01-data-model.md), the run flow in
[03-execution-and-scheduling.md](03-execution-and-scheduling.md), and the
LLM-decision scaffold already used for recovery and revision
([llm-decisions.ts](../../../../plugins/sero-orchestrator-plugin/runtime/llm-decisions.ts)).

## Why

Loops accumulate run history — outcomes, retries, recovery decisions, blocks —
but that history is only used *in the moment* (recovery adapts the current run)
and then largely pruned. Nothing reads *across* runs to notice "this step keeps
failing for the same reason" or "the instructions are vague and cause rework" and
fold the lesson back into the plan.

Reflection adds that: a model reads a loop's history and proposes how the loop
could run better next time. It is **on-demand** (the user triggers it), it
**proposes, never auto-applies**, and the decision of what to change is the
**model's, grounded in real run data** — not a heuristic. This matches the
existing principle that the engine builds mechanism and the model decides
strategy.

## Scope (v1)

Locked deliberately small. Three forks were decided:

- **Trigger:** on-demand only — a per-loop **Reflect** button and a workspace
  **Reflect All** button. No automatic or scheduled reflection.
- **What a suggestion may change:** the **plan and step instructions** only.
  Because a step-instruction edit is just a plan revision with stable ids, every
  suggestion rides the existing validated revise path. (Per-step model tier and
  context overrides are deferred — see Non-goals.)
- **Memory scope:** **per-loop**. Each loop learns only from its own history.
  **Reflect All** is a batch *trigger* that runs the per-loop pass over every
  loop consecutively; it is **not** a shared cross-loop learnings store (that is
  a deferred later layer).

## Built on existing primitives

The strength of this design is how little is new. Each capability already has a
home:

| Need | Existing primitive | New work |
| --- | --- | --- |
| History colocated with the loop | `LoopRun` persisted in `loop.json` | A compact, **durable** digest that survives run pruning |
| Model proposes a plan change, validated | `proposeRevisedPlan` + `validateLoopPlan` | A *reflection* prompt (history-driven, not user-prompt-driven) |
| Apply a plan change | `revise` action → `PlanRevision` apply path | Approve routes an accepted suggestion through it |
| "model proposed → applied/rejected" record | `PlanRevision { proposedBy, status }` | A *pending* wrapper (`LoopSuggestion`) awaiting approval |
| Strict structured model call | `runStructuredJson` (parse + bounded repair) | Reused as-is |
| Approve/reject one item in the UI | `choose_recovery` action + recovery card | A `choose_suggestion` action + inbox card of the same shape |

The genuinely new pieces are: a durable **run digest** store, the **reflection
prompt**, and a **suggestion inbox**.

## Goals / Non-goals

Goals:

- A compact `RunDigest` is captured at the end of every run and stored **next to
  the loop**, surviving run pruning, so reflection has long-term memory.
- A `reflect` pass reads the digests + current plan + prior insights + prior
  rejected suggestions and proposes improvements — or **nothing**, when nothing
  is clearly worth changing.
- Suggestions are **pending until the user approves**; approval applies through
  the existing validated revise path; rejection is recorded with a reason and
  fed back so the same idea is not re-proposed.
- A workspace **Reflect All** runs the per-loop pass over every loop with run
  history, consecutively.
- Colocate the per-run narrative with the loop (the digest), so the important run
  story is not scattered through the global log.

Non-goals (v1):

- **No automatic trigger.** Reflection runs only when the user asks. (A
  run-completion auto-trigger is a clean later push hook — never a poller.)
- **No tuning beyond plan/instructions.** Per-step model tier (`set_step_model`)
  and subagent context overrides (`contextOverrides`) are *not* targets yet, even
  though their apply paths exist. Added as later targets once the plan path is
  proven.
- **No auto-apply.** Every suggestion is user-approved. Confidence-gated
  auto-apply of low-risk targets is a later layer.
- **No shared/workspace learnings store.** Reflect All is a batch trigger, not a
  cross-loop memory. Each loop learns only from itself.
- **No new execution or permission policy.** Approval applies a normal plan
  revision; step work is unchanged.

## Data model

New types live in `shared/reflection-types.ts`, re-exported from
[shared/types.ts](../../../../plugins/sero-orchestrator-plugin/shared/types.ts)
(mirrors how `workspace-types.ts` keeps `types.ts` under 500 LOC).

### Run digest (durable, colocated)

```ts
/** A compact record of one finished run. Survives run pruning; feeds reflection. */
export interface RunDigest {
  runNumber: number;
  status: LoopRunStatus;
  completion?: "complete" | "blocked";
  startedAt: string;
  endedAt?: string;
  steps: RunDigestStep[];
  recoveries: { stepId: string; decision: RecoveryDecisionKind; reason: string }[];
  usage?: UsageSummary;
}

export interface RunDigestStep {
  id: string;
  title: string;
  status: StepStatus;
  attempts: number;
  model?: string;
  durationMs?: number;
  /** Present when the step failed / blocked / needed revision. */
  failureSummary?: string;
}
```

Digests are stored in a colocated side file `loops/<id>/digests.json`
(`{ version: 1, digests: RunDigest[] }`) via `host.readArtifact` /
`host.writeArtifact` (read-modify-write append) — **not** onto `loop.json`, so the
hot, frequently-rewritten authoritative file stays lean, and outside the
loop-store's run pruning. To read a known colocated file without persisting the
write ref, `host.readArtifact` resolves a state-dir-relative path as well as an
absolute write ref. Retention is bounded by a new `LogPolicy.retainDigests`
(default 50); because a digest is far smaller than a full run, we retain many more
digests than runs. This *is* the "colocate important loop logging with the loop"
answer.

### Durable insights

```ts
/** A learned fact about how this loop runs, carried across reflection passes. */
export interface LoopInsight {
  id: string;
  summary: string;            // plain-English lesson
  createdAt: string;
  fromRunNumbers?: number[];  // runs that evidenced it
}
```

Stored on the loop as `insights: LoopInsight[]` (bounded, e.g. last 20).
Reflection reads existing insights so it does not re-derive the same lessons, and
may add or supersede them. Insights are recorded even when reflection proposes no
change — they are the loop's memory; suggestions are the actionable subset.

### Pending suggestion

```ts
export interface LoopSuggestion {
  id: string;
  createdAt: string;
  target: "plan";                       // v1: plan + step-instructions both ride the plan path
  rationale: string;                    // why, grounded in the run history
  confidence: "low" | "medium" | "high";
  proposedPlan: LoopPlan;               // full plan, validated, stable ids where unchanged
  changedStepIds: string[];             // for a concise UI diff
  status: "pending" | "approved" | "rejected";
  rejectionReason?: string;
  decidedAt?: string;
}
```

Stored on the loop as `suggestions: LoopSuggestion[]`. Pending ones populate the
inbox. Rejected ones are kept (fed back to reflection). Approved ones are applied
and marked.

`LoopSuggestion` is the *pending* wrapper; when approved it materializes into the
existing `PlanRevision` history via the same apply path the `revise` action uses,
so applied changes appear in the loop's revision log exactly like a manual Refine.

### Added fields and policy

```ts
interface Loop {
  // …existing…
  insights: LoopInsight[];
  suggestions: LoopSuggestion[];
}

interface LogPolicy {
  // …existing…
  retainDigests: number; // default 50
}
```

## Reflection pass

New module `runtime/reflection.ts`, exporting
`proposeImprovements(host, loop): Promise<{ insights: LoopInsight[]; suggestions: LoopSuggestion[] }>`.
It reuses `runStructuredJson` (strict parse + bounded repair + raw-reply
artifact).

Prompt inputs:

- the loop **goal** (`loop.prompt`) and **current plan** (JSON);
- the **digests** read from `digests.json` (the durable history), merged with any
  in-memory runs not yet flushed (`gatherHistory`);
- **existing insights**;
- **prior rejected suggestions** (rationale + reason), so they are not
  re-proposed.

System prompt (REFLECTOR role), key rules:

- Read the run history and identify **recurring, concrete** problems: a step that
  repeatedly fails / retries / gets revised, a missing or mis-ordered step,
  instructions vague enough to cause rework.
- Propose **at most a few** improvements to the **plan or a step's
  instructions**, keeping step ids stable.
- **Return an empty `suggestions` list when nothing is clearly worth changing —
  never invent churn.** (This is the no-heuristics guarantee: the model judges
  whether a change is warranted; the engine never forces one.)
- Record durable **insights** (what you learned) even when proposing no change.
- Do **not** re-propose anything in the rejected list.

Output JSON: `{ insights: [...], suggestions: [{ rationale, confidence, plan, changedStepIds }] }`.
Each `plan` is validated with `validateLoopPlan`; an invalid plan gets the bounded
repair pass, and any suggestion whose plan still won't validate is **dropped**
(logged), never surfaced. Insights are appended (bounded); suggestions are stored
`pending`.

## Actions

Added to `OrchestratorAction`
([shared/actions.ts](../../../../plugins/sero-orchestrator-plugin/shared/actions.ts)):

```ts
| { kind: "reflect"; loopId: string }
| { kind: "reflect_workspace" }
| { kind: "choose_suggestion"; loopId: string; suggestionId: string;
    decision: "approve" | "reject"; rejectionReason?: string }
```

Coordinator behavior
([coordinator.ts](../../../../plugins/sero-orchestrator-plugin/runtime/coordinator.ts)):

- **`reflect`** — runs `proposeImprovements` for one loop, persists new insights
  and pending suggestions. Refuses only if the loop has **no runs** (nothing to
  learn from). It does not change loop status and never touches a running loop's
  execution.
- **`reflect_workspace`** — iterates **every loop with at least one run**,
  **consecutively** (not parallel — bounded model load, and it is the periodic
  sweep the user will trigger), calling the same per-loop pass. Loops with no run
  history are skipped silently. Returns a per-loop summary
  `{ ok, perLoop: [{ loopId, title, suggestionCount, error? }] }`.
- **`choose_suggestion` / approve** — re-validates the suggestion's
  `proposedPlan` against the *current* loop (it may be stale), applies it through
  the existing revise apply path (recording a normal `PlanRevision`,
  `proposedBy: "model"`, `status: "applied"`), then marks the suggestion
  `approved`. A re-validation failure surfaces as an error and leaves the
  suggestion pending.
- **`choose_suggestion` / reject** — marks the suggestion `rejected` with the
  user's reason and `decidedAt`. Kept for the reflection feed.

The `orchestrator` tool and slash command gain `reflect`, `reflect_workspace`,
and `choose_suggestion` (the slash form for approve/reject is optional; the inbox
is the primary surface).

## Engine seam: capturing the digest

In `run-engine.ts` `finalize()`
([run-engine.ts](../../../../plugins/sero-orchestrator-plugin/runtime/run-engine.ts)),
after the run is finished: build a `RunDigest` from the finished run and the
loop's plan (a pure helper in a new `runtime/digest.ts`, `buildRunDigest(loop,
run)`), then append it to `digests.json` (`appendDigest(host, loopId, digest,
retainDigests)` — read-modify-write, bounded; runs at most once per run so cost is
negligible). The write is **best-effort** (a `.catch` that logs) so a digest
failure never fails the run. This is the only change to the run path and it is
additive.

## Logging colocation

The colocated digest is where the per-run story now lives — structured, next to
the loop, where reflection (and the user) can actually read it. That directly
answers the "too much / scattered logging" concern: the important run narrative is
no longer something to fish out of the global log.

The existing one-line `host.log` events (created / blocked-draft / deleted /
run-ended-early, in
[host-adapter.ts](../../../../plugins/sero-orchestrator-plugin/runtime/host-adapter.ts))
are low-volume operational breadcrumbs and are kept as-is — they aid debugging and
are not the source of the noise. No log refactor is needed; the digest is the win.

## UI

- **Per-loop Reflect button** in `LoopControls`
  ([ui/components/LoopControls.tsx](../../../../plugins/sero-orchestrator-plugin/ui/components/LoopControls.tsx)),
  alongside Retry / Run next. Enabled when the loop has ≥1 run; disabled while
  busy. Click → `reflect`.
- **Suggestions inbox** in `LoopDetail`
  ([ui/components/LoopDetail.tsx](../../../../plugins/sero-orchestrator-plugin/ui/components/LoopDetail.tsx)):
  a card listing pending `LoopSuggestion`s, each showing the rationale, a
  confidence badge, the changed steps, and **Approve / Reject** (reject reveals a
  short reason field). Same visual language as the recovery prompt. Approved and
  rejected suggestions collapse into a small history.
- **Workspace Reflect All button** in the `OrchestratorApp` header
  ([ui/OrchestratorApp.tsx](../../../../plugins/sero-orchestrator-plugin/ui/OrchestratorApp.tsx)),
  next to the loop count. Click → `reflect_workspace`; shows a brief progress line
  while loops are processed consecutively and a summary on finish ("Reflected N
  loops · M suggestions"). The user opens each loop to act on its inbox.
- **Pending-suggestion badge** on each loop in `LoopList`
  ([ui/components/LoopList.tsx](../../../../plugins/sero-orchestrator-plugin/ui/components/LoopList.tsx)):
  a small count of pending suggestions, so after Reflect All the user sees at a
  glance which loops need attention without opening each one. The count is carried
  in the loop's `index.json` summary (the list renders from the watched index, not
  the full loop files), so a new `pendingSuggestions` field is added to the index
  entry and kept in sync whenever suggestions change.

## Functional requirements

| ID | Requirement |
| --- | --- |
| FR-R1 | At run finalize, a compact `RunDigest` is appended to the loop's colocated `digests.json`, retained beyond run pruning per `LogPolicy.retainDigests`. |
| FR-R2 | The digest captures per-step status / attempts / model / duration / failure-summary, recovery decisions, completion, and usage. |
| FR-R3 | A `reflect` action runs the reflection pass on one loop using its digests, current plan, existing insights, and prior rejected suggestions. |
| FR-R4 | Reflection may return zero suggestions and never fabricates a change when none is clearly warranted (model-judged, no heuristics). |
| FR-R5 | Each suggestion carries a rationale, confidence, changed-step ids, and a full `proposedPlan` validated with stable ids; an invalid plan is repaired-or-dropped, never surfaced. |
| FR-R6 | Suggestions are persisted `pending`; nothing is applied without explicit user approval. |
| FR-R7 | `choose_suggestion` approve re-validates against the current loop, applies the plan through the existing revise path (recording a `PlanRevision`), and marks the suggestion approved. |
| FR-R8 | `choose_suggestion` reject records the suggestion rejected with the user's reason; rejected suggestions feed later reflection so they are not re-proposed. |
| FR-R9 | Durable `LoopInsight`s record what reflection learned, are carried into later passes, and are bounded. |
| FR-R10 | `reflect_workspace` runs reflection on every loop with ≥1 run, consecutively, and returns a per-loop summary; loops with no runs are skipped. |
| FR-R11 | UI exposes a per-loop Reflect button, a workspace Reflect All button, a suggestions inbox with Approve / Reject (with reason), and a pending-suggestion count badge on each loop in the list (carried in the index summary). |
| FR-R12 | Reflection is on-demand only in v1 — no automatic trigger; loops behave exactly as today until the user reflects. |

## Test plan

Digest (pure + seam):

- `buildRunDigest` maps a finished run + step states to the compact shape
  (failure summary present only for failed/blocked/needs-revision steps).
- `appendDigest` appends and trims to `retainDigests`; survives a run prune that
  drops the corresponding `LoopRun`.

Reflection (`runStructuredJson` with fakes):

- proposes a plan suggestion from a digest history with a repeatedly-failing step;
- returns **zero** suggestions for a clean history (no churn);
- excludes a previously-rejected idea given the rejected feed;
- an invalid `proposedPlan` is dropped after repair, not surfaced.

Coordinator:

- `reflect` on a loop with no runs → refused with a clear reason;
- approve applies the plan via the revise path (a `PlanRevision` is recorded) and
  marks the suggestion approved; a stale plan that fails re-validation leaves the
  suggestion pending with an error;
- reject records reason + `decidedAt`;
- `reflect_workspace` processes only loops with runs, consecutively, and returns
  the per-loop summary.

UI: Reflect button enablement; inbox approve/reject wiring; Reflect All summary.

Regression: loops never reflected behave byte-for-byte as today (FR-R12); the new
fields default empty.

## Phased implementation

1. **Digest capture** — `RunDigest` types, `buildRunDigest`, `appendDigest`,
   `gatherHistory`, `LogPolicy.retainDigests`, the relative-path `readArtifact`,
   and finalize wiring. Unit tests. Invisible to users (no reflection yet).
2. **Reflection pass + actions** — `reflection.ts`, `LoopInsight` /
   `LoopSuggestion` types, the `reflect` / `reflect_workspace` /
   `choose_suggestion` actions in the coordinator, and the tool / slash command.
   Approve routes through the existing revise apply path. Tests. No UI.
3. **UI** — per-loop Reflect button, workspace Reflect All button + summary, and
   the suggestions inbox with Approve / Reject.
4. **Docs** — fold the new types into [01-data-model.md](01-data-model.md), note
   the digest capture in [03-execution-and-scheduling.md](03-execution-and-scheduling.md),
   update the [index](index.md) and the
   [user guide](../../../../apps/docs-site/docs/guide/orchestrator.md).

Each phase: `pnpm typecheck` green + the orchestrator suite green before the next.
