# Orchestrator

Reference for the Orchestrator plugin (app id `orchestrator`). For a
task walkthrough with screenshots, see the
[Orchestrator guide](/guide/orchestrator).

Orchestrator runs durable **loops**: a prompt becomes a model-authored step
plan; the steps run (sequential or parallel); outcomes are recorded; the model
decides how to recover from failures; and the loop completes only when a planned
step emits an explicit completion signal.

Orchestrator owns **management** — persistence, scheduling, locks, attempt and
token limits, workspace isolation, and restart recovery. Step work runs through
standard Sero execution. Orchestrator adds **no** second permission, approval,
command, or tool-policy layer.

## Agent tool actions

The `orchestrator` tool and `/orchestrator` command route every action through a
single per-workspace coordinator. Only the coordinator starts steps or mutates
loop runtime state.

Actions: `create`, `list`, `show`, `activate`, `pause`, `resume`, `stop`,
`run_next`, `revise`, `choose_recovery`.

## `/orchestrator` commands

```text
/orchestrator create <prompt>
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
/orchestrator answer <loopId> <your answer>
/orchestrator revise <loopId> <plain-English change>
/orchestrator delete <loopId>
```

Library commands:

```text
/orchestrator library_list
/orchestrator library_save <loopId> <version-note>
/orchestrator library_load <entryId> [version]
/orchestrator library_set_version <loopId> <version>
/orchestrator library_unlink <loopId>
```

## Step execution types

- `active-session` — runs in the foreground session.
- `background-agent` — runs as a background subagent; the default for work
  steps. Supports per-step model, agent role, and extra tools.
- `human` — pauses the loop for your input.

## Per-step overrides (Tune)

The planner picks each step's model, agent, and tools. **Tune** overrides them
for a single step:

- **Model** — `Auto` (default), tier `LOW` / `MED` / `HIGH`, or a specific
  model.
- **Agent** — `Default agent`, or one of the workspace's named agents
  (`~/.sero-ui/agent/agents/`). A role brings its own instructions and default
  model; the orchestrator's step rules still apply on top. A role deleted before
  the step runs falls back to the default agent, and the loop shows a warning —
  it never gets stuck on a missing role.
- **Tools** — the default tool set plus any extras you add. Tools are chosen per
  step, not loop-wide.

## Loop context

The **Context** button sets a custom system prompt and hides chosen skills for
the loop's background steps. Leave the system prompt blank to use Sero's
default, type to replace it, or clear it to drop the default entirely. The
orchestrator's per-step result rules always apply on top. Tools are set per step
in the plan, not here.

## Plan validation

On create, and on every revision, the plan is checked: unique step ids; valid
and acyclic dependencies; supported step types; at least one step. An invalid
plan is repaired once; if it still fails it is saved as a **blocked draft** with
the errors and cannot be activated.

## Recovery

When a step fails, the model chooses one action: **retry** the step, **revise**
the step, **revise the plan** (how steps are added, removed, or reordered),
**skip** the step, **wait**, or **block** the loop. Revisions are validated
before they are applied.

Manual recovery on a blocked or failed loop:

- **Retry step** — resets that step and runs the loop on from there, keeping
  finished work. Use it once you've fixed the underlying cause.
- **Restart** — re-runs the whole plan from the first step, discarding this
  run's progress (commits or PRs already made are kept). A blocked loop can
  always be restarted; it is never a dead end.

## Completion

A loop completes only when a planned validation or finalization step emits an
explicit completion signal. Orchestrator never guesses that a loop is done. If
every known step has succeeded but no step signals completion, the loop waits.

## Triggers

A loop runs `manual`, on a `cron` schedule, by an `event`, or a `hybrid` of
both. Triggers only mark a loop **due** — the lifecycle, the per-loop lock, and
the limits still apply before anything runs. A cron loop that became due while
Sero was closed runs once on next open (missed fires collapse into one catch-up
run).

The schedule, events, and stop condition are authored in the prompt and changed
with **Refine**, never through a form. Write them in plain language — "every
morning", "when CI fails on my PRs", "whenever docs/ changes" — and Sero
derives the trigger. They show read-only in the loop's summary line, with the
event details on hover.

### Event sources

| Source | Fires when |
| --- | --- |
| `loop:completed` / `loop:blocked` / `loop:asked-question` | another loop in the workspace finishes, blocks, or asks a question |
| `fs:changed` | files in the workspace change (one batched event per burst) |
| `github:pr-opened`, `github:ci-failed`, `github:ci-passed`, `github:issue-labelled`, `github:review-requested`, `github:review-comment` | the matching activity happens on the workspace's GitHub repo |
| `webhook:<name>` | an external system POSTs JSON to `http://127.0.0.1:<port>/hooks/<name>` |

An event trigger can carry an exact-match filter ("only the `bug` label") and a
plain-language condition ("only when the failing PR is mine") judged at fire
time. The event that started a run shows as a chip on that run in the history,
and its details (source, summary, payload) are given to every step.

Sources only do work while an active loop uses them: the file watcher, webhook
listener, and GitHub poller all stop when the last subscribing loop is paused.
A loop finishing can trigger another loop, but chains stop after five hops and
a loop never triggers itself.

GitHub events are polled through the `gh` CLI using your existing login — no
tokens are stored. Polling is deliberately gentle: one shared poller per
workspace, every 2 minutes by default (never faster than 1 minute), using
conditional requests so unchanged answers are free, and slowing down
automatically under rate-limit pressure. The loop's summary line shows when
GitHub was last checked and the local webhook port.

## Management limits

| Limit | Caps |
| --- | --- |
| Attempts per step | retries of a single step |
| Total attempts | retries across the whole run |
| Concurrency | steps running at once |
| Wall-clock | total run time |
| Tokens / cost | when the model reports them |

Reaching any limit **blocks** the loop with a clear reason. Limits are
management controls only — they do not restrict what a step's agent may do. They
are set from your description at create time and changed with **Refine**, not
through a form.

## Loop Library

A profile-shared collection of saved loops, reusable in any workspace.

- **Save** stores the loop's plan, triggers, limits, and context — never its run
  history. The first save creates an entry; later saves add a new **version**.
- **Load** creates a fresh draft loop in the current workspace, linked to that
  version.
- **Update / switch** moves a loaded loop to another version. Only the plan
  changes — your own triggers, limits, context, and per-step model choices stay
  put. Switching is allowed only when the loop is idle (not mid-run).
- **Unlink** detaches a loop from its entry; it keeps its current plan and stops
  tracking versions. Deleting an entry never affects loops already loaded from
  it.

## State and storage

Per-workspace loop state:

```text
<workspace>/.sero/apps/orchestrator/
  index.json                     # loop list for the workspace
  loops/<loopId>/loop.json       # plan, triggers, limits, context
  loops/<loopId>/runs/           # attempt history
  loops/<loopId>/revisions.json  # plan revision history
```

(A legacy single `state.json` is migrated into this split layout on first load,
keeping a backup.)

Shared Loop Library — one copy across every workspace in the profile:

```text
$SERO_HOME/apps/orchestrator-library/   # ~/.sero-ui/apps/orchestrator-library/
  index.json
  entries/<entryId>/entry.json          # plus one file per saved version
```

Treat this as local workspace and profile metadata. It can include prompts,
plans, step instructions, outcomes, timestamps, and token/cost figures. Redact
before sharing logs or screenshots.

## Non-goals

Orchestrator does not add a second permission, approval, command allow/deny, or
tool-policy layer. Step work runs through standard Sero execution with the
normal runtime tools. Management limits cap how a loop *runs*, not what an agent
is allowed to *do*.

## See also

- [Orchestrator guide](/guide/orchestrator) — task walkthrough with screenshots.
- [Agent Definitions](/reference/agent-definitions) — the named agent roles a
  step can run as.
- [Scheduler and Reminders](/guide/scheduler-reminders) — the cron surface loops
  share.
- [State and Folders](/reference/state-and-folders) — full map of profile and
  workspace state.
