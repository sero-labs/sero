## Context

See proposal.md for motivation. Facts that shape the approach, all verified in
the current tree:

- Orchestrator has three modes with separate records and one writer each:
  Workflow (`Loop`, coordinator), Room (`RoomCoordinator`), Goal
  (`GoalRuntime`). One autonomous driver per chat session is enforced by
  `runtime/session-drivers.ts`; a second owner is refused, not queued.
- Programmatic entry from outside the plugin is the bridged Pi tools
  `orchestrator`, `rooms`, `goals`, `goal` (resolved by cwd), the typed
  `OrchestratorCoordinatorHandle` in `@sero-ai/common` (narrow board action
  set: activate, run_next, run_again, retry, retry_step, answer_input,
  choose_suggestion, fire_event), and the watched index files
  `.sero/apps/orchestrator/index.json` and `rooms/index.json`.
- The `goal` tool acts only on the calling session, so Goals cannot be
  dispatched to another session.
- Host-managed persistent sessions are gated by an exact-path allowlist with
  one entry (`orchestrator`) plus a per-grant user approval of a clamped
  proposal. The turn contract is: prompt, receive a `turnId`, wait for
  `turn_end` with that id.
- `host.subagents.runStructured` is ungated, with `customTools`, `agent`,
  `model`, `appendSystemPrompt`, and per-run usage. Pool limits default to 8
  total and 4 concurrent.
- `host.git` is ungated: worktrees, checkpoints, diff, push, PR create and
  merge, issues and PRs list. `host.devServers.startManaged` supports
  `scope: 'card-preview'`. `host.verification` detects and runs compile,
  dependency, test and dev-server smoke commands. The CLI gives an agent
  browser open, navigate, get-text and screenshot, and app capture.
- `host.notifications.notify` needs an `openTarget` or a click does nothing.
  `requestChoice` is a timed, non-durable prompt. The notification feed
  unread count is the badge primitive. The Orchestrator attention index is
  what the Agent Board and the Needs You widget read.
- No host budget enforcement exists; the usage plugin reports by scanning
  session files. Persistent sessions and subagent runs both return usage with
  `costUsd`.
- Plugin code cannot create a chat session or a workspace. The CLI
  `workspace create` exists for agents (interactive, IPC-backed).
- A global-scope plugin runtime is started exactly once, bound to the
  synthetic `global` workspace (`ctx.workspaceId === 'global'`), and acts on
  real workspaces by passing their ids explicitly, as Graphify does through
  `host.workspace.list()`. The gated persistent-session capability is
  installed on that single instance before it starts.
- Plugin structure, manifest fields, tool bridging, runtime boundaries and
  UI conventions follow `.agents/skills/sero-plugin/SKILL.md` and its
  `references/`, plus `apps/docs-site/docs/reference/`. The design does not
  restate them; anything here that conflicts with them is a defect in this
  document.
- Memory is file and tool shaped (`memory`, `memory_search`), auto-injected
  into sessions. Graphify exposes `graphify_search` and friends as tools.
- The Goal contract pattern: the record is authoritative, the contract is
  re-stated after every transition and after compaction, only an active
  status says "keep working", and stopping is an explicit tool call, never
  silence.
- Every source file is capped at 500 LOC. Renderer state persists through
  `layout.json`, never `localStorage`. Push model only: no polling.

## Goals / Non-Goals

**Goals:**
- One durable record per product that the UI, the runtime and the owner all
  treat as the single source of truth.
- An owner that is woken, not scheduled, and that never accepts a claim as
  done without mechanical evidence.
- A surface that shows state and required input, and nothing else by
  default.
- Reuse every existing primitive through its existing seam; add exactly two
  small host capabilities.

**Non-Goals:**
- A second permission, approval, tool-policy or sandbox layer. Architect
  grants no tool or access that the approved persistent-session grant and
  the dispatched Workflow or Room do not already have.
- Dispatching Goals. Goals stay a user-facing chat mode.
- Cards on the Agent Board. The Workflows and Rooms Architect dispatches
  already appear there.
- Multi-user or multi-machine ownership. One profile owns a project. Agent
  Node execution is a later concern.
- Replacing Orchestrator's planner, limits, delivery or receipt contracts.
- Planning the proving project (the roguelike) in advance.

## Decisions

### D1. Separate built-in plugin, profile-global

Chosen: `plugins/sero-architect-plugin`, app id `architect`, scope global,
runtime plus extension plus UI, listed in the built-in plugin discovery so the
persistent-session gate can allowlist it.

Alternatives: a fourth Orchestrator mode. Rejected because a project exists
before its workspace (the coordinator is per workspace), the orchestrator
plugin sits at the file cap, and the UI would land in the Orchestrator tab bar
against the "simple, separate surface" requirement.

### D2. Owner is a persistent session supervised by a management runtime

Chosen: one host-managed persistent session per project, created from an
approved grant that names the project workspace, the models, and the tools the
owner may use. The runtime does management only: persistence, wake scheduling,
budget, the verification gate, the attention index. The owner does the
thinking and dispatching by calling bridged tools from its own turns.

The record is authoritative. On every wake the runtime sends a contract
message built from the record (idea, brief, phase, open decisions, open
directives, milestone states, budget remaining, the event that woke it) and
withdraws the "keep working" instruction for every non-active status, on the
Goal contract precedent. The contract is re-sent after compaction.

Alternatives: stateless wakes where each wake is a `runStructured` call over
the record. Kept as the documented fallback if the persistent owner drifts
after months of compaction. It removes the persistent-session gate and
transcript growth but loses continuity and makes directives an inbox.

### D3. Wake sources and priorities, push only

The runtime watches, through `host.state.watch`, the Orchestrator loop and
Room index files of the project workspace and diffs status transitions. It
also receives directive and decision answers from the UI through the record.
Scheduled maintenance reviews are Workflow cron triggers whose completion
event the runtime observes; Architect keeps no timer of its own.

Wake priority, highest first: directive from the user, decision answered,
dispatch blocked or asked a question, dispatch completed, GitHub or scheduled
event, project quiet. One wake at a time per project; a wake that arrives
during a turn is queued and coalesced, the way Room `duePasses` work.

### D4. Owner tools

The owner session's grant lists: `sero-cli` (which bridges `orchestrator`,
`rooms`, `git_manager`, `devserver`, `browser`, `app`, `memory`,
`graphify_*`, `design_library_*`, `usage`), `subagent`, `read`, `bash`,
`write`, `edit`, and the new bridged `architect` tool. The `architect` tool
is the only writer of the project record from inside the session and offers:
`brief`, `charter`, `milestone`, `decide` (raise a decision), `dispatch`
(link a Workflow or Room id to a milestone), `evidence` (attach verification
evidence to a milestone), `status` (set the one-line state), `reply` (answer
a directive), `sleep` (end the wake explicitly). Ending a wake is an explicit
`sleep`, `decide` or `blocked` call, never silence, on the Goal rule.

A separate management surface, the `architect_projects` tool and the UI
actions, serves the user: create, pause, resume, stop, raise budget, answer
decision, send directive, delete.

### D5. Lifecycle state machine

```
intake -> discovery -> charter -> build -> release -> maintain
                          ^         |  ^
                          |         v  |
                     user approves  milestone n -> verify -> n+1
overlays: decision (parked), blocked, paused, limited (budget)
```

- intake: the user gives the idea and a folder; Architect creates the folder,
  initialises git and registers the workspace, then opens the owner session.
- discovery: the owner researches with subagents or a Room and writes the
  brief.
- charter: milestones, escalation policy, cost cap. Requires user approval.
  Any later change to the charter is a decision.
- build: one Workflow or Room per milestone. The owner writes each
  milestone plan; by default the user approves it (autonomy setting
  `milestones`; the alternatives `charter-only` and `model-judged` are
  recorded on the charter and can be changed by the user at any time).
- release: delivery through the existing PR or workspace-files path with its
  receipt contract. External destinations always escalate.
- maintain: the owner subscribes a maintenance Workflow to GitHub issue,
  CI-failed and scheduled sources, triages on wake, and dispatches or
  escalates.

Transitions are recorded in `history` with the cause. A limit reached moves
the overlay to `limited`, never to a later phase.

### D6. Decisions and parking

A decision record is `{ id, question, options[{id,label,consequence}],
recommendation, reason, raisedAt, dependsOn: milestoneIds[], answer? }`. The
model authors it; the runtime validates only the shape, on the "no
heuristics for LLM tasks" rule. An open decision parks the milestones it
names, with no timeout and no default, the Workflow pending-input precedent.
Unparked work continues. The answer is delivered to the owner as a top
priority wake. Charter change, external delivery and spend beyond the cap are
forced escalations the runtime checks mechanically.

### D7. Verification gate

A milestone moves to done only when the owner attaches evidence that the
runtime can check: at least one command run with exit code through
`host.verification.runCommands` or the workspace runtime, and, where the
milestone declares a preview, a dev-server smoke check and one capture. The
runtime refuses `milestone done` without them and returns the missing item to
the owner, on the delivery-contract three-layer precedent: prompt contract,
in-session repair, engine backstop. The dispatched Workflow's own completion
signal is a claim to the Architect, not a verdict.

### D8. Budget

`costUsd` from every persistent-session turn and every `runStructured`
result the owner starts is charged to the project. Dispatched Workflows and
Rooms report usage in their index views; the runtime charges those too on
each index change. Reaching the cap sets `limited`, stops new dispatches and
pauses the owner; the user raises the cap from the project page. Cost is a
bound on what Architect starts, not a guaranteed spend ceiling, the Goal
wording.

### D9. UI

Projects list: one row per project with the owner's state line, phase pill,
spend against cap, needs-you count. Project page: state line and spend,
Needs You cards (decisions and charter or milestone approvals, each with the
recommendation preselected), milestone rail with one link per milestone to
the Orchestrator record, directive composer with the owner's last reply.
History is a collapsed disclosure. "Open session" links to the persistent
session history through `readHistory`. Nothing streams into the page; the
widget shows the projects-list rows and the needs-you count. Layout
preferences persist through `layout.json`.

### D10. Host seams

- Persistent sessions: add `architect: 'sero-architect-plugin'` to
  `PERSISTENT_SESSION_BUILTIN_APPS`. No change to the exact-path gate or the
  per-grant approval.
- Workspace create: add `create(name, parentPath, options)` to the app
  runtime workspace API and the typed `SeroBridge`, backed by the existing
  workspace manager and its home-directory guard, across all four layers.
  This is a generic host capability any plugin may declare, not an
  Architect-specific bridge, which keeps to the plugin skill's rule against
  plugin-specific preload or IPC. Graphify's `workspace.create.option` still
  fires after creation.

### D11. Naming and docs

Product name Sero Architect; record type Project; the owner is "the
Architect" in copy. The Orchestrator mode table gains one row. Kanban and
plan-mode are removed from the catalog's recommended list.

## Risks / Trade-offs

- [Spend runs away across many dispatches] → project cap enforced from usage
  on every index change and every owner turn; charter proposes the cap;
  `limited` is a hard stop for new work.
- [Owner transcript drifts after months] → record restated on every wake and
  after compaction; D2 fallback to stateless wakes documented and switchable
  without touching the record format.
- [Hollow completion] → D7 gate refuses milestones without evidence; the
  Workflow completion signal is treated as a claim; three-layer contract.
- [Session driver conflicts] → the owner session is never a target of an
  active-session Workflow step; the grant names only the owner's own session.
- [Persistent session for a workspace registered seconds earlier] → intake
  waits for the `sero:workspace:changed` push before requesting the grant;
  verify in phase 1.
- [Cron jobs run with a fixed four-tool set] → Architect never uses the cron
  plugin for wakes; scheduled reviews are Workflow cron triggers.
- [Too much on the page] → the prototype is the gate; anything not in D9 is
  refused at review.

## Migration Plan

Additive. The plugin ships disabled behind `SERO_ARCHITECT=0|false` for
rollback, on the Rooms and Goals precedent. Records live under
`<SERO_HOME>/apps/architect/` and are kept when the plugin is disabled.
Proving run: the user creates a clean profile by hand and gives its path;
the plugin is activated through Local Plugin Development; the intake text is
the roguelike spec verbatim.

## Open Questions

- Which model tier the owner defaults to, and whether discovery uses a Room or
  parallel subagents by default. Both are charter settings and do not change
  the specs.
- Whether the widget opts into remote (`remote: true`) in the first release.
