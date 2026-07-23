# 17 — Bounded dynamic fan-out

## Summary

A step may declare a statically validated `fanOut` so the **runtime** expands it
into one activation per item of an upstream array variable. The plan graph stays
fixed; only the activation count varies between runs, within bounds declared at
planning time.

Example: one run identifies 3 codebase areas and creates 3 scout activations;
another run identifies 10 and creates 10. The durable plan is unchanged either
way. This gives dynamic delegation without letting the runtime or an agent
rewrite the workflow graph.

## Plan model

```ts
interface FanOutDefinition {
  itemsFrom: string;       // upstream array variable (must be in an ancestor's "produces")
  itemVariable: string;    // name each activation receives its item under
  itemKey?: string;        // field read from each item for a stable key; omitted ⇒ index
  minItems?: number;       // default 1
  maxItems: number;        // mandatory hard cap, ≤ MAX_DYNAMIC_FAN_OUT_ITEMS (50)
  maxConcurrency?: number; // parallel activations; also capped by limits.maxConcurrentSteps
  overflow?: 'block';      // the only mode: too many items blocks visibly, never truncates
}
```

`LoopStepDefinition.fanOut?: FanOutDefinition` (shared/fanout-types.ts).

### Validation (fan-out-plan.ts, wired into `validateLoopPlan`)

Shape: `itemsFrom`/`itemVariable` required and distinct; `maxItems` a positive
integer ≤ 50 (host policy); `0 ≤ minItems ≤ maxItems`; `maxConcurrency ≥ 1`;
`overflow` only `"block"`.

Graph: the source variable must be in a dependency ancestor's `produces`; the
step must be `background-agent`; it cannot be the finalization step, an approval
gate, a feedback source, or inside the bounded feedback region. Nested fan-out
cannot be expressed (one definition per step, no runtime graph mutation).

The route contract (route-contract.ts) additionally enforces the **producer**
side at run time: a step whose `produces` names a fan-out source variable must
record it as an array in its StepOutcome, or its "succeeded" reply is repaired
in-session / demoted to `needs-revision` — the same defence-in-depth used for
routing variables.

## Runtime model

State (all durable):

- `LoopRuntimeState.fanOutStates?: Record<stepId, { manifest, aggregate? }>` —
  the manifest is written **before** any activation starts and is immutable for
  its run; the aggregate is written at the join. Cleared by `rearmLoop`.
- Per-item `StepActivation` records on the run with
  `fanOut: { index, key, item }` and id `<runId>:<stepId>:<key>`. Keys come from
  `itemKey` (normalised to the safe slug alphabet, duplicates rejected) or the
  item index. Per-item `StepAttempt`s reference their activation and write
  per-key artifacts (`<stepId>-<key>-a<n>.txt`).

### Execution (fan-out-run.ts)

The engine batches a ready fan-out step **alone** (its concurrency budget goes
to its own activations; sibling ready steps run on following ticks). The runner:

1. Reuses this run's persisted manifest, else expands the source variable.
   Invalid input — missing/non-array source, `< minItems`, `> maxItems`,
   duplicate or unusable keys — yields a `blocked` join outcome with a precise
   report (count, cap, variable, step, key sample) and starts nothing.
2. Persists manifest + pending activations, then runs waves of
   `min(fanOut.maxConcurrency, limits.maxConcurrentSteps)` activations through
   the ordinary step executor, committing per wave. Each activation's prompt
   carries its item (`variables.<itemVariable>`), its key/index, and the
   instruction to work only on that item. Management limits are checked between
   waves. Each activation runs at most once per step-run.
3. Joins: all activations settled (`succeeded`/`skipped`) ⇒ a `succeeded`
   outcome recording the aggregate under **`<itemsFrom>Results`**
   (e.g. `scoutAreas` → `scoutAreasResults`); otherwise a `failed` outcome
   naming the unsettled keys.

The join outcome rides one synthesized join attempt through run-batch's normal
path, so downstream readiness, recovery, parking, and completion are unchanged:

- **Join semantics** — a dependent step becomes ready only when the fan-out
  step's outcome is `succeeded`/`skipped`, i.e. after every activation is
  terminal. The aggregate is in loop variables, the run digest (one row per
  activation, labelled `[key]`), and the UI.
- **Per-activation recovery** — a failed aggregate goes to the recovery
  decider; `retry-step` re-enters the runner in the same run, the manifest is
  reused, and only unsettled activations re-run. Succeeded siblings keep their
  activation identity and history.
- **Questions** — an activation that asks the user parks the loop through the
  standard pending-input flow; already-settled siblings stay settled for
  retries within the run.
- **Branch guards** — a guarded fan-out step whose route wasn't taken is
  skipped before expansion: no manifest, no activations, normal skipped
  semantics downstream.

### Restart behaviour

The manifest is keyed to its run. Within a run (recovery retries, crash-free
re-ticks) activations are reconstructed exactly. Across runs (recurring re-arm,
user retry/restart, post-crash reconcile) the step re-expands from the persisted
variables — deterministic for unchanged input, and a fresh visit semantically,
matching how ordinary steps re-run.

## Planner

The planning prompt documents the `fanOut` field and when to use it (an earlier
step discovers a bounded list of same-instruction, parallel-safe items a later
step must join) and when not to (unbounded queues, polling, sequential work,
per-item unique instructions, mechanical retries, or a count knowable at
planning time). It requires mandatory `maxItems`, conservative
`maxConcurrency`, the producer recording the collection under the exact
`itemsFrom` name, and the join step depending on the fan-out step normally.

## UI

The plan spine keeps **one** step card per fan-out step (activations are
runtime detail, not permanent graph nodes). The card shows a declaration badge
(`⇉ one per scoutAreas · up to 10`) and, once expanded at runtime, a compact
status headline ("3 of 3 succeeded") expandable to one row per activation
(status pill, key, outcome summary) — built by `ui/lib/fan-out-summary.ts` from
the newest run's activations.

## Excluded from this iteration

Truncate/batch overflow modes, partial-success completion policies
(`minimum-successes` / `best-effort`), an `empty: "skip"` mode, nested fan-out,
fan-out inside feedback regions, per-item execution overrides, and cross-run
manifest reuse. The bounds (`maxItems` ≤ 50, mandatory manifest, loop limits,
no runtime graph mutation) are the safety controls that make the rest safe to
add later.
