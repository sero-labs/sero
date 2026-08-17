# Workflows in practice

This page covers the parts of Workflows you reach for once you have built a few:
running them on a schedule or an event, configuring a single step, recovering a
blocked run, and reusing a workflow across workspaces.

It assumes you have been through the [Workflows tutorial](/guide/workflows). For
exact commands, limits, and storage paths, see the
[Workflows reference](/reference/workflows).

## Run a workflow on a schedule or an event

A workflow does not have to wait for you to press a button. Say when it should
run as part of the description, or ask for it later in **Refine**:

- "run this every weekday at 9am"
- "run this whenever a file in `src/` changes"
- "run this when CI fails on main"

A scheduled or event-fired run behaves exactly like a manual one, including its
approval gates — it will still stop and wait for you, and Sero will still notify
you that it is waiting.

Two things are worth deciding up front. A workflow that runs on a file change can
fire often, so give it a narrow path. And a workflow that runs while you are away
should either work in a managed worktree or be allowed to run in the workspace,
which is the subject of the next section.

## When a workflow finds uncommitted changes

A workflow set to work directly in the workspace checks for uncommitted changes
before it edits anything. If it finds some, it asks first. The confirmation names
the workflow and the workspace, and says what happens if you do not answer.

- **Run isolated** is the safe default: the workflow uses a separate worktree and
  leaves your changes alone.
- **Run here** works alongside your changes. You can also allow that for this
  workflow from now on, or stash the changes first.
- **Skip this run** waits for the workflow's next normal trigger.

A scheduled or manual run can also **Snooze** — 15 minutes, 1 hour, 4 hours, or
9:00 AM tomorrow. A snooze survives a restart, and Sero checks the workspace
again before it starts. Event-fired runs cannot snooze, because their event
payload cannot be held.

The result is recorded in **Attempt history** as **Skipped** or **Snoozed**, with
the reason and the retry time. Both are different from **Waiting**, which means a
run is parked on your input or has no step it can run yet.

## Configure a single step

Most of the time the planner's choices are right. When they are not, every step
has a **Tune** control that overrides them for that step alone.

![Tune a single step's model and tools](../assets/images/orchestrator-tune-step.jpg)

You can change which **model** the step uses and which extra **tools** it may
reach for. Use it to give one expensive step a stronger model, or one narrow step
a tool the rest of the plan does not need.

A step can also run as one of your workspace's named **agents** — a specialist
role with its own instructions and default model.

![Choosing a specialist agent role for a step](../assets/images/orchestrator-tune-step2.jpg)

This is the better option when the difference is about *how* the step should
work, not just which model runs it. A "reviewer" agent brings its own standing
instructions; a model override does not.

## When a run gets stuck

A workflow **blocks** when it meets something it cannot get past on its own. It
stops, says why, and waits. It never fails silently, and it never repeats forever.

You have two ways out, and they are not interchangeable.

- **Retry step** resets that one step and continues from there, keeping every
  finished step. Use it once you have fixed whatever caused the block — a missing
  credential, a broken test, a file that was not there.
- **Restart** re-runs the whole plan from the first step and discards this run's
  progress. Anything already committed stays committed. Use it when you want to
  make a different choice this time.

Retrying changes nothing on its own. If the cause is still there, the step
reaches the same conclusion and blocks again. When that happens, either fix the
cause, restart and answer differently, or **Refine** the plan so the step is no
longer asked for something impossible.

## Improve a workflow from its own history

Every workflow keeps a record of its runs. **Reflect** reads that history and
suggests how the workflow could run better — a clearer instruction, a check that
should have been there. **Reflect all**, at the top of the panel, does the same
across every workflow that has run.

Suggestions wait for you. **Approve** applies one to the plan; **Reject** keeps a
one-line reason so the same idea is not offered again. Nothing changes on its
own, and reflection only runs when you ask for it.

## Save a workflow and use it elsewhere

The **Workflow Library** is a collection that follows you across every workspace
in your Sero profile.

On a workflow, open **Library → Save to Library**. The first save creates an
entry; later saves add a **version** with an optional note about what changed. A
save stores the plan, schedule, limits, and context — never the run history.

Click **Library** in the panel header to browse what you have saved. **Load**
drops a fresh copy into the current workspace as a draft, which you review and
activate like any other. When a newer version is saved from anywhere, a loaded
workflow offers to **Update** to it.

## Install a ready-made workflow

Next to My Library is the **Catalog**: curated workflows from the official Sero
catalog, marked **Verified**, plus any catalog repositories you add. A private
company repository works as a team catalog.

Press **Install** and the planner adapts the workflow to your workspace, asking
first when it needs something only you know — which repository to watch, which
branch is yours. The result is an ordinary draft: read the plan, then activate.

When the catalog publishes a better version, your installed workflow shows a
version badge. **Update & re-adapt** brings in the new version and re-fits it to
this workspace.

## Where next

- [Workflows tutorial](/guide/workflows) — the walkthrough, if you skipped it.
- [Workflows reference](/reference/workflows) — commands, triggers, delivery
  options, limits, recovery rules, and storage paths.
- [Rooms](/guide/rooms) — for work that needs several agents talking to each
  other rather than one plan running to completion.
