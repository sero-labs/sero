# Sero Architect

`@sero-ai/plugin-architect` is a profile-global built-in plugin for managing a
**product**, not a single task. A user supplies a request and a start cap, and
approves the access once. Architect plans the work, dispatches it to
Orchestrator Workflows and Rooms inside that cap, verifies the result with
runtime-generated evidence and reports it. The user makes the decisions that are
theirs; the owner session runs the project. A project made before delivery
agreements keeps its charter flow, which is deprecated and is not converted.

Design notes, specifications and the build order are in
`openspec/changes/sero-architect/`.

## Layout

```
shared/      project record, index and lifecycle types; paths; kill switch
runtime/     record store, wake scheduler, budget, verification gate (Electron main)
extension/   `architect` (owner session) and `architect_projects` (management) tools, bridged
ui/          projects list, project page, dashboard widget (renderer)
```

## Live work

`host.feedback` holds one bounded snapshot per producer (the owner turn, a
research run, an evidence run) and pushes it on `architect-feedback`. The
`feedback` action adds the snapshots the Orchestrator runtime of the project's
workspace holds for the same project id. The overview, the list and the widget
read only this metadata. Output text is separate: `runtime/work-watch.ts`
forwards the owner's current turn on `architect-owner-live`, and asks the
Orchestrator Room handle for a linked Room's members, only while a Work view
holds a lease.

## Direct work

The owner can do a milestone itself. `shared/direct-execution.ts` holds the
execution record and its transitions: begin, continue, report and interrupt.
`runtime/owner-direct.ts` runs the `work` action and its refusals (agreement
projects only, no OpenSpec-linked milestone).
`runtime/execution-location.ts` (`projectWriter`) keeps the owner's work and
any Workflow or Room that writes the project folder from running together.
`continue` is a wake kind in `shared/wake.ts`, delivered in `runtime/index.ts`.
A report is a claim: evidence and acceptance are unchanged. Interrupted work
keeps its files and identity. The owner contract text is `DIRECT_WORK_HELP` in
`shared/owner-contract.ts`.

In a Workspace project the owner edits the project folder, and only one thing
writes it at a time. In a Worktree project `begin` makes a managed checkout for
the milestone (`runtime/direct-worktree.ts`, key `direct-<milestone id>`),
inside the project folder at `.sero/worktrees/`, so the owner's own file tools
reach it. The directory and branch are saved with the execution before `begin`
returns, so a repeat or a restart finds the same checkout. The per-wake
contract names the directory while the work is active. Base commit, fingerprint,
evidence commands and the diff all read that directory. `report` commits the
checkout to its branch first and is refused, with the execution left running,
if that fails; an interruption commits it too. With
`--destination workspace-files` the branch name becomes the receipt, and the
usual acceptance and delivery steps follow. The checkout is released after the
milestone is accepted and delivered, or parked: its work is committed first,
nothing is forced, and a branch Git does not call merged is never deleted. A
released checkout is restored from its branch if the work resumes. A worktree
execution does not count as a project-folder writer, but one execution at a
time still holds the owner, and a dispatch on its own milestone is refused.

## Waits

The owner ends a wake with `work --operation wait`, handled in
`runtime/owner-wait.ts`. `shared/waits.ts` holds the saved wait: a source kind
and id, a condition, an optional deadline, the outcome, and one wake. The only
observable source is `child` (`OBSERVABLE_SOURCES`), a Workflow or Room named by
the project's own milestone or research id. `process` and `ci` are refused with
a manual-resume message. Nothing the owner types is evaluated.

- The intent is saved first, then the source is read once, so a completion that
  landed before the call is not missed.
- `runtime/wait-reconciler.ts` re-reads source state on a change, on startup and
  on one timer armed for the nearest deadline. It does not poll.
- The wake is reserved before it is requested (`reserveWake`) and consumed when
  its turn starts (`consumeWake`). The one owner scheduler delivers it as a
  `wait` wake in `shared/wake.ts`. The reconciler never starts a turn.
- `expired` and `failed` outcomes wake the owner and are never completion.
  `uncertain` holds the project (`holdUncertain`).
- A stop moves `controlRevision` past every earlier wait, so nothing reserved
  before it can wake the owner. A pause, a block, the cap or a missing approval
  leave the outcome on the record with no wake (`waitMayWake`).

## Stall recovery

`runtime/owner-stall.ts` replaces the fixed owner turn limit. Every session
event restarts one silence timer. At `OWNER_STALL_WINDOW_MS` (10 minutes) the
owner is steered to checkpoint and declare an outcome. At a further
`OWNER_STALL_GRACE_MS` (5 minutes) the turn is aborted, and `owner-session.ts`
wakes the owner once more. A second stall in a row holds the project.
`SILENT_TURN_LIMIT` still holds a project after three turns with no outcome.
The values live in `shared/stall-limits.ts` and are safety values the user does
not set. User limits such as the cost cap stay hard stops.
`shared/effective-limits.ts` lists every limit with its origin (`user`,
`safety`, `default`, `agent`) for the inspector.

## Owner access

`runtime/owner-skills.ts` adds the workspace's enabled skills to a NEW owner's
start approval. An owner with a grant asks again for exactly what was approved,
so a renewed grant neither widens nor drops it. Widening an existing owner is a
host grant amendment that the user approves. The owner session registers every
approved tool, loads a small set, and finds the rest with `tool_search`. It
never gets Code Mode, and the architect plugin needs no discovery code of its
own: the host builds the tool surface (`tool-surface.ts` in the persistent
sessions capability).

## Where things live

Persistent data is stored under `<SERO_HOME>/apps/architect/`. The host watches
the index at `state.json` and pushes updates to the UI. The runtime alone
writes full records to `projects/<id>.json`.

## Strategy baseline

`runtime/baseline.ts` defines the record for one run of one strategy on one
task. `apps/desktop/e2e/architect-baseline.agent.spec.ts` runs the comparison:
five scenarios, each through the current Architect and through one persistent
chat agent, with repeats.

Run the checks that cost nothing first. They need no app and no model:

```bash
cd apps/desktop
npx playwright test e2e/architect-baseline.contract.spec.ts --project=contract
```

Then run the paid pilot against a profile that is signed in and onboarded:

```bash
env -u ELECTRON_RUN_AS_NODE SERO_E2E_ARCHITECT_BASELINE=1 SERO_BASELINE_TOTAL_CAP=20 \
  npx playwright test e2e/architect-baseline.agent.spec.ts --project=agent
```

| Variable | Meaning | Default |
| --- | --- | --- |
| `SERO_BASELINE_TOTAL_CAP` | total USD for the pilot; no new run starts at or above it | required |
| `SERO_BASELINE_TIER` | the global tier both strategies run on, `low` or `med` | `low` |
| `SERO_BASELINE_CAP` | USD cap for one run | `2` |
| `SERO_BASELINE_MINUTES` | time limit for one run | `20` |
| `SERO_BASELINE_REPEATS` | runs for each strategy and scenario | `2` |
| `SERO_BASELINE_ONLY` | scenario ids to run, comma separated | all |
| `SERO_BASELINE_STRATEGY` | `architect` or `persistent-single-agent` | both |
| `SERO_BASELINE_HOME` | the profile to use | `apps/desktop/.sero-baseline-home` |

Do not run the desktop unit tests while the pilot runs.

Matched inputs. Both strategies get the same request, starting files,
acceptance checks, model, effort, capabilities, cost cap and time limit. The
runner resolves the tier to a model before it starts and refuses a tier that
has no model or that resolves to Anthropic. `compareBaselines` names each
input that differs and refuses to compare a record with itself.

Outcomes. A run is `accepted` only when it finished and each independent
check passed. The checks run on a copy of the delivered folder after the run.
A run that reaches its time limit is `incomplete`. No dispatch failure is not
acceptance.

What the records cannot show:

- The model of delegated work, when the journal does not record it. That pair
  cannot support a strategy claim.
- `repeatedWork` and `protocolFailures`. No signal exists for them, so the
  fields are absent, not zero.
- Complete cost for a run that was restarted.
- Who wrote an independent review. The check only finds the review file.
- A run with an intervention does not show unassisted completion.

Results go to `apps/desktop/e2e/screenshots/architect-baseline/pilot/`. The
files beside that folder, `baseline.json` and `outcome-comparison.json`, are
the first baseline. They keep their original classification: partial cost
coverage, no run identity, and no support for a strategy claim.

## Kill switch

Set `SERO_ARCHITECT=0` or `false` before Sero starts to disable the runtime.
Records remain on disk. Restart Sero after removing the variable to enable
Architect again.
