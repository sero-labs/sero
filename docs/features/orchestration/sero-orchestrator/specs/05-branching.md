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

- A judge step records a **routing variable**; every step that belongs to a branch
  carries a **guard** keyed to it. A step is skipped when its own guard doesn't
  match; unguarded steps always run, so the main line and convergence continue past
  skipped ones (a skipped dependency already satisfies dependents).
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
`in` guard matches). **Every step inside a branch carries that branch's guard** —
not just the head — so a multi-step branch skips entirely when its route isn't
chosen. The `fallback` carries `when: { var: "route", default: true }` and is taken
only when the value matched no sibling `in` guard — the **planner-authored default**
that guarantees work runs when the judge returns an unforeseen value.

### Multiple / nested branch points

A plan may have several branch points keyed to different variables, including a
branch inside a branch. Nesting is free — the inner judge is guarded on the outer
route, so it only runs on the taken outer path; when it doesn't run, its routing
variable stays unset, and the inner branch steps (guarded on that variable) skip
because an unset route is never taken.

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
but never sets `route`, guards on `route` find no value → not taken → those steps
skip. No silent coercion.

> Open decision to confirm: `produces` is the one small structural addition beyond
> pure convention. It is what lets the validator check "a guard's variable is
> produced upstream" and lets the UI mark branch points. If you'd rather have zero
> declaration and rely entirely on runtime behavior (weaker validation, harder UI
> tree), we drop `produces` — say the word.

## Engine behavior

Branch resolution runs each tick **before** `computeReadySteps`, as a pure
function over loop state. It marks guarded steps `skipped` so their dependents and
the UI see the decision. **There is no cascade**: a step is skipped only by its
*own* guard. Unguarded steps always run.

```text
resolveBranchSkips(loop):
  repeat until no change:                                # a chain of guards settles in one tick
    for each step S with status 'pending', a guard S.when, and every dependency resolved:
      v := loop.runtime.variables[S.when.var]
      taken := (v is undefined) ? false                 # judge for this route never ran
             : S.when.default    ? noSiblingInGuardMatched(S.when.var, v)
             :                      (S.when.in includes v)
      if not taken: mark S skipped("route " + S.when.var + " did not match")
```

Key properties:

- **Every branch step carries a guard.** A step is skipped only when its own guard
  doesn't match — so the planner must guard *every* step that belongs to a branch
  (its head, its interior, and its internal convergence), not just the first.
  Unguarded steps always run.
- **The main line continues past a skipped optional step.** A skipped dependency
  already satisfies dependents, so an unguarded step whose only dependency skipped
  still runs (this is the *"simple → straight to implementation"* case).
- **Un-taken nested branches skip for free.** A guard is only evaluated once its
  dependencies resolved; if its routing variable is still unset (its judge was
  itself skipped on an un-taken outer branch) the guard is *not taken*, so the
  inner step skips without needing the outer condition repeated.
- **Convergence runs.** An unguarded convergence/finalization step runs whichever
  branch was taken — its skipped dependencies still satisfy it.
- **Mark `skipped` = record outcome** `{ status: 'skipped', summary }`, so the step
  status is `skipped` and dependents are satisfied.

### No-match

If the judge returns a value that matches no `in` guard and the planner authored
no `default`, the alternatives all skip — but the **finalization step is unguarded
and still runs**. Per the completion model it confirms whether the objective is met
and, finding nothing was done, emits `blocked` — so the loop blocks with the
finalize step's own (informative) reason rather than a synthetic engine error. A
planner-authored `default` branch is how you guarantee *some* work runs instead.
No special engine machinery; "block on no-match without a default" falls out of the
existing completion path.

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

Deliberately **not** validated: that the judge can produce the values the `in`
guards expect (values are the model's domain — a `default` branch or the finalize
step's judgment handles a mismatch), "exactly one branch" (see below), and a lone
`default` with no sibling `in`-guard (harmless — it simply runs whenever its
variable was set).

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
  `produces`) and decides its value, then put a `when` guard on **every** step that
  belongs to a branch — its head, its interior steps, and its internal convergence,
  not just the first. Unguarded steps always run, so leave only the true main line
  unguarded.
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
| FR-B2 | Before readiness each tick, a guarded step whose route doesn't match is skipped; there is no cascade — only a step's own guard skips it. |
| FR-B3 | A `default` guard is taken only when no sibling `in`-guard on the same variable matched. |
| FR-B4 | A guard never evaluates before its dependencies have resolved (so its routing variable is decided, or its judge was skipped → unset → not taken). |
| FR-B5 | On no-match with no default, branches skip and the unguarded finalization step runs and judges completion (emits `blocked` if nothing was done). |
| FR-B6 | `validateLoopPlan` rejects a guard whose variable is not produced by a dependency-ancestor, and an ill-formed `when`. |
| FR-B7 | Recurring loops re-judge and re-route each iteration. |
| FR-B8 | revise-plan / revise-step / Refine may author and modify branches; revised plans are validated. |
| FR-B9 | The plan UI renders branches as a tree and greys un-taken steps with the chosen route. |
| FR-B10 | Branching is optional; non-branching plans behave exactly as today (byte-for-byte). |

## Test plan

Engine / readiness (mirror `readiness`/`run-engine` tests):

- guard match → taken; no match → skipped; default taken only when nothing matched.
- every-step-guarded: a multi-step un-taken branch fully skips (each via its guard).
- convergence: an unguarded step with one skipped + one succeeded dep runs.
- one optional step: `implement dependsOn [planning]` (unguarded) runs whether
  `planning` ran or skipped.
- nested branch: inner branch steps skip when the outer route isn't taken (their
  routing variable stays unset).
- no-match with no default: branches skip; the unguarded finalize step still runs.

Schema:

- guard var not produced by an ancestor → error; `in`+`default` both/neither → error.

Recurring: two iterations with different judge outputs route differently.

Recovery/Refine: `revise-plan` that adds a guarded branch validates and runs.

UI: branch tree renders; skipped steps greyed; chosen route shown.

Regression: every existing (non-branching) plan and test stays green (FR-B10).

## Phased implementation

1. **Engine + schema** — `StepGuard` / `produces` types, validation rules, the
   `resolveBranchSkips` pass. Unit tests. No UI; the planner doesn't author branches
   yet (hand-authored plans exercise it).
2. **Planner** — the BRANCHING prompt section so the planner authors branches when
   work diverges (linear by default). Fixture-prompt tests.
3. **UI** — full branch-tree rendering + skipped styling in `PlanView`.
4. **Docs** — fold the new fields into [01-data-model.md](01-data-model.md) and the
   run flow into [03-execution-and-scheduling.md](03-execution-and-scheduling.md);
   update the [index](index.md) and the user guide.

Each phase: `pnpm typecheck` green + orchestrator suite green before the next.
```
