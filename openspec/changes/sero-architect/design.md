## Context

See [proposal.md](proposal.md) for the problem and scope. This design is required because project ownership crosses Orchestrator, managed sessions, host services, and user interaction. The UI layout remains provisional until the early prototype review.

The source inspection established these boundaries:

| Existing component | Reuse and constraint |
| --- | --- |
| [Orchestrator runtime](../../../plugins/sero-orchestrator-plugin/runtime/index.ts) | Workspace coordinators already run Workflows, Rooms, and Goals. A project must retain ownership across their lifetimes. |
| [Workflow planner](../../../plugins/sero-orchestrator-plugin/runtime/planner.ts) | Planning uses a structured call without tools. Architect needs tool-using discovery before and between bounded plans. |
| [Room records](../../../plugins/sero-orchestrator-plugin/shared/room-types.ts) | Reuse mandates, artifacts, and computed briefs inside Rooms. Keep project records separate from these bounded execution records. |
| [Managed session wiring](../../../apps/desktop/electron/features/apps/runtime/capabilities/persistent-sessions/wiring.ts) | Members load the grant-owning app and built-in search with a private CLI registry. Installed plugins are not automatically available to them. |
| [Room revision rules](../../../plugins/sero-orchestrator-plugin/runtime/rooms/room-revision-plan.ts) | A running grant cannot widen its roster or capability set. A new execution needs a valid grant and an explicit handover. |
| [Session drivers](../../../plugins/sero-orchestrator-plugin/runtime/session-drivers.ts) | Only one autonomous driver can steer a given chat session. User input remains possible. |
| [Goal completion](../../../plugins/sero-orchestrator-plugin/runtime/goals/goal-transitions.ts) and [delivery checks](../../../plugins/sero-orchestrator-plugin/runtime/delivery/verify-receipt.ts) | A completion claim or delivery receipt does not establish product acceptance. |
| [Host APIs](../../../packages/common/src/app-runtime-background.ts) | Reuse app-state, verification, dev servers, models, Git, and managed sessions. |
| [Event sources](../../../plugins/sero-orchestrator-plugin/runtime/events/source-catalog.ts) | Existing lifecycle, filesystem, GitHub, and webhook signals provide a starting point for maintenance. |

[ARCHITECTURE.md](../../../ARCHITECTURE.md) remains the authority for process, storage, runtime, and plugin boundaries. The existing programmatic tool calling spec does not change.

## Goals / Non-Goals

**Goals:**

- Keep project ownership independent of a particular worker, chat window, or execution mode.
- Turn user direction into durable changes that affect active work and acceptance.
- Reuse current execution and host services with the smallest necessary contracts.
- Establish a reviewable UI before production work fixes its interaction model.
- Prove a complete software delivery and maintenance cycle without prescribing the trial product.

**Non-Goals:**

- A new model runtime, transcript store, workflow language, or distributed scheduler.
- Changes to the independent behavior of ordinary chats, Workflows, Rooms, or Goals.
- Automatic access to every installed plugin or provider.
- A project-management dashboard filled with agent activity, task counts, or event logs.
- Game implementation or game design as part of this planning change.

## Decisions

### D1. Keep project ownership above individual executions

Implement a profile-level project coordinator in Orchestrator's project-specific runtime modules. Bind its lifecycle once per active profile through the host runtime loader. Workspace coordinators continue to own their existing execution modes. This requires a narrow host lifecycle binding; do not instantiate a second project owner for each open workspace.

The project record can exist before a product workspace is selected. A host-managed owner session starts in a profile-owned context with bounded discovery access. Binding or creating a product workspace goes through the host workspace service and its existing authority checks. A path in model output is never permission to use that path.

Each project references its authorized workspaces and execution records. Closing a UI tab does not cancel the project. An unavailable workspace produces an explicit dependency state; it does not cause an implicit host fallback. The first live trial uses the workspaces Architect actually needs. The record supports multiple workspace references without introducing cross-machine scheduling.

Alternative considered: one permanent Room as the project. Its bounded records, fixed running grant, and terminal lifecycle would make long-term ownership depend on the wrong object. Reuse Rooms as project work instead.

### D2. Persist current records and reference existing artifacts

Store versioned project records and a compact profile index through the host app-state service under Orchestrator's project namespace. The coordinator serializes mutations per project. Pi owns owner and worker transcripts. Use standard paged history reads; do not put whole transcripts into project state.

The initial record groups are:

| Record | Contents |
| --- | --- |
| Project | Stable identity, verbatim seed, current state, revision, owner-session reference, workspace references, and authority reference. |
| Intent | User requirements, constraints, delegated choices, and superseded revisions with their origins. |
| Decision | Author, reason, evidence references, status, affected requirements or work, and replacement decision if superseded. |
| Plan | Current milestones, dependencies, bounded work assignments, and next useful action. |
| Attention | Question or approval, reason, recommendation, consequence, blocking scope, and resolution. |
| Execution link | Work identity, executor kind, workspace, run/session identity, instruction revision, budget reservation, and observed outcome. |
| Acceptance and release | Criteria, evidence references, checked revision, verdict, delivery intent, external receipt, and verification state. |
| Maintenance | Authorized responsibilities, triggers, budgets, active work, and next check. |

Keep large research, designs, and generated assets in artifact files and reference them. Give each fact one authority: specifications define requirements; Git identifies code; the project record relates them to decisions and execution. A short diagnostic history explains transitions but is not replayed to reconstruct the project.

Alternative considered: a master Markdown file reconstructed from chat summaries. It would not reliably distinguish user requirements from model decisions or support atomic steering and dispatch.

### D3. Let the owner investigate and decide within delegation

Run Architect's reasoning in a standard managed Pi session with tools appropriate to the current assignment. The owner can research, inspect existing work, request experiments, revise its plan, and delegate. The runtime validates its requested mutations and actions. Product judgment belongs to the agent; authority, identity, accounting, and mutation ordering belong to application code.

Preserve the seed verbatim. Record creative choices as Architect decisions. Delegated choices can become working commitments without compulsory human approval. An assumption stays identifiable as an assumption until evidence or a decision resolves it. Material departures from explicit user requirements return to the user.

Develop detail as it becomes useful. Do not force every project through a fixed research/design/build pipeline, a fixed team, or a large up-front task tree. Research needs a question and a stopping condition. The owner should prefer a small experiment when it resolves uncertainty better than more planning.

Memory supplies preferences and reusable lessons; current project records govern current work. Graphify supplies code relationships, not an assumed graph of research and decisions. Refresh relevant context at assignment and decision boundaries, including after compaction. Do not broadcast every project's context to every worker.

Alternative considered: a stronger initial planner prompt. That would not provide investigation, continued ownership, or a durable response to later evidence.

### D4. Treat conversation as project control

Use one project conversation for questions and direction. The agent distinguishes a request for explanation from a request to change the project. Deterministic pause, resume, and stop controls do not depend on language classification. Ask a focused question when an ambiguous message could cause materially different work.

Persist incoming direction before acknowledging receipt. A substantive change commits a new project revision and records which work it affects. The user sees the effect and any unresolved consequence, not just an agreeable reply. Distinguish received, applying, and applied direction where work cannot stop immediately.

Assignments carry the project revision and relevant decision references. When direction changes, the coordinator prevents affected new dispatches, signals running executors to stop or accept revised instructions at a supported boundary, and retains their artifacts. Unaffected work can continue. An old-revision result becomes a candidate for reuse; it cannot be accepted against current requirements without review.

Pause stops new work immediately and requests safe settlement of active work. Report pausing until settlement is confirmed. Explicit stop requests cancellation and records uncertain external effects. Resume first reconciles changes, authority, and actual execution state. A side effect already committed cannot be undone by changing the plan.

Alternative considered: append user feedback to a worker prompt and continue. That does not protect dependent work from outdated instructions or prove that the direction was applied.

### D5. Prove a minimal interface before production implementation

The first apply deliverable is an interactive `sero-prototype` in the styleguide. Inspect current Sero components, design tokens, the closest prototypes, and the archive before drawing it. The review question is whether the user can understand state and direct the project without managing agents.

Prototype the initial idea, working state, explanation request, direction change, required decision, blockage, pausing/paused state, reviewable result, and quiet maintenance. Use illustrative data that does not establish a design for the game. Make steering, decisions, result access, and detail navigation interactive. Detail destinations can be clearly labeled prototype views; do not imply live runtime integration.

The main view presents only applicable current state, useful result, required input, and a way to direct Architect. Conversation history is available on request. Routine execution changes update the current explanation without filling the conversation. State must come from records; an agent-authored explanation cannot override a blocker, limit, pending direction, or failed check.

Show material consequences before a decision. Group related attention and explain whether only part of the project is blocked. Link to the relevant existing Room, Workflow, Goal, session, or artifact. Do not recreate their granular views. Use existing contribution and navigation contracts for Board, dashboard, and remote entry points.

Record the user's prototype review and revise these artifacts before production work. Automated build, accessibility, and interaction checks do not satisfy that human review. Exact layout, labels, and navigation placement are decisions for the prototype.

Alternative considered: a full transcript or project dashboard as the default view. Both expose more operational detail than the user needs to steer the project.

### D6. Reuse execution through a small project command boundary

Give the project coordinator a narrow start/observe/steer/pause/cancel boundary over existing execution modes. Carry project, work, command, revision, and workspace identities. Persist dispatch intent before starting a run. The receiving executor must recognize the same command identity or allow recovery to locate the run by work identity. If neither is available, hold for reconciliation instead of blindly repeating a start.

Choose focused agent work for a bounded task, a Workflow for repeatable steps, and a Room when coordination among persistent members is useful. A project does not need to use every mode to pass. Goal-driven chat work must retain the existing exact-session arbitration. Do not wrap the Architect session in another autonomous driver.

Extend the managed-session resource path only for capabilities required by authorized work. Build the effective catalog from actual installation, grant, workspace runtime, and provider availability. Maintain tool origin checks and the private CLI registry. Add narrow host contracts where existing generic actions cannot carry the operation; do not expose another session's command registry.

A running Room that needs broader authority requires a supported new grant/execution and recorded handover. Do not assume the current grant can be amended. Ordinary within-grant choices remain autonomous; the project mandate is not a substitute for a missing host grant.

Reserve bounded child budgets before dispatch. Aggregate observed owner, child, and known external-service usage by stable execution identity. Releases and concurrent work must not receive the same remaining allocation twice. Show unknown or delayed usage honestly. When no existing applicable budget is available, establish one with the user before paid autonomous work. No role may raise its own spending or permissions.

Alternative considered: use unrestricted CLI calls from the owner. That would bypass the identity, budget, and grant relationships needed for recoverable delegation.

### D7. Reconcile events against current state

Wake the owner for user direction, relevant execution outcomes, resolved decisions, bounded timers, or subscribed maintenance events. Persist pending work and deduplication identities before acknowledging events. Check current project revision and active work before dispatching. Coalesce redundant signals; waiting must not consume model turns merely to repeat status.

On restart or profile reactivation, reconcile persisted intents against executor records, session paths, Git, and available external read APIs. Recover owner context from current records. Keep uncertain external effects unresolved until observation or the user settles them. A completed Room does not imply an accepted project milestone.

Retain existing session accounting at settled turn boundaries, including retries and compaction. Test project lifecycle behavior separately from provider behavior. Suspending the host preserves records but does not provide continuous execution. Agent Node is not assumed to have Desktop's plugins, browser, or dev-server capabilities.

Alternative considered: continuously prompt the owner to check progress. Events plus bounded reconciliation avoid idle model spend and repeated decisions.

### D8. Accept results against current criteria and confirm delivery

Architect derives observable criteria from the user's request and its recorded decisions before claiming acceptance. Evidence names the criterion, checked code or artifact revision, method, result, producer, and time. Use host verification services and rendered checks where behavior requires them. A separate review session can challenge claims; agreement between models alone is not proof.

Keep reported completion, verification, acceptance, and confirmed release distinct. Required observations that cannot run remain unverified. A delivery receipt cannot override a failed acceptance check. Requirement changes and affected artifact changes invalidate dependent evidence until it is checked again. An agent cannot silently remove a failing criterion to obtain completion.

Record a release intent for the exact accepted artifact, target, and authority. Execute through the appropriate existing host/plugin tools, then observe the destination. If delivery is interrupted, query it before retrying. Keep the accepted artifact available when delivery fails. Product feedback such as enjoyment remains a human evaluation where needed.

Alternative considered: accept the executor's terminal state or PR receipt. Existing terminal states and receipts establish narrower facts than product acceptance.

### D9. Treat maintenance as bounded continuing responsibility

After release, agree the responsibilities, allowed changes, triggers, and budget for maintenance. Reuse existing schedules and event sources. Record a release-to-maintenance handoff so it survives a restart. A qualifying event creates or attaches to project work, uses the same acceptance and delivery path, and returns to quiet monitoring when resolved.

Failure, feedback, or an unavailable service can reopen work. Duplicate events must attach to the same unresolved work. Changes outside the mandate become decision requests. Reusable lessons or skills can be proposed with evidence and use existing authorization paths; completing a task does not grant authority to rewrite global memory or install plugins.

Alternative considered: leave the project indefinitely active with a general instruction to improve it. That gives neither a bounded responsibility nor a useful definition of progress.

### D10. Evaluate ownership with an unchanged seed

The first trial input is exactly:

> **Turn-Based Roguelike Dungeon in Canvas/DOM**
> A mini tile-based dungeon crawler featuring procedural room generation, FOV raycasting (fog of war), deterministic turn steps, and enemy pathfinding (A\*). Be as creative as you like.

Do not add a title, theme, enemy roster, floor count, run length, deployment provider, milestone plan, or feature exclusions to this input. Architect determines the product and appropriate work during the trial. Example content in the prototype is not an instruction to the trial owner.

Evaluate two things separately: the result meets the original requirements and Architect's recorded commitments; Architect manages research, decisions, direction, execution, acceptance, delivery, and maintenance. Use a real browser result and actual execution records. Do not score a particular creative direction or demand use of every Sero capability.

After a baseline run, include user redirection during active work, an interrupted execution, a duplicate maintenance event, an unavailable capability, and a reproducible defect. Use an observed defect or a declared controlled injection, not invented evidence. Record completion quality, human interventions and their reasons, stale-work handling, duplicate effects, total known cost, and unresolved limitations. Deterministic tests establish runtime contracts; live runs and user review establish judgment and usability.

### D11. Use a clean profile for live development and the trial

Ask the user to manually create a dedicated clean profile through Sero's existing profile flow and provide its storage location before the first live Architect session. Do not create a profile or choose its location on the user's behalf. Recommend leaving profile-copy disabled and completing normal onboarding for the required providers. If the user chooses to reuse credentials or model settings, confirm the transfer's actual contents. The current [copy helper](../../../apps/desktop/electron/features/profile/copy-profile-data.ts) includes gateway configuration and selected portable app preferences as well as provider settings, so it is not a content-neutral shortcut.

Wait for the supplied location, then verify it against Sero's registered profile identity and resolved data root before live work. Ask the user to activate it when needed rather than silently switching profiles. Use fresh product workspace paths; a new profile that opens an old workspace can still see that workspace's `.sero/apps/` state. Confirm that no old project sessions, memory, schedules, graph indexes, or app history enter the owner context. Standard bundled templates and tools are expected; record the initial capability inventory without recording secrets. Keep approved Architect instructions separate from the unchanged game seed.

Reuse machine-shared managed toolchains. A clean profile must not trigger duplicate heavyweight installs in profile storage. Preserve existing profiles and their workspaces. Switching profiles restarts Sero, so coordinate that step with active work. The served styleguide prototype uses illustrative data and can be reviewed before this live setup is complete.

Keep the dedicated profile through implementation, release, and maintenance checks. For another uncontaminated baseline trial, create a fresh trial environment without deleting previous evidence or unrelated profile data.

Alternative considered: clear the user's existing profile. That would risk unrelated work and make the starting conditions harder to verify.

## Risks / Trade-offs

- **Profile and workspace ownership can drift.** Keep one project coordinator per profile, explicit workspace references, and stable dispatch identities. Test closing a view, losing a workspace runtime, and switching profiles separately.
- **A reply can imply steering happened before it did.** Persist receipt, report application state, and prevent affected work from advancing on an obsolete revision.
- **Capability discovery can overstate worker access.** Inspect the effective grant and loaded resources at execution time. Hold unsupported work with a concrete reason.
- **Agents can optimize for a completion claim.** Keep criteria and evidence outside their summaries, record revisions, and test false and stale claims.
- **Minimal UI can hide a material problem.** Derive state and attention from records. Review blocked, failed, and incomplete-result states explicitly in the prototype.
- **Broad project ownership can become a platform rewrite.** Keep new code to project records, ownership, and the required adapters. Reuse existing services. Recheck any proposed abstraction against the trial.
- **A successful example can overstate general reliability.** Report the exact trial and disruptions exercised. Broader domains and always-on hosting require separate evidence.

## Migration Plan

1. Complete the interactive prototype and record explicit user approval of its direction. Leave production code unchanged during this stage.
   Ask the user to create the dedicated clean profile and supply its location before any live Architect session; the static prototype does not require a profile switch.
2. Reconcile the design, specs, and remaining tasks with that review. Confirm host contract feasibility before production work. If findings reduce the agreed experience or supported workflows, ask the user before implementation.
3. Add versioned project records and lifecycle binding without converting existing Workflow, Room, Goal, or chat records. Existing work can be linked only through an explicit project action.
4. Implement the smallest complete ownership path, then the reviewed UI and required execution, acceptance, delivery, and maintenance adapters. Update renderer/store, preload IPC, main handlers, and Pi SDK contracts together where changed. Preserve the common CLI and programmatic-tool authority boundaries.
5. Run focused regressions, rendered UI validation, and the live trial. Update user docs and subsystem guidance with behavior that passed, including operating limits.
6. Release through the normal draft-PR process. Disabling Architect must stop new project dispatches and retain project records, transcripts, artifacts, and uncommitted work. Reconcile active child work before disabling its controller. Rollback must not rewrite unrelated mode state or claim that an uncertain external write was undone.

## Open Questions

- Exact UI arrangement and copy will be selected in the early prototype review. The state, input, steering, and progressive-disclosure requirements already apply.
- The trial's creative direction, detailed criteria beyond the seed, tools, and delivery target belong to Architect's run within available authority. They are intentionally absent from this design.
