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
  `.sero/apps/orchestrator/index.json` and `rooms/index.json`. The
  coordinator registry behind the handle lives on `globalThis` in Electron
  main, where every plugin runtime runs. The coordinator's own
  `requestAction` already handles `create`; only the exported board action
  view leaves it out. The Room coordinator registry sits on the same global
  under a `:rooms` suffix but is typed only inside the plugin.
- The `goal` tool acts only on the calling session, so Goals cannot be
  dispatched to another session.
- Host-managed persistent sessions are gated by an exact-path allowlist with
  one entry (`orchestrator`) plus a per-grant user approval of a clamped
  proposal. The turn contract is: prompt, receive a `turnId`, wait for
  `turn_end` with that id.
- A managed session loads only the grant-owning app's package and the built-in
  search plugin into a private CLI registry
  (`persistent-sessions/wiring.ts`). It does not receive the shared CLI
  commands. Other plugins' commands, `sero app`, workspace control and the
  `subagent` tool are unavailable because `enableAgentManagementTools` is
  false. An Architect owner session can use the Architect app's commands, the
  platform tools allowed by its grant and search. It cannot use commands from
  Orchestrator, Graphify, Design Library or the subagent manager. A grant
  proposal cannot add those commands.
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
  unread count supplies the badge. The Orchestrator attention index is
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
- Memory is available through files and tools (`memory`, `memory_search`) and
  is auto-injected into sessions. Graphify exposes `graphify_search` and
  related tools.
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
- A page that shows state and required input, and nothing else by default.
- Reuse existing features through their current APIs. Add two small host
  capabilities and widen one typed contract.
- Keep reported, verified, accepted and delivered as four separate states,
  so no lower state ever stands in for a higher one.

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

## Decisions

### D1. Separate built-in plugin, profile-global

Chosen: `plugins/sero-architect-plugin`, app id `architect`, scope global,
runtime plus extension plus UI, listed in the built-in plugin discovery so the
persistent-session gate can allowlist it.

Alternatives: a fourth Orchestrator mode. Rejected because a project exists
before its workspace (the coordinator is per workspace), the orchestrator
plugin sits at the file cap, and the UI would land in the Orchestrator tab bar
  in the Orchestrator tab bar, which conflicts with the requirement for a
  simple, separate page.

### D2. Owner is a persistent session supervised by a management runtime

Chosen: one host-managed persistent session per project, created from an
approved grant that names the project workspace, the models, and the tools the
owner may use. The owner does the thinking: it reads the workspace, writes the
brief and the plans, raises decisions, and asks for work through the
`architect` tool. The runtime does everything that touches the world outside
the workspace files: persistence, wake scheduling, budget, the verification
gate, the attention index, and the mechanical execution of every dispatch,
research and verification request the owner makes. This split is forced by
the managed-session wiring (see Context): the owner cannot reach the
`orchestrator`, `rooms` or `subagent` tools from its session, so the runtime
must act for it through the runtime-side seams.

The record is authoritative. Before every wake, the runtime sends a contract
built from the record: idea, brief, phase, open decisions, open directives,
milestone states, remaining budget and the event that caused the wake. For
non-active statuses, the contract omits the "keep working" instruction, as in
the Goal contract. The runtime sends the contract again after compaction.

Alternative: use a stateless `runStructured` call for each wake. This avoids
the persistent-session gate and transcript growth, but loses continuity and
treats directives as inbox items. Keep it as a fallback if the persistent
owner drifts after long-term compaction.

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

The owner session's grant lists `read`, `bash`, `write`, `edit` and
`sero-cli`. The managed session's private CLI registry contains the
Architect app's commands and managed-session defaults, but not the shared
`workspace` or `pwd` commands. The `architect_projects` command is present
because it belongs to the same app, but it refuses an owner caller. Search
arrives with every managed session. The grant names nothing else because the
wiring loads only the grant-owning app and search, so
`orchestrator`, `rooms`, `subagent`, `graphify_*`, `design_library_*` and
`sero app` are absent. Memory stays available because it is auto-injected,
not bridged.

The `architect` tool is the owner's only way to act outside the workspace
files and the only writer of the project record from inside the session. Its
actions, and what the runtime does for each:

- `brief`, `charter`, `milestone`, `decide` (raise a decision), `status`
  (set the one-line state), `reply` (answer a directive), `blocked`, `sleep`
  (end the wake explicitly): record writes.
- `research`: the owner gives a question, a stopping condition and the
  workspace; the runtime runs `host.subagents.runStructured` with them and
  attaches the structured result to the record. Parallel questions are
  parallel calls, bounded by the subagent pool.
- `dispatch`: the owner gives a milestone id and either a Workflow prompt or
  a Room mandate; the runtime creates and activates the Workflow or Room in
  the project workspace through the typed dispatch handle (D10), links the
  id to the milestone and sets it `running`. The owner never receives a
  loop or room handle of its own.
- `evidence`: the owner names the commands to run and, for a preview
  milestone, the route to open; the runtime runs them itself (D7) and
  records what it observed. The owner cannot attach an exit code, a capture
  or a diff summary directly, so an owner claim cannot serve as evidence.

Ending a wake is an explicit `sleep`, `decide` or `blocked` call, never
silence, on the Goal rule.

The `architect_projects` tool and the UI provide these user actions: create,
pause, resume, stop, raise budget, answer decision, send directive and delete.

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
- discovery: the owner researches through `research` runs or a Room and
  writes the brief.
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
  model authors it. The runtime validates only the shape; it does not evaluate
  the model's content. An open decision parks the milestones it names, with no
  timeout or default. Other milestones continue. The answer is delivered to
  the owner before lower-priority updates. The runtime always requires user
  approval for charter changes, external delivery and spend beyond the cap.

### D7. Verification gate

A milestone passes through four states that never substitute for one
another:

- reported: the dispatched Workflow or Room signalled completion. This is a
  claim to the Architect, not a verdict. It moves the milestone to
  `verifying` and wakes the owner.
- verified: the runtime ran the milestone's evidence itself and every item
  passed: at least one command with exit code and captured output through
  `host.verification.runCommands` or the workspace runtime, a diff summary
  from `host.git` when files changed, and, where the milestone declares a
  preview, a dev-server smoke check through `host.devServers.startManaged`
  and one capture.
- accepted: the owner reviewed the verified evidence against the milestone
  plan and closed the milestone with `milestone done`. The runtime refuses
  the call while any evidence item is missing or failed and names the missing
  item. This enforces the prompt contract at runtime.
- delivered: a release receipt was observed for the accepted artifact
  through the existing delivery path. A receipt proves the artifact exists
  at the destination; it never proves the behaviour, so it cannot stand in
  for verified or accepted.

The runtime produces the evidence; the owner only names what to run. A verifier
`runStructured` run supplies the capture and includes the CLI browser
screenshot tool. The runtime rejects evidence if that tool did not run. Phase
1 checks whether a subagent run can reach the CLI browser tools. If it cannot,
the dispatched Workflow must provide the capture during its own verification
step. Evidence recorded before a later file change is stale. The runtime
compares the checked commit with the current commit and reruns the checks.

### D8. Budget

`costUsd` from every persistent-session turn and every `runStructured`
result the owner starts is charged to the project. Dispatched Workflows and
Rooms report usage in their index views, and the runtime charges that usage on
each index change. Reaching the cap sets `limited`, stops new dispatches and
pauses the owner. The cap limits what Architect starts; it is not a guaranteed
spend ceiling because a dispatched run can spend before the next check.

### D9. UI

The projects list has one row per project with the owner's state line, phase
pill, spend against the cap and needs-you count. The project page shows the
state line and spend, Needs You cards, the milestone rail and the directive
composer with the owner's last reply. Each dispatched milestone links once to
its Orchestrator record. History is collapsed by default. "Open session" links
to persistent session history through `readHistory`. Nothing streams into the
page. The widget shows the project rows and needs-you count. Layout preferences
persist through `layout.json`.

### D10. Host seams

- Persistent sessions: add `architect: 'sero-architect-plugin'` to
  `PERSISTENT_SESSION_BUILTIN_APPS`. No change to the exact-path gate or the
  per-grant approval.
- Workspace create: add `create(name, parentPath, options)` to the app
  runtime workspace API, backed by the existing workspace manager and its
  home-directory guard. The Architect UI reaches it through the Architect
  management tool, so the host verifies the calling plugin and its declared
  capability before creation. This is a generic runtime capability, not an
  Architect-specific preload or IPC bridge. Graphify's
  `workspace.create.option` still fires after creation.
- Dispatch handle: the Architect runtime creates Workflows and Rooms through
  the typed coordinator registry in `@sero-ai/common`, never through session
  tools. Add `create` to `OrchestratorBoardAction`, carrying prompt, title and
  options and returning the new loop id in the result; the coordinator's
  `requestAction` already implements it, so the change is the exported view
  and the board adapter that narrows to it. Type the Room registry entry the
  same way with a `create` action carrying the mandate and returning the room
  id. No new IPC and no new capability: the registry is already on
  `globalThis` in Electron main, where the Architect runtime runs, and the
  Room's per-grant approval still happens on creation.

### D11. Naming and docs

The product name is Sero Architect, the record type is Project, and copy calls
the owner "the Architect." The Orchestrator mode table gains one row. Kanban
and plan-mode are removed from the catalog's recommended list.

## Risks / Trade-offs

- **Dispatches exceed the budget.** The runtime checks usage after every index
  change and owner turn. The charter sets the cap, and `limited` prevents new
  work.
- **The owner drifts after long-term compaction.** The runtime restates the
  record on every wake and after compaction. D2 keeps stateless wakes as a
  fallback without changing the record format.
- **A completion claim is accepted without proof.** D7 refuses to close a
  milestone without runtime-generated evidence.
- **Two session drivers conflict.** An active-session Workflow cannot target
  the owner session. The grant names only the owner's session.
- **The owner tries to use unavailable tools.** The grant lists only bridged
  tools, and the contract names `architect` as the only way to act. The phase
  1 end-to-end test checks the command list.
- **Subagent runs cannot capture the preview.** Phase 1 checks the capture path
  before the verification feature is built. If needed, the dispatched Workflow
  supplies the capture without a record-format change.
- **A new workspace is not ready when the session starts.** Intake waits for
  the `sero:workspace:changed` push before it requests the grant.
- **Cron jobs have a fixed tool set.** Architect uses Workflow cron triggers
  for scheduled reviews instead of the cron plugin.
- **The project page becomes too dense.** The approved prototype and D9 define
  what the page contains.

## Migration Plan

The change is additive. Set `SERO_ARCHITECT=0|false` before startup to disable
the plugin for rollback, as with Rooms and Goals. Records remain under
`<SERO_HOME>/apps/architect/` while the plugin is disabled.

## Open Questions

- Which model tier the owner defaults to, and whether discovery uses a Room or
  parallel `research` runs by default. Both are charter settings and do not
  change the specs.
- Whether the widget opts into remote (`remote: true`) in the first release.
