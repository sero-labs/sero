# Workflows

Use a Workflow when you can describe a result and let Sero plan the steps. A
Workflow can run once, on a schedule, or after an event such as a file change or
a failed CI check. It keeps its plan and run history after Sero restarts.

You do not need to design the steps. Describe the result, review the plan, and
activate it. Sero can run independent steps at the same time and can stop for
your answer when it needs a decision.

Use a [Room](/guide/rooms) instead when several agents need to discuss one
problem, divide the work, and change their approach while they work. For a short
comparison, see [Orchestrator](/guide/orchestrator).

Sero is in public beta. Check important results before you use or publish them.

## How a Workflow works

A **workflow** is three things:

- **your goal** — the prompt you wrote ("review open issues and fix the simple
  ones");
- **a step plan** — the steps Sero wrote to reach that goal, and how they
  connect;
- **its history** — every run, what each step did, and any decisions you made.

You describe the goal. Sero writes the plan, runs the steps in order — some can
run at the same time — and stops to ask you whenever a step needs a decision
only you should make. It finishes only when the plan says the work is genuinely
done; it never just guesses that it's finished.

The two examples below use a test project. The
[setup steps](#set-up-the-demo-project) are at the end.

## Create your first Workflow

We'll start small: read a project's README and write a short changelog from it.

**1. Open the panel and click New.** The first step of the wizard asks what you
want done.

![Describe what you want done](../assets/images/orchestrator-new-describe.jpg)

Type your goal in plain English:

> Read README.md, then write a concise CHANGELOG.md summarising the project, and
> verify the file was created.

Leave **Run in a managed worktree** turned on. This runs the workflow on its own
copy of your files (its own branch), so your working files are never touched
while it works.

**Deliver results to** decides where the finished work goes. **Automatic**
matches the placement — a worktree workflow opens a pull request, a workspace-root
workflow leaves the files in place. You can instead pick a saved report file, a
Gmail draft, or an outward send (email, chat message, webhook). Outward sends
always show you the exact content first and wait for your approval before
anything leaves the machine. Leave it on **Automatic** here and click
**Generate plan →**.

**2. Review the plan.** Sero turns your sentence into steps.

![Sero wrote the steps for you](../assets/images/orchestrator-new-review.jpg)

Each box is one step. The line joining them means the second step waits for the
first to finish. You can adjust anything here in plain English using the box at
the bottom of the plan — but this plan is fine, so click **Activate workflow →**.

**3. Watch it run.** The workflow opens and starts working. A green strip shows what
it's doing right now, with a live count of time and tokens used.

![The workflow running](../assets/images/orchestrator-loop-running.jpg)

**4. Done.** When the last step finishes, the workflow reports that it's complete and
every step shows as finished. The **Attempt history** below records this run.

![The workflow finished](../assets/images/orchestrator-loop-complete.jpg)

## When a workflow finds uncommitted changes

A workflow set to work directly in the workspace checks for uncommitted changes
before it edits files. If it finds any, the confirmation names the workflow and
workspace and shows what will happen if you do not answer.

**Run isolated** is the safe default: the workflow uses a separate worktree and
leaves your changes alone. Use **Run here** to work alongside the changes, allow
that behavior for this workflow, or stash the changes first. **Skip this run** waits
for the workflow's next normal trigger.

For a scheduled or manually started run, **Snooze** can retry in 15 minutes, 1
hour, 4 hours, or at 9:00 AM the next day. The snooze survives a Sero restart,
and Sero checks the workspace again before starting. Event-fired runs do not
offer snooze because their event payload cannot be discarded. **Open workflow**
takes you to the correct workspace and workflow without answering the confirmation.

The workflow's **Attempt history** records the result as **Skipped** or **Snoozed**,
including the reason and retry time. These are separate from **Waiting**, which
means a run is parked on input or has no runnable step.

## Create a Workflow with conditional steps

Now a workflow that has to make choices. We'll point it at the demo project's
`issues/` folder, which holds a mix of work: one simple typo fix and two that
need code changes.

Click **New**, and in **Describe** type:

> Review all the open issues in the issues/ folder in one run, working on the
> independent ones at the same time. For each issue: if it's a simple typo or
> docs fix, draft the change directly; if it's a code change, write a short plan
> first and ask me before making any edits. When you're done, summarise what you
> did. Run this only when I trigger it.

![Describing a bigger, multi-issue goal](../assets/images/orchestrator-issues-describe.jpg)

**Sometimes Sero asks first.** If your goal is missing a detail it needs, the
workflow is created but not started — it shows the planner's questions, you answer
them, and it builds the plan. For a clear goal like this one it goes straight to
the plan.

**The plan chooses steps from what it finds.** Sero's first step classifies the
issues. The plan then uses a condition to choose the docs-fix steps, the
code-change steps, or both.

![The plan branches on the issue type](../assets/images/orchestrator-plan-branch.jpg)

**Independent work runs at the same time.** Because the demo has both kinds of
issue, both arms of the branch are taken — and Sero runs them together instead of
one after another. The live view shows both steps *running* side by side.

![Two steps running in parallel](../assets/images/orchestrator-plan-parallel.jpg)

You do not need to draw this plan. To change its structure, describe the change
in the **Refine** box.

**It pauses to ask you.** Your goal said "ask me before making any edits" for code
changes. When the workflow reaches that point it stops and shows a **Needs your input**
card — the question, quick-pick buttons, and a box for your own answer — and waits
as long as it takes (there's no timeout). It continues the moment you answer, and
your answer is saved with the workflow.

**You can configure one step.** Every step has a **Tune** control. Open
it to override, for that step alone, which **model** it uses and any extra **tools**
it may use — the defaults the planner chose are usually fine.

![Tune a single step's model and tools](../assets/images/orchestrator-tune-step.jpg)

**Custom agent roles.** You can also run a step as one of your workspace's named
**agents** — a specialist role with its own instructions and default model — when
one suits the step better than the default.

![Choosing a specialist agent role for a step](../assets/images/orchestrator-tune-step2.jpg)

**You can rewrite the plan in plain English.** The **Refine** box changes the plan,
its schedule, or its stop condition — just describe what you want and Sero
re-writes the steps.

![Refine the plan in plain English](../assets/images/orchestrator-refine.jpg)

When every step is done, the workflow summarises what it did and marks itself complete
— here it reviewed all three issues, made the fixes it was allowed to, and opened a
pull request.

![The finished multi-step workflow](../assets/images/orchestrator-issues-complete.jpg)

## When a workflow gets stuck

A workflow **blocks** when it hits a problem it can't get past on its own. It stops,
tells you why, and waits — it never fails silently or repeats forever. You have two
ways out:

- **Retry step** — the button on the blocked step itself. It resets *that* step
  and runs the workflow on from there, keeping all the finished work. Use it once
  you've fixed whatever caused the block.
- **Restart** — a workflow-level button that re-runs the *whole plan from the first
  step*, discarding this run's progress (anything already committed is kept). Use
  it for a clean start — for example to make a different choice this time.

Retrying won't help if nothing has changed — the step will reach the same
conclusion and block again. In that case, Restart and choose differently, or
**Refine** the plan. A blocked workflow is never a dead end.

## Clearing your "Needs you" list

The panel opens on **Home**, with a single **Needs you** list that gathers every
workflow waiting on you — questions to answer and suggested improvements to approve —
so you can clear them in one place without opening each workflow. Below it is an
overview of all your workflows, grouped by status.

You don't have to keep the panel open. When a workflow **finishes** or **blocks**
while you're away, Sero sends you a notification with the workflow's name and what
happened.

## Improving a workflow over time

A workflow keeps a short record of each run. **Reflect** (on a workflow) reads that
history and suggests how the workflow could run better next time — a clearer step, a
missing check. **Reflect all** (top of the panel) does the same across every
workflow that has run.

Each suggestion waits for you: **Approve** applies it to the plan, **Reject**
keeps a one-line reason so the same idea isn't suggested again. Nothing changes
on its own, and reflection only ever runs when you ask.

## Saving and reusing workflows

Build a workflow once and reuse it anywhere with the **Workflow Library** — a shared
collection that follows you across every workspace in your Sero profile.

On a workflow, open **Library → Save to Library**. The first save creates an entry;
later saves add a new **version** with an optional "what changed" note. Saving
stores the workflow's plan, schedule, limits, and context — never its run history.

Click **Library** in the panel header to browse what you've saved. **Load** an
entry to drop a fresh copy into the current workspace, then review and activate
it like any new workflow. When a newer version is saved from anywhere, a loaded workflow
offers to **Update** to it.

### Install a ready-made workflow from the Catalog

Next to My Library is the **Catalog** tab. It contains curated workflows from the
official Sero catalog (marked **Verified**), plus any catalog repos you add —
a private company repo works as a team catalog. Press **Install** on an entry
and the planner adapts it to your workspace, asking first when it needs a
detail only you know (like which repo to watch). The result is an ordinary
draft: review the plan, then activate. When the catalog publishes an improved
version, your installed workflow shows a version-available badge. Select
**Update & re-adapt** to update it for the current workspace.

## Set up the demo project

The walkthroughs above use a small throwaway project so nothing real is touched.
Open an empty folder as a workspace, start a chat, and paste this to the agent —
it builds the seed files for you:

> Set up a small throwaway demo project in this workspace, then run `git init`,
> stage everything, and commit it. Create:
>
> - **README.md** — a "Tip Calculator" CLI that splits a restaurant bill and tip
>   across a group: a one-line description, a usage example
>   (`node src/tip.js --bill 84.50 --tip 18 --people 3`), and a status note that
>   it's an early prototype. In the description, deliberately misspell the
>   word "calculates".
> - **src/tip.js** — a `splitBill(bill, tipPercent, people)` function that adds
>   the tip and divides by people **without rounding to whole cents**, with a top
>   `// TODO` noting the rounding is naive (see issues/002).
> - **issues/001-readme-typo.md** — a simple docs fix: one word in the README
>   description is misspelled.
> - **issues/002-fix-rounding.md** — a code change: `splitBill()` never rounds, so
>   odd splits lose a cent; plan the approach before editing.
> - **issues/003-add-currency-flag.md** — a code change: add an optional
>   `--currency` flag (default "USD") that formats each share.
>
> Don't create a CHANGELOG.md — a later workflow writes that.

The `issues/` folder has one simple fix and two code changes. This gives the
second example both routes to run.

## Find exact settings and commands

See the [Workflows reference](/reference/workflows) for commands, triggers,
delivery options, limits, recovery rules, and storage paths.
