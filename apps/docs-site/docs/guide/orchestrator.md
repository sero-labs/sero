# Orchestrator

Orchestrator is a built-in plugin (`@sero-ai/plugin-orchestrator`) for running
durable **loops**. You describe a goal in plain language; the model turns it into
a step plan; Orchestrator runs the steps, recovers from failures, and finishes
only when the plan says the work is done.

Orchestrator does not define a fixed workflow. The steps come from the model, so
the same machinery can drive code work, triage, research, inbox review, or any
other multi-step task.

Sero is in **public beta**. Treat loops as helpful local automation, not a
guaranteed job runner.

## What a loop is

A loop holds:

- your original prompt;
- a generated **step plan** (steps, their dependencies, and what each step is
  expected to produce);
- the run history (attempts, outcomes, recovery decisions);
- workspace, trigger, and limit settings.

Steps can run one after another (sequential) or at the same time (parallel),
depending on how the plan wires their dependencies.

## Create a loop

In the Orchestrator panel, click **New loop**, describe the work, and choose:

- **Run in a managed worktree** (default) — background work runs in an isolated
  copy of the repo, leaving your working files untouched.
- **Activate after creating** — start the loop immediately once the plan is
  valid.

You can also use the agent tool or slash command:

```text
/orchestrator create Review open pull requests and summarize risky changes
/orchestrator list
/orchestrator show <loopId>
/orchestrator activate <loopId>
/orchestrator pause <loopId>
/orchestrator resume <loopId>
/orchestrator stop <loopId>
/orchestrator run_next <loopId>
/orchestrator retry <loopId>
/orchestrator reflect <loopId>
/orchestrator reflect_workspace
/orchestrator revise <loopId> add a final validation step
```

If a step **blocks** (it stops and waits for you — e.g. it found a problem it
can't fix on its own), fix the underlying cause and then **Retry**: this resets
the blocked step, clears the block, and runs the loop on from there. Steps that
already succeeded are left alone, so finished work is never redone. Retry is also
a button on the loop detail view whenever a loop has a blocked or failed step.

When you create a loop, the model returns a plan and Orchestrator checks it
(unique step ids, valid and acyclic dependencies, supported step types, at least
one step). An invalid plan is repaired once; if it still fails it is saved as a
blocked draft with the errors and **cannot be activated**.

## Inspect a loop

The loop detail view shows:

- the generated steps, their dependencies, and expected outcomes;
- each step's status and attempt history;
- which workspace the loop resolved to;
- recovery decisions, the completion signal, and any block;
- triggers and management limits.

## Example plans

**One step** — a single background-agent step that does the work.

**Sequential** — step *B* depends on step *A*, so *B* only starts after *A*
succeeds.

**Parallel** — *left* and *right* both depend only on *root*, so they start
together after *root* succeeds (up to the concurrency limit), then a *join* step
combines them.

**Branching** — when the right next steps depend on what an earlier step finds
(e.g. *"if the change is simple, implement directly; if it's hard, plan first"*),
the model adds a **judge** step that decides a route and **guarded** steps that run
only on the matching route. The branch that isn't taken is skipped; the rest of the
plan continues. The plan view shows the branch point, the route that was chosen,
and greys out the steps that didn't run.

You do not author these shapes directly — they fall out of the dependencies and
guards the model writes into the plan.

## How loops recover and finish

- **Recovery is the model's decision.** When a step fails, Orchestrator asks the
  model what to do: retry the step, revise the step, revise the plan (which is
  how steps are added, removed, or reordered), skip the step, wait, or block the
  loop. Revisions are validated before they are applied.
- **Completion comes from a planned step.** Orchestrator never guesses that a
  loop is "done". The model includes a validation or finalization step, and that
  step emits an explicit completion signal. If every known step has succeeded but
  no step signals completion, the loop simply waits.

## Reflection (self-improvement)

Loops keep a short, durable record of each run — what each step did, what failed,
what was retried — stored alongside the loop. **Reflect** reads that history and
suggests how the loop could run better next time.

- **Reflect** (on a loop) looks at that one loop's past runs and proposes
  improvements to its plan or a step's wording. If nothing is clearly worth
  changing, it says so — it won't invent busywork.
- **Reflect All** (top of the panel) runs the same pass over every loop with run
  history, one after another, and tells you how many suggestions it found.

Each suggestion waits for you. **Approve** applies it to the plan straight away
(recorded in the loop's revision history, exactly like a manual refine);
**Reject** asks for a one-line reason and keeps it, so the same idea isn't
suggested again. Nothing changes on its own. Loops with suggestions waiting show a
small count in the loop list.

Reflection only suggests changes to the plan and step instructions, and only when
you ask — it never runs on its own.

## Triggers

A loop can be run manually, on a **cron** schedule, by an **event**, or a
**hybrid** of both. Triggers only mark a loop *due* — Orchestrator still applies
the lifecycle, the per-loop lock, and the limits before anything runs. A cron
loop that became due while Sero was closed runs once on next open (missed fires
collapse into a single catch-up run).

## Management limits

Orchestrator caps how a loop runs: maximum attempts per step, maximum total
attempts, maximum steps at once, wall-clock time, and tokens or cost when those
are reported. When a limit is reached the loop is blocked with a clear reason.

These are management controls only. They do **not** restrict what a step's agent
is allowed to do — step work runs through standard Sero execution with the normal
runtime tools. Orchestrator adds no separate permission, approval, command, or
tool-policy layer.
