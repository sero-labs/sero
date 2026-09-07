## Why

Sero has every primitive an autonomous project needs (Workflows, Rooms, Goals,
worktrees, dev servers, browser capture, memory, graph, scheduling, media
generation, remote access) but nothing owns the layer above one task. No
record holds a product's vision, master plan, decisions, milestone state,
budget or maintenance posture, and no agent is responsible for deciding what
to run next, verifying the result, and escalating only what the user must
decide. Sero Architect closes that gap so the user can hand Sero a high-level
idea and get a delivered, maintained product back, with the user acting as the
decision-maker rather than the operator.

## What Changes

- New built-in plugin `sero-architect-plugin` (app id `architect`,
  profile-global scope) with a runtime, a Pi extension and a federated UI.
- A durable **Project record** per idea: idea verbatim, brief, workspace link,
  phase, milestones, decisions, directives, dispatch ledger, budget and usage,
  history. Stored under `<SERO_HOME>/apps/architect/` with a watched index.
- A persistent **Owner session** per project (host-managed persistent session,
  the Room Conductor pattern lifted one level). It is woken by events, never
  polled, and restated its contract from the record on every wake and after
  compaction. It thinks in its session and acts only through the `architect`
  tool; the Architect runtime performs each dispatch, research and
  verification request over runtime-side seams, because a managed session
  cannot reach another plugin's tools or the subagent manager.
- A **lifecycle**: intake, discovery, charter, build, release, maintain, with
  decision, blocked, paused and over-budget as overlays.
- **Decisions** as first-class records: question, options, recommendation,
  consequence, reason for escalation. An unanswered decision parks the
  dependent work with no timeout and no default. Charter changes, external
  delivery and spend beyond budget always escalate. Default autonomy: the user
  approves the charter and each milestone plan; the owner decides alone inside
  a milestone.
- A **verification gate**: a milestone closes only with evidence the runtime
  produced itself (commands and exit codes, dev-server smoke check, capture
  or screenshot, diff summary). Reported, verified, accepted and delivered
  are four separate states and a lower one never stands in for a higher one.
  A summary or claim is never accepted as completion. Reaching a limit is
  never completion.
- **Project budget**: a cost cap proposed in the charter and approved by the
  user, enforced by the Architect runtime from per-run usage. Reaching it
  stops the project until the user raises it.
- **Directives**: the user can send the owner a message from the project page;
  the owner is woken at top priority and replies in one short message.
- **UI**: a projects list and a project page with four parts only: state line
  and spend, Needs You decision cards, milestone rail linking to Orchestrator
  detail, and the directive composer. History is behind a disclosure. One
  dashboard widget. No event log. No Agent Board cards.
- **Host changes**: add `architect` to the persistent-session built-in
  allowlist, and add workspace creation to the typed plugin bridge so intake
  can create the project folder and workspace.
- **Contract widening**: the typed Orchestrator coordinator registry in
  `@sero-ai/common` gains a `create` action for Workflows, which the
  coordinator already implements, and a typed Room entry with `create`, so
  the Architect runtime can dispatch without session tools.
- **Deprecations**: the external kanban and plan-mode plugins are not built
  on; Architect and the host Agent Board supersede them.

## Capabilities

### New Capabilities
- `architect-project-record`: the durable project record, its index, the
  lifecycle state machine, single-writer rule, and restart recovery.
- `architect-owner-session`: the persistent owner session, its contract,
  wake sources and priorities, session ownership, and the tools it may call.
- `architect-decisions-and-directives`: decision records, escalation policy,
  parking semantics, directive delivery and replies.
- `architect-verification-gate`: what evidence closes a milestone and what is
  refused.
- `architect-budget`: project cost cap, accounting from per-run usage, stop
  and raise behaviour.
- `architect-ui`: projects list, project page, widget, and what they must
  not show.
- `plugin-workspace-create`: workspace creation exposed through the typed
  plugin bridge.
- `persistent-session-allowlist`: the `architect` app added to the
  built-in persistent-session gate.
- `orchestrator-dispatch-handle`: Workflow and Room creation exposed on the
  typed coordinator registry so a plugin runtime in Electron main can
  dispatch work.

### Modified Capabilities
- none

## Impact

- New package `plugins/sero-architect-plugin/` (runtime, extension, shared,
  ui) following the orchestrator plugin layout.
- `apps/desktop/electron/features/apps/runtime/capabilities/persistent-sessions/builtin-gate.ts`:
  one allowlist entry plus tests.
- `packages/common` app-runtime and `packages/app-runtime` bridge types, the
  preload and the main-process handler for workspace creation (all four layers
  together per `AGENTS.md`).
- `packages/common/src/orchestrator-contract.ts` and the orchestrator
  plugin's registry and board adapter: `create` on the board action view and
  a typed Room registry entry, plus tests.
- Reads `.sero/apps/orchestrator/index.json` and `rooms/index.json` through
  the app-state watch seam; writes to Orchestrator only through the typed
  coordinator and Room registry handles from the Architect runtime.
- Docs: new guide and reference pages under `apps/docs-site/docs/`, and the
  Orchestrator mode table gains one line: Workflow plans a task, Room staffs
  a task, Goal finishes a task, Architect owns the product.
- Prototype under `apps/styleguide/public/prototypes/sero-architect/` linked
  from `PrototypeArchive.tsx`.
- First proving run uses a clean Sero profile that the user creates by hand
  and a fixed intake text (a turn-based roguelike dungeon); the game itself is
  not planned in advance.
