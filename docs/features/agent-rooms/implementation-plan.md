# Agent Rooms implementation plan

Status: Ready for Phase 1  
Branch: feat/agent-rooms  
Specification: [spec.md](./spec.md)  
Last updated: 2026-08-13

## 1. Delivery rule

Deliver Agent Rooms in gated phases. Do not mark a phase complete until all of its deliverables and acceptance criteria are checked.

Phase 1 is the UX decision gate. Runtime implementation starts only after the prototype is approved and its decisions are added to the specification.

The prototype will live at docs/prototypes/sero-agent-rooms.html because the repository requires static prototypes in docs/prototypes. All written feature documents live in docs/features/agent-rooms.

## 2. Milestones

| Milestone | Included phases | Outcome |
| --- | --- | --- |
| Product agreement | 0 to 1 | Approved specification and static UX |
| Runtime foundation | 2 to 4 | Durable multi-agent sessions, scheduling, and communication |
| Delivery safety | 5 to 6 | Worktree coordination, guardrails, and cache leases |
| Usable feature | 7 | Complete first-party Room experience |
| Replacement | 8 | CollaborationEngine and DebateEngine replaced by templates |
| Production release | 9 | Integration, recovery, tests, migration, and rollout complete |

## 3. Phase 0: Product contract

Objective: Record the agreed product and architecture before prototype work.

### Deliverables

- [x] Create feat/agent-rooms from main.
- [x] Add docs/features/agent-rooms/spec.md.
- [x] Add docs/features/agent-rooms/implementation-plan.md.
- [x] State that Agent Rooms replace CollaborationEngine and DebateEngine.
- [x] Separate local runtime heartbeats from remote prompt-cache leases.
- [x] Make cache behaviour provider-neutral and route-specific.
- [x] Record that Sero will not depend on an upstream Pi change.
- [x] Make the UX prototype the next delivery gate.

### Acceptance criteria

- [x] The specification covers the Conductor, independent sessions, member configuration, communication, scheduling, persistence, workspaces, limits, security, cache leases, UX, templates, and migration.
- [x] The implementation plan has phase checklists and acceptance criteria.
- [x] The prototype sequence is clear: specification first, prototype in Phase 1, runtime code after approval.

## 4. Phase 1: Static UX prototype and decision gate

Objective: Agree the complete user workflow before runtime code fixes the wrong interaction model.

### Work checklist

- [ ] Review docs/prototypes/sero-design-library-plugin.html and current Sero product surfaces.
- [ ] Create docs/prototypes/sero-agent-rooms.html as a standalone static prototype.
- [ ] Use the Sero design tokens and established component patterns.
- [ ] Show a Rooms home with empty, active, paused, completed, and failed states.
- [ ] Show Room creation from blank values and from a template.
- [ ] Show arbitrary member addition and removal.
- [ ] Show separate Conductor and member configuration.
- [ ] Show model route, thinking, prompt, tools, skills, permissions, and workspace settings.
- [ ] Show Room limits and prompt-cache policy with useful defaults.
- [ ] Show the live roster, public timeline, work board, claims, artifacts, cost, tokens, and cache state.
- [ ] Show a member inspector with transcript, inbox, tool work, worktree, local heartbeat, and cache lease.
- [ ] Show pause, resume, cancel, interrupt, direct message, and broadcast actions.
- [ ] Show blocked, failed, resource-conflict, budget, and cache-miss attention states.
- [ ] Show completion, dissent or consensus, checks, commits, artifacts, and pull request handoff.
- [ ] Test the prototype against the three primary use cases.
- [ ] Record prototype feedback and decisions in spec.md.
- [ ] Decide whether the first UI ships as a bundled plugin surface or native desktop surface.
- [ ] Obtain explicit UX approval.

### Deliverables

- [ ] Static multi-state prototype at docs/prototypes/sero-agent-rooms.html.
- [ ] Updated UX and integration decisions in spec.md.
- [ ] A short decision record in this plan or spec.md for the selected UI container.
- [ ] Approved scope for the first usable release.

### Acceptance criteria

- [ ] A reviewer can create, run, inspect, intervene in, and finish a Room from the prototype.
- [ ] The prototype makes Conductor authority and member state clear.
- [ ] The prototype clearly separates local heartbeat from remote cache lease state.
- [ ] Advanced member and cache settings do not obscure the normal create flow.
- [ ] Cost, token, time, and failure limits are visible before Room start.
- [ ] Waiting, blocked, paused, failed, and completed states have clear next actions.
- [ ] Resource claims are shown as advisory coordination, not guaranteed file locks.
- [ ] All prototype feedback that affects behaviour is reflected in spec.md.
- [ ] The product owner approves the prototype before Phase 2 starts.

## 5. Phase 2: Contracts and durable storage

Objective: Add renderer-safe contracts and a persistent Room state model with no LLM execution.

Expected areas:

- packages/common for shared types and validation;
- apps/desktop/electron/features/rooms for host services;
- apps/desktop/electron/ipc/rooms for IPC handlers;
- apps/desktop/electron/preload/rooms for the renderer bridge; and
- the existing Sero persistence layer for Room records.

### Work checklist

- [ ] Define versioned RoomDefinition and RoomMember schemas.
- [ ] Define Room lifecycle and member status enums.
- [ ] Define RoomEvent, RoomMessage, WorkItem, ResourceClaim, RoomArtifact, and budget schemas.
- [ ] Define PromptCachePolicy, ModelRoute, PromptCacheProfile, and cache telemetry schemas.
- [ ] Define IPC request, response, command, and event contracts.
- [ ] Add schema validation at the renderer-to-host boundary.
- [ ] Add an append-only Room event store.
- [ ] Add persisted Room definitions and derived read models.
- [ ] Add monotonic per-Room sequence allocation.
- [ ] Add inbox cursors and message deduplication keys.
- [ ] Add schema versioning and forward migration hooks.
- [ ] Add retention and deletion operations.
- [ ] Add storage tests for concurrent appends, restart, migration, and corruption.
- [ ] Keep the new runtime separate from the current collaboration files.

### Deliverables

- [ ] Shared Room contract package exports.
- [ ] Host Room repository and event store.
- [ ] Typed IPC and preload boundary.
- [ ] Storage migrations.
- [ ] Unit and integration tests for persistence.

### Acceptance criteria

- [ ] A draft Room with one Conductor and several members can be created, read, updated, listed, and deleted.
- [ ] Invalid member, limit, model-route, and authority data is rejected before persistence.
- [ ] Events are durable before a successful command returns.
- [ ] Event order is stable within one Room.
- [ ] Replaying events rebuilds the same Room read model.
- [ ] Duplicate command or message IDs do not duplicate their logical effect.
- [ ] A current Room record survives an application restart.
- [ ] Renderer code has no direct access to host storage or credentials.
- [ ] Phase tests pass with pnpm typecheck and the relevant test commands.

## 6. Phase 3: Persistent sessions, lifecycle, and scheduler

Objective: Run independent persistent member sessions under one Room lifecycle and budget.

### Work checklist

- [ ] Implement RoomRuntime and RoomRuntimeManager.
- [ ] Create one persistent Sero session for each Room member.
- [ ] Preserve each member model route, thinking, prompt, tools, skills, permissions, and workspace.
- [ ] Add start, pause, resume, cancel, complete, and fail transitions.
- [ ] Add member start, idle, working, waiting, blocked, suspended, complete, failed, and offline transitions.
- [ ] Add a fair ready queue.
- [ ] Enforce Room and provider-route concurrency.
- [ ] Reserve configurable execution capacity for the Conductor.
- [ ] Add hard and warning limits for wall time, cost, tokens, turns, retries, and failures.
- [ ] Count nested subagent work against Room limits when the feature is enabled.
- [ ] Add local member presence heartbeats.
- [ ] Add turn checkpoints and safe cancellation.
- [ ] Restore sessions and scheduler state after restart.
- [ ] Detect uncertain non-idempotent tool activity during recovery.
- [ ] Add fake-session and fake-clock scheduler tests.

### Deliverables

- [ ] Host Room lifecycle service.
- [ ] Persistent member session adapter.
- [ ] Budget-aware scheduler.
- [ ] Local heartbeat and member presence service.
- [ ] Recovery coordinator.
- [ ] Deterministic lifecycle and scheduler test suite.

### Acceptance criteria

- [ ] A Room can run at least three differently configured members with separate transcripts.
- [ ] A member resumes the same session after idle time and after application restart.
- [ ] A paused Room starts no new turns and can resume without losing work.
- [ ] Cancellation reaches active work and leaves a durable terminal reason.
- [ ] Concurrency never exceeds the Room or route limit.
- [ ] The Conductor can run when all non-reserved slots are occupied.
- [ ] Cost, token, turn, retry, and failure limits stop or pause work as configured.
- [ ] A local heartbeat does not make a provider request.
- [ ] Recovery does not silently repeat an uncertain external write.
- [ ] Phase tests pass with pnpm typecheck and the relevant test commands.

## 7. Phase 4: Communication, waiting, and Conductor tools

Objective: Add durable agent coordination without hard-coded collaboration behaviour.

### Work checklist

- [ ] Implement the host-mediated Room message bus.
- [ ] Persist messages before delivery.
- [ ] Implement directed, broadcast, question, reply, cancel, acknowledgement, and system messages.
- [ ] Implement per-member inbox cursors and delivery states.
- [ ] Add message deduplication, size limits, backlog limits, and rate limits.
- [ ] Deliver to idle sessions and queue for suspended sessions.
- [ ] Add controlled steering for busy sessions.
- [ ] Implement room.roster, room.send, room.broadcast, room.ask, room.reply, and room.wait.
- [ ] Implement work item, resource claim, artifact, status, and attention tools.
- [ ] Implement Conductor management tools and authority checks.
- [ ] End the current turn when a member waits.
- [ ] Wake a waiting member when a matching reply or approved signal arrives.
- [ ] Add wait-cycle detection and Conductor notification.
- [ ] Mark peer content as untrusted member input.
- [ ] Test message storms, duplicate delivery, cancellation, restart, and late replies.

### Deliverables

- [ ] Durable Room message bus.
- [ ] Member Room tool set.
- [ ] Conductor Room management tool set.
- [ ] Wait and wake scheduler integration.
- [ ] Message protocol and authority tests.

### Acceptance criteria

- [ ] A member can ask another member a question and later resume the same session with the reply.
- [ ] A waiting member uses no active execution slot.
- [ ] Directed messages reach only authorised recipients.
- [ ] Broadcast messages respect backlog and rate limits.
- [ ] Restart does not lose an accepted message.
- [ ] Duplicate delivery does not repeat a work assignment or reply.
- [ ] A peer message cannot grant permission, approve an action, or change protected configuration.
- [ ] The Conductor can assign, reassign, suspend, wake, and finish work within Room policy.
- [ ] No workflow assumes consensus, debate, review, or a fixed role sequence.
- [ ] Phase tests pass with pnpm typecheck and the relevant test commands.

## 8. Phase 5: Workspace coordination and artifacts

Objective: Make parallel repository work safe enough for real issue delivery.

### Work checklist

- [ ] Implement read-only shared, per-member worktree, and shared-tree workspace modes.
- [ ] Make per-member worktrees the default for editing members.
- [ ] Create, recover, and clean up Room worktrees through existing Git services.
- [ ] Implement advisory ResourceClaim creation, renewal, expiry, overlap detection, and release.
- [ ] Add warn and block policies for overlapping claims.
- [ ] Show claims to agents through Room tools.
- [ ] Persist branch, commit, patch, test, review, and pull request artifacts.
- [ ] Add Conductor integration helpers for commit collection and conflict reporting.
- [ ] Prevent automatic cleanup when uncommitted work needs user review.
- [ ] Add safe handling for Room cancellation and application restart.
- [ ] Add integration tests with temporary repositories and overlapping edits.

### Deliverables

- [ ] Room workspace manager.
- [ ] Resource claim service.
- [ ] Artifact registry.
- [ ] Conductor integration helpers.
- [ ] Temporary-repository integration tests.

### Acceptance criteria

- [ ] Two editing members can work in separate worktrees without changing each other's files.
- [ ] Overlapping advisory claims produce the configured warning or block.
- [ ] Claims expire and release without becoming permanent deadlocks.
- [ ] The UI contract can identify a member branch, worktree, commits, claims, and test artifacts.
- [ ] The Conductor can collect independent commits and report a merge conflict.
- [ ] Cancellation does not delete uncommitted user work without an explicit safe decision.
- [ ] Recovery reconnects valid worktrees and marks missing or inconsistent worktrees as blocked.
- [ ] Phase tests pass with pnpm typecheck and the relevant test commands.

## 9. Phase 6: Prompt-cache leases and operational guardrails

Objective: Reduce costly idle cache misses without making one provider part of the Room architecture.

### Work checklist

- [ ] Implement CacheLeaseManager separately from local presence heartbeats.
- [ ] Implement the PromptCacheAdapter boundary.
- [ ] Resolve cache profiles by provider, model, API, gateway, account route, and effective configuration.
- [ ] Seed profiles from Pi public model information where it is available.
- [ ] Add Sero profile overrides when Pi does not expose an exact expiry or route behaviour.
- [ ] Implement off, provider-default, long-retention, keep-warm, and auto policies.
- [ ] Schedule from the start of the last real provider request with a configurable safety margin.
- [ ] Cancel a pending refresh when real member work begins.
- [ ] Use an isolated minimal-output Pi request with the same stable session and prompt prefix.
- [ ] Ensure a refresh does not enter the member transcript or trigger member tools.
- [ ] Attribute refresh input, output, cache read, cache write, and cost to the Room and member.
- [ ] Verify cache reads and detect unexpected cache writes.
- [ ] Add bounded backoff and disable rules after misses or route uncertainty.
- [ ] Stop leases for pause, completion, suspension, idle limit, low expected benefit, or budget limit.
- [ ] Add no-progress detection based on structural progress.
- [ ] Nudge the Conductor, then pause for user attention after the configured threshold.
- [ ] Test Anthropic as the short-retention worst case.
- [ ] Test a long-retention provider and a provider with no refresh support.
- [ ] Test with fake clocks and fake usage reports before any live-provider test.

### Deliverables

- [ ] Provider-neutral prompt-cache adapter and profile registry.
- [ ] Cache lease scheduler.
- [ ] Cost and cache verification telemetry.
- [ ] Auto-policy cost decision logic.
- [ ] Structural no-progress detector.
- [ ] Provider matrix and deterministic test suite.

### Acceptance criteria

- [ ] Local presence heartbeat state and remote cache lease state can change independently.
- [ ] A supported idle member refreshes before its configured route expiry.
- [ ] Real member activity cancels the redundant scheduled refresh.
- [ ] A refresh has no member transcript, tool, work item, or message side effect.
- [ ] Cache refresh cost counts against hard and warning budgets.
- [ ] Reported cache-read usage marks a verified hit.
- [ ] An unexpected cache write marks a miss and causes backoff or lease disablement.
- [ ] A provider with no cache support runs normally with no refresh request.
- [ ] Auto mode can decline a refresh when its expected cost is not justified.
- [ ] The implementation uses public Pi runtime boundaries and has no Pi patch, fork, or upstream dependency.
- [ ] A short-retention Anthropic route passes the lease timing and verification test where credentials permit.
- [ ] Phase tests pass with pnpm typecheck and the relevant test commands.

## 10. Phase 7: First-party Rooms UI

Objective: Implement the approved Room experience on the host contracts.

### Work checklist

- [ ] Implement the approved native or bundled first-party UI container.
- [ ] Implement the Rooms home and persisted list.
- [ ] Implement the create and edit flow.
- [ ] Implement template selection and editable template values.
- [ ] Implement member, Conductor, model, prompt, tool, skill, permission, and workspace configuration.
- [ ] Implement validation before start.
- [ ] Implement the live Room roster and status.
- [ ] Implement the public event timeline.
- [ ] Implement work item, resource claim, branch, commit, test, and artifact views.
- [ ] Implement the member inspector.
- [ ] Implement direct message, broadcast, interrupt, pause, resume, cancel, and limit actions.
- [ ] Implement attention and user-input flows.
- [ ] Implement cost, token, time, retry, failure, and cache views.
- [ ] Label cache status as verified, inferred, unsupported, or unknown.
- [ ] Implement completion and pull request handoff.
- [ ] Add loading, empty, degraded, offline, and recovery states.
- [ ] Add keyboard, focus, screen reader, contrast, and reduced-motion support.
- [ ] Add component tests and critical-flow end-to-end tests.
- [ ] Compare the result with the approved static prototype.

### Deliverables

- [ ] Rooms navigation and home.
- [ ] Room create and configuration flow.
- [ ] Live Room dashboard and member inspector.
- [ ] Intervention, failure, and completion flows.
- [ ] Accessible UI tests and end-to-end tests.

### Acceptance criteria

- [ ] A user can complete the approved prototype flows in the running application.
- [ ] The UI never becomes the source of truth for Room execution.
- [ ] Reload and application restart restore the same visible Room state.
- [ ] The user can identify why each member is active, idle, waiting, blocked, suspended, failed, or complete.
- [ ] The user can see current and historical budget use.
- [ ] The UI distinguishes a local heartbeat from a provider cache lease.
- [ ] The UI does not claim cache savings when telemetry cannot verify them.
- [ ] All interactive controls are keyboard accessible and have clear focus state.
- [ ] Critical create, run, pause, resume, intervene, fail, recover, and finish flows pass end-to-end tests.
- [ ] The implemented UI receives final design review.
- [ ] Phase tests pass with pnpm typecheck and the relevant test commands.

At the end of Phase 7, Agent Rooms is usable behind a feature flag. The old engines still exist until Phase 8 is complete.

## 11. Phase 8: Templates and legacy engine replacement

Objective: Replace fixed collaboration and debate code with editable Room templates.

### Work checklist

- [ ] Add Issue Delivery, Adversarial Council, and Parallel Issues templates.
- [ ] Add compatibility templates for current collaboration and debate behaviour.
- [ ] Map existing collaboration entry points to preconfigured Rooms behind a feature flag.
- [ ] Preserve user-visible output and cancellation behaviour during compatibility testing.
- [ ] Add migration guidance for code and plugin consumers.
- [ ] Run comparison evaluations for result quality, duration, token use, cost, and failures.
- [ ] Add telemetry that identifies old and new execution paths without recording sensitive content.
- [ ] Fix parity gaps that block replacement.
- [ ] Change the default entry points to Agent Rooms.
- [ ] Deprecate CollaborationEngine and DebateEngine.
- [ ] Remove old runtime code, IPC, renderer stores, and unused templates after the compatibility window.
- [ ] Remove or migrate stale tests and documentation.
- [ ] Verify that no new Room record depends on an old engine type.

### Deliverables

- [ ] Three primary Room templates.
- [ ] Collaboration and debate compatibility templates.
- [ ] Entry-point migration and deprecation notes.
- [ ] Parity evaluation report.
- [ ] Removal of CollaborationEngine and DebateEngine after the gate passes.

### Acceptance criteria

- [ ] Each legacy collaboration scenario can run through an editable Room template.
- [ ] Each legacy debate scenario can run through an editable Room template.
- [ ] The runtime contains no hard-coded collaboration role sequence or debate round sequence.
- [ ] Existing users receive a clear migration path.
- [ ] Cancellation, errors, and degraded results remain understandable.
- [ ] Evaluation results meet the agreed quality and cost thresholds.
- [ ] No production entry point constructs CollaborationEngine or DebateEngine.
- [ ] No orphaned legacy IPC or renderer state remains.
- [ ] Phase tests pass with pnpm typecheck and the full relevant test suite.

## 12. Phase 9: Integration, hardening, and production rollout

Objective: Make Agent Rooms reliable, supportable, and safe for general use.

### Work checklist

- [ ] Decide and implement optional Orchestrator Room execution integration.
- [ ] Add import and export for Room definitions and templates.
- [ ] Add retention, archive, and deletion controls.
- [ ] Add Room diagnostics export with secret redaction.
- [ ] Add crash, network-loss, provider-throttle, storage-failure, and low-disk tests.
- [ ] Add long-running soak tests with waiting and wake cycles.
- [ ] Add multi-provider and mixed-model tests.
- [ ] Add permission and prompt-injection security tests.
- [ ] Add budget race and cancellation race tests.
- [ ] Add cache route-change and repeated-miss tests.
- [ ] Add worktree conflict and cleanup recovery tests.
- [ ] Measure scheduler fairness and recovery time.
- [ ] Add user documentation and template authoring guidance.
- [ ] Add operator documentation for cache profiles and provider changes.
- [ ] Add release notes and telemetry dashboards.
- [ ] Roll out behind a feature flag to an internal cohort.
- [ ] Expand the cohort after reliability and cost targets pass.
- [ ] Remove the feature flag after the production acceptance gate.

### Deliverables

- [ ] Optional Orchestrator integration or a recorded deferral decision.
- [ ] Import, export, retention, archive, and diagnostics features.
- [ ] Security, resilience, performance, and soak test reports.
- [ ] User and operator documentation.
- [ ] Rollout and rollback plan.
- [ ] Production telemetry and support runbook.

### Acceptance criteria

- [ ] A Room recovers from application restart and transient provider failure without losing accepted messages or completed work.
- [ ] Hard budgets hold under concurrent completion and cancellation races.
- [ ] Diagnostics explain scheduler, message, workspace, and cache decisions without exposing secrets.
- [ ] Security tests confirm that peer messages cannot escalate authority.
- [ ] Soak tests show no unbounded inbox, event, session, timer, or worktree resource growth.
- [ ] Mixed-provider Rooms can complete when one provider has no prompt-cache support.
- [ ] Cache profile changes can ship without changing Room orchestration code.
- [ ] User documentation covers create, run, intervene, recover, finish, and delete flows.
- [ ] Rollback keeps existing Room records readable or provides a safe export.
- [ ] Production quality, reliability, and cost thresholds are approved.
- [ ] pnpm typecheck and the full test suite pass.
- [ ] The feature flag is removed only after the production gate passes.

## 13. Cross-phase engineering rules

Apply these rules in every implementation phase:

- [ ] Keep source files within the repository size limit.
- [ ] Use ASD-STE100 Simplified Technical English in new documentation and user text where practical.
- [ ] Use strict TypeScript and avoid untyped Room payloads.
- [ ] Validate data at IPC, tool, provider, and persistence boundaries.
- [ ] Keep renderer code free from host credentials and direct file-system authority.
- [ ] Add structured logs with Room and correlation IDs.
- [ ] Redact secrets and sensitive prompt content.
- [ ] Make time-based logic testable with an injected clock.
- [ ] Make provider calls testable with adapters and fake usage reports.
- [ ] Do not treat message activity alone as progress.
- [ ] Do not patch or fork Pi for Agent Rooms.
- [ ] Use conventional commit messages.
- [ ] Run pnpm typecheck before each implementation commit.
- [ ] Run the smallest relevant tests during development and the full relevant suite at each phase gate.
- [ ] Update spec.md when a reviewed implementation decision changes behaviour.

## 14. Suggested pull request boundaries

Keep each change reviewable. A phase can use more than one pull request.

1. Product specification and plan.
2. Static UX prototype and approved spec update.
3. Shared contracts and storage.
4. Runtime lifecycle and scheduler.
5. Message bus and Room tools.
6. Workspaces, claims, and artifacts.
7. Cache leases and guardrails.
8. First-party UI.
9. Templates and old engine migration.
10. Hardening, documentation, and rollout.

Each pull request must state:

- the phase and checklist items that it completes;
- the requirements that it implements;
- the tests that were run;
- migration or storage effects;
- cost or provider effects;
- known limitations; and
- rollback behaviour.

## 15. Release definition of done

Agent Rooms is complete when:

- [ ] A user can configure one Conductor and any supported number of independent agents.
- [ ] Agents can coordinate through durable Room messages and shared work state.
- [ ] Waiting agents release execution capacity and later resume the same sessions.
- [ ] Rooms survive restart and do not repeat uncertain external writes.
- [ ] Worktrees and claims support safe parallel code delivery.
- [ ] Budgets, failures, no-progress rules, and user controls stop runaway work.
- [ ] Prompt-cache leases are provider-neutral, route-specific, measurable, and optional.
- [ ] The first-party UI covers creation through completion and recovery.
- [ ] CollaborationEngine and DebateEngine are replaced by editable templates.
- [ ] The three primary use cases pass end-to-end evaluation.
- [ ] Security, accessibility, resilience, migration, and cost gates pass.
- [ ] User and operator documentation is complete.
