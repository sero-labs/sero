# Bounded feedback workflows

Orchestrator supports one explicit, bounded return from a completed step to one
strict dependency ancestor. This covers workflows such as implement, verify,
fix, and verify again without turning the dependency DAG into a general workflow
network.

## Plan shape

The feedback declaration lives on the later barrier step:

```ts
interface StepFeedbackTransition {
  id: string;
  toStepId: string;
  when: {
    var: string;
    in: Array<string | number | boolean>;
  };
  maxTraversalsPerRun: number;
}
```

The source step must list `when.var` in `produces` and record it in its own
`StepOutcome.variables`. A matching value returns to `toStepId`; a non-match
continues through the normal forward dependencies.

Only one feedback declaration is allowed. The target must be a strict dependency
ancestor of the source. The repeated region is the intersection of steps
reachable from the target and steps able to reach the source barrier. It must
have one entry at the target and one exit at the source. Finalisation and approval
steps cannot be inside it.

## Visits and attempts

Every logical visit is persisted as a `StepActivation`. A recovery retry adds an
attempt to the current activation. A feedback return creates a new activation
with the next visit number. This keeps `Implement #1` and `Implement #2` distinct
in run history even though readiness continues to use one mutable `stepStates`
entry per step definition.

The run index and UI render the activation sequence. Persisted runs created before
this feature remain valid because activation and attempt-link fields are optional.

## Traversal

When feedback matches, Orchestrator persists the following together:

- the completed source activation and attempt;
- the incremented per-run traversal count;
- explicit source outcome context for the next target activation;
- the reset of only the feedback region;
- removal of variables declared in `produces` by region steps, except `notes`.

The next target prompt receives the source summary, variables, observations and
artifact reference as a dedicated feedback block. It does not rely on stale
shared routing variables.

`maxTraversalsPerRun` counts returns, not the initial pass. When the condition
matches after the bound is reached, the source result becomes a synthetic
`needs-revision` outcome and enters normal recovery. The engine never continues
forward as if verification passed and never exceeds the bound.

Recurring and manually rearmed runs start with fresh traversal state.

## Non-goals

- multiple, nested, or overlapping feedback regions;
- arbitrary runtime routing or topology changes;
- unbounded repetition, schedules, polling, watches, or queues;
- implicit cancellation or compensation;
- a free-form graph editor.

The accepted architectural rationale is in
[bounded-cyclic-workflows-decision.md](../bounded-cyclic-workflows-decision.md).
