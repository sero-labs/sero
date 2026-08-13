# Agent Rooms implementation plan

Status: Ready for Phase 1  
Branch: feat/agent-rooms  
Parent product: Sero Orchestrator plugin  
Specification: [spec.md](./spec.md)  
Last updated: 2026-08-13

## 1. Delivery rule

Deliver Room mode through gated phases. Do not begin a runtime phase until the previous phase meets all acceptance criteria.

Phase 1 is the product and architecture gate. Runtime implementation starts only after the static prototype is approved and its decisions are recorded in spec.md.

Prototype path:

    docs/prototypes/sero-agent-rooms.html

## 2. Target outcome

Sero Orchestrator will have:

- Workflow mode for the current LLM-authored step graph;
- Room mode for a persistent, Conductor-led team.

Room mode will generate a team from the user's problem, use normal persistent Pi sessions, let the Conductor revise the team within user limits, and reuse existing Orchestrator and host management services.

## 3. Milestones

| Milestone | Phases | Outcome |
| --- | --- | --- |
| Product agreement | 0 to 1 | Approved architecture and static UX |
| Runtime foundation | 2 to 4 | Room records, generated blueprints and persistent sessions |
| Usable Room | 5 to 6 | Coordination, workspace safety, approvals, delivery and UI |
| Replacement | 7 | CollaborationEngine and DebateEngine removed |
| Production | 8 | Security, recovery, documentation and rollout complete |
| Optional optimisation | Cache track | Measured prompt-cache keep-warm experiment |

## 4. Phase 0: Revised product contract

Objective: Replace the initial standalone-Room design with the agreed Orchestrator-owned design.

### Deliverables

- [x] Create feat/agent-rooms.
- [x] Review the initial specification and plan.
- [x] Review the existing Orchestrator and host reuse seams.
- [x] Make Rooms a mode in sero-orchestrator-plugin.
- [x] Use Workflow as the product name for current Orchestrator behaviour.
- [x] Keep Workflow and Room domain records separate.
- [x] Use standard Pi SessionManager persistence for Room members.
- [x] Make Room creation problem-first and LLM-generated.
- [x] Make templates optional adaptive seeds.
- [x] Allow controlled Conductor-led Room revisions.
- [x] Make progressive disclosure a core UX rule.
- [x] Use current-state Room records plus an audit timeline.
- [x] Add context management and compaction requirements.
- [x] Keep simple path claims and defer active cache keep-warm.
- [x] Define result delivery to an invoking chat.
- [x] Replace the old parity plan with keep, prove and delete.
- [x] Replace spec.md and implementation-plan.md.

### Acceptance criteria

- [x] The documents describe Workflow and Room as modes of one Orchestrator product.
- [x] No section proposes a second scheduler, budget engine, Git layer, model runtime or transcript store.
- [x] Room-specific behaviour is not forced into Workflow records.
- [x] Generated blueprints are detailed internally and compact in the default UI.
- [x] Runtime Room changes have a clear authority boundary.
- [x] Every later phase has clear deliverables and acceptance criteria.

## 5. Phase 1: Architecture records and static UX gate

Objective: Approve the boundaries and complete user flow before runtime implementation.

### Work checklist

- [ ] Add a numbered architecture decision for Room mode, Pi session persistence, Room storage and AD-020 command bridging.
- [ ] Verify the reuse map in spec.md against current code.
- [ ] Identify the small shared Orchestrator interfaces and the Room-specific records.
- [ ] Confirm the generic host capability for persistent Pi session creation and reopen.
- [ ] Confirm the Room session namespace and retention policy.
- [ ] Create docs/prototypes/sero-agent-rooms.html using current Sero design patterns.
- [ ] Show Workflows and Rooms navigation inside Orchestrator.
- [ ] Show one-question creation, preparation, compact proposal, Start and natural-language Adjust.
- [ ] Show optional rationale and advanced blueprint settings.
- [ ] Show the live Room, member inspector, Room revisions and context compaction.
- [ ] Show the consolidated approval inbox, waiting, deadlock, failure and path conflict.
- [ ] Show result delivery to an invoking chat and links to the Agent Board.
- [ ] Test the prototype against issue delivery, adversarial analysis and parallel issues.
- [ ] Record accepted prototype decisions in spec.md.
- [ ] Obtain explicit product approval.

### Deliverables

- [ ] Agent Rooms architecture decision.
- [ ] Verified reuse map and session-host boundary.
- [ ] Approved static prototype.
- [ ] Final first-release product scope.

### Acceptance criteria

- [ ] A non-technical user can create and start a Room without advanced settings.
- [ ] The compact proposal shows only team, roles, time, spend, access and important warnings.
- [ ] Natural-language adjustment is the first edit path.
- [ ] Advanced users can inspect the complete blueprint.
- [ ] Runtime roster changes and approval boundaries are understandable.
- [ ] Room sessions remain accessible through the Room without appearing as normal chats.
- [ ] The result-to-chat and Agent Board relationships are clear.
- [ ] The product owner approves the prototype before Phase 2.

## 6. Phase 2: Shared foundations and Room storage

Objective: Reuse Orchestrator management primitives and add separate Room records without running members.

### Work checklist

- [ ] Generalise only the lifecycle, limits, usage, workspace, artifact, attention and delivery contracts that truly match both modes.
- [ ] Keep existing Workflow records and behaviour compatible.
- [ ] Define RoomDefinition, RoomBlueprint, OperatingEnvelope, RoomMember and MemberMandate.
- [ ] Define RoomRuntimeState, RoomRevision, RoomMessage, WorkItem, RoomArtifact and PathClaim.
- [ ] Define Room and member lifecycle states.
- [ ] Add strict validation for Room records and commands.
- [ ] Reuse the Orchestrator split-store and index pattern for current Room state.
- [ ] Add an append-only audit timeline for UI and diagnostics, not state replay.
- [ ] Add message cursors and command idempotency keys.
- [ ] Add schema migrations, archive, retention and delete operations.
- [ ] Add storage, restart, concurrent-write and migration tests.
- [ ] Document every new shared abstraction and its owner.

### Deliverables

- [ ] Small shared Orchestrator management interfaces.
- [ ] Separate Room domain contracts.
- [ ] Room split store, index and audit timeline.
- [ ] Storage and migration tests.

### Acceptance criteria

- [ ] Existing Workflow tests and persisted records remain compatible.
- [ ] A draft Room can be created, read, updated, listed, archived and deleted.
- [ ] Current Room records are authoritative without event replay.
- [ ] Duplicate command IDs do not duplicate logical changes.
- [ ] Invalid envelope, member and authority data is rejected.
- [ ] Shared interfaces contain no placeholder fields for the other mode.
- [ ] Renderer contracts expose no credentials or host file authority.
- [ ] pnpm typecheck and relevant tests pass.

## 7. Phase 3: Room Planner and adaptive templates

Objective: Generate a comprehensive problem-specific Room from a simple user brief.

### Work checklist

- [ ] Define strict RoomBlueprint and compact RoomProposalSummary schemas.
- [ ] Reuse Orchestrator structured planning and bounded repair.
- [ ] Give the planner the available model, tool, skill and workspace catalogue.
- [ ] Require one Conductor, bounded team size and a rationale for every member.
- [ ] Support inline generated members that do not require saved agent files.
- [ ] Clamp suggestions to user constraints and application defaults.
- [ ] Derive the simple proposal summary from the complete blueprint.
- [ ] Support bounded natural-language adjustment while preserving explicit user choices.
- [ ] Define optional adaptive templates without secrets or runtime state.
- [ ] Add Software Delivery, Adversarial Analysis and Parallel Issues presets.
- [ ] Allow a generated Room to be saved and later adapted or reused exactly.
- [ ] Add planner repair, unavailable-capability and redundant-team tests.

### Deliverables

- [ ] Room Planner and validated blueprint.
- [ ] Compact proposal and natural-language adjustment.
- [ ] Adaptive template format and three built-in presets.
- [ ] Planner and template test suite.

### Acceptance criteria

- [ ] One problem description produces a valid Room with one Conductor and a bounded team.
- [ ] Generated members do not require predefined agent files.
- [ ] The planner selects only available capabilities.
- [ ] User time, spend, access and team limits override suggestions.
- [ ] The default proposal contains no raw prompts, provider routes, schemas or paths.
- [ ] Natural-language adjustment preserves unrelated approved values.
- [ ] Presets guide planning without fixing the final roster.
- [ ] Invalid output is repaired or rejected within the attempt limit.
- [ ] pnpm typecheck and relevant tests pass.

## 8. Phase 4: Persistent Pi sessions, scheduling and context

Objective: Run and recover Room members through Pi's normal persistent session APIs.

### Work checklist

- [ ] Confirm or extract a generic host-owned persistent-session factory.
- [ ] Use SessionManager.create for new members and SessionManager.open for resumed members.
- [ ] Store standard Pi session files in the approved Room-specific directory.
- [ ] Store only session references and configuration revisions in Room state.
- [ ] Build each member resource loader from its approved blueprint.
- [ ] Resolve models through the host ModelRuntime and apply approved tools, skills and permissions.
- [ ] Add a bounded live AgentSession pool that can dispose and reopen members.
- [ ] Integrate Room lifecycle with existing Orchestrator scheduling, limits, abort and recovery.
- [ ] Reserve execution capacity for the Conductor and release capacity for idle members.
- [ ] Track cost, tokens, turns, retries and failures by member and Room.
- [ ] Reconcile active and uncertain turns after restart.
- [ ] Monitor context usage and compact only at safe turn boundaries.
- [ ] Preserve a member checkpoint, Room brief, mandate, questions and artifacts through compaction.
- [ ] Add local presence plus passive cache read and write usage capture.
- [ ] Add real temporary-session, fake-clock, concurrency, compaction and restart tests.

### Deliverables

- [ ] Standard Pi persistent member-session host.
- [ ] Bounded live session pool and Room scheduler integration.
- [ ] Restart reconciliation.
- [ ] Context management, compaction and passive cache telemetry.
- [ ] Deterministic runtime tests.

### Acceptance criteria

- [ ] At least three differently configured members run with separate Pi session files.
- [ ] No active Room member uses SessionManager.inMemory.
- [ ] A disposed member resumes from the same session file.
- [ ] An application restart reopens members without Room transcript replay.
- [ ] Room sessions do not appear in normal chat history.
- [ ] Pause, cancellation and hard limits stop new turns correctly.
- [ ] Concurrency stays within limits and the Conductor reserve remains available.
- [ ] Context compaction preserves current responsibilities and active work.
- [ ] A provider with no cache metadata runs normally.
- [ ] No second ModelRuntime, credential store or transcript store exists.
- [ ] pnpm typecheck and relevant tests pass.

## 9. Phase 5: Communication, waiting and dynamic Room revisions

Objective: Let members coordinate and let the Conductor adapt the team without expanding user authority.

### Work checklist

- [ ] Implement a durable single-host Room mailbox with direct, broadcast, question, reply, cancel and system messages.
- [ ] Persist messages before delivery and maintain per-member read cursors.
- [ ] Add message size, backlog, rate and idempotency limits.
- [ ] Queue broadcasts by default and require an explicit policy-approved wake option.
- [ ] End a waiting member's turn, release its slot and reopen the same session for a matching reply.
- [ ] Add required wait-cycle detection, Conductor notification and user pause.
- [ ] Implement add, mandate update, assign, suspend, resume, retire and replace revisions.
- [ ] Validate every revision against the operating envelope.
- [ ] Apply configuration changes at safe turn boundaries.
- [ ] Require user approval for any authority expansion.
- [ ] Create handover summaries and retain retired session history.
- [ ] Bound roster revisions and prevent autonomous Conductor self-replacement.
- [ ] Bridge logical Room operations through sero-cli under AD-020.
- [ ] Enforce Conductor-only actions in runtime code.
- [ ] Add duplicate, late-reply, message-storm, deadlock, revision-race and restart tests.

### Deliverables

- [ ] Durable Room mailbox and delivery policy.
- [ ] Wait, wake and deadlock handling.
- [ ] Controlled Room revision engine.
- [ ] AD-020 Room command namespace.
- [ ] Messaging and authority tests.

### Acceptance criteria

- [ ] A member can ask another member and later resume the same Pi session with the answer.
- [ ] Waiting consumes no active execution slot.
- [ ] A normal broadcast does not wake idle recipients.
- [ ] Peer messages cannot grant permission or approve protected work.
- [ ] The Conductor can add a member inside the approved envelope.
- [ ] Permission, spend or team-limit expansion waits for the user.
- [ ] Fundamental identity change creates a replacement and handover.
- [ ] Continued deadlock pauses for the user.
- [ ] Room commands do not add many tool schemas to each turn.
- [ ] pnpm typecheck and relevant tests pass.

## 10. Phase 6: Workspace safety, approvals, delivery and first-party UI

Objective: Make Room mode usable for real work inside the Orchestrator plugin.

### Runtime checklist

- [ ] Reuse the unified Git service and existing Orchestrator workspace placement.
- [ ] Support read-only shared work and a managed worktree for each editing member.
- [ ] Keep shared-root editing behind explicit user approval.
- [ ] Add minimal free-form WorkItem records and simple advisory path claims.
- [ ] Detect overlapping claims and apply warn or block policy.
- [ ] Persist artifacts and support Conductor commit collection and conflict reporting.
- [ ] Preserve uncommitted member work during failure and cancellation.
- [ ] Add one multi-member approval and attention queue.
- [ ] Reuse Orchestrator delivery settings and record the invoking chat as origin.
- [ ] Deliver final result, artifacts, unresolved items, duration and cost to the approved destination.
- [ ] Add temporary-repository, approval and delivery tests.

### UI checklist

- [ ] Add Workflows and Rooms navigation without changing Workflow behaviour.
- [ ] Implement Rooms home and the approved simple creation flow.
- [ ] Implement compact proposal, natural-language adjustment and advanced settings.
- [ ] Implement live roster, activity, work, claims, artifacts and Room revisions.
- [ ] Implement member transcript, mandate, context, worktree and cost inspection.
- [ ] Implement direct message, broadcast, pause, resume, cancel and user intervention.
- [ ] Implement consolidated approvals, deadlock, failure and recovery states.
- [ ] Implement completion and invoking-chat delivery state.
- [ ] Link Room members to the global Agent Board and back to the Room.
- [ ] Add keyboard, screen-reader, contrast and reduced-motion support.
- [ ] Add component and critical-flow end-to-end tests.
- [ ] Complete final design review against the prototype.

### Deliverables

- [ ] Per-member worktrees, minimal work records, simple claims and artifacts.
- [ ] Consolidated approval inbox and result delivery.
- [ ] Complete Room UI inside sero-orchestrator-plugin.
- [ ] Agent Board linking.
- [ ] Accessible component and end-to-end tests.

### Acceptance criteria

- [ ] A non-technical user can create and start a Room from one brief.
- [ ] The default proposal shows only the approved compact information.
- [ ] Advanced users can inspect every blueprint field.
- [ ] Two editing members can work in separate worktrees.
- [ ] Claims remain clearly advisory.
- [ ] Cancellation does not silently delete uncommitted work.
- [ ] Approval requests identify the member and authority consequence.
- [ ] A Room created from chat returns one final result to that chat.
- [ ] Reload and restart restore the same visible Room state.
- [ ] The UI explains every member and Room state.
- [ ] The global Agent Board is not duplicated inside the Room.
- [ ] Final design review, pnpm typecheck and critical tests pass.

At the end of Phase 6, Room mode is usable behind a feature flag. The old collaboration engines remain available.

## 11. Phase 7: Prove Room mode and remove legacy engines

Objective: Prove generated Rooms, switch entry points and remove the fixed engines.

### Work checklist

- [ ] Evaluate issue delivery with generated problem-specific rosters.
- [ ] Evaluate adversarial analysis.
- [ ] Evaluate parallel issues with worktrees and path claims.
- [ ] Evaluate chat-origin result delivery.
- [ ] Measure success, duration, cost, failures and user intervention.
- [ ] Fix Room defects that block normal use.
- [ ] Confirm that built-in presets remain adaptive.
- [ ] Route collaboration and adversarial entry points to Room creation after approval.
- [ ] Add release and migration notes.
- [ ] Remove CollaborationEngine and DebateEngine.
- [ ] Remove orphaned legacy IPC, stores, UI, templates, tests and documentation.
- [ ] Verify that no Room record or production entry point depends on a legacy engine.

### Deliverables

- [ ] Evaluation report for the three primary scenarios.
- [ ] Approved entry-point switch.
- [ ] Release and migration notes.
- [ ] Removal of both legacy engines and orphaned code.

### Acceptance criteria

- [ ] Generated Rooms complete the agreed primary scenarios.
- [ ] Collaboration behaviour comes from the problem and optional preset, not a fixed sequence.
- [ ] Chat invocation still receives one final result.
- [ ] No dual-runtime parity framework remains.
- [ ] No production code constructs CollaborationEngine or DebateEngine.
- [ ] No orphaned legacy state remains.
- [ ] pnpm typecheck and the full relevant test suite pass.

## 12. Phase 8: Hardening and production rollout

Objective: Make Room mode safe and reliable for general use.

### Work checklist

- [ ] Add long-running soak tests with repeated wait, wake, dispose, reopen and compaction.
- [ ] Add mixed-model, mixed-provider, throttle and network-failure tests.
- [ ] Add storage failure, crash recovery and low-disk tests.
- [ ] Add budget, cancellation, revision and delivery race tests.
- [ ] Add worktree conflict and cleanup recovery tests.
- [ ] Add prompt-injection, authority-expansion and forged-approval security tests.
- [ ] Verify AD-020, AD-024 and AD-026 compliance.
- [ ] Measure scheduler fairness, recovery time and resource growth.
- [ ] Add archive, retention, deletion and redacted diagnostics.
- [ ] Add user, template-author and operator documentation.
- [ ] Add telemetry, support runbook, rollout and rollback plan.
- [ ] Release to an internal cohort and expand after reliability and cost gates pass.
- [ ] Remove the feature flag after final approval.

### Deliverables

- [ ] Security, resilience, performance and soak reports.
- [ ] User and operator documentation.
- [ ] Diagnostics and support runbook.
- [ ] Approved rollout and rollback plan.
- [ ] General-availability release.

### Acceptance criteria

- [ ] Restart loses no accepted messages or completed work.
- [ ] Standard Pi sessions reopen after long idle time.
- [ ] Hard budgets hold under concurrent races.
- [ ] Context compaction prevents context exhaustion.
- [ ] Members and Conductor cannot expand authority.
- [ ] Diagnostics explain decisions without exposing secrets.
- [ ] Soak tests show no unbounded session, timer, message, log or worktree growth.
- [ ] Rollback preserves or safely exports Room data.
- [ ] Documentation covers create, adjust, run, intervene, recover, finish and delete.
- [ ] Production reliability and cost targets are approved.
- [ ] pnpm typecheck and the full test suite pass.

## 13. Deferred prompt-cache keep-warm track

Status: Optional post-MVP experiment. It does not block Room release.

### Go or no-go checklist

- [ ] Measure real Room idle duration, resume frequency and cache usage without storing prompt content.
- [ ] Measure route-specific cache-read and cache-write costs.
- [ ] Measure the effect of real turns and compaction on reusable prefixes.
- [ ] Define a strict experimental refresh budget.
- [ ] Approve a separate experiment for routes with reliable behaviour.
- [ ] Implement opt-in minimal-output refresh with no transcript or tool effects.
- [ ] Verify hits and unexpected writes, with backoff and stop rules.
- [ ] Compare measured cost against no keep-warm.

### Acceptance criteria

- [ ] A defined route and usage pattern shows repeatable net savings.
- [ ] Refresh is opt-in and separately budgeted.
- [ ] Refresh has no Room transcript, message, tool or work side effect.
- [ ] Unsupported providers run normally.
- [ ] Auto policy is not added without evidence that it saves cost.
- [ ] The experiment can be removed without changing Room orchestration.

A failed gate closes this track without blocking Room mode.

## 14. Cross-phase engineering rules

- [ ] Keep Workflow and Room domain records separate.
- [ ] Share only behaviour with the same contract.
- [ ] Do not implement a second scheduler, limit engine, Git layer, model runtime or transcript store.
- [ ] Use standard persistent Pi SessionManager APIs for Room members.
- [ ] Do not copy Pi transcripts into Room state.
- [ ] Use the unified Git layer under AD-024.
- [ ] Resolve models through the host runtime under AD-026.
- [ ] Bridge Room operations through sero-cli under AD-020.
- [ ] Validate model, command, storage and permission boundaries.
- [ ] Keep renderer code free from credentials and host authority.
- [ ] Treat peer messages as untrusted input.
- [ ] Preserve uncommitted work during failure and cancellation.
- [ ] Keep the default UX in plain English with technical details behind disclosure.
- [ ] Use strict TypeScript and conventional commits.
- [ ] Run pnpm typecheck before implementation commits.
- [ ] Run relevant tests during work and the full relevant suite at phase gates.
- [ ] Update spec.md when an approved decision changes behaviour.

## 15. Suggested pull request boundaries

Suggested review boundaries are:

1. Architecture decision and static prototype.
2. Shared foundations and Room storage.
3. Room Planner and adaptive templates.
4. Persistent Pi session runtime, scheduler and context.
5. Messaging, waiting and Room revisions.
6. Workspace safety, approvals and delivery.
7. First-party Room UI.
8. Legacy engine removal.
9. Hardening and rollout.
10. Optional cache experiment after separate approval.

Each pull request must state:

- phase and completed checkboxes;
- specification requirements;
- reused services and new Room-specific records;
- migrations;
- tests run;
- permission or provider effects;
- known limitations; and
- rollback behaviour.

## 16. First-release definition of done

- [ ] Workflows and Rooms are clear modes inside Sero Orchestrator.
- [ ] A user can create a Room from one plain-language problem.
- [ ] Sero generates a problem-specific Conductor and team.
- [ ] The default proposal shows only team, time, spend and access.
- [ ] Natural-language adjustment and advanced configuration both work.
- [ ] Every member uses a standard persistent Pi session.
- [ ] Members dispose, reopen, compact and recover without transcript duplication.
- [ ] The Conductor revises the Room only inside the approved envelope.
- [ ] Authority expansion requires user approval.
- [ ] Members communicate, wait and wake without holding idle capacity.
- [ ] Deadlock detection can pause for the user.
- [ ] Worktrees and simple claims support parallel work.
- [ ] Limits and no-progress rules stop runaway work.
- [ ] One approval inbox covers all members.
- [ ] A Room result returns to the invoking chat.
- [ ] Agent Board links do not duplicate Room controls.
- [ ] CollaborationEngine and DebateEngine are removed after proof.
- [ ] Security, accessibility, recovery and cost gates pass.
- [ ] User and operator documentation is complete.

Active prompt-cache keep-warm is not required for this definition of done.
