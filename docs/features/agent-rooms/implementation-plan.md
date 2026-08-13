# Agent Rooms implementation plan

Status: Ready for Phase 1  
Branch: feat/agent-rooms  
Parent product: Sero Orchestrator plugin  
Specification: [spec.md](./spec.md)  
Last updated: 2026-08-13

## 1. Delivery rule

Deliver Room mode through gated phases.

Do not start a runtime phase until the previous phase's acceptance criteria are complete. Do not mark a phase complete until every required deliverable and acceptance criterion is checked.

The static UX prototype is the first delivery gate. Runtime implementation starts only after the product owner approves the prototype and the resulting decisions are recorded in spec.md.

The prototype will live at:

    docs/prototypes/sero-agent-rooms.html

Written feature documents remain under:

    docs/features/agent-rooms/

## 2. Product outcome

Sero Orchestrator will have two user-facing modes:

- Workflow mode for the current LLM-authored step graph;
- Room mode for a persistent, Conductor-led team.

Room mode will:

- generate a team from the user's problem;
- use normal persistent Pi sessions;
- allow controlled runtime roster changes;
- reuse Orchestrator and host management primitives;
- keep Room-specific records separate from Workflow records;
- provide a simple default experience;
- support advanced control when requested; and
- replace CollaborationEngine and DebateEngine after proof.

## 3. Milestones

| Milestone | Phases | Outcome |
| --- | --- | --- |
| Product agreement | 0 to 1 | Approved architecture and static UX |
| Runtime foundation | 2 to 4 | Room records, generated blueprints and persistent member sessions |
| Coordinated Room | 5 to 6 | Communication, dynamic revisions, workspaces, approvals and delivery |
| Usable release candidate | 7 | Complete Room UI behind a feature flag |
| Engine replacement | 8 | Old collaboration engines removed |
| Production release | 9 | Reliability, security, migration and rollout complete |
| Optional optimisation | Cache track | Measured prompt-cache keep-warm experiment |

## 4. Phase 0: Revised product contract

Objective: Replace the initial standalone-Room proposal with the agreed Orchestrator-owned design.

### Work checklist

- [x] Create feat/agent-rooms from main.
- [x] Review the initial specification and implementation plan.
- [x] Review the existing Orchestrator runtime and reuse seams.
- [x] Decide that Agent Rooms are a mode in sero-orchestrator-plugin.
- [x] Rename the current product mode to Workflow mode.
- [x] Keep Workflow and Room domain records separate.
- [x] Decide that Room members use Pi's standard persistent SessionManager.
- [x] Remove the need for custom member transcript persistence.
- [x] Make Room creation problem-first and LLM-generated.
- [x] Make templates optional adaptive seeds.
- [x] Allow controlled Conductor-led Room revisions.
- [x] Make progressive disclosure a core UX rule.
- [x] Replace full event sourcing with current-state records and an audit timeline.
- [x] Add member context and compaction requirements.
- [x] Keep simple path claims but remove the complex lease design.
- [x] Move active prompt-cache keep-warm out of the first release.
- [x] Add the invoking-chat result contract.
- [x] Replace the old parity proposal with keep, prove and delete.
- [x] Replace spec.md with the revised specification.
- [x] Replace implementation-plan.md with this phased plan.

### Deliverables

- [x] Revised feature specification.
- [x] Revised phased implementation plan.
- [x] Explicit standard Pi session persistence decision.
- [x] Explicit Orchestrator mode and reuse decision.
- [x] Explicit simple default UX decision.

### Acceptance criteria

- [x] The documents describe Workflow and Room as modes of one Orchestrator product.
- [x] No section proposes a second Room scheduler, budget engine, Git layer or transcript store.
- [x] The Room domain remains free to model persistent members and messages.
- [x] Generated blueprints are detailed internally and compact in the default UI.
- [x] Runtime Room changes have a clear authority boundary.
- [x] The plan contains checkboxes, deliverables and acceptance criteria for each phase.

## 5. Phase 1: Architecture records and static UX gate

Objective: Approve the architecture boundaries and the complete simple-to-advanced user flow before runtime code begins.

### Architecture checklist

- [ ] Add a numbered architecture decision for Agent Rooms.
- [ ] Record Room mode ownership in sero-orchestrator-plugin.
- [ ] Record standard Pi SessionManager persistence for Room members.
- [ ] Record current-state Room records plus audit timeline.
- [ ] Record AD-020 command bridging for Room operations.
- [ ] Record the relationship between Room view and Agent Board.
- [ ] Verify every item in the reuse map against current code.
- [ ] Identify shared modules that need small generic interfaces.
- [ ] Identify Room-specific modules that must remain separate.
- [ ] Confirm that no change conflicts with AD-024, AD-025 or AD-026.
- [ ] Confirm the exact host capability used to create and reopen persistent sessions.
- [ ] Confirm the Room session namespace and retention path.

### Prototype checklist

- [ ] Review docs/prototypes/sero-design-library-plugin.html and current Orchestrator UI.
- [ ] Create docs/prototypes/sero-agent-rooms.html.
- [ ] Show Workflows and Rooms navigation inside Orchestrator.
- [ ] Show one plain-language Room brief field.
- [ ] Show optional simple time, spend and access limits.
- [ ] Show a preparing-the-team state.
- [ ] Show the compact Room proposal.
- [ ] Show only team, roles, time, spend and access by default.
- [ ] Show Start Room and Adjust as the primary actions.
- [ ] Show natural-language adjustment.
- [ ] Show optional Why this team? content.
- [ ] Show advanced blueprint configuration.
- [ ] Show a live Room roster and activity view.
- [ ] Show a member inspector with transcript, mandate and context state.
- [ ] Show a Conductor adding, updating and replacing a member.
- [ ] Show an authority-expansion approval request.
- [ ] Show the consolidated multi-member approval inbox.
- [ ] Show direct message, queued broadcast and explicit broadcast wake.
- [ ] Show waiting, deadlock, blocked, paused and failed states.
- [ ] Show path-claim conflict.
- [ ] Show context-compaction state.
- [ ] Show the Room result returning to an invoking chat.
- [ ] Show completion with artifacts, duration and cost.
- [ ] Test the prototype against issue delivery, adversarial analysis and parallel issues.
- [ ] Record all accepted prototype decisions in spec.md.
- [ ] Obtain explicit product approval.

### Deliverables

- [ ] Agent Rooms architecture decision in docs/decisions.md.
- [ ] Verified implementation reuse map.
- [ ] Approved static prototype.
- [ ] Updated specification with final Phase 1 UX choices.
- [ ] Confirmed first-release scope.

### Acceptance criteria

- [ ] A non-technical user can create and start a Room without opening advanced settings.
- [ ] The compact proposal does not expose prompts, provider routes, tool schemas or worktree paths.
- [ ] The user can understand team purpose, maximum time, maximum spend and access before start.
- [ ] Natural-language adjustment is the first edit path.
- [ ] Advanced users can inspect and edit the complete blueprint.
- [ ] Conductor-led roster changes and approval boundaries are understandable.
- [ ] Room members do not appear as normal chats in the approved flow.
- [ ] The Room result-to-chat flow is explicit.
- [ ] The Agent Board relationship avoids a duplicate global agent dashboard.
- [ ] The product owner approves the prototype before Phase 2.

## 6. Phase 2: Shared Orchestrator foundations and Room records

Objective: Add the smallest shared management seams and Room-specific durable records without running an LLM member.

Expected areas:

- plugins/sero-orchestrator-plugin/shared;
- plugins/sero-orchestrator-plugin/runtime;
- plugins/sero-orchestrator-plugin/ui;
- existing host app-state capabilities; and
- packages/common only for renderer-safe host contracts.

### Shared infrastructure checklist

- [ ] Define a small common Orchestrator identity and lifecycle interface where needed.
- [ ] Generalise limits and usage aggregation without changing Workflow semantics.
- [ ] Generalise workspace placement interfaces without merging Workflow and Room records.
- [ ] Generalise artifact and delivery interfaces where their behaviour is identical.
- [ ] Reuse the existing coordinator ownership rule.
- [ ] Reuse existing abort and lock primitives.
- [ ] Reuse existing restart reconciliation patterns.
- [ ] Reuse the existing split-store and index approach.
- [ ] Keep the existing Workflow record compatible.
- [ ] Add migration tests for any shared type change.
- [ ] Document why each new shared abstraction is shared.

### Room record checklist

- [ ] Define versioned RoomDefinition and RoomRuntimeState.
- [ ] Define RoomBlueprint and compact RoomProposalSummary.
- [ ] Define OperatingEnvelope.
- [ ] Define RoomMember and MemberMandate.
- [ ] Define RoomRevision and approval state.
- [ ] Define RoomMessage and member read cursor.
- [ ] Define minimal WorkItem.
- [ ] Define RoomArtifact and simple PathClaim.
- [ ] Define Room lifecycle and member status values.
- [ ] Define Room origin and delivery fields.
- [ ] Define local presence and core cache-profile fields.
- [ ] Add strict schema validation.
- [ ] Add one current Room record for each Room.
- [ ] Add lightweight Room index summaries.
- [ ] Add append-only audit timeline for UX and diagnostics.
- [ ] Do not add audit replay as a state reconstruction requirement.
- [ ] Add command and message idempotency keys.
- [ ] Add retention, archive and delete operations.
- [ ] Add Room store migrations.
- [ ] Add concurrent write, restart, migration and corruption tests.

### Deliverables

- [ ] Small shared Orchestrator management interfaces.
- [ ] Separate Room domain contracts.
- [ ] Room split store and index.
- [ ] Room audit timeline.
- [ ] Room schema and storage tests.
- [ ] No migration of current Workflow data beyond required shared-version changes.

### Acceptance criteria

- [ ] Existing Workflow tests pass unchanged or with documented compatibility updates.
- [ ] A draft Room can be created, read, updated, listed, archived and deleted.
- [ ] Replaying audit events is not required to read current state.
- [ ] Every accepted Room command durably updates the current record and audit entry.
- [ ] Duplicate command IDs do not duplicate a logical change.
- [ ] Invalid envelope, member, model or authority data is rejected.
- [ ] Renderer-safe contracts expose no credentials or host file authority.
- [ ] Shared abstractions contain no Room-only or Workflow-only placeholder fields.
- [ ] pnpm typecheck and relevant tests pass.

## 7. Phase 3: Room Planner, blueprint validation and templates

Objective: Generate a comprehensive, problem-specific Room definition from a simple user brief.

### Planner checklist

- [ ] Define the strict RoomBlueprint output schema.
- [ ] Define the compact RoomProposalSummary output.
- [ ] Reuse Orchestrator's structured planning call and bounded repair pattern.
- [ ] Build a Room Planner prompt that does not assume static roles.
- [ ] Provide the available model, tool, skill and workspace catalogue.
- [ ] Prevent the planner from inventing unavailable capabilities.
- [ ] Require a rationale for member count and each participant.
- [ ] Require one Conductor.
- [ ] Require generated inline member definitions when no saved agent fits.
- [ ] Merge user constraints over planner suggestions.
- [ ] Clamp all suggestions to hard application defaults.
- [ ] Estimate a plain-English time and cost range.
- [ ] Generate a compact proposal from the full blueprint.
- [ ] Support bounded natural-language blueprint adjustment.
- [ ] Preserve explicit user changes during later planner revisions.
- [ ] Add invalid-output and repair tests.
- [ ] Add tests for excessive, redundant and missing member proposals.

### Template checklist

- [ ] Define an optional Room template format.
- [ ] Exclude secrets, session IDs and runtime state.
- [ ] Allow planning strategy, example roles, constraints and output expectations.
- [ ] Default template reuse to adapt to the current problem.
- [ ] Add an advanced exact-roster reuse choice.
- [ ] Allow a generated Room to be saved as a template.
- [ ] Add Software Delivery, Adversarial Analysis and Parallel Issues presets.
- [ ] Verify that presets do not hard-code final rosters.
- [ ] Add template validation and migration tests.

### Deliverables

- [ ] Room Planner and validated RoomBlueprint contract.
- [ ] Compact proposal derivation.
- [ ] Natural-language adjustment flow.
- [ ] Optional adaptive Room templates and built-in presets.
- [ ] Planner, repair and template tests.

### Acceptance criteria

- [ ] One problem description can produce a valid Room with one Conductor and a bounded team.
- [ ] Generated members do not require predefined agent files.
- [ ] The planner uses only available models, tools and skills.
- [ ] User time, spend, access and team constraints always override suggestions.
- [ ] The compact proposal contains no hidden technical configuration.
- [ ] Natural-language adjustment preserves unrelated approved values.
- [ ] A preset changes planning guidance without fixing the final roster.
- [ ] An invalid blueprint is repaired or rejected within the attempt limit.
- [ ] pnpm typecheck and relevant tests pass.

## 8. Phase 4: Standard Pi sessions, lifecycle, scheduling and context

Objective: Run and recover independent Room members through Pi's normal persistent session API.

### Persistent session checklist

- [ ] Confirm or extract the generic host-owned persistent-session factory.
- [ ] Use SessionManager.create for new Room members.
- [ ] Use SessionManager.open for resumed Room members.
- [ ] Do not use SessionManager.inMemory for Room members.
- [ ] Store sessions under the agreed Room-specific directory.
- [ ] Store only session references in Room records.
- [ ] Do not copy Pi transcripts into Room state.
- [ ] Build the approved resource loader for each member.
- [ ] Resolve all member models through the host ModelRuntime.
- [ ] Apply tools, skills, prompt and permissions from the approved configuration.
- [ ] Keep open AgentSession objects in a bounded Room session pool.
- [ ] Dispose live sessions without deleting their persisted files.
- [ ] Reopen a disposed member on demand.
- [ ] Reopen required members after application restart.
- [ ] Add create, reopen, close and restart tests using real temporary session files.

### Lifecycle and scheduler checklist

- [ ] Implement RoomRuntime and Room coordinator integration.
- [ ] Add Room start, pause, resume, complete, fail and cancel transitions.
- [ ] Add all member lifecycle states.
- [ ] Reuse Orchestrator concurrency and limit primitives.
- [ ] Reserve execution capacity for the Conductor.
- [ ] Add fair ready-member selection.
- [ ] Count turns, tokens and cost by member and Room.
- [ ] Add bounded retries and failure limits.
- [ ] Add local member presence state.
- [ ] Add safe abort and shutdown handling.
- [ ] Reconcile orphaned turns after restart.
- [ ] Mark uncertain non-idempotent operations for review.
- [ ] Add fake-clock and concurrency tests.

### Context checklist

- [ ] Read context usage through the existing Pi session API.
- [ ] Define warning and compaction thresholds.
- [ ] Compact only at safe turn boundaries.
- [ ] Create a member checkpoint summary before compaction.
- [ ] Restore the current Room brief, mandate, questions and artifacts.
- [ ] Record compaction in Room diagnostics.
- [ ] Invalidate cache assumptions after compaction.
- [ ] Give new members curated Room context instead of the full Room transcript.
- [ ] Add long-session, repeated-compaction and restart tests.

### Core cache-boundary checklist

- [ ] Define route-specific PromptCacheProfile metadata.
- [ ] Add off and provider-default policies.
- [ ] Capture cache read and write usage when Pi reports it.
- [ ] Attribute normal-turn cache usage to the member and Room.
- [ ] Do not add active keep-warm requests in this phase.

### Deliverables

- [ ] Standard Pi persistent member-session host.
- [ ] Bounded live Room session pool.
- [ ] Room lifecycle and scheduler.
- [ ] Restart reconciliation.
- [ ] Member context management and compaction.
- [ ] Core passive cache metadata and usage capture.
- [ ] Deterministic runtime test suite.

### Acceptance criteria

- [ ] At least three differently configured members run with separate Pi session files.
- [ ] A disposed member resumes from the same Pi session file.
- [ ] An application restart can reopen the member without Room transcript replay.
- [ ] Room member sessions do not appear in normal chat history.
- [ ] Pause starts no new turns and preserves member sessions.
- [ ] Cancellation reaches active work and leaves a durable reason.
- [ ] Concurrency never exceeds the approved limit.
- [ ] The Conductor can run when non-reserved capacity is occupied.
- [ ] Context compaction preserves the current mandate and active work.
- [ ] A provider with no cache profile runs normally.
- [ ] No code creates a second ModelRuntime or credential store.
- [ ] pnpm typecheck and relevant tests pass.

## 9. Phase 5: Messaging, waiting and dynamic Room revisions

Objective: Let members coordinate and let the Conductor adapt the team without weakening user authority.

### Messaging checklist

- [ ] Implement the host-mediated durable Room mailbox.
- [ ] Persist messages before delivery.
- [ ] Add direct, broadcast, question, reply, cancel, acknowledgement and system messages.
- [ ] Add monotonic Room message sequence.
- [ ] Add per-member read cursors.
- [ ] Add message and inbox size limits.
- [ ] Add rate and backlog limits.
- [ ] Add command-id deduplication.
- [ ] Queue broadcasts by default.
- [ ] Require an explicit policy-approved option to wake broadcast recipients.
- [ ] Deliver direct replies to waiting members.
- [ ] Add controlled steering only at safe points.
- [ ] Treat peer messages as untrusted input.
- [ ] Test duplicates, late replies, message storms and restart.

### Wait and deadlock checklist

- [ ] End the current turn when a member waits.
- [ ] Release its execution slot.
- [ ] Persist the question or wait condition.
- [ ] Wake the same session when a matching reply arrives.
- [ ] Reopen a disposed waiting session when required.
- [ ] Add required wait-cycle detection.
- [ ] Notify the Conductor about a detected cycle.
- [ ] Pause for the user after continued deadlock.
- [ ] Test mutual waits and full-capacity waits.

### Room revision checklist

- [ ] Implement RoomRevisionRequest.
- [ ] Implement add, update mandate, assign, suspend, resume, retire and replace.
- [ ] Implement model and capability changes inside the allowed pool.
- [ ] Validate every change against the operating envelope.
- [ ] Apply configuration changes at a safe turn boundary.
- [ ] Require approval for any authority expansion.
- [ ] Add bounded roster revision and replacement counts.
- [ ] Create a handover summary for replacement members.
- [ ] Retain retired session history.
- [ ] Prevent autonomous Conductor self-replacement.
- [ ] Pause for the user after unrecoverable Conductor failure.
- [ ] Record every accepted and rejected revision.
- [ ] Inform affected members after an applied revision.
- [ ] Add race, approval and restart tests.

### AD-020 command checklist

- [ ] Register Room operations through the Orchestrator plugin.
- [ ] Bridge them through sero-cli under AD-020.
- [ ] Avoid standalone Room tool schemas for every operation.
- [ ] Enforce Conductor-only actions in runtime code.
- [ ] Add command help that is concise enough for member prompts.
- [ ] Test commands from Conductor and non-Conductor sessions.

### Deliverables

- [ ] Durable Room mailbox.
- [ ] Wait and wake integration.
- [ ] Deadlock detection.
- [ ] Controlled Room revision engine.
- [ ] sero-cli Room command namespace.
- [ ] Messaging, authority and revision tests.

### Acceptance criteria

- [ ] A member can ask another member and later resume the same session with the answer.
- [ ] A waiting member consumes no active slot.
- [ ] A queued broadcast does not wake idle recipients.
- [ ] Explicit broadcast wake respects concurrency and budget limits.
- [ ] A peer message cannot grant a permission or approve an action.
- [ ] The Conductor can add a member within the approved maximum without user interruption.
- [ ] A permission or budget expansion waits for user approval.
- [ ] A fundamental member identity change creates a replacement and handover.
- [ ] Continued wait-cycle deadlock pauses for the user.
- [ ] Room operations do not add many tool schemas to each model turn.
- [ ] pnpm typecheck and relevant tests pass.

## 10. Phase 6: Workspaces, work records, approvals, artifacts and delivery

Objective: Support safe software delivery and complete the Room's user and external handoff.

### Workspace checklist

- [ ] Reuse the Orchestrator workspace placement contract.
- [ ] Reuse the unified Git service under AD-024.
- [ ] Add read-only shared workspace mode.
- [ ] Add one managed worktree for each editing member.
- [ ] Make per-editor worktrees the default for code Rooms.
- [ ] Add shared-root mode only with explicit user approval.
- [ ] Restore or reconcile worktrees after restart.
- [ ] Preserve uncommitted member work during failure or cancellation.
- [ ] Add integration tests with temporary repositories.

### Work and claim checklist

- [ ] Implement minimal WorkItem records.
- [ ] Keep work status free-form.
- [ ] Avoid a hard-coded review or methodology state machine.
- [ ] Implement simple path, directory and glob claims.
- [ ] Detect overlapping active claims.
- [ ] Add warn and block policies.
- [ ] Release claims on member retirement and Room completion.
- [ ] Keep claims advisory.
- [ ] Add overlap, release and restart tests.

### Artifact checklist

- [ ] Persist Room plans, decisions, branches, commits, patches, tests, reviews and reports.
- [ ] Link artifacts to producer and work item.
- [ ] Add Conductor integration support for member commits.
- [ ] Detect and report merge conflicts.
- [ ] Preserve artifact references after session compaction.
- [ ] Add artifact retention and missing-file handling.

### Approval checklist

- [ ] Add one Room approval and attention queue.
- [ ] Include member, reason, target, permission consequence and estimated cost.
- [ ] Add approve, reject and adjust actions.
- [ ] Prevent the Conductor from answering user approvals.
- [ ] Resume only affected work after a decision.
- [ ] Persist unresolved approvals across restart.
- [ ] Add concurrent multi-member approval tests.

### Delivery checklist

- [ ] Reuse Orchestrator delivery settings and receipts.
- [ ] Record the invoking chat as Room origin when applicable.
- [ ] Deliver final result and compact summary to the origin session.
- [ ] Include artifacts, unresolved items, duration and cost.
- [ ] Support user-selected session delivery for UI-created Rooms.
- [ ] Use the normal approval path for external delivery.
- [ ] Add retry and idempotency protection.
- [ ] Test chat, UI and external delivery outcomes.

### Deliverables

- [ ] Per-member worktree support through the unified Git layer.
- [ ] Minimal work and simple path claims.
- [ ] Room artifact registry.
- [ ] Consolidated approval inbox.
- [ ] Invoking-chat and external delivery.
- [ ] Temporary-repository and delivery tests.

### Acceptance criteria

- [ ] Two editing members can work in separate worktrees without changing each other's files.
- [ ] Overlapping path claims produce the configured warning or block.
- [ ] Claims never claim to provide file-system locking.
- [ ] Cancellation does not silently delete uncommitted work.
- [ ] The Conductor can collect commits and report conflicts.
- [ ] Multiple member approval requests remain attributable and understandable.
- [ ] A Room created from chat returns one final result to that chat.
- [ ] External delivery cannot bypass user approval.
- [ ] No Room code spawns Git or GitHub operations outside the unified Git service.
- [ ] pnpm typecheck and relevant tests pass.

## 11. Phase 7: First-party Room UI

Objective: Implement the approved Room experience inside sero-orchestrator-plugin.

### Navigation and creation checklist

- [ ] Add Workflows and Rooms navigation.
- [ ] Preserve existing Workflow behaviour and routes.
- [ ] Add Rooms home with empty, draft, running, paused, completed and failed states.
- [ ] Add the one-question create flow.
- [ ] Add optional simple time, spend and access controls.
- [ ] Add preparing-the-team state.
- [ ] Add compact Room proposal.
- [ ] Add Start Room and natural-language Adjust.
- [ ] Add Why this team? disclosure.
- [ ] Add advanced blueprint settings.
- [ ] Add accessible loading, validation and repair errors.

### Live Room checklist

- [ ] Add compact member roster and statuses.
- [ ] Add current activity and Room timeline.
- [ ] Add work, path claims and artifacts.
- [ ] Add Room revision history.
- [ ] Show Conductor-added and replacement members.
- [ ] Add direct message and broadcast controls.
- [ ] Make broadcast wake an explicit choice.
- [ ] Add pause, resume, cancel and user-message actions.
- [ ] Add member inspector.
- [ ] Show transcript from the member's Pi session.
- [ ] Show current mandate, context usage and compaction history.
- [ ] Show worktree, branch and claims.
- [ ] Show current and historical cost.
- [ ] Show local presence separately from provider cache information.

### Attention and completion checklist

- [ ] Add consolidated approval and attention inbox.
- [ ] Add blocked, deadlocked, failed and no-progress states.
- [ ] Add Conductor failure and replacement flow.
- [ ] Add path-conflict resolution.
- [ ] Add limit warning and hard-stop state.
- [ ] Add invoking-chat delivery state.
- [ ] Add completion with artifacts, unresolved items, duration and cost.
- [ ] Add links from Room members to global Agent Board cards.
- [ ] Add links from Agent Board cards back to the Room.

### Accessibility and testing checklist

- [ ] Use plain-English product labels in the default flow.
- [ ] Keep technical values out of the default proposal.
- [ ] Add keyboard and focus support.
- [ ] Add screen-reader labels and live-state announcements.
- [ ] Meet contrast and reduced-motion requirements.
- [ ] Add component tests.
- [ ] Add critical-flow end-to-end tests.
- [ ] Compare the implementation with the approved prototype.
- [ ] Obtain final design review.

### Deliverables

- [ ] Workflows and Rooms Orchestrator navigation.
- [ ] Simple Room create and proposal flow.
- [ ] Advanced Room configuration.
- [ ] Live Room and member inspector.
- [ ] Approval, failure, recovery and completion views.
- [ ] Agent Board linking.
- [ ] Accessible component and end-to-end tests.

### Acceptance criteria

- [ ] A non-technical user can create and start a Room from one brief.
- [ ] The default proposal shows no raw prompts, routes, schemas or paths.
- [ ] Advanced users can inspect every blueprint field.
- [ ] The UI never becomes the source of truth for Room execution.
- [ ] Reload and application restart restore the same visible Room state.
- [ ] Every member state has a clear explanation and next action.
- [ ] Conductor-led roster changes are visible without overwhelming the main timeline.
- [ ] Approval requests identify the responsible member and authority change.
- [ ] Room members are inspectable without appearing as normal chats.
- [ ] The result-to-chat flow passes end-to-end tests.
- [ ] Final design review approves the implementation.
- [ ] pnpm typecheck and relevant tests pass.

At the end of Phase 7, Room mode is usable behind a feature flag. The old collaboration engines still exist.

## 12. Phase 8: Presets and legacy engine replacement

Objective: Prove Room mode, switch entry points and remove the fixed collaboration engines.

### Proof checklist

- [ ] Run issue-delivery evaluation with generated problem-specific rosters.
- [ ] Run adversarial-analysis evaluation.
- [ ] Run parallel-issues evaluation with worktrees and path claims.
- [ ] Run chat-origin result-delivery evaluation.
- [ ] Measure success, duration, cost, failures and required user intervention.
- [ ] Fix Room defects that block normal use.
- [ ] Confirm that built-in presets remain adaptive.

### Replacement checklist

- [ ] Keep CollaborationEngine and DebateEngine unchanged until the proof gate passes.
- [ ] Route collaboration entry points to generated Rooms after approval.
- [ ] Route adversarial or debate entry points to generated Rooms after approval.
- [ ] Preserve the final-result-to-chat experience.
- [ ] Add clear release and migration notes.
- [ ] Remove CollaborationEngine.
- [ ] Remove DebateEngine.
- [ ] Remove old IPC handlers and runtime state.
- [ ] Remove old renderer stores and components that have no remaining use.
- [ ] Remove unused static agent templates.
- [ ] Remove or update old tests and documentation.
- [ ] Verify that no Room record depends on a legacy engine type.
- [ ] Verify that no production entry point constructs either old engine.

### Deliverables

- [ ] Evaluation report for the three primary Room scenarios.
- [ ] Approved entry-point switch.
- [ ] Release and migration notes.
- [ ] Removal of the two legacy engines and orphaned code.

### Acceptance criteria

- [ ] Generated Rooms complete the agreed primary scenarios.
- [ ] Collaboration and adversarial behaviour come from the problem and optional preset, not a fixed runtime sequence.
- [ ] Chat invocation still receives one final result.
- [ ] There is no dual-runtime parity or telemetry framework to maintain.
- [ ] No production code constructs CollaborationEngine or DebateEngine.
- [ ] No orphaned legacy IPC or renderer state remains.
- [ ] Full relevant test suite and pnpm typecheck pass.

## 13. Phase 9: Hardening and production rollout

Objective: Make Room mode safe and reliable for general use.

### Reliability checklist

- [ ] Add long-running Room soak tests.
- [ ] Add repeated wait, wake, dispose and reopen cycles.
- [ ] Add repeated context-compaction cycles.
- [ ] Add mixed-model and mixed-provider tests.
- [ ] Add provider throttle and transient network failure tests.
- [ ] Add storage failure and low-disk tests.
- [ ] Add crash recovery during member turn and Room revision.
- [ ] Add budget and cancellation race tests.
- [ ] Add worktree conflict and cleanup recovery tests.
- [ ] Add delivery retry and duplicate-protection tests.
- [ ] Measure scheduler fairness and recovery time.
- [ ] Check for unbounded session, timer, message, log or worktree growth.

### Security checklist

- [ ] Test peer-message prompt injection.
- [ ] Test Conductor authority expansion attempts.
- [ ] Test forged approval and message identities.
- [ ] Test invalid session-path access.
- [ ] Test secret redaction.
- [ ] Test workspace escape attempts.
- [ ] Test external delivery approval enforcement.
- [ ] Verify all model use passes through AD-026.
- [ ] Verify all Git use passes through AD-024.
- [ ] Verify all Room commands follow AD-020.

### Product and operations checklist

- [ ] Add Room import and export if required for the release.
- [ ] Add archive, retention and deletion controls.
- [ ] Add redacted diagnostics export.
- [ ] Add user documentation.
- [ ] Add template and preset authoring guidance.
- [ ] Add operator guidance for session recovery and provider changes.
- [ ] Add release notes.
- [ ] Add production telemetry without sensitive content.
- [ ] Add rollout and rollback plan.
- [ ] Release to an internal cohort behind the feature flag.
- [ ] Expand after reliability and cost targets pass.
- [ ] Remove the feature flag after final approval.

### Deliverables

- [ ] Security, resilience, performance and soak reports.
- [ ] User and operator documentation.
- [ ] Diagnostics and support runbook.
- [ ] Rollout and rollback plan.
- [ ] Approved production telemetry.
- [ ] General-availability release.

### Acceptance criteria

- [ ] A Room recovers from application restart without losing accepted messages or completed work.
- [ ] A member reopens through its standard Pi session after long idle time.
- [ ] Hard budgets hold under concurrency and cancellation races.
- [ ] Context compaction prevents long sessions from exhausting their context.
- [ ] Security tests confirm that members and Conductor cannot expand authority.
- [ ] Diagnostics explain Room decisions without exposing secrets.
- [ ] Soak tests show no unbounded resource growth.
- [ ] Rollback preserves or safely exports existing Room data.
- [ ] User documentation covers create, adjust, run, intervene, recover, finish and delete.
- [ ] Production reliability and cost targets are approved.
- [ ] pnpm typecheck and the full test suite pass.
- [ ] The feature flag is removed only after the production gate passes.

## 14. Deferred prompt-cache keep-warm track

Status: Optional post-MVP experiment. It is not part of the Room release definition.

Objective: Measure whether active remote cache refresh can save cost for idle persistent members.

### Go or no-go checklist

- [ ] Collect real Room idle-duration and resume-frequency distributions without prompt content.
- [ ] Measure route-specific cache-read and cache-write costs.
- [ ] Measure the effect of real turns and compaction on reusable prefixes.
- [ ] Define a maximum experimental cache-refresh budget.
- [ ] Identify provider routes with reliable cache behaviour.
- [ ] Write a separate experimental design.
- [ ] Approve the experiment before any live keep-warm request is implemented.

### Experimental implementation checklist

- [ ] Extend PromptCacheAdapter with a refresh operation.
- [ ] Add explicit opt-in keep-warm policy.
- [ ] Add route-specific timing and safety margins.
- [ ] Use isolated minimal-output requests.
- [ ] Ensure refreshes have no member transcript or tool effects.
- [ ] Attribute all refresh cost.
- [ ] Verify cache reads and detect unexpected writes.
- [ ] Add backoff and route-disable rules.
- [ ] Stop on pause, completion, compaction, idle limit or budget.
- [ ] Test Anthropic as a short-retention case.
- [ ] Test a long-retention provider.
- [ ] Test a provider with no usable cache control.
- [ ] Compare savings against no keep-warm.

### Acceptance criteria

- [ ] The experiment shows a repeatable net saving for a defined route and usage pattern.
- [ ] Keep-warm is opt-in and separately budgeted.
- [ ] A refresh has no member transcript, message, tool or work side effect.
- [ ] Unexpected cache writes stop or delay further refreshes.
- [ ] A provider with no support runs normally.
- [ ] Auto policy is not added without evidence that its decision rule saves cost.
- [ ] The experiment can be removed without changing Room orchestration.

A failed go or no-go gate closes this track without blocking Room mode.

## 15. Cross-phase engineering rules

Apply these rules in every implementation phase:

- [ ] Keep Workflow and Room domain models separate.
- [ ] Share only behaviour that has the same contract.
- [ ] Do not implement a second scheduler, limit engine, Git layer, model runtime or transcript store.
- [ ] Use Pi SessionManager.create and SessionManager.open for Room members.
- [ ] Do not use SessionManager.inMemory for active Room members.
- [ ] Do not copy Pi transcripts into Room state.
- [ ] Use the unified Git layer under AD-024.
- [ ] Use plugin-owned UI patterns under AD-025 where applicable.
- [ ] Resolve models through the host runtime under AD-026.
- [ ] Bridge Room operations through sero-cli under AD-020.
- [ ] Validate data at model, command, IPC, storage and provider boundaries.
- [ ] Keep renderer code free from credentials and host authority.
- [ ] Use strict TypeScript.
- [ ] Make clock and provider behaviour testable.
- [ ] Redact secrets and sensitive prompt content.
- [ ] Treat peer messages as untrusted input.
- [ ] Treat message volume as activity, not progress.
- [ ] Preserve uncommitted work during failure and cancellation.
- [ ] Keep the default UX in plain English.
- [ ] Keep technical details behind progressive disclosure.
- [ ] Use conventional commit messages.
- [ ] Run pnpm typecheck before implementation commits.
- [ ] Run the smallest relevant tests during work and the full relevant suite at phase gates.
- [ ] Update spec.md when an approved implementation decision changes behaviour.

## 16. Suggested pull request boundaries

A phase can use more than one pull request. Suggested review boundaries are:

1. Architecture decisions and static prototype.
2. Shared Orchestrator interfaces and Room store.
3. Room Planner, blueprint validation and templates.
4. Persistent Pi session host and runtime lifecycle.
5. Context management and scheduler integration.
6. Messaging, waiting and deadlock handling.
7. Dynamic Room revisions and AD-020 commands.
8. Worktrees, claims and artifacts.
9. Approvals and delivery.
10. First-party Room UI.
11. Legacy engine removal.
12. Hardening and rollout.
13. Optional cache experiment, only after approval.

Each pull request must state:

- phase and checklist items;
- specification requirements;
- shared services reused;
- new Room-specific records;
- migrations;
- tests run;
- permission or provider effects;
- known limitations; and
- rollback behaviour.

## 17. First-release definition of done

Room mode is complete when:

- [ ] Workflows and Rooms are clear modes inside Sero Orchestrator.
- [ ] A user can create a Room from one plain-language problem.
- [ ] Sero generates a problem-specific Conductor and participant team.
- [ ] The default proposal shows only team, time, spend and access.
- [ ] The user can adjust the team with natural language.
- [ ] Advanced users can inspect the full blueprint.
- [ ] Every member uses a standard persistent Pi session.
- [ ] Members can dispose, reopen, compact and recover without transcript duplication.
- [ ] The Conductor can revise the Room inside the approved envelope.
- [ ] Authority expansion requires user approval.
- [ ] Members can communicate, wait and wake without holding idle capacity.
- [ ] Deadlock detection can pause the Room for the user.
- [ ] Worktrees and simple path claims support parallel code work.
- [ ] Budgets and no-progress rules stop runaway work.
- [ ] The UI provides one approval and attention inbox.
- [ ] A Room result can return to the invoking chat.
- [ ] The global Agent Board links to Room members without duplicating Room controls.
- [ ] CollaborationEngine and DebateEngine are removed after proof.
- [ ] Security, accessibility, recovery and cost gates pass.
- [ ] User and operator documentation is complete.

Active prompt-cache keep-warm is not required for this definition of done.
