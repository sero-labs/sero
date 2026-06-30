# Sero Orchestrator — UI experience overview (for design)

This describes what the Orchestrator UI does today, the experience it delivers,
and what each part is responsible for. It deliberately avoids prescribing screen
layout. Treat the one diagram near the end as the *current* arrangement for
orientation only — you are free to reimagine the whole thing.

---

## What the Orchestrator is

The Orchestrator runs **loops**. A loop is a long-running, autonomous task the
user sets up once in plain English and then leaves to run on its own.

The flow behind a loop:

1. The user describes a goal in their own words ("Every 10 minutes, check GitHub
   issues and open a PR for anything unassigned").
2. The AI turns that description into a **plan** — an ordered set of **steps**.
   The user did not write the steps; the model did. The plan can branch and can
   run some steps in parallel.
3. The loop then runs the steps on its own: it starts the steps that are ready,
   records what happened, and moves on. It can run on a schedule or be triggered
   by hand.
4. When a step fails, the loop asks the AI how to recover instead of just
   stopping.
5. When the loop needs a human decision, it **pauses and waits** — there is no
   timeout and no guessing.
6. The loop finishes only when a step explicitly signals completion.
7. After it has run, the loop can **reflect** on its own history and propose
   improvements to itself, which the user approves or rejects.

The key mental model for design: **the user is a supervisor, not an operator.**
They set intent, then mostly watch, occasionally answer a question, unblock a
stall, or approve an improvement. The day-to-day surface should make "is
everything fine, and does anything need me?" answerable at a glance.

---

## The core concepts a user encounters

These are the nouns the UI exposes. Naming and grouping are open for redesign,
but the concepts are load-bearing.

- **Loop** — one autonomous task. Has a title, a plain-English goal, a status,
  and a history.
- **Loop status** — the single most important signal. Five states:
  - *Draft* — created but not yet running.
  - *Active* — running or ready to run.
  - *Blocked* — stopped and needs attention to continue.
  - *Complete* — finished.
  - *Disabled* — paused by the user.
- **Needs-you signals** — two things can demand the user's attention
  independent of status, and both are surfaced as counts/badges:
  - *Pending input* — the loop asked a question and is parked until answered.
  - *Pending suggestions* — reflection proposed improvements awaiting a
    decision.
- **Plan & steps** — the generated work. Each step has a kind (it runs as a
  background agent, a model call, or through an active chat session), its own
  status, instructions, an expected outcome, and dependencies. Steps can be
  grouped: some run **in parallel**, others are **branches** where only one path
  is taken.
- **Run / attempt history** — a record of each time the loop ran, what each step
  did, how failures were recovered, and resource usage (tokens, time, cost).
- **Workspace isolation** — where the loop does its work: in an isolated managed
  copy (a git worktree/branch) or directly in the project. A safety-relevant
  property the user chooses up front.
- **Triggers & limits** — how the loop starts (manual or on a schedule) and the
  ceilings that keep it safe (max attempts, max tokens, max cost, max runtime).
- **Reflection** — the loop learning from its own past runs: durable *insights*
  it has learned, and *suggestions* (proposed plan changes) for the user to
  approve or reject.

---

## The end-to-end experience

### 1. Seeing everything at once
The user lands on a directory of all their loops. Each entry communicates the
three things that matter: what the loop is, its status, and whether it needs the
user (waiting on an answer, or has suggestions to review). The list is
searchable and ordered most-recently-active first. This is the home base the
user returns to.

### 2. Creating a loop
The user writes what they want done in plain English — optionally naming it, but
they can let the AI name it. Up front they make a couple of safety choices: run
in an isolated workspace copy or directly in the project, and whether to start
it immediately. Submitting hands the description to the AI, which authors the
plan. **Important nuance:** the AI may decide it needs to ask clarifying
questions *before* it can build the plan — so creation can lead straight into a
"the planner needs a few answers" state rather than a finished plan.

### 3. Reviewing and shaping the plan
Once a plan exists, the user can read it: the objective, the steps, how they're
sequenced, where they branch, and what each step is expected to produce. The
user can shape it without editing code:
- **Refine in plain English** — "stop when there are no unassigned issues left,"
  "run every hour instead," "add a step that runs the tests." The AI revises
  the plan.
- **Tune individual steps** — override which AI model a step uses, or grant a
  step extra tools beyond the always-on defaults.
- **Set loop-wide context** — replace the system prompt and pick which
  skills the loop's workers can use.

### 4. Running and watching
The user activates the loop and it begins working through the plan. As it runs,
the plan reflects live step statuses, and the run history accumulates. Parallel
steps and branch decisions become visible as they resolve. The user is mostly
observing here.

### 5. Being asked for input
At any point a step (or the planner) can need a human decision. The loop
**parks**: nothing runs until the user answers. The question can offer
quick-pick choices and/or a free-text answer. Once answered, the step re-runs
with the answer and the loop continues. This is a first-class, attention-pulling
moment — the loop is explicitly waiting on the human.

### 6. Getting unblocked
If a step exhausts its recovery options, the loop becomes *Blocked* and explains
why. Recovery is targeted: the user fixes the underlying cause, then retries the
specific blocked step (keeping all the work done so far), or restarts the whole
loop from the first step. Whole-loop blocks (a limit was hit, a validation
problem) offer restart-or-refine instead.

### 7. Finishing
When a step signals completion, the loop is *Complete* and says why. A completed
loop can be run again.

### 8. Learning over time
After runs exist, the user can ask a loop (or all loops at once) to reflect.
Reflection produces suggestions — concrete proposed changes to the plan — which
the user approves (applied as a revision) or rejects (with a reason, so it isn't
proposed again). The loop also keeps a growing list of durable insights about
what works.

### 9. Managing the lifecycle
Throughout, the user can pause/disable a running loop (an interrupt that must
work even mid-run), re-enable it, restart it, run it again, or delete it
(optionally also deleting its git branch). Failures from any action surface as a
dismissible message.

---

## Components and what each is responsible for

Grouped by responsibility, not by where they sit on screen.

### Shell & global state
- **Orchestrator shell** — The container for the whole experience. Switches
  between "viewing a loop" and "creating a loop," shows the global header
  (product identity, total loop count, a "Reflect All" action that learns from
  every loop), and surfaces two kinds of transient notice: an error message and
  a reflection summary. Every user action funnels through a single channel to the
  back end — the UI never mutates loop state directly, it requests actions.

### Finding & choosing loops
- **Loop list** — The directory of all loops. Responsible for search, ordering
  (most recent first), paging through long lists, selecting a loop, starting a
  new one, and — critically — signalling per-loop status plus the two
  "needs-you" counts (pending questions, pending suggestions).

### Creating loops
- **Create-loop form** — Captures the user's intent: the plain-English
  description, an optional title, and the up-front safety choices (isolated
  workspace vs. project directory, whether to allow running over uncommitted
  changes, whether to start immediately). Its job is to make authoring a loop
  feel like describing a task, not configuring a system.

### The single-loop workspace
- **Loop detail** — The complete picture of one loop and the coordinator for all
  the pieces below. Responsible for showing identity, status, the "waiting for
  you" indicator, and assembling the questions, suggestions, warnings,
  block/completion notices, workspace info, triggers/limits, the plan, refine,
  and history into one coherent view.

- **Loop controls** — The lifecycle actions for a loop. Each maps to exactly one
  back-end action: Activate, Run next, Enable, Run again, Restart, Reflect,
  Disable, and Delete (with a confirm step and an option to also delete the git
  branch). Responsible for showing only the actions valid for the loop's current
  state — and for keeping the interrupt (Disable) available even while the loop
  is busy.

- **Loop context control** — An optional power-user override: the system prompt
  and the skills available to this loop's workers. Reuses the same context
  editor as the main chat experience. Its job is to let advanced users steer how
  the loop's AI behaves, without cluttering the default experience.

### Attention & decisions
- **Input request card** — The "the loop needs you" surface. Presents the open
  question(s) — from a paused step or from the planner — with optional quick-pick
  choices plus free text, and submits all answers together. Responsible for
  making it unmistakable that the loop is parked and the human is the blocker.

- **Suggestions inbox** — The reflection results. Presents pending improvement
  suggestions (with the AI's rationale, confidence, and which steps would
  change) for approve/reject, keeps a tally of past decisions, and exposes the
  durable insights the loop has learned. Responsible for turning
  self-improvement into a simple yes/no review.

### The plan
- **Plan view** — Renders the AI-authored plan. Responsible for communicating
  structure that the user didn't write: the objective, the ordered steps, which
  steps run together in parallel, where the plan branches and which path was
  taken, and each step's live status and outcome. It must never imply a fixed,
  hand-built workflow — the shape comes from the model. It also hosts the
  per-step controls and the targeted "retry this step" affordance when a step is
  stuck.

- **Step model control** — Per-step override of which AI model runs that step
  (keep the AI's choice, change the capability tier, pin a specific model, or
  revert to default). A per-step refinement, not a primary action.

- **Step tools control** — Per-step control over which tools a step's worker can
  use. The default toolset is always on and locked; this adds or removes extras.
  Again, a refinement layered onto a step.

- **Refine plan** — A plain-English box to revise the whole loop: its stop
  condition, its schedule, or its steps. The AI rewrites the plan from the
  instruction. This is the main way users reshape a loop after it exists.

### History & accountability
- **Attempt history** — The record of recent runs. For each run: the steps that
  ran, their attempts and outcomes, any recovery decisions the AI made, and a
  collapsible panel of resource stats (tokens, model time, cost, step/attempt
  counts). Responsible for letting the user audit what the loop actually did and
  what it cost.

### Cross-cutting display
- **Status & formatting helpers** — Consistent labels, colour/emphasis per
  status, and human-friendly time, duration, and cost formatting used
  everywhere. Worth treating as a small design system: status is the most
  repeated signal in the product and should read identically wherever it appears.

---

## Current layout (reference only — not a constraint)

This is how the pieces are arranged *today*. It is here to orient you, not to
bound you. The arrangement, density, navigation model, and even the
list-plus-detail split are all open to rethinking.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Orchestrator        [loop count]                          [ Reflect All ] │   ← global header
├──────────────────────────────────────────────────────────────────────────┤
│  ( transient notice: error  /  reflection summary — dismissible )          │
├───────────────┬────────────────────────────────────────────────────────── ┤
│               │  Loop title                              [status] [waiting] │
│  search…  [+] │  one-line goal                                              │
│               │  [ lifecycle controls ]            [ context override ]     │
│ ┌───────────┐ │                                                             │
│ │ loop  ●2  │ │  ┌─ needs your input ───────────────────────────────────┐  │
│ │ loop      │ │  │  question + choices + free text          [ answer ]   │  │
│ │ loop  ●1  │ │  └───────────────────────────────────────────────────────┘ │
│ │ …         │ │  ┌─ suggestions / blocked / completion notices ─────────┐  │
│ └───────────┘ │  └───────────────────────────────────────────────────────┘ │
│  [load more]  │  workspace isolation · triggers & limits                    │
│               │                                                             │
│  (list: each  │  ┌─ generated plan ─────────────────────────────────────┐  │
│   entry shows │  │  objective                                            │  │
│   status +    │  │  step → step → ( parallel a | b ) → branch(x = …)     │  │
│   needs-you   │  │  per-step: model · tools · retry-if-stuck             │  │
│   badges)     │  └───────────────────────────────────────────────────────┘ │
│               │  [ refine in plain English ]                                │
│               │                                                             │
│               │  ┌─ attempt history (runs, outcomes, recovery, stats) ──┐   │
│               │  └───────────────────────────────────────────────────────┘ │
│               │  created · updated · run count                              │
└───────────────┴─────────────────────────────────────────────────────────── ┘

When creating instead of viewing, the right side becomes the create-loop form.
```

---

## Design opportunities worth considering

Not requirements — prompts, given the experience above.

- **"Does anything need me?" as the primary job.** Pending input and pending
  suggestions are currently small badges. For a supervisor of many loops, the
  cross-loop "what needs my attention right now" view may deserve to be the
  centre of gravity, not a detail buried per loop.
- **Status legibility at scale.** Five loop statuses plus eight step statuses
  plus two needs-you signals is a lot of state. A coherent visual language for
  state would carry the whole product.
- **Plans are read, not authored.** Users consume an AI-generated, branching,
  partly-parallel plan and watch it execute live. This is closer to a flow/graph
  visualisation than a checklist — the current vertical-card form is one take,
  not the only one.
- **Two audiences.** Most interaction is "describe, watch, answer, approve."
  A minority is power-tuning (per-step model/tools, context override, limits).
  Keeping the default surface calm while leaving depth accessible is the core
  tension.
- **Waiting and blocked are emotional moments.** Being asked a question and
  hitting a block are where the user is pulled in. These deserve the most
  deliberate, reassuring treatment.
</content>
</invoke>
