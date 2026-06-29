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

## Home — what needs you

The Orchestrator panel opens on **Home**: a single "Needs you" list that gathers
every loop waiting on you — questions to answer and suggested improvements to
approve or reject — so you can clear them in one place without opening each loop.
Below it is an overview of all your loops, grouped by status. Click any loop to
open its detail view. Once you have a lot of loops, a **search** box appears to
filter the overview by name, and each status group shows the most recent first
with a **Show more** to reveal the rest.

You don't have to keep the panel open. When a loop **finishes** or **blocks**
(stops on a problem it can't get past) while you're away, Sero sends you a
notification with the loop's name and what happened — the same way it tells you
when a loop has a question.

## Create a loop

Click **New loop** and you're walked through three steps:

1. **Describe** — say what you want done (include any schedule). Choose whether to
   run in a **managed worktree** (default — an isolated copy of the repo, leaving
   your working files untouched) or in the workspace directly.
2. **Clarify** — if the AI needs more detail before it can plan, it asks a few
   questions here. Answer them and it builds the plan.
3. **Review** — read the plan the AI wrote, refine it in plain English, then
   **Save as draft** or **Activate** the loop.

You can also use the agent tool or slash command:

```text
/orchestrator create Review open pull requests and summarize risky changes
/orchestrator list
/orchestrator show <loopId>
/orchestrator activate <loopId>
/orchestrator disable <loopId>
/orchestrator enable <loopId>
/orchestrator run_next <loopId>
/orchestrator run_again <loopId>
/orchestrator retry_step <loopId> <stepId>
/orchestrator reflect <loopId>
/orchestrator reflect_workspace
/orchestrator answer <loopId> yes, drop the old table
/orchestrator revise <loopId> add a final validation step
/orchestrator delete <loopId>
```

**Disable** turns a running loop off and stops any work in progress; **Enable**
turns a disabled loop back on. **Run again** restarts a finished loop.

If a step **blocks** or **fails** (it stops — e.g. it found a problem it can't
fix on its own), you have two ways to recover:

- **Retry step** — a button on the blocked/failed step itself, in the plan. It
  resets *that* step and runs the loop on from there, keeping finished work. The
  reason it stopped is shown on the step, right next to the button. Use this when
  you've fixed the underlying cause.
- **Restart** — a loop-level button that re-runs the *whole plan from the first
  step*, discarding this run's progress (any commits or PRs already made are
  kept). Use this for a clean restart — for example to make a different choice
  this time. A loop is never a dead end: a blocked loop can always be restarted.

Retry won't help if nothing has changed — the step will reach the same
conclusion and block again. In that case, either Restart and choose differently,
or **Refine** the plan. (Some blocks are loop-wide — a hit limit, an invalid
plan — and aren't tied to one step; those show at the top of the loop with
Restart / Refine as the way out.)

When you create a loop, the model returns a plan and Orchestrator checks it
(unique step ids, valid and acyclic dependencies, supported step types, at least
one step). An invalid plan is repaired once; if it still fails it is saved as a
blocked draft with the errors and **cannot be activated**.

## Inspect a loop

Open a loop to get a single, calm column. From the top:

- a **header** with the title, the loop's status, and badges for anything that
  needs you (questions, suggestions) or a newer Library version;
- a **summary line** of the essentials — which workspace it runs in, its schedule
  (or "Manual only"), how many times it has run, operational limits, and a
  **lifetime usage** chip (total tokens and cost, and — when you've set a token or
  cost limit — how much budget is left);
- the **controls** for this loop (see above), the **Context** button, and **Save
  to Library**.

Below the header, anything that needs attention surfaces first: a question to
answer, suggested improvements, warnings, and any block. While a loop is running,
a small **live-activity** strip shows what it's doing right now.

Two sections then hold the detail and stay out of the way until you open them:

- **Plan** (open by default) — the steps grouped by order, each with its status
  and, on a blocked or failed step, the reason and a **Retry step** button. Below
  the plan is a box to **refine** it in plain English (which can also change the
  loop's goal, schedule, or stop condition).
- **Attempt history** (collapsed) — one row per run, newest first, with a one-line
  summary of what happened and that run's time, tokens, and cost (cost shows only
  for models with known pricing). It pages with **Show more**.

**Context.** The **Context** button on a loop sets a custom system prompt and
hides chosen skills for that loop's background work. Leave the system prompt
blank to use Sero's default, type to replace it, or clear it to drop the default
entirely. This applies to every background step the loop runs (the per-step rules
the loop needs to report its results always still apply). Tools are chosen per
step in the plan, not here.

## Loop Library

The **Loop Library** is a shared collection of saved loops. Build a loop once,
save it to the Library, and load it into any of your workspaces. It is shared
across every workspace in your Sero profile — one place to keep the loops you
reuse.

**Save a loop.** On a loop, open **Library** and choose **Save to Library**. The
first save creates a new entry; later saves add a new **version** to it. You can
add a short "what changed" note. Saving stores the loop's plan, triggers, limits,
and context — never its run history.

**Load a loop.** Click **Library** in the panel header to open the browser. Pick
an entry and **Load** it (the latest version by default, or open **Versions** to
load an older one). Loading creates a fresh draft loop in the current workspace,
linked back to that version. Review it, then activate it like any new loop.

**Stay up to date.** A loaded loop shows which version it is on. When a newer
version is saved — from any workspace — the loop shows **"vN available"**; click
**Update** to move to it, or pick any version to **switch** (you can roll back
too). Switching only changes the plan: your own triggers, limits, context, and
per-step model choices stay put. You can switch only when the loop isn't mid-run.

**Unlink** detaches a loop from the Library — it keeps its current plan and stops
tracking versions. Deleting a Library entry never affects loops already loaded
from it.

You can also use the agent or slash command:

```text
/orchestrator library_list
/orchestrator library_save <loopId> new-version
/orchestrator library_load <entryId> [version]
/orchestrator library_set_version <loopId> <version>
/orchestrator library_unlink <loopId>
```

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

## Questions and approvals

A loop can pause to ask you something — when a step hits a decision only you
should make (an irreversible change, a missing detail, "confirm before doing
this"), or when the plan can't be built without more information.

- **A step asks.** The loop pauses with a **Needs your input** card on the loop:
  the question, any quick-pick buttons, and a box to type your own answer. The
  step runs again with your answer once you send it.
- **The planner asks.** If your description is missing something essential, the
  new loop is created but not started — it shows the planner's questions. Answer
  them and the plan is built; you then review and activate it as usual.

The loop **waits** until you answer — there's no timeout and no default, and a
scheduled loop won't run again while a question is open. Open questions appear in
the **Home** "Needs you" list (and as a count in the loop list), and you can
answer them right there without opening the loop. You can also answer from the
agent with `/orchestrator answer <loopId> <your answer>`.

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
suggested again. Nothing changes on its own. Pending suggestions appear in the
**Home** "Needs you" list, where you can approve or reject them in place.

Reflection only suggests changes to the plan and step instructions, and only when
you ask — it never runs on its own.

## Triggers

A loop can be run manually, on a **cron** schedule, by an **event**, or a
**hybrid** of both. Triggers only mark a loop *due* — Orchestrator still applies
the lifecycle, the per-loop lock, and the limits before anything runs. A cron
loop that became due while Sero was closed runs once on next open (missed fires
collapse into a single catch-up run).

You don't set a schedule through a form — you describe the cadence in the loop's
prompt (for example, "every weekday at 9am"). This is deliberate: a loop is
authored in plain language, not dialled in through fields. To change the timing
later, **Refine** the loop and describe the new cadence — Sero re-derives the
schedule from your wording. The schedule and triggers are shown read-only in the
summary line so you can see what's set.

## Management limits

Orchestrator caps how a loop runs: maximum attempts per step, maximum total
attempts, maximum steps at once, wall-clock time, and tokens or cost when those
are reported. When a limit is reached the loop is blocked with a clear reason.

These are management controls only. They do **not** restrict what a step's agent
is allowed to do — step work runs through standard Sero execution with the normal
runtime tools. Orchestrator adds no separate permission, approval, command, or
tool-policy layer.

Limits are set when the loop is created — sensible defaults, adjusted from your
description — and aren't edited through a form afterwards, by design (the same
plain-language authoring as the schedule). The summary line shows the caps and,
once a token or cost limit is set, how much budget is left.
