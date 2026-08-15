# Agent Rooms implementation plan

Status: Phase 1 approved — Phase 2 in progress  
Branch: feat/agent-rooms  
Parent product: Sero Orchestrator plugin  
Specification: [spec.md](./spec.md)  
Last updated: 2026-08-13

## 1. Delivery rule

Deliver Room mode through gated phases. Do not begin a runtime phase until the previous phase meets all acceptance criteria.

Phase 1 is the product and architecture gate. Runtime implementation starts only after the static prototype is approved and its decisions are recorded in spec.md.

Prototype path: docs/prototypes/sero-agent-rooms.html
Existing prototype example: docs/prototypes/sero-design-library-plugin.html

## 2. Target outcome

Sero Orchestrator will have:

- Workflow mode for the current LLM-authored step graph;
- Room mode for a persistent, Conductor-led team.

Room mode will generate a team from the user's problem, use normal persistent Pi sessions, let the Conductor revise the team within user limits, and reuse existing Orchestrator and host management services.

## 3. Milestones

| Milestone | Phases | Outcome |
| --- | --- | --- |
| Product agreement | 0 to 1 | Approved architecture and static UX |
| Runtime foundation | 2 to 4 | Secure session capability, Room records, generated blueprints and persistent sessions |
| Coordinated runtime | 5 to 6 | Messaging, revisions, workspace safety, approvals and delivery |
| Usable Room | 7 | Approved first-party Room UI |
| Replacement | 8 | CollaborationEngine and DebateEngine removed |
| Production | 9 | Security, recovery, documentation and rollout complete |
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
- [x] Incorporate the second review findings.
- [x] Make authority-bearing proposal fields deterministic projections.
- [x] Define the filtered member-session resource policy.
- [x] Assign the Room coordinator as Room brief owner.
- [x] Require event-driven member wake.
- [x] Split runtime and UI delivery gates.

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

- [x] Design and record the appRuntime.persistentSessions capability as a Phase 1 blocker.
- [x] Define the host-issued grant, request validation, revocation and built-in-only gating.
- [x] Record reuse of Pi SessionManager mechanics and the new plugin-to-host authority boundary.
- [x] Record Room mode ownership, current-state storage and AD-020 command bridging.
- [x] Record the decision to keep internal Loop naming for Workflow records and track the rename debt.
- [x] Verify the reuse map in spec.md against current code.
- [x] Identify the small shared Orchestrator interfaces and the Room-specific records.
- [x] Confirm the Room session namespace and retention policy.
- [x] Define the deterministic consent-summary projection and fixed access-label mapping.
- [x] Define the filtered member resource and lifecycle policy.
- [x] Define automatic Room brief ownership and Conductor-authored notes.
- [x] Define Room and member grouping in Usage analytics.
- [x] Create docs/prototypes/sero-agent-rooms.html using current Sero design patterns.
- [x] Show Workflows and Rooms navigation inside Orchestrator.
- [x] Show one-question creation, preparation, compact proposal, Start and natural-language Adjust.
- [x] Show optional rationale and advanced blueprint settings.
- [x] Show the live Room, member inspector, Room revisions and context compaction.
- [x] Show the consolidated approval inbox, waiting, deadlock, failure and path conflict.
- [x] Show result delivery to an invoking chat and links to the Agent Board.
- [x] Test the prototype against issue delivery, adversarial analysis and parallel issues.
- [x] Record accepted prototype decisions in spec.md.
- [x] Obtain explicit product approval.

### Deliverables

- [x] Agent Rooms architecture decision.
- [x] Persistent-session host capability architecture decision.
- [x] Security contract for grant validation and built-in-only gating.
- [x] Verified reuse map, resource policy and session namespace.
- [x] Deterministic consent-summary mapping.
- [x] Approved static prototype.
- [x] Final first-release product scope.

### Acceptance criteria

- [x] A non-technical user can create and start a Room without advanced settings.
- [x] The compact proposal shows only team, roles, time, spend, access and important warnings.
- [x] Team size, time, spend and access are computed from the validated blueprint.
- [x] A planner-authored sentence cannot understate effective authority.
- [x] Natural-language adjustment is the first edit path.
- [x] Advanced users can inspect the complete blueprint.
- [x] Runtime roster changes and approval boundaries are understandable.
- [x] Room sessions remain accessible through the Room without appearing as normal chats.
- [x] The result-to-chat and Agent Board relationships are clear.
- [x] The product owner approves the prototype before Phase 2.

## 6. Phase 2: Shared foundations and Room storage

Objective: Implement the secure generic session capability, reuse Orchestrator management primitives and add separate Room records without running a Room.

### Persistent-session capability checklist

- [x] Add appRuntime.persistentSessions to SERO_HOST_CAPABILITIES.
- [x] Restrict the first release to bundled first-party plugins by canonical path equality against a host-derived bundled root plus an app-ID-to-directory allowlist.
- [x] Reject plugin-dev-session and settings-declared package sources outright.
- [x] Issue every grant from a host-stored approval, never from the plugin request.
- [x] Define host-issued PersistentSessionGrant records with per-subject policies.
- [x] Define PersistentSessionPermissionProfile and its total-order subset check.
- [x] Use opaque owner, scope and subject identifier strings in the generic capability.
- [x] Keep the capability free from imports or dependencies on Room domain types.
- [x] Register an immutable subject-to-path binding on create; resolve open from it and ignore any caller path.
- [x] Validate session path and working directory after symlink resolution.
- [x] Validate model, thinking level, tools, skills and prompt-addition size against the requesting subject's policy.
- [x] Apply the subject policy's permission profile verbatim; accept no caller-supplied profile.
- [x] Take the count check, subject binding and pending reservation as one atomic critical section, counting pending against both caps.
- [x] Commit or release the reservation after construction, and reconcile pending reservations against the filesystem at startup.
- [x] Reject plugin-supplied authority that the host cannot resolve to an approved grant.
- [x] Add create, open, prompt, steer, abort, subscribe, compact, usage and dispose operations.
- [x] Persist grants and created-session counters; rebuild the live count from the live registry at startup.
- [x] Revoke grants write-first when the Room stops, is deleted or loses authority.
- [x] Add every deny test listed in architecture.md 4.2.
- [x] Add generic temporary-session tests without Room domain dependencies.

### Shared and storage checklist

- [x] Generalise only the lifecycle, limits, usage, workspace, artifact, attention and delivery contracts that truly match both modes.
- [x] Keep existing Workflow records and behaviour compatible.
- [x] Define RoomDefinition, RoomBlueprint, OperatingEnvelope, RoomMember and MemberMandate.
- [x] Define RoomRuntimeState, RoomRevision, RoomMessage, WorkItem, RoomArtifact and PathClaim.
- [x] Define Room and member lifecycle states.
- [x] Add strict validation for Room records and commands.
- [x] Reuse the Orchestrator split-store and index pattern for current Room state.
- [x] Add an append-only audit timeline for UI and diagnostics, not state replay.
- [x] Add message cursors and command idempotency keys.
- [x] Add schema migrations, archive, retention and delete operations.
- [x] Add storage, restart, concurrent-write and migration tests.
- [x] Document every new shared abstraction and its owner.

### Deliverables

- [x] Gated appRuntime.persistentSessions host capability.
- [x] Host-issued grant and validation implementation.
- [x] Small shared Orchestrator management interfaces.
- [x] Separate Room domain contracts.
- [x] Room split store, index and audit timeline.
- [x] Capability, storage and migration tests.

### Acceptance criteria

- [x] Existing Workflow tests and persisted records remain compatible.
- [x] An external plugin cannot obtain the persistent-session capability.
- [x] A directory claiming an allowlisted app ID from an arbitrary path is rejected.
- [x] A defective built-in plugin cannot create a session outside its host-issued grant.
- [x] One subject cannot use another subject's capabilities or open its session.
- [x] Two concurrent creates cannot both pass a one-session cap.
- [x] A restart preserves grants and created counts and zeroes the live count.
- [x] A crash between reservation and construction leaks no count and binds no nonexistent session.
- [x] The capability has no dependency on Room domain record types.
- [x] A draft Room can be created, read, updated, listed, archived and deleted.
- [x] Current Room records are authoritative without event replay.
- [x] Duplicate command IDs do not duplicate logical changes.
- [x] Invalid envelope, member and authority data is rejected.
- [x] Shared interfaces contain no placeholder fields for the other mode.
- [x] Renderer contracts expose no credentials or host file authority.
- [x] pnpm typecheck and relevant tests pass.

## 7. Phase 3: Room Planner and adaptive templates

Objective: Generate a comprehensive problem-specific Room from a simple user brief.

### Work checklist

- [x] Define strict RoomBlueprint and compact RoomProposalSummary schemas.
- [x] Reuse Orchestrator structured planning and bounded repair.
- [x] Give the planner the available model, tool, skill and workspace catalogue.
- [x] Require one Conductor, bounded team size and a rationale for every member.
- [x] Support inline generated members that do not require saved agent files.
- [x] Clamp suggestions to user constraints and application defaults.
- [x] Compute team size, maximum time, maximum spend and access from validated blueprint fields in deterministic application code.
- [x] Use a fixed mapping from effective capabilities to plain-English access labels and warnings.
- [x] Limit planner-authored proposal fields to prose such as role one-liners, approach and rationale.
- [x] Recompute the authority summary after every blueprint adjustment.
- [x] Compute the changed / preserved / removed report from a member-granular blueprint diff, never from planner prose.
- [x] Support bounded natural-language adjustment while preserving explicit user choices.
- [x] Define optional adaptive templates without secrets or runtime state.
- [x] Add Software Delivery, Adversarial Analysis and Parallel Issues presets.
- [x] Allow a generated Room to be saved and later adapted or reused exactly.
- [x] Add planner repair, unavailable-capability and redundant-team tests.

### Deliverables

- [x] Room Planner and validated blueprint.
- [x] Compact proposal and natural-language adjustment.
- [x] Adaptive template format and three built-in presets.
- [x] Planner and template test suite.

### Acceptance criteria

- [x] One problem description produces a valid Room with one Conductor and a bounded team.
- [x] Generated members do not require predefined agent files.
- [x] The planner selects only available capabilities.
- [x] User time, spend, access and team limits override suggestions.
- [x] The default proposal contains no raw prompts, provider routes, schemas or paths.
- [x] The computed proposal always matches the blueprint enforced by the runtime.
- [x] Capability mapping tests cover read, workspace write, GitHub write and deployment warnings.
- [x] Natural-language adjustment preserves unrelated approved values.
- [x] A member gaining a capability another member already holds is reported even though no union tile moves.
- [x] Presets guide planning without fixing the final roster.
- [x] Invalid output is repaired or rejected within the attempt limit.
- [x] pnpm typecheck and relevant tests pass.

## 8. Phase 4: Persistent Pi sessions, scheduling and context

Objective: Run and recover Room members through Pi's normal persistent session APIs.

### Work checklist

- [x] Consume appRuntime.persistentSessions rather than constructing sessions in plugin code.
- [x] Use SessionManager.create for new members and SessionManager.open for resumed members behind the host capability.
- [x] Store standard Pi session files in the approved Room-specific directory.
- [x] Store only session references and configuration revisions in Room state.
- [x] Set deterministic Pi session names that identify Room and member.
- [x] Load project context files such as AGENTS.md.
- [x] Load the approved member prompt, mandate, selected skills, platform tools and sero-cli Room commands.
- [x] Load only plugin extensions that provide an approved selected capability.
- [x] Keep unrelated extensions, prompts, themes, agent definitions and third-party lifecycle hooks off by default.
- [x] Enforce the filtered resource policy in the host from the approved grant.
- [x] Resolve models through the host ModelRuntime and apply approved tools, skills and permissions.
- [x] Add a bounded live AgentSession pool that can dispose and reopen members.
- [x] Integrate Room lifecycle with existing Orchestrator scheduling, limits, abort and recovery.
- [x] Reserve execution capacity for the Conductor and release capacity for idle members.
- [x] Track cost, tokens, turns, retries and failures by member and Room.
- [x] Reconcile active and uncertain turns after restart.
- [x] Build the authoritative Room brief automatically from current Room state after structural progress.
- [x] Allow a clearly labelled Conductor situation note without overriding computed fields.
- [x] Project only member-relevant Room brief content into each session.
- [x] Monitor context usage and compact only at safe turn boundaries.
- [x] Preserve a member checkpoint, Room brief, mandate, questions and artifacts through compaction.
- [x] Implement subscribe as a bounded per-member live output buffer that is never persisted.
- [x] Implement paged member-history reads through the host capability, derived on read.
- [x] Keep observation read-only, holding no execution slot and changing no member behaviour.
- [x] Add local presence plus passive cache read and write usage capture.
- [x] Add real temporary-session, fake-clock, concurrency, compaction and restart tests.

### Deliverables

- [x] Standard Pi persistent member-session host.
- [x] Bounded live session pool and Room scheduler integration.
- [x] Restart reconciliation.
- [x] Live member observation and paged history reads.
- [x] Context management, compaction and passive cache telemetry.
- [x] Deterministic runtime tests.

### Acceptance criteria

- [x] At least three differently configured members run with separate Pi session files.
- [x] No active Room member uses SessionManager.inMemory.
- [x] A disposed member resumes from the same session file.
- [x] An application restart reopens members without Room transcript replay.
- [x] Room sessions do not appear in normal chat history.
- [x] Pause, cancellation and hard limits stop new turns correctly.
- [x] Concurrency stays within limits and the Conductor reserve remains available.
- [x] Context compaction preserves current responsibilities and active work.
- [x] A member's live turn output and complete history are both readable through the runtime.
- [x] A retired, replaced or failed member's history stays readable.
- [x] Observation writes nothing into Room records.
- [x] A provider with no cache metadata runs normally.
- [x] Member sessions contain approved project context but do not load every installed extension.
- [x] The authoritative Room brief is available without reading the full Room transcript.
- [x] No second ModelRuntime, credential store or transcript store exists.
- [x] pnpm typecheck and relevant tests pass.

## 9. Phase 5: Communication, waiting and dynamic Room revisions

Objective: Let members coordinate and let the Conductor adapt the team without expanding user authority.

### Work checklist

- [x] Implement a durable single-host Room mailbox with direct, broadcast, question, reply, cancel and system messages.
- [x] Persist messages before delivery and maintain per-member read cursors.
- [x] Add message size, backlog, rate and idempotency limits.
- [x] Queue broadcasts by default and require an explicit policy-approved wake option.
- [x] End a waiting member's turn, release its slot and reopen the same session for a matching reply.
- [x] Emit an immediate coordinator event when a reply or targeted wake signal is persisted.
- [x] Keep the periodic scheduler tick as recovery only, not the normal wake path.
- [ ] Start a resumed turn within two seconds at the 95th percentile when local capacity and limits permit. *(The event-driven path is covered, but a percentile claim needs production telemetry. Measure it in Phase 9 rather than infer it from a fake-clock test.)*
- [x] Add required wait-cycle detection, Conductor notification and user pause.
- [x] Implement add, mandate update, assign, suspend, resume, retire and replace revisions.
- [x] Validate every revision against the operating envelope.
- [x] Apply mandate changes as instructions only.
- [x] Route every model, tool, skill, permission, workspace and delivery change through a validated configuration revision.
- [x] Apply configuration changes at safe turn boundaries.
- [x] Require user approval for any authority expansion.
- [x] Create handover summaries and retain retired session history.
- [x] Bound roster revisions and prevent autonomous Conductor self-replacement.
- [x] Bridge logical Room operations through sero-cli under AD-020.
- [x] Enforce Conductor-only actions in runtime code.
- [x] Add duplicate, late-reply, message-storm, deadlock, revision-race and restart tests.

### Deliverables

- [x] Durable Room mailbox and delivery policy.
- [x] Wait, wake and deadlock handling.
- [x] Controlled Room revision engine.
- [x] AD-020 Room command namespace.
- [x] Messaging and authority tests.

### Acceptance criteria

- [x] A member can ask another member and later resume the same Pi session with the answer.
- [x] Reply delivery uses the event path and does not wait for the periodic tick.
- [ ] Event-to-resumed-turn latency meets the two-second target when capacity is available. *(Deferred to the Phase 9 performance gate; local tests prove event routing, not a production percentile.)*
- [x] Waiting consumes no active execution slot.
- [x] A normal broadcast does not wake idle recipients.
- [x] Peer messages cannot grant permission or approve protected work.
- [x] The Conductor can add a member inside the approved envelope.
- [x] Permission, spend or team-limit expansion waits for the user.
- [x] Fundamental identity change creates a replacement and handover.
- [x] Continued deadlock pauses for the user.
- [x] Room commands do not add many tool schemas to each turn.
- [x] pnpm typecheck and relevant tests pass.

## 10. Phase 6: Workspace safety, approvals and delivery runtime

Objective: Complete the Room runtime and let it soak behind the feature flag before the UI gate.

### Work checklist

- [x] Reuse the unified Git service and existing Orchestrator workspace placement.
- [x] Support read-only shared work and a managed worktree for each editing member.
- [x] Keep shared-root editing behind explicit user approval.
- [x] Add minimal free-form WorkItem records and simple advisory path claims.
- [x] Detect overlapping claims and apply warn or block policy.
- [x] Persist artifacts and support Conductor commit collection and conflict reporting.
- [x] Preserve uncommitted member work during failure and cancellation.
- [x] Add one multi-member approval and attention queue.
- [x] Prevent the Conductor from answering user approvals.
- [x] Reuse Orchestrator delivery settings, the agent-authored send and the DeliveryReceipt approval token.
- [x] Add a Room origin field and a new internal invoking-chat delivery destination; the seven existing destinations are all external.
- [x] Deliver final result, artifacts, unresolved items, duration and cost to the approved destination.
- [x] Label Pi sessions with Room and member identity.
- [x] Extend the Usage aggregator with path-derived Room grouping; leave the scanner unchanged.
- [x] Derive Usage grouping from the rooms/<roomId>/ path and Pi session name.
- [x] Do not read the Orchestrator store from the Usage plugin.
- [x] Allow only optional published label or link enrichment from Room metadata.
- [x] Show grouped Room totals and optional per-member usage without changing Pi session format.
- [x] Add the `SERO_ROOMS` rollout flag. One gate in front of the whole Room
      runtime: switched off, no coordinator, no tick and no state are created.
- [x] Run the completed runtime behind the feature flag without the final Room UI. *(The UI now exists, so the historical ordering cannot be repeated. The runtime gate remains UI-independent; see runtime-soak.md.)*
- [x] Add temporary-repository, approval, delivery, usage-grouping and runtime-soak tests. *(The bounded Phase 6 gate is mapped in runtime-soak.md. Long-running and failure-injection soak work remains in Phase 9.)*

### Deliverables

- [x] Per-member worktrees, minimal work records, simple claims and artifacts.
- [x] Consolidated approval and attention runtime.
- [x] Invoking-chat and external delivery.
- [x] Room-labelled Usage analytics.
- [x] Runtime soak report behind the feature flag. *([runtime-soak.md](./runtime-soak.md))*

### Acceptance criteria

- [x] Two editing members can work in separate worktrees.
- [x] Claims remain clearly advisory.
- [x] Cancellation does not silently delete uncommitted work.
- [x] Approval requests identify the member and authority consequence.
- [x] A Room created from chat returns one final result to that chat.
- [x] External delivery cannot bypass approval.
- [x] Usage groups member sessions under their Room instead of unexplained ordinary sessions.
- [x] Usage aggregation still works when no Orchestrator metadata lookup is available.
- [x] No direct Usage-to-Orchestrator store dependency exists.
- [x] No Room code bypasses the unified Git service.
- [x] Runtime soak has no dependency on the final Room UI.
- [x] pnpm typecheck and relevant runtime tests pass.

## 11. Phase 7: First-party Room UI

> **Status:** complete. Reviewed in three routed rounds; the findings and their
> fixes are recorded on PR #373.


Objective: Implement and approve the Room experience inside sero-orchestrator-plugin on top of the proven runtime.

### Work checklist

- [x] Add Workflows and Rooms navigation without changing Workflow behaviour.
- [x] Implement Rooms home and the approved simple creation flow.
- [x] Implement compact computed proposal, natural-language adjustment and advanced settings.
- [x] Implement live roster, activity, work, claims, artifacts and Room revisions.
- [x] Implement the Watch view showing every member's current activity live.
- [x] Implement the member session view with a live turn, follow toggle, turn strip and collapsed early history.
- [x] Implement member mandate, context, worktree and cost inspection.
- [x] Implement direct message, queued broadcast, explicit wake, pause, resume, cancel and intervention.
- [x] Implement consolidated approvals, deadlock, failure and recovery states.
- [x] Implement completion and invoking-chat delivery state.
- [x] Extend the Agent Board store to watch the Room index alongside the Workflow loop index.
- [x] Link Room members to the global Agent Board and back to the Room.
- [x] Link grouped Usage Room entries to the Room where supported.
- [x] Add keyboard, screen-reader, contrast and reduced-motion support.
- [x] Add component and critical-flow end-to-end tests.
- [x] Complete final design review against the approved prototype.

### Deliverables

- [x] Workflows and Rooms navigation.
- [x] Simple create, preparation and computed proposal flow.
- [x] Natural-language adjustment and advanced configuration.
- [x] Live Room timeline and Watch views.
- [x] Live member session viewer with full history navigation.
- [x] Approvals, recovery and completion UI.
- [x] Agent Board and Usage linking.
- [x] Accessible component and end-to-end tests.

### Acceptance criteria

- [x] A non-technical user can create and start a Room from one brief.
- [x] The default proposal shows only computed team, time, spend, access and approved prose.
- [x] Advanced users can inspect every blueprint field.
- [x] The UI never becomes the source of truth for Room execution.
- [x] Reload and restart restore the same visible Room state.
- [x] Every member and Room state has a clear explanation and next action.
- [x] Approval requests identify the responsible member and authority change.
- [x] A user can see what every member is doing right now without opening each one.
- [x] A user can read any member's complete history, including before a compaction and after it retires.
- [x] Room members are inspectable without appearing as normal chats.
- [x] Agent Board and Usage links do not duplicate Room controls.
- [x] Result-to-chat passes end-to-end tests.
- [x] Final design review, pnpm typecheck and critical UI tests pass.

At the end of Phase 7, Room mode is usable behind a feature flag. The old collaboration engines remain available.

## 12. Phase 8: Prove Room mode and remove legacy engines

> **Status:** the gate harness is built (`docs/features/agent-rooms/evaluation.md`,
> `apps/desktop/e2e/agent-rooms.agent.spec.ts`). The evaluation runs spend real
> money and are the user's to approve. Entry-point routing and engine removal
> wait on the gate, as this plan requires.
>
> The live attempts have paid for themselves. Each found defects no unit test
> could reach, because the plugin's test host answers every request and the real
> one does not. All are fixed:
>
> - the host matched bare model ids against `provider/id` keys, so it dropped
>   every model a Room asked for and no member session could open;
> - a drafted Room opened on the live Room view, so a Room a chat prepared could
>   not be approved in the panel;
> - nobody answered the host's grant question, and a silent timeout was reported
>   as a refusal with no reason;
> - `prompt()` returned a turn id Pi never uses, so every member waited for a
>   turn boundary that could not arrive;
> - the planner never gave a member the `sero-cli` tool, so no Room command was
>   possible;
> - a member session was handed a resource loader that nobody loaded, so it held
>   no extensions, no Room commands and no bridge — and it went looking for
>   another way to talk, ending up driving the desktop through `sero app`.
>
> A member now runs on its own command surface: the Room-owning plugin's
> commands and nothing else. A run can be held on one model and one effort level
> (`SERO_ROOM_MODELS`, `SERO_ROOM_THINKING`).
>
> A second round of live runs found the defects a Room only shows when real
> models drive it. All are fixed:
>
> - the protocol prompt listed command names without their arguments, so a
>   member invented a syntax and was refused every time;
> - a member that stopped to wait had its own reason overwritten with "Finished
>   its turn.", hiding what it waited for;
> - only work-board changes counted as progress, so a Room that claimed paths
>   and worked stopped for "nothing has progressed";
> - a member waiting for an answer from an idle member was in no cycle, so
>   nothing woke either of them — the Room now chases the answer once and then
>   frees the asker;
> - a member that asked for the user had no answer box, and its notification was
>   too long to read and did nothing when clicked.
>
> **Entry-point decision (user, 14 Aug 2026):** the two chat buttons that ran the
> fixed collaboration and debate sequences are REMOVED rather than re-routed.
> Those sequences run from the Agent Rooms UI, so there is no hard-coded pipeline
> left to point anywhere.
>
> **GATE PASSED — 14 Aug 2026, all four scenarios on one build:**
>
> | scenario | result | time | spend | roster |
> |---|---|---|---|---|
> | 1 delivery | completed | 3.4 min | $0.08 / $5 | Conductor+Reviewer (haiku, low), Implementer (gpt-5.4-mini, medium) |
> | 2 adversarial | completed | 14.1 min | $1.01 / $5 | Decision synthesiser (sonnet-5, high), Design advocate (sonnet-4.6, medium), Security critic (sonnet-5, high) |
> | 3 parallel | completed | 4.8 min | $0.15 / $5 | Integration Conductor + two implementers (gpt-5.4-mini) |
> | 4 chat-origin | completed | 2.6 min | $0.12 / $5 | Conductor+verifier, documentation implementer (haiku) |
>
> No Room stopped, none needed an intervention, every run finished far inside its
> envelope, and scenario 4 delivered to `session:<id>` — the chat that asked.
> Presets stayed adaptive: scenarios 1 and 2 produced different roles, models and
> effort levels for different problems.


Objective: Prove generated Rooms, switch entry points and remove the fixed engines.

### Work checklist

- [x] Evaluate issue delivery with generated problem-specific rosters. *(3.4 min, $0.08)*
- [x] Evaluate adversarial analysis. *(14.1 min, $1.01, both sides staffed)*
- [x] Evaluate parallel issues with worktrees and path claims. *(4.8 min, $0.15, a checkout each)*
- [x] Evaluate chat-origin result delivery. *(2.6 min, $0.12, delivered to `session:<id>`)*
- [x] Measure success, duration, cost, failures and user intervention. *(`e2e/screenshots/agent-rooms/evaluation.json`; no interventions in any run)*
- [x] Fix Room defects that block normal use.
- [x] Confirm that built-in presets remain adaptive. *(scenarios 1 and 2 staffed different roles, models and effort levels)*
- [x] Route collaboration and adversarial entry points to Room creation after approval. *(decided: the buttons are removed, not re-routed — Rooms are started from the Agent Rooms UI)*
- [x] Add release and migration notes. *([release-and-migration-notes.md](./release-and-migration-notes.md))*
- [x] Remove CollaborationEngine and DebateEngine.
- [x] Remove orphaned legacy IPC, stores, UI, templates, tests and documentation. *(~4,200 lines: main-process feature, IPC, preload, renderer stores, components and tests)*
- [x] Verify that no Room record or production entry point depends on a legacy engine. *(repo typecheck green; the only `collaboration` string left is the published theme colour group)*

### Deliverables

- [x] Evaluation report for the three primary scenarios. *(four, in the table above)*
- [x] Approved entry-point switch. *(removed, per the decision above)*
- [x] Release and migration notes.
- [x] Removal of both legacy engines and orphaned code.

### Acceptance criteria

- [x] Generated Rooms complete the agreed primary scenarios.
- [x] Collaboration behaviour comes from the problem and optional preset, not a fixed sequence.
- [x] Chat invocation still receives one final result.
- [x] No dual-runtime parity framework remains.
- [x] No production code constructs CollaborationEngine or DebateEngine.
- [x] No orphaned legacy state remains.
- [x] pnpm typecheck and the full relevant test suite pass.

## 13. Phase 9: Hardening and production rollout

Objective: Make Room mode safe and reliable for general use.

### Work checklist

- [ ] Add long-running soak tests with repeated wait, wake, dispose, reopen and compaction.
- [ ] Add mixed-model, mixed-provider, throttle and network-failure tests.
- [ ] Add storage failure, crash recovery and low-disk tests.
- [x] Make a store transaction crash-atomic ACROSS files. Each file write is
      atomic on its own, but one transaction writes several (member files, the
      revision list, room.json, the index) and a crash can land some of them.
      room.json is written last and carries the applied-command key, so an
      interrupted transaction is retried rather than half-claimed — but the
      record a reload builds from a partial set can still mix old and new.
      Implemented with a compact redo journal that records the changed file
      operations and replays them before state loads after a restart.
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

## 14. Deferred prompt-cache keep-warm track

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

## 15. Cross-phase engineering rules

- [ ] Keep Workflow and Room domain records separate.
- [ ] Share only behaviour with the same contract.
- [ ] Keep every source file under the repository 500-line limit.
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

## 16. Suggested pull request boundaries

Suggested review boundaries are:

1. Architecture decisions and static prototype.
2. Gated opaque-scope persistent-session capability, shared foundations and Room storage.
3. Room Planner and adaptive templates.
4. Persistent Pi member runtime, scheduler and context.
5. Messaging, waiting and Room revisions.
6. Workspace safety, approvals, delivery and Usage grouping.
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

## 17. First-release definition of done

- [ ] Workflows and Rooms are clear modes inside Sero Orchestrator.
- [ ] A user can create a Room from one plain-language problem.
- [ ] Sero generates a problem-specific Conductor and team.
- [ ] The default proposal computes team, time, spend and access from the validated blueprint.
- [ ] Natural-language adjustment and advanced configuration both work.
- [ ] appRuntime.persistentSessions is host-gated and enforces approved grants.
- [ ] Every member uses a standard persistent Pi session with the filtered resource policy.
- [ ] Members dispose, reopen, compact and recover without transcript duplication.
- [ ] A user can watch every member live and read any member's complete history.
- [ ] The Conductor revises the Room only inside the approved envelope.
- [ ] Authority expansion requires user approval.
- [ ] Members communicate, wait and wake without holding idle capacity.
- [ ] Reply wake is event-driven and meets the latency target when capacity permits.
- [ ] Deadlock detection can pause for the user.
- [ ] Worktrees and simple claims support parallel work.
- [ ] Limits and no-progress rules stop runaway work.
- [ ] One approval inbox covers all members.
- [ ] A Room result returns to the invoking chat.
- [ ] Usage analytics groups costs by Room and member.
- [ ] Agent Board links do not duplicate Room controls.
- [ ] CollaborationEngine and DebateEngine are removed after proof.
- [ ] Security, accessibility, recovery and cost gates pass.
- [ ] User and operator documentation is complete.

Active prompt-cache keep-warm is not required for this definition of done.
