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
/orchestrator create --deliver <destination> <prompt>
/orchestrator set_delivery <loopId> <destination>
/orchestrator set_schedule <loopId> <triggerId> <cron schedule (UTC)>
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

Catalog commands:

```text
/orchestrator catalog_list
/orchestrator catalog_refresh [repoKey]
/orchestrator catalog_install <repoKey> <slug>
/orchestrator catalog_add_repo <url>
/orchestrator catalog_remove_repo <repoKey>
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

## Workspace placement and uncommitted changes

Managed-worktree loops run in a separate checkout and do not prompt about
changes in the workspace root. Workspace-root loops check for uncommitted
changes before background filesystem work starts.

The confirmation identifies the loop, workspace, and trigger type. It links to
the loop detail and offers these actions:

- **Run isolated** — create a managed worktree. This is also the 60-second
  timeout fallback.
- **Run here once** — work in the workspace root without stashing.
- **Always run here for this loop** — persist the loop-level dirty-workspace
  override.
- **Stash changes and run here** — create a Git stash, then use the workspace
  root.
- **Skip this run** — start no steps and wait for the next normal trigger.
- **Snooze** — for scheduled or manually started runs, retry after 15 minutes,
  1 hour, 4 hours, or at 9:00 AM the next day. Event-fired runs do not offer
  snooze because the retry must not lose the event payload.

Snooze state is durable. Scheduled fires that occur while snoozed collapse into
one retry, queued events wait, and the dirty-workspace check runs again when the
snooze expires.

Attempt history records these outcomes explicitly. A skipped pass has status
**Skipped** and its reason; a delayed pass has status **Snoozed** and keeps its
retry time even after the loop resumes. **Waiting** remains reserved for runs
parked on input or with no runnable step.

## Delivery

Every loop has a **delivery destination** — where its results ship. You choose
it (at create, or later with the **Delivery** button); the planner authors the
steps that implement it but never picks it. Without a choice the loop behaves
as before: worktree loops deliver a pull request, workspace-root loops leave
files in the working tree.

| Destination | Ships | Needs |
| --- | --- | --- |
| Pull request | a commit + PR via `gh` | — |
| Workspace files | changes left in the working tree | — |
| Saved report | one file written in the workspace | — |
| Email draft | a Gmail draft (never sent) | the Google plugin |
| Send email | a sent email — **approval-gated** | the Google plugin |
| Chat post | a message to the channel in the params | a connected MCP chat server |
| Webhook POST | an HTTP POST to the URL in the params | — |

Destination **params** (channel, recipients, URL, report name) are set beside
the picker and handed to the agent verbatim. A param the destination cannot
work without — the webhook URL — is marked required: the loop won't activate
until you set it, so a run never stalls halfway to ask for it. Loops installed
from the catalog never include these values (they're yours, not the
author's) — set them in Delivery before activating.

**Working on an existing pull request.** A loop that reacts to PR events (CI
failed, review comments) can be set to **work on the PR branch from the firing
event** — a switch next to the worktree setting when you create it. Instead of
starting a fresh branch, each run checks out the branch of the PR the event
points at, so its commits and pushes update that PR directly. The branch
belongs to the PR: deleting the loop never deletes it. Only a firing event
that points at a pull request can name the branch (CI results, PR opened,
approvals, review comments); any other start — a schedule, a manual run, or a
repo-wide event like "main updated" — stops with a plain explanation rather
than guessing.

**Receipts.** A loop that declares a destination completes only when its final
step reports a delivery receipt — what landed and where (PR URL, message link,
draft id, file path). A completion claim without one is rejected and the step
revises; PR and saved-report receipts are additionally cross-checked (the PR
must really be open, the file must really exist). Delivered receipts show on
the run in history — as a link when the ref is a URL — and in the finish
notification, and future runs are told what already shipped so a recurring
loop doesn't re-deliver it.

**External destinations always ask first.** Send email, chat post, and webhook
POST are visible to other people, so the plan stages them: the loop drafts the
content, shows it to you on the input card (the full draft, with
Approve/Reject), and a send only counts as delivered when its proof names
your recorded approval for that exact content — enforced mechanically, not
just prompted. A rejection sends nothing. Each approval covers exactly one
send; the next iteration asks again with its new content. If a step ever
sends something without approval, the loop refuses to accept it as done and
flags the run for revision instead.

If a destination's tool isn't available (say the chat MCP server isn't
connected), the loop still activates and runs with a warning; the warning
clears on its own once the tool appears.

## Plan validation

On create, and on every revision, the plan is checked: unique step ids; valid
and acyclic dependencies; supported step types; at least one step. An invalid
plan is repaired once; if it still fails it is saved as a **blocked draft** with
the errors and cannot be activated.

## Dynamic fan-out

A plan step can run **once per item** of a list an earlier step discovers — for
example, one scout per codebase area. The plan itself never changes: one run
may find 3 areas and start 3 scouts, the next run 10 and start 10.

- The earlier step records the list; the fan-out step names it and runs one
  activation per item, in parallel up to its concurrency setting.
- The plan always declares a **hard maximum**. A list that comes back larger
  blocks the step with a clear message — items are never silently dropped.
- The next step waits until every activation finishes, and receives all their
  results combined. If one activation fails, recovery retries just that one;
  finished siblings keep their results.
- The step card shows one node with a status line ("3 of 3 succeeded") that
  expands to one row per item.

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
with **Refine**. Write them in plain language — "every morning", "when CI fails
on my PRs", "whenever docs/ changes" — and Sero derives the trigger. They show
read-only in the loop's summary line, with the event details on hover.

The cron schedule is the one exception: the Scheduler app's **Loops** tab lists
every scheduled loop in the workspace and can edit or pause the schedule
directly (the `set_schedule` action). Only the schedule is editable there — the
loop itself is still managed in Orchestrator. Pausing a hybrid loop's schedule
stops only its scheduled runs; it keeps firing on its events.

The Loops tab also lists pending snoozed retries. An event-only loop snoozed
from a manual run appears without cron editing controls and disappears after
the retry starts.

### Event sources

| Source | Fires when |
| --- | --- |
| `loop:completed` / `loop:blocked` / `loop:asked-question` | another loop in the workspace finishes, blocks, or asks a question |
| `fs:changed` | files in the workspace change (one batched event per burst) |
| `github:pr-opened`, `github:ci-failed`, `github:ci-passed`, `github:issue-labelled`, `github:review-requested`, `github:review-comment`, `github:pr-approved`, `github:main-updated`, `github:issue-opened` | the matching activity happens on the workspace's GitHub repo |
| `webhook:<name>` | an external system POSTs JSON to `http://127.0.0.1:<port>/hooks/<name>` |

An event trigger can carry an exact-match filter ("only the `bug` label") and a
plain-language condition ("only when the failing PR is mine") judged at fire
time. The event that started a run shows as a chip on that run in the history,
and its details (source, summary, payload) are given to every step.

Events that arrive while a run is already going are not lost: they queue (up
to ten, oldest first) and each one gets its own run when the current one
finishes. The loop's summary line shows how many are waiting and which is
next; if the queue ever overflows, the oldest event is dropped with a visible
warning on the loop.

Some situations have no event because nothing "happens" — a pull request going
stale is just time passing. Write those as a schedule instead: "every morning,
list my open pull requests that have had no activity for a week and …". A
hybrid loop can combine both — a schedule for the sweep plus events for
instant reaction.

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

## Loop Catalog

Curated, ready-made loops you install instead of writing from scratch. The
**Catalog** tab sits beside My Library in the library view.

- **A catalog is a git repository.** The official Sero catalog is built in and
  shows a **Verified** badge on its entries. You can add more repos with *Add
  repo* — any public or private git repo with the catalog layout works, using
  your existing git sign-in. A private company repo is a shared team catalog.
  Third-party entries show which repo they came from, never the verified badge;
  adding a repo asks you to confirm once.
- **Fetching happens only when you look.** Opening the tab (or pressing
  Refresh) pulls the repos; there are no background timers. Once fetched, the
  catalog also works offline — if a repo becomes unreachable you keep the last
  copy, marked as such.
- **Install lands as a draft you review.** Installing puts the loop in your
  library (with a link back to its catalog source) and creates a draft in the
  current workspace. The planner then adapts the loop to your workspace —
  replacing placeholders like "your repo" with real values, and asking you
  first where it can't know. Nothing runs until you review and activate, and
  externally visible sends stay approval-gated.
- **Updates ride the library.** Refresh turns newer catalog versions into new
  library versions, so an installed loop shows the normal "v available" badge.
  **Update & re-adapt** switches to the new version and re-fits it to your
  workspace in one step; plain **Update** takes it exactly as published.
- **Nothing breaks when a repo goes away.** Removing a repo (or the repo
  deleting an entry) never touches installed loops — they own their library
  copies.
- If an entry needs a tool you don't have (listed as `requiredTools`), the
  install still works and the draft carries a warning.

## Rooms (preview)

Rooms are the Orchestrator's second mode. A loop is a step plan for one job; a
Room is a **team** for one problem — a Conductor and the specialists the problem
needs, each a real Sero session, working and talking until the problem is
solved. The team is written for the problem, not chosen from a fixed cast, and
it can change while it works.

Rooms are off unless the profile sets `SERO_ROOMS=1`. A build without it behaves
exactly like Workflow-only Sero.

### How a Room runs

1. **Describe the problem.** One brief, in your own words.
2. **Read the proposal.** Sero computes the team, the time and spend ceiling,
   and what access the team gets. Nothing runs and nothing is spent yet. You can
   adjust it in plain words, or open every field.
3. **Start it.** Members take turns inside the ceiling you approved. A member
   that asks a question ends its turn and frees its slot; it picks up in the
   same session when the answer lands.
4. **Watch or leave it.** The Room shows what has happened and what each member
   is doing right now. Watching changes nothing.
5. **It delivers.** A Room started from a chat answers that chat.

### What the team may change on its own

The Conductor can add, retire, suspend and resume members, change a mandate,
reassign work, and pick another model you already approved. More access, more
spend, more time, a bigger team, a new delivery destination — and replacing the
Conductor itself — always come to you as an approval.

### Room actions

The `rooms` tool is the user's surface: `prepare`, `adjust`, `start`, `pause`,
`resume`, `cancel`, `delete`, `resolve_approval`, `intervene`, `wake`, `answer`,
`release`, `timeline`, `watch`, `unwatch`, `history`, `context`.

Members use a different tool (`room`) through the Sero CLI, and it refuses
anybody who is not on the roster. The two surfaces never overlap: a member
cannot approve its own request or stop the Room you are watching.

### Room state

```text
<workspace>/.sero/apps/orchestrator/rooms/
  index.json                        # the Room list the panel and Agent Board read
  <roomId>/room.json                # the Room, its brief, work, artifacts and claims
  <roomId>/members/<memberId>.json  # one file per member
  <roomId>/messages/<page>.json     # the Room's message log
  <roomId>/revisions.json           # every change to the team, and who asked
  <roomId>/timeline.jsonl           # what happened, as an audit record
```

Member sessions are ordinary Pi session files, so a member's whole history stays
readable after it retires — including before a compaction.

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

Catalog cache — repo registry plus one local clone per catalog repo:

```text
$SERO_HOME/apps/orchestrator-catalog/
  repos.json                            # repos you added (the official one is built in)
  repos/<repoKey>/                      # shallow git clone, pulled on demand
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
