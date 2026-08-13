# Agent Rooms feature specification

Status: Draft for Phase 1 validation  
Branch: feat/agent-rooms  
Owners: Sero maintainers  
Last updated: 2026-08-13

## 1. Summary

Agent Rooms let a user create a durable group of agents that work on one goal. Each Room has one Conductor and any number of member agents. Each member has a separate LLM session and can have a separate model, prompt, tool set, skill set, permission set, and workspace.

The Conductor controls the work inside the limits that the user sets. The Room instructions define how the agents must work. Sero does not hard-code one discussion or delivery method.

Agent Rooms replace CollaborationEngine and DebateEngine. Their current behaviours become editable Room templates after Agent Rooms reaches feature parity.

## 2. Product decision

The initial specification and implementation plan come before the UX prototype. The static prototype is Phase 1 and is the first delivery gate.

This order gives the prototype clear product limits. Prototype review can still change the UX requirements and the related parts of this specification. Runtime implementation must not start until the Phase 1 prototype is approved.

The prototype is a product artifact, not a second specification. Repository rules require static prototypes in docs/prototypes. The planned path is:

    docs/prototypes/sero-agent-rooms.html

The specification and implementation plan stay in:

    docs/features/agent-rooms/

## 3. Problem

Sero supports single chat sessions and subagent fan-out. It also has fixed collaboration and debate engines. These options do not support a durable group of independent agents that can:

- work for a long time;
- communicate during the work;
- wait without using an active execution slot;
- resume the same LLM session later;
- use different models, prompts, tools, skills, and permissions;
- coordinate shared code changes;
- operate under one budget and safety policy; and
- adapt their method from instructions that the user supplies.

The fixed engines also mix orchestration policy with runtime behaviour. This makes new collaboration patterns expensive to add.

## 4. Goals

Agent Rooms must:

- let a user add any supported number of agents to one Room;
- give every member an independent, persistent LLM session;
- let every member have its own model route, thinking level, prompt, tools, skills, permissions, and workspace;
- give one Conductor responsibility for Room choreography;
- let members send durable directed and broadcast messages;
- let an agent wait and resume without losing its session;
- keep local agent presence separate from remote prompt-cache retention;
- support provider-neutral prompt-cache leases where they are useful;
- apply limits for time, cost, tokens, turns, messages, concurrency, retries, and failures;
- support safe parallel repository work;
- persist enough state to recover after an application restart;
- expose live state, decisions, costs, claims, and artifacts to the user;
- support user pause, resume, interrupt, and message actions; and
- replace CollaborationEngine and DebateEngine with Room templates.

## 5. Non-goals

The first production release does not:

- provide a general distributed compute system across unrelated Sero hosts;
- make advisory file claims a substitute for Git worktrees or merge conflict handling;
- allow peer messages to grant permissions or approve protected actions;
- require an upstream Pi change or a private Pi fork;
- guarantee that every provider supports remote prompt-cache refresh;
- keep a cache warm when the expected saving is lower than the refresh cost;
- let members create unbounded nested subagents;
- hard-code consensus, debate, review, or issue-delivery workflows in the runtime; or
- automatically publish a pull request without the permissions that normal Sero work requires.

## 6. Principles

### 6.1 Instructions define the method

The Room goal, operating instructions, success criteria, and member prompts define how the group works. Templates provide editable starting values only.

The runtime enforces protocol and safety. It does not decide whether agents must seek consensus, compete, review each other, or divide work by issue.

### 6.2 The Conductor is an agent with added authority

The Conductor has a normal persistent member session. It also has Room management tools and reserved scheduler capacity.

The Conductor can assign work, request revisions, resolve scheduling conflicts, select final artifacts, and finish the Room. It cannot exceed user permissions or Room limits.

### 6.3 Durable state is the source of truth

Chat transcripts alone are not enough. Sero stores Room events, messages, work items, resource claims, artifacts, budget use, and member cursors.

The Room event log is append-only. Read models can be rebuilt from it.

### 6.4 Waiting is not working

An agent that waits for another member ends its current LLM turn and releases its execution slot. A matching message or an explicit wake action starts a new turn in the same persistent session.

### 6.5 Cache health and process health are different

A local heartbeat reports that an agent runtime is alive. It does not keep a provider prompt cache warm.

A prompt-cache lease can send a small provider request before a known cache expires. The request must use the same effective model route and stable prompt prefix. Sero tracks its cost and verifies whether the provider read or rewrote the cache.

### 6.6 Coordination does not weaken authority

Room messages are untrusted peer input. They do not become system instructions. They cannot grant tool access, change model configuration, approve a protected operation, or expand a member workspace.

## 7. Primary use cases

### 7.1 Issue delivery

A Room receives a complex GitHub issue. A Conductor, planner, implementers, and reviewer create a plan, edit in separate worktrees, review changes, run checks, and prepare a final pull request. The Room instructions ask for consensus and constructive review.

### 7.2 Adversarial council

Several members independently solve or challenge a problem. They compare evidence and attack weak assumptions. The Conductor acts as judge and selects or synthesises the final answer.

### 7.3 Parallel issues

Members handle separate issues in parallel. They publish file and path claims, communicate dependencies, and use separate worktrees. The Conductor controls integration and resolves overlap.

## 8. Concept model

### 8.1 RoomDefinition

A RoomDefinition contains:

- Room ID, name, description, and creation time;
- goal, instructions, success criteria, and optional template source;
- workspace and repository configuration;
- one Conductor member ID;
- zero or more additional RoomMember definitions;
- execution, budget, messaging, cache, and retention policies;
- initial artifacts or linked external items; and
- user permissions and approval policy.

A Room can be saved as a reusable template after secrets and run-specific values are removed.

### 8.2 RoomMember

A RoomMember contains:

- member ID, display name, and role;
- persistent Sero session ID;
- provider, model, API, gateway, and account route;
- thinking level and custom prompt;
- enabled and disabled tools;
- enabled and disabled skills;
- permissions and approval policy;
- working directory or worktree;
- resource claims;
- status, current work item, and last activity;
- message inbox cursor;
- token, cost, turn, retry, and failure totals; and
- local heartbeat and prompt-cache lease state.

The model route is the complete effective route. Provider and model name alone are not enough because an API, gateway, account, or configuration can change cache behaviour.

### 8.3 RoomEvent

RoomEvent is the durable audit record. Each event has:

- event ID and Room ID;
- monotonic Room sequence;
- type, time, and actor;
- correlation and causation IDs;
- structured payload;
- visibility scope; and
- optional cost, token, session, work item, and artifact references.

Examples include member_started, message_sent, work_claimed, resource_claimed, turn_completed, cache_refresh_requested, cache_hit, cache_miss, budget_warning, room_paused, artifact_published, and room_finished.

### 8.4 RoomMessage

RoomMessage supports:

- directed message;
- broadcast;
- question;
- reply;
- cancellation;
- acknowledgement; and
- system notice.

Each message has an ID, sender, recipients, type, body, correlation ID, delivery state, and creation time. A reply references the question that it answers.

Messages are durable before delivery. Sero deduplicates delivery by message ID.

### 8.5 WorkItem

A WorkItem contains a title, description, owner, status, dependencies, expected outputs, and related resource claims. Members can create and claim work if policy permits it. The Conductor can change ownership and priority.

Work item states are proposed, ready, active, blocked, review, completed, failed, and cancelled.

### 8.6 ResourceClaim

A ResourceClaim is an advisory lease on a repository path or logical resource. It contains the member, scope, reason, creation time, expiry time, and renewal state.

A claim warns or blocks another Room member according to policy. It does not change file-system permissions. Separate worktrees remain the default safety boundary for editing agents.

### 8.7 RoomArtifact

A RoomArtifact is a durable output such as a plan, decision, patch, branch, commit, test result, review, pull request, report, or final answer. It includes its producer, type, location, metadata, and related work item.

## 9. Architecture

Agent Rooms use a host-owned runtime and a first-party Rooms UI.

~~~mermaid
flowchart TD
    UI[Rooms UI] --> API[Room host API]
    API --> CORE[Room runtime]
    CORE --> STORE[Event store]
    CORE --> EXEC[Session scheduler]
    CORE --> BUS[Message bus]
    CORE --> CACHE[Cache lease manager]
    EXEC --> PI[Pi session runtime]
    EXEC --> WORK[Workspace manager]
~~~

The desktop host owns:

- Room creation and lifecycle;
- durable storage and recovery;
- member session creation and resume;
- scheduling and concurrency;
- the message bus;
- Room tools and authority checks;
- budgets and stop conditions;
- worktree and resource-claim coordination;
- cache leases and telemetry; and
- renderer-safe IPC or capability contracts.

Shared types live in @sero-ai/common. The first-party UI uses the host contract and does not own execution state.

The first implementation can expose the UI as a bundled first-party plugin if the plugin framework supports the required live host capability. The host runtime remains the authority in all cases. Phase 1 must confirm the final UI container before implementation.

## 10. Room lifecycle

Room states are:

- draft;
- ready;
- running;
- pausing;
- paused;
- completing;
- completed;
- failed; and
- cancelled.

Member states are:

- starting;
- idle;
- working;
- waiting;
- blocked;
- suspended;
- completed;
- failed; and
- offline.

A Room starts only after validation confirms that:

- it has one Conductor;
- all model routes are available;
- member configuration is valid;
- required tools and skills exist;
- workspace rules are valid;
- permissions do not exceed user authority; and
- budget limits are complete.

Pause stops new turns and cache refreshes. Active tools reach a safe interrupt point. Resume restores member sessions, inbox cursors, work state, claims, and scheduler state.

After an application restart, Sero rebuilds the Room state from durable records. It marks uncertain external tool activity for review. It does not silently repeat a non-idempotent tool call.

## 11. Scheduling and execution

Each member has a separate LLM session. The session keeps its own transcript, system prompt, tool configuration, skill configuration, and model route.

The Room scheduler enforces:

- a maximum number of active turns for the Room;
- an optional maximum for each provider route;
- reserved capacity for the Conductor;
- fair selection among ready members;
- wake priority for awaited replies and user interventions;
- budget and stop checks before each turn; and
- cancellation propagation.

A member can be idle without occupying a scheduler slot. A waiting member also releases its slot.

The normal wait flow is:

1. A member sends a question.
2. The member calls room.wait with the question or correlation ID.
3. The current turn ends.
4. The scheduler marks the member as waiting.
5. A reply arrives in the durable inbox.
6. The scheduler wakes the member.
7. Sero starts a new turn in the same session with the reply context.

Sero must prevent a deadlock where all capacity is held by members that wait for work from the Conductor. The Conductor reserve and slot release rule provide the minimum protection. A wait-cycle detector can also notify the Conductor.

Nested subagents are disabled by default. If enabled, their use counts against the parent member and Room budgets.

## 12. Communication protocol

The host mediates all Room communication. Members do not share a raw file mailbox.

Minimum member tools are:

- room.roster;
- room.send;
- room.broadcast;
- room.ask;
- room.reply;
- room.wait;
- room.create_work;
- room.claim_work;
- room.complete_work;
- room.claim_resources;
- room.release_resources;
- room.publish_artifact;
- room.report_status; and
- room.request_attention.

Conductor-only or policy-controlled tools are:

- room.assign_work;
- room.reassign_work;
- room.wake_member;
- room.suspend_member;
- room.update_limits;
- room.request_user_input;
- room.pause;
- room.fail; and
- room.finish.

Delivery rules are:

- Persist before delivery.
- Acknowledge receipt separately from processing.
- Deliver immediately to an idle member when policy permits.
- Add the message as steering context for a busy member only when policy permits.
- Otherwise queue the message for the next turn.
- Apply per-sender and per-Room rate limits.
- Apply inbox and broadcast size limits.
- Reject invalid recipients and expired Room IDs.
- Preserve sender identity and message type.
- Never treat message content as higher authority than the recipient prompt.

## 13. Workspace and source control

Room workspace modes are:

1. Read-only shared workspace.
2. One worktree for each editing member.
3. Shared working tree with advisory claims.

The default for code delivery is one worktree for each editing member. The Conductor owns integration or assigns it explicitly.

Resource claims:

- can cover files, directories, generated outputs, migrations, ports, or logical resources;
- have an expiry and renewal policy;
- are visible to all members;
- detect overlapping scopes;
- can warn or block according to Room policy; and
- are released on completion, cancellation, or lease expiry.

The Conductor collects commits or patches, resolves merge conflicts, runs integration checks, and publishes the final branch or pull request artifact.

## 14. Prompt-cache leases

### 14.1 Purpose

Some providers expire prompt caches after a short idle period. An idle, high-context member can then pay to process its full stable history when it wakes. A small remote refresh request can be cheaper than a later cache miss.

Anthropic is the worst-case validation target, not the architecture boundary. The design must also support providers with longer retention, no controllable cache, gateway-specific behaviour, or session-affinity rules.

### 14.2 Pi boundary

The current Pi model information exposes cache-retention categories and cache read and write usage, but it does not provide an exact cache expiry for every effective model route.

Sero will not depend on an upstream Pi change. It will not patch, fork, or monkey-patch Pi for this feature.

Sero uses a narrow internal adapter:

~~~ts
interface PromptCacheAdapter {
  resolveProfile(modelRoute: ModelRoute): PromptCacheProfile | null;
  refresh(snapshot: CacheSnapshot): Promise<CacheRefreshResult>;
}
~~~

The first release uses the public Pi model and session runtime to make an isolated minimal-output request. The request must use the same effective session identity, model route, stable prompt prefix, tools, messages, and thinking configuration. Sero discards the output and does not add the refresh to the member transcript.

A provider-native zero-output request can be a later adapter optimisation.

### 14.3 Policy

PromptCachePolicy modes are:

- off;
- provider-default;
- long-retention;
- keep-warm; and
- auto.

Policy can be set at the application default, model-route profile, Room, and member levels. The most specific permitted value wins.

A model-route profile can define:

- support type: none, automatic, explicit, or session-affinity;
- expected time to live;
- available retention options;
- cache write multiplier;
- minimum cacheable token count;
- refresh strategy;
- stable session identity requirements;
- safety margin; and
- verification rules.

The scheduler measures time from the start of the last real provider request. It schedules a refresh before the expected expiry and cancels it when a real member request starts.

### 14.4 Cost and verification

Every refresh counts against Room token and cost limits.

Sero records cache-read and cache-write usage when the provider reports it. A cache read confirms a useful refresh. An unexpected cache write indicates a miss, route mismatch, or expired lease. Sero must not repeat failed refreshes without a backoff and policy decision.

Auto mode compares expected refresh cost with expected future cache-miss cost. It can stop warming when:

- the Room is paused or finished;
- the member is complete or suspended;
- the maximum idle warm time is reached;
- the cache lease budget is reached;
- the stable prefix is below the provider threshold;
- recent refreshes miss;
- route identity cannot be preserved; or
- the probability of another useful turn is too low.

The UI shows the local heartbeat and remote cache lease as separate states. It also shows refresh cost, last verified hit or miss, and the next planned refresh.

## 15. Limits and guardrails

A Room can set hard and warning limits for:

- wall-clock duration;
- total and per-member cost;
- total and per-member input and output tokens;
- member turns;
- concurrent active turns;
- provider-route concurrency;
- messages and queued inbox size;
- tool calls and tool stall time;
- retries and consecutive failures;
- Conductor revision rounds;
- nested subagent use;
- cache refresh cost and duration; and
- idle duration.

A hard limit pauses or fails the Room according to policy. A warning creates an event and tells the Conductor.

The no-progress detector uses structural progress. Examples are completed work, a published artifact, a commit, a test result, a resolved decision, or a changed blocking condition. Message volume alone is not progress.

When no progress continues, Sero first notifies the Conductor. It then pauses the Room and requests user attention if the configured threshold is reached.

## 16. Permissions and security

- A Room cannot grant authority that the user or workspace does not have.
- Every member receives the minimum configured tool and skill set.
- Conductor authority is limited to Room management.
- Peer messages are data, not system instructions.
- Sensitive values do not appear in Room messages or durable event payloads.
- External writes use the existing Sero approval path.
- Tools validate Room ID, member ID, actor authority, and current Room state.
- Audit events identify the member and effective permission decision.
- Restored Rooms do not repeat uncertain non-idempotent actions without review.
- Retention and deletion apply to transcripts, events, artifacts, and cache metadata.

## 17. User experience requirements

The static prototype must show these states:

1. Rooms home with empty, active, paused, completed, and failed Rooms.
2. Create Room flow with goal, template, Conductor, arbitrary members, models, thinking, prompts, tools, skills, permissions, workspace, limits, and cache policy.
3. Live Room with roster, member status, assignments, public timeline, work items, resource claims, branches, commits, artifacts, cost, tokens, and cache state.
4. Agent inspector with transcript, current work, tool activity, inbox, questions, worktree, claims, local heartbeat, and prompt-cache lease.
5. Attention states for failure, stall, resource conflict, cache miss, expensive refresh, budget warning, and Conductor request.
6. Completion state with final summary, consensus or dissent, artifacts, commits, checks, pull request, and unresolved items.

The user must be able to:

- create and validate a Room;
- add, remove, and configure members before start;
- save or load a Room template;
- start, pause, resume, and cancel a Room;
- interrupt or message one member;
- send a message to the whole Room;
- inspect a member without changing its transcript;
- view current and historical cost;
- change limits within allowed bounds;
- respond to a Conductor request;
- open Room artifacts; and
- understand why a Room is waiting, blocked, paused, failed, or complete.

## 18. Templates and migration

The first bundled templates are:

- Issue Delivery;
- Adversarial Council; and
- Parallel Issues.

A template contains editable Room instructions, suggested roles, member defaults, workspace policy, limits, and finish criteria. It does not contain a hard-coded state machine.

Migration rules are:

- CollaborationEngine behaviour becomes a collaboration template.
- DebateEngine behaviour becomes an adversarial template.
- Existing entry points can route to preconfigured Rooms during a compatibility period.
- Telemetry compares success, cost, and cancellation between old and new paths.
- The old engines are removed only after their acceptance and migration checks pass.
- New Room records do not depend on old engine storage formats.

## 19. Observability

The Room UI and diagnostic logs must expose:

- state transitions;
- active, idle, waiting, and blocked members;
- scheduler queue and reason;
- message delivery and acknowledgement;
- work and resource claims;
- tool activity and failures;
- cost and tokens by Room, member, model route, and cache refresh;
- local heartbeat age;
- cache lease state and verification;
- budget warnings and stop reasons;
- recovery actions; and
- artifacts and final outcome.

Logs must use stable Room, member, event, message, work, and correlation IDs. Logs must not contain secrets or full sensitive prompts.

## 20. Requirements

| ID | Requirement |
| --- | --- |
| FR-001 | A user can create a Room with one Conductor and any supported number of members. |
| FR-002 | Each member has an independent persistent LLM session and configuration. |
| FR-003 | Room instructions and member prompts define the collaboration method. |
| FR-004 | Members can send durable directed, broadcast, question, reply, cancel, and acknowledgement messages. |
| FR-005 | Waiting ends the current turn and releases the execution slot. |
| FR-006 | A matching reply can wake the same persistent member session. |
| FR-007 | The scheduler enforces Room concurrency and reserves Conductor capacity. |
| FR-008 | The event log, inbox cursors, work, claims, artifacts, budgets, and lifecycle survive restart. |
| FR-009 | The user can pause, resume, cancel, inspect, interrupt, and message the Room. |
| FR-010 | The Conductor can manage work and finish the Room within user limits. |
| FR-011 | Editing members can use separate worktrees and advisory resource claims. |
| FR-012 | Limits cover time, cost, tokens, turns, concurrency, messages, retries, failures, and cache refreshes. |
| FR-013 | Local heartbeats and remote prompt-cache leases are separate mechanisms. |
| FR-014 | Cache behaviour is resolved by full model route and does not depend on exact Pi TTL metadata. |
| FR-015 | Cache refreshes use public Pi runtime boundaries, have no transcript effect, and count against budgets. |
| FR-016 | Cache telemetry verifies reads and detects unexpected writes when usage data is available. |
| FR-017 | The UI shows Room, member, message, work, claim, artifact, budget, and cache state. |
| FR-018 | CollaborationEngine and DebateEngine behaviours are available as editable Room templates. |
| FR-019 | Peer messages cannot grant authority or change protected configuration. |
| FR-020 | The system can recover a running or paused Room without repeating uncertain external actions. |

| ID | Quality requirement |
| --- | --- |
| NFR-001 | A Room event is durable before an action reports success. |
| NFR-002 | Duplicate message delivery does not duplicate its logical effect. |
| NFR-003 | Renderer code cannot access host-only sessions, credentials, or file-system authority directly. |
| NFR-004 | A waiting member uses no active LLM execution slot. |
| NFR-005 | Budgets and cancellation remain effective during restart and recovery. |
| NFR-006 | A provider without cache refresh support can run normally with the cache policy off. |
| NFR-007 | New provider cache behaviour can be added through a Sero adapter or profile without changing Room orchestration. |
| NFR-008 | Room state and decisions are inspectable through events and diagnostics. |
| NFR-009 | The core runtime has no dependency on one bundled Room template. |
| NFR-010 | Automated tests cover lifecycle, scheduling, messaging, recovery, authority, limits, worktree coordination, and cache leases. |

## 21. Failure handling

- A member turn failure increments the member and Room failure counters.
- Retry uses bounded exponential backoff and an idempotency check.
- A member can fail without failing the Room if policy and remaining roles allow recovery.
- A Conductor failure wakes a configured fallback or pauses for the user.
- A message delivery failure keeps the message queued and visible.
- A storage failure stops new side effects and puts the Room in a recoverable error state.
- A worktree failure blocks the affected work item.
- A cache refresh failure disables or delays that lease. It does not fail the member task.
- A budget hard limit stops new turns and refreshes.
- An application exit persists a shutdown checkpoint and resumes through normal recovery.

## 22. Open design checks for Phase 1

Phase 1 must close these checks before runtime implementation:

- Confirm whether the first-party Rooms UI is a bundled plugin surface or a native desktop surface.
- Confirm the create flow and the amount of configuration shown by default.
- Confirm how public Room messages differ visually from private member messages.
- Confirm how the user sees and changes member permissions.
- Confirm how cost, cache savings, and cache uncertainty are explained.
- Confirm the pause, cancel, and failure recovery flows.
- Confirm the default worktree and resource-claim experience.
- Confirm the completion and pull request handoff.

These are UX and integration choices. They do not reopen the core decisions about durable sessions, one Conductor, host authority, provider-neutral cache leases, or replacement of the two old engines.
