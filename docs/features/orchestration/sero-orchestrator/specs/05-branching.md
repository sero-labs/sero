# 05 — LLM-Judged Branching

This file specifies conditional branching in a loop plan: alternative paths the
**planner LLM authors** and a **judge step decides** at runtime, with no
hard-coded routes, conditions, or heuristics. It extends the step model in
[01-data-model.md](01-data-model.md) and the run flow in
[03-execution-and-scheduling.md](03-execution-and-scheduling.md).

## Why

Today a plan is a static acyclic DAG: every step runs once its dependencies are
satisfied. That covers sequential and parallel work, and the recovery system
already handles "a step failed, adapt" (retry / revise-step / revise-plan). What
it cannot express is **"take a different path depending on what we find"** — e.g.
*"if the change is simple, go straight to implementation; if it's hard, plan
first"*, or progressively heavier paths for harder requests.

We add that as a capability the planner uses when work genuinely diverges. We do
**not** add a fixed taxonomy (no built-in `simple|standard|complex`): the routing
variable, its values, and the branch shapes are all authored by the planner per
plan. We build the *mechanism* and the *rules*; the model decides the strategy.

## Keystone

A `skipped` step already counts as satisfied for its dependents
([readiness.ts](../../../../plugins/sero-orchestrator-plugin/runtime/readiness.ts),
`SATISFYING_OUTCOMES = {succeeded, skipped}`). So an un-taken branch can be
skipped and the convergence step still runs. Branching is built on top of this —
no new completion semantics, no cycles, the graph stays acyclic.

## Goals / Non-goals

Goals:

- A judge step records a **routing variable**; other steps carry an optional
  **guard** that gates them on that variable. Un-taken steps are skipped; the
  skip cascades down the un-taken branch; convergence is automatic.
- All routing values and branch shapes are **planner-authored**.
- Guards are **per-step and optional** — only conditional steps carry one. A
  "branch" can be a single optional step up to an N-way switch.
- Multiple and **nested** branch points per plan.
- Mid-run revisions (recovery `revise-plan` / `revise-step`, manual Refine) author
  branches the same way the initial planner does.

Non-goals:

- **No loops / cycles.** The plan stays acyclic; iteration stays the job of the
  recovery system (retry/revise) and the schedule. (Confirmed out of scope.)
- **No heuristic conditions.** The branch decision is the model's; the engine only
  does mechanical value-matching of the route the judge chose.
- No richer guard expressions (multi-variable boolean logic, comparisons). A guard
  is a simple value match. Anything smarter belongs in the judge's reasoning.
- Selecting more than one branch per routing variable (no multi-select switch).

## Authoring model

### The judge step

The judge is an **ordinary step** — nothing special — whose job is to decide a
route and record it in its `StepOutcome.variables`. It is a cheap `model` step
when the inputs are already in loop variables (a prior background-agent gathered
them), or a `background-agent` when it must inspect files first (see the
model-vs-agent distinction in [03](03-execution-and-scheduling.md#model-step)).

A step declares the routing variables it will set with `produces`, so the route
is statically legible (for validation and the UI). Values stay open — the judge
picks them; `produces` lists only the variable *names*.

```jsonc
{
  "id": "assess",
  "title": "Assess the change",
  "instructions": "Judge whether this change is simple or needs planning first. Record your decision under \"route\".",
  "produces": ["route"],
  "execution": { "type": "model", "model": "LOW" }
}
```

### Guards

Any step may carry an optional `when` guard. Absent ⇒ the step always runs (the
main line). Present ⇒ the step runs only when the routing variable's value
matches.

```jsonc
{ "id": "planning", "when": { "var": "route", "in": ["hard"] }, "dependsOn": ["assess"], ... }
```

### A branch can be one optional step

Branching does **not** require a labeled A/B/C set. Your example — *"simple → go
straight to implementation; hard → plan first"* — is a single optional step:

```text
assess (produces route) ──► planning (when route in [hard]) ──► implement ──► finalize
                                                                  ▲
                                  implement dependsOn [planning]; runs either way,
                                  because a skipped dependency still satisfies it
```

- `route = "simple"` → `planning` skips → `implement` (its dep resolved as
  skipped) runs immediately → straight to implementation.
- `route = "hard"` → `planning` runs → `implement` runs after.

`implement` and `finalize` are the unguarded main line; `planning` is the only
conditional step.

### An N-way switch (one branch taken)

```text
                 ┌─ simple-impl   (when route in [simple]) ─┐
assess ─► judge ─┼─ standard-impl (when route in [standard])┼─► finalize
(route)          ├─ complex-impl  (when route in [complex]) ┤
                 └─ fallback      (when route default) ──────┘
```

Exactly one alternative per routing variable is taken (one value ⇒ at most one
`in` guard matches). The `fallback` carries `when: { var: "route", default: true }`
and is taken only when the value matched no sibling `in` guard — this is the
**planner-authored default** that prevents a dead-end when the judge returns an
unforeseen value.

### Multiple / nested branch points

A plan may have several branch points keyed to different variables, including a
branch inside a branch. Nesting is free — the inner judge runs only on the taken
outer path (its dependencies skip otherwise, cascading the skip inward).

## Data model

Added to `LoopStepDefinition`
([shared/types.ts](../../../../plugins/sero-orchestrator-plugin/shared/types.ts)):

```ts
export interface StepGuard {
  /** Routing variable read from loop.runtime.variables. */
  var: string;
  /** Taken when the variable's value is one of these (mutually exclusive with default). */
  in?: (string | number | boolean)[];
  /** Default branch: taken only when no sibling guard on the same `var` matched its value. */
  default?: true;
}

export interface LoopStepDefinition {
  // …existing fields…
  /** Routing variables this step will set (declares a branch decision; for validation + UI). */
  produces?: string[];
  /** Branch guard. Absent → the step always runs (main line). */
  when?: StepGuard;
}
```

`produces` is advisory for validation/UI; the runtime source of truth is whatever
the step actually records in `variables`. If a step declares `produces:["route"]`
but never sets `route`, guards on `route` simply find no value → no match →
skip/default/block (see below). No silent coercion.

> Open decision to confirm: `produces` is the one small structural addition beyond
> pure convention. It is what lets the validator check "a guard's variable is
> produced upstream" and lets the UI mark branch points. If you'd rather have zero
> declaration and rely entirely on runtime behavior (weaker validation, harder UI
> tree), we drop `produces` — say the word.

## Engine behavior

Branch resolution runs each tick **before** `computeReadySteps`, as a pure
function over loop state. It marks steps `skipped` so their dependents and the UI
see the decision.

```text
resolveBranchSkips(loop):
  repeat until no change:
    for each step S with status 'pending' whose every dependency has an outcome:
      if S has ≥1 dependency and ALL dependency outcomes are 'skipped':
        mark S skipped("branch not taken")            # cascade down an un-taken branch
      else if S.when is set:
        v := loop.runtime.variables[S.when.var]
        taken := S.when.default
                   ? noSiblingInGuardMatched(S.when.var, v)
                   : (v is set AND S.when.in includes v)
        if not taken: mark S skipped("guard " + S.when.var + " did not match")
```

Key properties:

- **Guard never evaluates before its variable exists.** The validator requires the
  guard's `var` to be produced by a dependency-ancestor, and the loop only
  evaluates a step once all its dependencies have an outcome. By then the producer
  has either completed (variable set) or was itself skipped (its branch wasn't
  taken) — in which case the cascade rule skips this step first, before the guard
  is read.
- **Cascade before guard.** A step on an un-taken branch is skipped by the
  all-deps-skipped rule, so inner guards on un-set variables are never read.
- **Convergence runs.** A convergence step has at least one non-skipped dependency
  (the taken branch), so it is *not* all-skipped → it runs (subject to its own
  guard, usually none).
- **Mark `skipped` = record outcome** `{ status: 'skipped', summary }`, so the
  step status is `skipped` and dependents are satisfied.

### No-match safety net

If the judge returns a value that matches no `in` guard and the planner authored
no `default`, the alternatives all skip. If that cascades to the single
finalization sink (it becomes `skipped`), the loop has nothing that can emit
completion. The engine detects a **settled run whose finalization sink is
`skipped`** and blocks the loop with a clear reason
("all branches were skipped and no default branch ran — the judge's route matched
nothing"), surfacing it for a human (and the new Retry control). This is the
agreed "block on no-match without a default" behavior.

### Recurring loops

`rearmLoop` resets step states and clears `variables`
([scheduler.ts](../../../../plugins/sero-orchestrator-plugin/runtime/scheduler.ts)),
so each scheduled iteration re-runs the judge and re-routes. No special handling.

## Validation

Extends `validateLoopPlan`
([schema.ts](../../../../plugins/sero-orchestrator-plugin/runtime/schema.ts)).
Existing rules (acyclic, single finalization sink) are unchanged. New rules:

1. **Guard variable produced upstream (hard error).** For a step with
   `when.var = V`, some dependency-ancestor step must list `V` in its `produces`.
   This guarantees deterministic ordering (the route is decided before it is read).
2. **Guard shape (hard error).** `when` must have exactly one of: a non-empty `in`,
   or `default: true`.
3. **Default needs alternatives (warning).** A `default: true` guard on `V` with no
   sibling `in`-guard on `V` is pointless; warn, don't fail.

Deliberately **not** validated: that the judge can produce the values the `in`
guards expect (values are the model's domain — the default/block path handles
mismatches), and "exactly one branch" (see below).

## "Exactly one" is guidance, not a rule

A single routing variable holds one value, so mutually-exclusive `in` guards
naturally select at most one alternative. The engine does **not** forbid
overlapping guards on the same variable — if the planner authors two guards that
both match a value, both branches simply run and converge, which is harmless. The
planner prompt steers toward mutually-exclusive guards; the validator stays out of
it.

## Planner prompt

Add a BRANCHING section to `PLANNING_SYSTEM_PROMPT`
([planner-prompt.ts](../../../../plugins/sero-orchestrator-plugin/runtime/planner-prompt.ts)),
keeping it strictly optional:

- Default to a **linear** plan. Use branching only when the work genuinely diverges
  (a path that should sometimes be skipped, or alternative paths by what's found).
- To branch: author a **judge step** that records a routing variable (declare it in
  `produces`) and decides its value, then put a `when` guard on each conditional
  step. Unguarded steps always run.
- Keep guards on one variable **mutually exclusive** (one value ⇒ one path). For an
  exhaustive switch, include a `default` branch so an unexpected value still has a
  home.
- A branch can be a **single optional step** — don't force an A/B/C set.
- Everything still funnels to one finalization step.
- The judge is a `model` step when its inputs are already in variables, a
  `background-agent` when it must inspect files (ties to the model-vs-agent rule).

## Revisions and recovery

Guards and `produces` are ordinary `LoopPlan` fields, so they flow through the
existing paths for free: the recovery decider's `revise-plan` / `revise-step` and
the manual Refine action can add, remove, or reshape branches. All revised plans
go through the extended `validateLoopPlan`. Bounded by the existing attempt
limits. A review step that fails can therefore have recovery insert a guarded
deep-investigation branch for the next pass — composing branching with the
recovery loop you already have.

## UI

Full branch-tree rendering in `PlanView`
([ui/components/PlanView.tsx](../../../../plugins/sero-orchestrator-plugin/ui/components/PlanView.tsx)):

- Render the plan as a branch/merge tree rather than a flat list: a judge step
  (has `produces`) opens a branch point; its guarded dependents are grouped by
  route under it; branches re-merge at their convergence step.
- Each guarded step shows its condition (e.g. `if route ∈ [hard]`); the `default`
  branch is labeled as such.
- After a run, **un-taken (skipped) steps are greyed** and the branch point shows
  the route the judge chose, so the path taken is obvious at a glance.
- Read-only; authoring stays with the planner / Refine.

## Functional requirements

| ID | Requirement |
| --- | --- |
| FR-B1 | A step may declare `produces` (routing variables) and a `when` guard; absent guard ⇒ always runs. |
| FR-B2 | Before readiness each tick, a guarded step whose value doesn't match is skipped; a step whose dependencies all skipped is skipped (cascade). |
| FR-B3 | A `default` guard is taken only when no sibling `in`-guard on the same variable matched. |
| FR-B4 | A guard never evaluates before its variable's producer has resolved (validation + cascade guarantee). |
| FR-B5 | A settled run whose finalization sink is skipped blocks the loop with a clear reason. |
| FR-B6 | `validateLoopPlan` rejects a guard whose variable is not produced by a dependency-ancestor, and an ill-formed `when`. |
| FR-B7 | Recurring loops re-judge and re-route each iteration. |
| FR-B8 | revise-plan / revise-step / Refine may author and modify branches; revised plans are validated. |
| FR-B9 | The plan UI renders branches as a tree and greys un-taken steps with the chosen route. |
| FR-B10 | Branching is optional; non-branching plans behave exactly as today (byte-for-byte). |

## Test plan

Engine / readiness (mirror `readiness`/`run-engine` tests):

- guard match → taken; no match → skipped; default taken only when nothing matched.
- cascade: a multi-step un-taken branch fully skips from the head down.
- convergence: a step with one skipped + one succeeded dep runs.
- finalization-sink-skipped → loop blocks with the no-match reason.
- one optional step: `implement dependsOn [planning]` runs whether `planning` ran
  or skipped.
- nested branch: inner judge only runs on the taken outer path.

Schema:

- guard var not produced by an ancestor → error; `in`+`default` both/neither → error;
  lone `default` → warning.

Recurring: two iterations with different judge outputs route differently.

Recovery/Refine: `revise-plan` that adds a guarded branch validates and runs.

UI: branch tree renders; skipped steps greyed; chosen route shown.

Regression: every existing (non-branching) plan and test stays green (FR-B10).

## Phased implementation

1. **Engine + schema** — `StepGuard` / `produces` types, validation rules, the
   `resolveBranchSkips` pass, the finalization-skipped block. Unit tests. No UI; the
   planner doesn't author branches yet (hand-authored plans exercise it).
2. **Planner** — the BRANCHING prompt section so the planner authors branches when
   work diverges (linear by default). Fixture-prompt tests.
3. **UI** — full branch-tree rendering + skipped styling in `PlanView`.
4. **Docs** — fold the new fields into [01-data-model.md](01-data-model.md) and the
   run flow into [03-execution-and-scheduling.md](03-execution-and-scheduling.md);
   update the [index](index.md) and the user guide.

Each phase: `pnpm typecheck` green + orchestrator suite green before the next.
```
