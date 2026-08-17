# Agent Rooms feature specification

Status: Ready for Phase 1  
Branch: feat/agent-rooms  
Product owner: Sero maintainers  
Parent product: Sero Orchestrator plugin  
Last updated: 2026-08-13

## 1. Summary

Agent Rooms are a new mode in sero-orchestrator-plugin.

Sero Orchestrator has two product modes:

- Workflow mode is the current Orchestrator function. An LLM creates a step graph and Orchestrator runs it.
- Room mode creates a persistent team of agents. One Conductor coordinates the Room and can change the team while it works.

The user normally creates a Room by describing the problem and desired result. A Room Planner generates the Conductor, participants, roles, responsibilities, models, prompts, tools, skills, workspace policy and limits. The user sees a small plain-English summary by default. The complete blueprint remains available under advanced settings.

Each Room member uses Pi's standard persistent SessionManager. Room sessions do not use SessionManager.inMemory. Sero does not create a second transcript or session persistence system.

Agent Rooms will replace CollaborationEngine and DebateEngine after Room mode is proven. The old engines remain unchanged during initial development.

## 2. Agreed product decisions

### 2.1 Rooms belong to Sero Orchestrator

Room mode is part of sero-orchestrator-plugin. It is not a separate application, plugin or host-owned orchestration runtime.

Workflow mode and Room mode share management infrastructure where it is correct to do so. They keep separate domain records and types where their behaviour is different.

Reuse must not weaken either mode or force a Room into a step graph.

### 2.2 Workflow and Room are separate modes

| Concern | Workflow mode | Room mode |
| --- | --- | --- |
| Primary structure | LLM-authored step graph | LLM-authored team blueprint |
| Agent lifetime | Usually one execution for each step | Persistent member sessions |
| Coordination | Dependencies, branches and feedback | Messages and Conductor decisions |
| Runtime change | Plan revision | Room and roster revision |
| Best use | Repeatable workflows and automation | Adaptive collaborative work |
| Completion | Planned completion signal | Conductor finalisation against success criteria |

The current internal Loop naming can remain until a separate migration has value. The user-facing terms are Workflow and Room.

### 2.3 Room creation is problem-first

The normal entry point is a plain-language problem description. Static templates are optional seeds, not the only definition of Room behaviour.

A Room Planner creates a problem-specific team. A participant does not need a predefined named agent or a static agent file.

### 2.4 The Conductor can revise the Room

The Conductor can add, update, suspend, retire and replace members within a user-approved operating envelope.

The Conductor cannot increase permissions, cost limits, team-size limits, workspace authority or external delivery authority. It can request those changes from the user.

### 2.5 Pi owns member session persistence

Room members use the standard Pi SessionManager create and open APIs and the normal Pi JSONL session format.

Sero stores only the Room-to-session reference and Room-specific state. It does not copy, rebuild or replay member transcripts.

### 2.6 The default UX is simple

The generated blueprint can be detailed. The default confirmation shows only:

- team size;
- short plain-English roles;
- maximum working time;
- maximum spend;
- broad access summary; and
- Start Room and Adjust actions.

Prompts, models, tools, skills, worktrees, detailed limits and cache information are advanced settings.

### 2.7 The UX prototype is the first gate

This specification and the implementation plan come before implementation. Phase 1 creates and approves the static prototype.

The prototype path is:

    docs/prototypes/sero-agent-rooms.html

Runtime implementation must not start until Phase 1 is approved and the resulting decisions are recorded.

### 2.8 The consent summary is a deterministic projection

The Room Planner generates and revises the complete RoomBlueprint. Application code computes every authority-bearing field in the compact proposal from the validated blueprint that the runtime will enforce.

Code computes:

- team size from the validated member list;
- maximum working time from the operating envelope;
- maximum spend from the operating envelope; and
- access from the union of approved tools, skills, permissions, workspace modes and delivery capabilities.

The LLM can write role one-liners, the approach summary and Why this team? rationale. It cannot write or override the authority summary that the user approves.

Sero validates a revised blueprint and recomputes the proposal after every natural-language adjustment.
An adjustment holds a durable planning claim. Start or Delete invalidates that
claim, and the completed model plan is refused instead of replacing newer Room
state.

### 2.9 Existing Pi machinery, new host authority boundary

Pi already provides session creation, persistence, reopen, history and compaction. Room mode reuses those APIs.

The new part is a plugin-to-host capability that lets the built-in Orchestrator request managed persistent sessions. The host, not the plugin, validates every request against a user-approved authority grant before it creates or opens a session.

Phase 1 must design and record this trust boundary. The initial capability is available only to bundled first-party plugins.

## 3. Terms

### 3.1 Workflow

The current Orchestrator execution mode. An LLM creates a structured plan of steps, dependencies, execution targets and completion conditions.

### 3.2 Room

A durable Orchestrator object that contains a goal, success criteria, operating envelope, Conductor, members, messages, assignments, artifacts and runtime state.

### 3.3 Room Planner

An isolated Orchestrator planning call that converts the user's problem and constraints into a validated RoomBlueprint.

The Room Planner is not a Room member. It runs before activation and uses the existing Orchestrator structured planning and repair approach.

### 3.4 RoomBlueprint

The complete proposed definition of a Room. It contains the Conductor, members, generated mandates, collaboration strategy, capabilities, workspace choices, initial assignments and suggested limits.

### 3.5 Conductor

The one Room member that controls Room choreography within the operating envelope. The Conductor has a normal persistent member session plus Room management authority.

### 3.6 Member

An agent with its own persistent Pi session, model selection, mandate, tools, skills, permissions, workspace and usage totals.

### 3.7 Operating envelope

The user-approved hard boundary for team size, concurrency, time, cost, models, tools, skills, permissions, workspace access and delivery.

### 3.8 Member mandate

The current role, responsibilities, task, priorities and working instructions for a member. A mandate can change without rewriting the member's stable session identity.

### 3.9 RoomRevision

A validated change to the Room definition or runtime roster. Each revision records its actor, reason, previous values, new values and approval result.

### 3.10 Room brief

A compact, current summary of the goal, important decisions, active work, blockers and artifacts.

The Room coordinator owns and automatically updates the authoritative brief from current Room state after structural progress. The Conductor can add a short situation note, but it cannot change authority-bearing fields through the note.

New members and compacted sessions receive a member-relevant projection of the Room brief instead of the complete Room transcript.

## 4. Problem

Sero supports single chats, transient subagent fan-out and two fixed collaboration engines.

These options do not provide a durable team that can:

- maintain separate long-running sessions;
- communicate while work continues;
- wait without holding an execution slot;
- resume after idle time or an application restart;
- use problem-specific roles instead of a fixed registry;
- change team composition when the problem changes;
- coordinate parallel repository work;
- operate under one visible budget and permission envelope; and
- deliver one result through an accountable Conductor.

Building Rooms as a separate runtime would duplicate much of Sero Orchestrator. The Orchestrator already owns budgets, scheduling, recovery, worktrees, artifacts, delivery and a multi-agent UI.

## 5. Goals

Room mode must:

- live inside sero-orchestrator-plugin;
- reuse existing Orchestrator and host services where their contracts fit;
- keep Workflow and Room domain models separate;
- create a problem-specific Room from a plain-language brief;
- support an optional template or preset as planning input;
- use one Conductor and any supported number of members;
- use standard persistent Pi sessions for every member;
- let each member have its own model, thinking level, mandate, tools, skills, permissions and workspace;
- let the Conductor change the Room within approved limits;
- let members communicate through durable Room messages;
- let waiting members release execution capacity;
- recover Room and member sessions after restart;
- manage member context growth and compaction;
- support safe parallel work with worktrees and simple advisory path claims;
- apply limits for time, cost, tokens, turns, concurrency, retries, failures and roster changes;
- provide a consolidated approval and attention inbox;
- deliver the final result to the Room origin or another approved destination;
- remain accessible to non-technical users; and
- replace CollaborationEngine and DebateEngine after Room mode is proven.

## 6. Non-goals

The first production release does not:

- encode a Room as a dynamic Workflow graph;
- force Workflow and Room records into one domain schema;
- provide distributed execution across unrelated Sero hosts;
- require users to select from a fixed registry of agents or roles;
- expose the complete generated blueprint in the default create flow;
- implement custom member transcript persistence;
- show Room member sessions as normal chats by default;
- let the Conductor expand its own authority;
- let peer messages grant permissions or approve protected work;
- support unbounded member creation or nested subagents;
- make advisory path claims a substitute for worktrees or Git conflict handling;
- require an upstream Pi change, Pi fork or Pi patch;
- make active prompt-cache keep-warm a release blocker;
- require cron or event-triggered Rooms in the first release; or
- automatically publish externally without the normal Sero permission and approval path.

## 7. Architecture

Room mode extends the Orchestrator plugin and consumes host-owned services.

~~~mermaid
flowchart TD
    UI[Orchestrator UI] --> ORCH[Orchestrator runtime]
    ORCH --> PLAN[Room Planner]
    ORCH --> COORD[Room coordinator]
    COORD --> SESS[Persistent session host]
    COORD --> GIT[Unified Git service]
    SESS --> PI[Pi SessionManager]
    COORD --> STORE[Room state and audit]
~~~

### 7.1 Plugin ownership

sero-orchestrator-plugin owns:

- Workflow and Room navigation;
- Room creation and blueprint review;
- Room records and runtime state;
- the Room coordinator;
- Room scheduling;
- Room messages and revisions;
- Room limits and usage aggregation;
- Room artifacts and delivery state;
- the Room user interface; and
- Room templates and presets.

### 7.2 Host ownership

The desktop host continues to own:

- the one Pi ModelRuntime;
- credentials and provider registration;
- generic persistent agent-session construction;
- workspace runtimes and tools;
- the unified Git and GitHub service;
- worktree operations;
- approval enforcement;
- app-state storage primitives; and
- cross-Sero agent presence.

The Orchestrator plugin receives narrow capabilities. It does not receive a second model runtime or credential store.

### 7.3 Separate domain records

Workflow records remain based on plans, steps, activations and attempts.

Room records are based on blueprints, members, messages, mandates and revisions.

Shared managers can use small common interfaces for:

- identity and lifecycle;
- limits and usage;
- workspace placement;
- artifacts;
- attention;
- delivery; and
- recovery.

A shared interface must not require one mode to store fields that only the other mode uses.

## 8. Required reuse map

Implementation must inspect and reuse or generalise these seams. A new parallel service requires a recorded architecture decision.

| Room need | Existing seam |
| --- | --- |
| Orchestrator ownership | plugins/sero-orchestrator-plugin |
| Limits and concurrency | runtime/limits.ts, runtime/coordinator.ts and shared LoopLimits patterns |
| Abort and coordination locks | runtime/coordinator.ts and runtime/locks.ts |
| Restart recovery | runtime/reconcile.ts |
| Durable split records | runtime/loop-store.ts and host.appState |
| LLM-authored structured planning | runtime/planner.ts, planning-flow.ts and schema repair patterns |
| Runtime plan revision pattern | runtime/revise.ts and recovery decision handling |
| Worktree lifecycle | runtime/workspace.ts and runtime/worktree-cleanup.ts |
| Unified Git authority | apps/desktop/electron/features/git under AD-024 |
| Persistent Pi session mechanics | SessionManager.create, SessionManager.open and the normal Sero session factory |
| Plugin capability gating | SERO_HOST_CAPABILITIES and the existing appRuntime.background pattern |
| Host authority enforcement | Existing approval and permission boundaries, extended with a host-issued persistent-session grant |
| Session prompt, steer and turn events | normal AgentSession APIs, active-session executor and turn-completion bridges |
| Session context usage and compaction | existing getContextUsage and session.compact paths |
| Model route resolution | the host-owned ModelRuntime under AD-026 |
| Cost and usage | Orchestrator usage summaries and host cost tracking |
| Plugin tools | the AD-020 sero-cli bridge |
| Isolated planning calls | existing Orchestrator planning and isolated-completion services |
| Global agent visibility | the current Agent Board and agent presence state |
| Result delivery | current Orchestrator delivery settings and receipts |

The implementation plan must identify the exact owner before it creates a new abstraction.

## 9. Room creation

### 9.1 Default flow

The default flow is:

1. The user selects Room mode.
2. The user answers: What would you like the team to accomplish?
3. The user can optionally set a maximum spend, maximum time or broad access choice.
4. The Room Planner creates a RoomBlueprint.
5. Sero validates the blueprint and repairs invalid model output through a bounded pass.
6. Sero shows a compact Room proposal.
7. The user starts the Room or adjusts it.
8. Orchestrator creates persistent member sessions and activates the Conductor.

The user does not need to understand agents, prompts, models, tools, skills, tokens, worktrees or provider routes.

### 9.2 Compact proposal

The default proposal shows:

- a short Room title;
- a one-sentence approach;
- number of members;
- each role name and one-line responsibility;
- maximum time;
- maximum spend;
- broad access such as This workspace and GitHub;
- important warning, only when one exists;
- Start Room; and
- Adjust.

The proposal can show Why this team? as optional supporting information.

The proposal is a deterministic projection of the validated blueprint. Application code computes team size, maximum time, maximum spend and access. Access uses a fixed mapping from effective capabilities to user-facing labels and warnings. Examples include Read this workspace, Edit this workspace, GitHub write access and deployment access.

The Room Planner supplies prose only. A planner-authored sentence cannot reduce or replace the computed access summary.

### 9.3 Adjustment

Adjust opens a natural-language input first.

Examples include:

- Use fewer agents.
- Add a security reviewer.
- Keep the cost below $2.
- Do not allow deployment tools.
- Use one agent only for implementation.
- Make the agents challenge each other's conclusions.

The Room Planner returns a revised blueprint only. It does not author the
proposal summary or the report of what changed. Application code computes both
from a normalized diff of the previous and revised validated blueprints, at
member granularity — so a member gaining a tool that another member already
holds is still reported, even though no summary tile moves.

### 9.4 Advanced settings

Advanced settings can expose:

- full member prompts and mandates;
- model and thinking selections;
- tools and skills;
- permission details;
- workspace and worktree placement;
- communication policy;
- concurrency and retry limits;
- detailed cost and token limits;
- context management; and
- cache policy.

Advanced settings do not replace the simple default flow.

## 10. RoomBlueprint

A RoomBlueprint contains:

- schema version;
- title and summary;
- objective and success criteria;
- Room instructions;
- proposed Conductor;
- proposed members;
- rationale for team size and composition;
- collaboration and communication strategy;
- initial mandates and assignments;
- workspace strategy;
- operating envelope;
- estimated time and cost range;
- artifact and delivery expectations;
- optional template source; and
- warnings or unresolved assumptions.

Each proposed member contains:

- generated display name and role;
- one-line user-facing responsibility;
- detailed mandate;
- model tier or permitted route;
- thinking level;
- custom prompt additions;
- enabled tools and skills;
- permission profile;
- workspace or worktree need; and
- reason for inclusion.

The planner can reference an existing saved agent, but it can also create an inline member definition. It must select only models, tools and skills that exist in the current Sero catalogue.

## 11. Templates and presets

Templates are optional planning seeds.

A template can contain:

- a planning strategy;
- preferred constraints;
- example roles;
- collaboration instructions;
- workspace defaults;
- limits; and
- output expectations.

Built-in presets can include:

- Software Delivery;
- Adversarial Analysis; and
- Parallel Issues.

A preset does not hard-code the final roster. The Room Planner adapts it to the current problem.

A user can save a generated Room as a template. Reuse defaults to adapting it to the new problem. An advanced option can reuse the exact saved roster.

Templates contain no secrets, run-specific session IDs or transient runtime state.

## 12. Authority and operating envelope

### 12.1 Ownership

| Owner | Authority |
| --- | --- |
| User | Goal, success criteria, budget ceiling, maximum members, permission ceiling, capability pool, workspace policy and delivery |
| Conductor | Roster within limits, mandates, assignments, coordination method and allowed member configuration |
| Orchestrator | Validation, IDs, persistence, scheduling, usage accounting, approvals, cancellation and audit |
| Member | Its assigned work, messages, artifacts and requests for help or change |

### 12.2 Envelope fields

The operating envelope can limit:

- maximum total members;
- maximum active member turns;
- maximum roster revisions;
- maximum member replacements;
- maximum wall time;
- total and per-member cost;
- total and per-member tokens;
- total and per-member turns;
- retries and consecutive failures;
- allowed model tiers and routes;
- allowed tools and skills;
- permission ceiling;
- nested subagent use;
- workspace and worktree policy;
- external delivery; and
- approval requirements.

The Room Planner and Conductor cannot increase these values.

### 12.3 User-owned intent

The Conductor cannot silently change:

- the user goal;
- success criteria;
- budget ceilings;
- permission ceiling;
- external delivery target; or
- the definition of a protected operation.

It can propose a change and explain why it is needed. The Room pauses affected work until the user responds.

## 13. Dynamic Room revisions

### 13.1 Supported changes

The Conductor can request:

- add member;
- update member mandate;
- change an assignment;
- change coordination strategy;
- change a member model within the allowed pool;
- change a member tool or skill subset within the allowed pool;
- suspend member;
- resume member;
- retire member;
- replace member;
- change a soft Room limit below the approved ceiling; and
- request user approval for an expansion.

### 13.2 Validation and application

The Room coordinator:

1. validates the request;
2. checks the operating envelope;
3. checks current Room and member state;
4. decides whether user approval is required;
5. waits for a safe turn boundary when required;
6. applies the change;
7. records a RoomRevision; and
8. informs affected members.

The Conductor does not edit persisted records directly.

### 13.3 Member identity and mandate

A member session has a stable base identity and authority.

The mutable mandate contains its current role, responsibilities, task, priorities and working instructions. Mandate changes apply as authoritative Room context on the next turn.

A mandate changes instructions only. It cannot add a model, tool, skill, permission, workspace or delivery capability.

Capability changes travel only through a validated Room configuration revision and the host authority boundary.
Removing a tool or skill first makes the member unschedulable and closes its
live session. The revision is recorded as applied only after the narrower
configuration is durable. The next turn reopens the session with that setup.

A fundamental identity or base-prompt change creates a replacement member session. The old member produces or receives a handover summary and becomes retired. History is retained.

### 13.4 Conductor failure

The first release has no automatic fallback Conductor.

If the Conductor fails and bounded retry cannot recover it, the Room pauses and asks the user to retry, replace the Conductor or stop the Room.

The Conductor cannot replace itself without user approval.

## 14. Standard Pi member sessions

### 14.1 Persistence decision

Every member uses Pi's default persistent SessionManager API.

Member sessions use SessionManager.create for creation and SessionManager.open for resume. They use the normal Pi JSONL format, message history, branching and compaction behaviour.

SessionManager.inMemory is not allowed for active Room members.

### 14.2 Session namespace

Room sessions are stored in a host-owned grant namespace under the normal Sero session root, for example:

    <SERO_SESSION_DIR>/<appId>/<grantId>/

This keeps Room members out of the normal chat history by default while retaining standard Pi storage and tooling.

The Room member record stores:

- session ID;
- session file path;
- session directory;
- workspace ID;
- current configuration revision; and
- last open and close times.

It does not duplicate the transcript.

### 14.3 Live session pool

The Orchestrator runtime keeps open AgentSession objects only for members that need them.

It can dispose a live session when:

- the member is suspended;
- the Room is paused for a long period;
- resource pressure requires it;
- the application exits; or
- the Room reaches a terminal state.

Disposal does not delete the persisted session.

A later wake reopens the same session file with the current approved member configuration.

### 14.4 Generic host capability

The Pi session mechanics already exist. Room mode adds a narrow plugin-to-host authority path around them.

The capability is named appRuntime.persistentSessions and is added to SERO_HOST_CAPABILITIES. That list is a compatibility declaration and grants nothing. The first release restricts the capability to bundled first-party plugins, enforced by canonical path equality: the host derives one bundled-plugin root, an allowlist maps each permitted app ID to its expected directory under it, and the app's resolved package path must equal that path exactly. Plugin-dev-session and settings-declared package sources are rejected. Installing an external plugin cannot grant this capability.

The Orchestrator sends a session request. It does not construct a session directly. A request includes:

- a host-issued authority grant ID;
- opaque owner, scope and subject identifier strings;
- session operation;
- approved workspace or worktree;
- model selection;
- tool and skill selection;
- permission profile; and
- resource-loading policy.

Permission profiles fail closed. A read-only profile receives only named read
tools and the Room protocol tool. It never receives an unrestricted shell, and
an unknown tool is denied. Blueprint validation also refuses command tools on
a read-only member.

A grant is issued from a host-stored approval, never from the plugin's request. The plugin submits a proposal; the host clamps it to current user authority and the workspace catalogue, presents the clamped set for approval, and stores exactly what was approved. The consent summary the user approves and the grant the host stores are projections of the same clamped set.

Capabilities are held **per session subject**, not grant-wide, so one subject cannot use another subject's tools, models or permissions. `open` takes no caller-supplied path — the host resolves it from its own immutable subject-to-path registry. The session-count check, the subject binding and the counter increment are one atomic reservation taken before construction, and both `create` and `open` commit that reservation afterwards against a re-read grant. A session whose grant is revoked while it is being built is disposed rather than registered: revocation tears down the sessions it can see, and a session still under construction is not yet one of them.

The host validates the request against that subject's policy: session and working-directory paths after symlink resolution, model availability through the one host ModelRuntime, tools, skills, permissions, prompt-addition size, session count, grant validity and revocation state. It then constructs or opens the Pi session.

Owner, scope and subject identifiers are opaque strings at this boundary. Room mode can use its Room and member IDs as values, but the host capability must not import, parse or depend on Room domain types.

The host must reject a request when a defective plugin asks for more authority than the user approved. The host must not trust an operating envelope supplied only by the plugin request.

This boundary contains a defective API caller, not a compromised bundled runtime. Runtime modules execute in Electron main with full Node authority, so tampered bundled code bypasses the capability rather than misusing it. Containing that would need an isolated runtime process with a capability-only facade — a host-wide change, out of scope for the first release and recorded as a known limit.

A grant is scoped to the plugin, opaque owner and scope identifiers, workspace and permitted session subjects. The calling product decides what those opaque values represent. It is revocable when its owning operation stops, is deleted or loses authority.

The generic boundary can expose:

- create;
- open;
- prompt;
- steer;
- abort;
- subscribe;
- compact;
- get context usage;
- get session usage; and
- dispose.

The capability and grant model require their own architecture decision in Phase 1 and must land before Room runtime uses them.

### 14.5 Member resource-loading policy

Room members use a filtered persistent-session profile between a full interactive chat and an isolated completion.

A member session loads:

- project context files such as AGENTS.md;
- the approved member prompt and current mandate;
- blueprint-selected skills;
- approved platform tools;
- the AD-020 sero-cli bridge;
- Room protocol context; and
- only the plugin extensions that provide an approved selected capability.

A member session does not automatically load every installed extension, prompt template, theme, agent definition or UI resource.

Third-party session-lifecycle hooks are off by default. Only host-required lifecycle behaviour and hooks from explicitly approved loaded extensions run. Persistence remains the responsibility of Pi SessionManager and does not depend on plugin lifecycle hooks.

The host enforces this resource profile from the approved grant. The plugin cannot widen it by changing its resource loader request.

## 15. Context management

### 15.1 Room brief ownership

The Room coordinator produces the authoritative Room brief automatically from current Room records. It updates the brief after structural progress such as an accepted revision, completed work, a decision, a blocker change or a new artifact.

Computed brief fields include the objective, success criteria, current roster, member mandate, active work, decisions, blockers, open questions and artifact references.

The Conductor can publish a short situation note. This note is clearly identified as Conductor-authored and cannot replace computed authority, permission, limit or assignment fields.

Each member receives only the relevant projection for its work. The full Room transcript is never required to construct the brief.

### 15.2 Compaction policy

Long-running member sessions must not fail because their context fills.

The Room runtime must:

- read context usage through the existing session API;
- warn before a configured threshold;
- compact only at a safe turn boundary;
- persist a member checkpoint summary before compaction;
- include the current Room brief, mandate, open questions and artifacts after compaction;
- record compaction in Room diagnostics;
- reset any cache assumption that depends on the previous prompt prefix; and
- allow the user to inspect compaction history.

A new or replacement member receives a curated Room brief and relevant artifacts. It does not receive all Room messages or every member transcript.

Resume the same session means preserving the Pi session history and compaction lineage. It does not mean keeping every original token in the active context window.

## 16. Scheduling and lifecycle

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

A Room enters `completing` when its work ends and stays there until the result
is delivered, uncommitted work is preserved and the grant is revoked. Only then
does it become `completed`. Holding the state across all of that is what lets
recovery tell an interrupted delivery from a clean finish, so a result is never
sent twice and never silently dropped. `completing` also claims the ending: a
cancel, a pause or a second completion is refused while it is held.

Cancellation has no such intermediate state, so the held grant is the marker
instead: a Room gives up its grant last, and one that is finished but still
holds a grant stopped partway through its cleanup. Recovery finishes that
cleanup on restart — preserving member work, then revoking — which is safe to
repeat because preservation commits only what is uncommitted and revocation is
idempotent.

Member states are:

- starting;
- idle;
- working;
- waiting;
- blocked;
- suspended;
- retiring;
- retired;
- completed;
- failed; and
- offline.

The shared Orchestrator coordinator infrastructure enforces:

- maximum active turns;
- provider-route concurrency where required;
- reserved capacity for the Conductor;
- fair selection among ready members;
- wake priority for direct replies and user intervention;
- budget checks before every turn;
- bounded retries;
- roster revision limits; and
- cancellation propagation.

Idle and waiting members do not occupy an active execution slot.

Reply delivery and other targeted wake signals use the coordinator event path immediately. They must not wait for the periodic 60-second scheduler tick.

On a healthy local host, a waiting member becomes ready immediately. When capacity and limits permit, its resumed turn starts within two seconds at the 95th percentile. Provider response time is outside this target. The periodic tick is recovery and reconciliation only.

## 17. Communication and waiting

### 17.1 Durable messages

Room messages support:

- direct message;
- broadcast;
- question;
- reply;
- cancellation;
- acknowledgement; and
- system notice.

Messages are persisted before delivery. The Room store keeps a monotonic Room message sequence and each member's read cursor.

This is a single-host message system. It does not need a distributed broker or a full event-sourcing model.

### 17.2 Delivery rules

- A direct message to an idle recipient can wake it when the sender requests a response.
- A direct message to a busy recipient queues for the next safe delivery point unless steering is explicitly allowed.
- A broadcast queues for each recipient by default.
- A broadcast wakes recipients only when the caller explicitly requests it and policy permits it.
- Message and inbox size limits apply.
- Duplicate command IDs do not create duplicate logical messages.
- Peer messages are untrusted member input, not system authority.

### 17.3 Wait and wake

The normal wait flow is:

1. A member asks a question.
2. The member waits on the question ID.
3. Its current turn ends.
4. The scheduler releases its slot.
5. A reply arrives in its durable inbox.
6. The scheduler reopens the member session if needed.
7. A new turn starts in the same session with the reply and current Room context.

Reply persistence emits an immediate coordinator event. The normal wait and wake path does not poll for the next scheduler tick.

The waiting question ID is durable authority for lookup. A bounded tail scan is
only an optimisation. After restart, lookup continues through retained message
pages until it finds the named question or proof that it was settled.

Wait-cycle detection is required. It notifies the Conductor when members form a dependency cycle or when no member can make progress. Continued deadlock pauses the Room for the user.

## 18. Room commands and AD-020

Room operations follow AD-020.

The Orchestrator plugin registers commands and tool handlers normally. Sero bridges them through the single sero-cli tool. Room members do not receive a separate schema for every Room operation on every turn.

Logical operations include:

- show roster;
- send direct message;
- broadcast;
- ask;
- reply;
- wait;
- show or update mandate;
- create or update work;
- claim or release paths;
- publish artifact;
- report status;
- request attention;
- propose Room revision; and
- finish Room.

Conductor-only operations are enforced by runtime authority checks, not by trusting the prompt.

## 19. Work, artifacts and path claims

### 19.1 Minimal work records

The first release uses a small WorkItem record:

- ID;
- title;
- owner;
- free-form status;
- short notes;
- dependencies; and
- related artifacts.

The runtime does not impose a review methodology or a large fixed work-state machine.

### 19.2 Artifacts

Room artifacts can include:

- plan;
- decision;
- branch;
- commit;
- patch;
- test result;
- review;
- report;
- pull request; and
- final answer.

Artifacts identify their producer and related work.

### 19.3 Simple advisory path claims

The first release supports simple advisory claims because parallel issue work is a primary use case.

A claim contains:

- member;
- file path, directory or glob;
- reason;
- creation time; and
- active or released status.

The runtime detects overlap and can warn or block according to Room policy. It releases claims when the member retires or the Room ends.

The first release does not need a complex renewable lease service. Claims remain advisory. Worktrees and Git conflict handling are the safety boundary.

## 20. Workspace and Git

Room mode consumes the unified Git service required by AD-024.

Workspace modes are:

1. Read-only shared workspace.
2. Separate managed worktree for each editing member.
3. Shared working tree with explicit user approval.

The default for code work is a separate worktree for each editing member.

The Conductor assigns integration work. It can collect commits, detect conflicts, request revisions, run checks and publish the final branch or pull request artifact.

Room code must not create a second Git runner, worktree helper, GitHub client or repository-state cache.

## 21. Limits and no-progress handling

Room mode reuses Orchestrator limit and usage primitives.

Limits include:

- wall-clock duration;
- total and per-member cost;
- total and per-member tokens;
- member turns;
- concurrent turns;
- provider-route concurrency;
- retries and failures;
- messages and inbox backlog;
- tool stall time;
- roster revisions;
- member additions and replacements;
- nested subagent use; and
- idle duration.

A hard limit stops new member turns and puts the Room in the configured paused or failed state.

No-progress detection uses structural progress such as:

- completed work;
- new artifact;
- commit;
- test result;
- resolved decision;
- changed blocker;
- accepted Room revision; or
- final delivery.

Message volume alone is not progress.

The system first notifies the Conductor. Continued no-progress pauses the Room for the user.

## 22. Permissions and approvals

- A Room cannot grant authority that the user or workspace does not have.
- The Room Planner selects only from the available capability catalogue.
- The Conductor can assign only capabilities inside the approved envelope.
- A capability or permission expansion requires user approval.
- Peer messages cannot approve operations.
- External writes use the normal Sero approval path.
- Secrets do not appear in Room messages, blueprints or audit payloads.
- Restored Rooms do not repeat uncertain non-idempotent actions without review.

The Orchestrator UI provides one approval and attention inbox for all Room members. It groups requests by Room and member and shows:

- requested operation;
- requesting member;
- reason;
- affected workspace or external service;
- permission consequence;
- estimated cost when relevant; and
- approve, reject or adjust actions.

The Conductor can request user input. It cannot answer an approval on the user's behalf.

## 23. Delivery and invoking chat

A Room stores an optional origin and a delivery policy.

If a Room starts from a chat, it records the originating session target. When the Conductor finishes, Orchestrator sends the final artifact and a compact Room summary back through the existing delivery mechanism.

The originating chat receives:

- final result;
- completion state;
- key artifacts;
- unresolved items;
- Room link; and
- cost and duration summary.

If a Room starts from the Orchestrator UI, its result remains in the Room. The user can send it to a selected session or approved external destination.

External delivery requires the same approval policy as Workflow mode.

## 24. Presence and prompt-cache policy

### 24.1 Local presence

A local heartbeat reports whether a live member session is available and responsive. It does not make a provider request and does not keep a remote prompt cache warm.

### 24.2 Core cache boundary

The first Room release keeps a narrow provider-neutral boundary:

~~~ts
interface PromptCacheAdapter {
  resolveProfile(modelRoute: ModelRoute): PromptCacheProfile | null;
}
~~~

Core Room mode supports:

- off;
- provider-default;
- route-specific profile lookup;
- cache read and write usage capture when Pi reports it;
- context-compaction invalidation; and
- cost attribution for normal member turns.

The full model route includes provider, model, API, gateway, account route and effective configuration.

Pi does not expose an exact expiry for every route. Sero does not depend on an upstream Pi change and does not patch, fork or monkey-patch Pi.

### 24.3 Deferred experimental keep-warm

Active remote cache refresh is not part of the first production release.

A later measured experiment can add:

- opt-in keep-warm;
- minimal-output refresh;
- verification telemetry;
- a strict cache-refresh budget;
- route-specific timing; and
- cost-based stop rules.

The experiment must pass a measured go or no-go gate. Auto prediction is not implemented until evidence shows that it can save cost reliably.

## 25. User experience

### 25.1 Orchestrator navigation

The Orchestrator product shows two modes:

- Workflows;
- Rooms.

Rooms are not a separate Sero application.

### 25.2 Required prototype states

The static prototype must show:

1. Orchestrator mode navigation.
2. Room creation from one plain-language brief.
3. Room preparation state.
4. Compact Room proposal with Start and Adjust.
5. Natural-language adjustment.
6. Optional Why this team? content.
7. Advanced blueprint settings.
8. Live Room with compact roster and current activity.
9. Live view of every member's current work at once.
10. Member session inspector with live turn, complete history, mandate, context and worktree.
11. Conductor-added or replaced member.
12. Multi-member approval and attention inbox.
13. Waiting, blocked, paused and failed states.
14. Path-claim conflict.
15. Result delivery to an invoking chat.
16. Completion with artifacts, duration and cost.

### 25.3 Accessibility and progressive disclosure

The default UI uses plain product language:

- Team size, not roster cardinality.
- Maximum spend, not token budget.
- Working time, not wall-clock limit.
- Access, not capability allowlist.
- Team member, not execution target.

Technical details remain available for users who want them.

Warnings appear only when they require a decision. The UI must not show a large generated configuration form after every Room brief.

## 26. Persistence and recovery

The current Room record is the source of truth.

The store uses the existing Orchestrator split-record and host.appState patterns. An append-only audit timeline explains transitions and supports the UI and diagnostics. State is not rebuilt by replaying all audit events.

Durable Room data includes:

- current definition and blueprint revision;
- operating envelope;
- member records and session references;
- member status and mandate;
- messages and read cursors;
- work and path claims;
- artifacts;
- usage and limits;
- approvals;
- delivery state;
- recovery state; and
- audit timeline.

After restart, Orchestrator:

1. loads the current Room state;
2. reconciles active and uncertain work;
3. reopens member sessions only when needed;
4. restores message cursors and limits;
5. reconnects valid worktrees;
6. marks uncertain external operations for review; and
7. resumes only when Room state and policy permit it.

## 27. Agent Board relationship

The existing Agent Board remains the global operational view of agents across Sero.

Active Room members appear on it with:

- Room label;
- role;
- status;
- cost;
- branch or worktree when relevant; and
- link to the Room.

The Room view contains the authoritative Room timeline, roster controls, messages, assignments and revisions. It must not create a second global fleet dashboard.

### 27.1 Usage analytics

The Usage plugin already scans nested Pi session files. Room sessions therefore remain part of total profile usage.

Room session creation sets a Pi session name that identifies the Room and member. The Usage scanner recognises the rooms/<roomId>/ session namespace.

The session path and Pi session name are the primary and sufficient grouping inputs. The Usage plugin does not read the Orchestrator store. An optional published lookup can enrich a group with a current Room label or link, but aggregation and attribution must continue to work without that lookup.

Usage presents:

- one grouped Room total;
- optional per-member rows;
- Room title and member role labels; and
- a link or stable Room ID for attribution.

Room member cost must not appear as an unexplained ordinary chat. Usage grouping is derived from the session path and Pi session name. Optional Room metadata can enrich labels and links only. It does not change the Pi session file format, duplicate usage data or create a direct cross-plugin store dependency.

## 28. Legacy engine replacement

The acceptance gate passed. CollaborationEngine and DebateEngine, their entry
points, and their orphaned state and UI are removed. Room mode is enabled by
default and keeps `SERO_ROOMS=0` as an emergency kill switch.

Room mode is proven through real Room scenarios. Sero does not build a large dual-runtime parity or compatibility framework.

The completed replacement:

- removes the fixed collaboration and debate entry points; Rooms start from the Orchestrator UI;
- optional presets can preserve useful collaboration or adversarial intent;
- release notes explain the change;
- old engine code, IPC, stores and UI are removed; and
- new Room records have no dependency on old engine types.

A Room created from chat returns its final result to that chat, which preserves the important user-facing contract of the old engines.

## 29. Observability

Room diagnostics expose:

- Room and member state;
- scheduler queue and reason;
- live, idle, waiting and blocked members;
- session open, close, reopen and compact actions;
- context usage;
- messages and delivery result;
- Room revisions and approvals;
- worktrees, claims and artifacts;
- cost and tokens by Room and member;
- limit warnings and stop reasons;
- recovery decisions;
- delivery result; and
- final outcome.

Logs use stable Room, member, session, message, revision, artifact and correlation IDs. Logs do not include secrets or complete sensitive prompts.

## 30. Failure handling

- A member turn failure increments bounded failure counters.
- Retry uses bounded backoff and an idempotency check.
- One member can fail without failing the Room when the Conductor can recover.
- Conductor failure pauses for the user after bounded retry.
- Message failure remains visible and queued when safe.
- Storage failure stops new side effects.
- Worktree failure blocks affected work.
- Context-compaction failure pauses the member before context exhaustion.
- A hard budget stops new turns.
- Restart does not repeat an uncertain external write.
- Cache telemetry failure does not fail the Room.

## 31. Functional requirements

| ID | Requirement |
| --- | --- |
| FR-001 | Agent Rooms are a mode inside sero-orchestrator-plugin. |
| FR-002 | The Orchestrator UI labels the current mode Workflow and the new mode Room. |
| FR-003 | Workflow and Room modes share management infrastructure without sharing forced domain records. |
| FR-004 | A user can create a Room from one plain-language problem description. |
| FR-005 | A Room Planner generates a problem-specific Conductor and roster. |
| FR-006 | A generated participant does not require a predefined named agent. |
| FR-007 | Application code computes team, time, spend and access in the default proposal from the validated blueprint. |
| FR-008 | The user can adjust the proposed Room with natural language. |
| FR-009 | Full blueprint configuration remains available under advanced settings. |
| FR-010 | Every member uses a standard persistent Pi SessionManager. |
| FR-011 | Room members do not use SessionManager.inMemory. |
| FR-012 | Room sessions are hidden from normal chat history by default. |
| FR-013 | A member can reopen the same Pi session after idle time or restart. |
| FR-014 | The Conductor can revise the Room within the approved operating envelope. |
| FR-015 | Authority expansion requires user approval. |
| FR-016 | Mandate changes apply without rewriting stable member identity. |
| FR-017 | Fundamental member identity changes create a replacement session and handover. |
| FR-018 | Members can send durable direct, broadcast, question and reply messages. |
| FR-019 | Waiting ends the current turn and releases its slot. |
| FR-020 | Wait-cycle detection informs the Conductor and can pause the Room. |
| FR-021 | Broadcast messages queue by default and wake only when explicit. |
| FR-022 | The runtime manages member context usage and safe compaction. |
| FR-023 | Editing members can use separate worktrees through the unified Git service. |
| FR-024 | Members can use simple advisory path claims. |
| FR-025 | Limits cover time, cost, tokens, turns, concurrency, retries, failures and roster changes. |
| FR-026 | The UI provides one approval and attention inbox for all members. |
| FR-027 | Room operations use the AD-020 sero-cli bridge. |
| FR-028 | Member models resolve through the host ModelRuntime required by AD-026. |
| FR-029 | A Room can return its result to the chat that invoked it. |
| FR-030 | Current-state records are authoritative and audit events are not used for full replay. |
| FR-031 | Templates are optional adaptive planning seeds. |
| FR-032 | CollaborationEngine and DebateEngine are removed after Room mode is proven. |
| FR-033 | Local presence and remote provider cache behaviour are separate. |
| FR-034 | Active cache keep-warm is not a first-release dependency. |
| FR-035 | appRuntime.persistentSessions is a named, initially built-in-only host capability. |
| FR-036 | The host validates every persistent-session request against a host-resolved user-approved grant using only opaque owner, scope and subject identifiers. |
| FR-037 | Member sessions load project context and approved resources through the filtered member resource policy. |
| FR-038 | The Room coordinator automatically owns and updates the authoritative Room brief. |
| FR-039 | Reply delivery wakes members through the event path and does not wait for the periodic tick. |
| FR-040 | Usage analytics groups nested Room sessions by Room and member from the session path and name without reading the Orchestrator store. |
| FR-041 | Mandate updates change instructions only; capability changes require validated configuration revisions. |
| FR-042 | A user can observe every member's current activity live, without opening each member in turn. |
| FR-043 | A user can read a member's complete session history at any time, including before a compaction and after the member retires. |

## 32. Quality requirements

| ID | Requirement |
| --- | --- |
| NFR-001 | Accepted Room state and messages survive application restart. |
| NFR-002 | Sero does not duplicate Pi member transcripts in Room storage. |
| NFR-003 | Duplicate command IDs do not duplicate their logical effects. |
| NFR-004 | Waiting and closed members use no active LLM execution slot. |
| NFR-005 | Renderer code cannot access credentials, raw model runtime or file authority. |
| NFR-006 | Budgets and cancellation hold during concurrent completion and restart. |
| NFR-007 | New Room worktree operations use the unified Git layer. |
| NFR-008 | A provider with no cache metadata can run normally. |
| NFR-009 | Room prompts and controls remain accessible to non-technical users. |
| NFR-010 | Full technical configuration is available without appearing in the default flow. |
| NFR-011 | Automated tests cover planning, persistence, reopen, scheduling, messaging, revisions, compaction, authority, workspace, delivery and recovery. |
| NFR-012 | A Room does not require any one template, provider, model or collaboration method. |
| NFR-013 | A defective plugin cannot create or open a session beyond its host-issued grant. This scopes to API misuse; a compromised bundled runtime is out of scope (see 14.4). |
| NFR-014 | A waiting member starts its resumed turn within two seconds at the 95th percentile when local capacity and limits permit. |
| NFR-015 | Authority-bearing proposal fields cannot disagree with the runtime blueprint because they are deterministic projections. |
| NFR-016 | Live observation adds no second transcript store. Streamed output is transient view state and is never written into Room records. |
| NFR-017 | Observing a member cannot change what it does. Observation is read-only and holds no execution slot. |

## 33. Phase 1 design checks

Phase 1 must confirm:

- the appRuntime.persistentSessions request, grant, validation, revocation and built-in-only capability design;
- the numbered architecture decision for this new plugin-to-host authority boundary;
- the computed consent-summary projection and fixed access-label mapping;
- the filtered member-session resource and lifecycle policy;
- the automatic Room brief projection and Conductor note;
- the path-and-name-derived Usage grouping, with any Room lookup limited to optional label or link enrichment;
- the decision to keep internal Loop naming for Workflow records and the visible rename debt;
- Workflows and Rooms navigation inside the Orchestrator UI;
- the one-question Room create flow;
- the compact proposal content;
- natural-language adjustment;
- advanced configuration placement;
- how generated rationale is shown;
- how a Conductor revision appears without interrupting normal work;
- how authority expansion reaches the approval inbox;
- how member sessions are inspected without entering normal chat history;
- how context compaction is explained;
- how a Room result returns to an invoking chat;
- how global Agent Board cards link to a Room; and
- how failure, pause and recovery remain understandable.

These checks can refine presentation and interaction. They do not reopen the agreed decisions about Orchestrator ownership, standard Pi session persistence, problem-first generation, controlled runtime revision or progressive disclosure.

## 34. Phase 1 recorded decisions

Source: [architecture.md](./architecture.md) and
[docs/prototypes/sero-agent-rooms.html](../../prototypes/sero-agent-rooms.html).
Architecture decisions AD-028 and AD-029 are recorded in
[docs/decisions.md](../../decisions.md).

### 34.1 Architecture

- **D-01** Room mode lives under `runtime/rooms/` and `shared/room-*`.
  `runtime/coordinator.ts` is already at the 500-line limit, so Room scheduling
  gets its own coordinator module rather than extending it.
- **D-02** `LoopLocks` has no Loop dependency. It is shared directly as a
  generic keyed try-lock and renamed `RunLocks`.
- **D-03** The Room store copies the Workflow split-store *pattern* into its own
  files. The two modes do not share one store interface.
- **D-04** `OrchestratorHost` gains a `persistentSessions` member. No second
  host object is created.
- **D-05** Workflow records keep the internal `Loop` name. The rename is tracked
  debt, scheduled after Phase 8.

### 34.2 Persistent-session capability

- **D-06** `SERO_HOST_CAPABILITIES` is a compatibility list only. It grants no
  authority. Built-in-only gating is canonical path equality — see **D-40**,
  which supersedes the provenance test this decision originally proposed.
  `isInstalledPluginPackagePath` is **not** the gate: an app discovered from a
  `settings.json` `packages` entry or a plugin dev session is not under the
  installed-plugins directory, so that test returns false for it while the app
  id it claims comes from its own package.json.
- **D-07** The host issues and stores grants. A request carries only a
  `grantId`. The host never reads authority from the request payload, and the
  caller identity comes from the runtime instance, not the payload.
- **D-08** Validation runs in a fixed ten-step order with a distinct denial
  reason at each step (architecture.md §3.3).
- **D-09** Grants are revocable. Revocation aborts in-flight turns, disposes
  live sessions, and fails every later request. It is idempotent.
- **D-10** The host builds the member resource loader from the grant. The
  request cannot supply loader overrides.
- **D-36** Authority comes from a host-stored approval, not from the plugin's
  request. The plugin proposes, the host clamps and gets approval, and the host
  stores exactly what was approved. The consent summary and the grant are
  projections of the same clamped set.
- **D-37** Capabilities are per session subject, not grant-wide. The per-subject
  policy covers working directories, models, **thinking levels**, tools, skills,
  the permission profile and the prompt-addition size cap. Every
  caller-selectable setting that moves cost or reach is in the policy.
- **D-38** `open` takes no caller-supplied path. The host resolves it from an
  immutable subject-to-path registry created at `create`.
- **D-39** The count check, subject binding and counter increment are one atomic
  reservation before construction. Both `create` and `open` commit that
  reservation after construction, in the same serialized turn that re-reads the
  grant. Revocation cannot dispose a session that is not registered yet, so a
  session whose grant was revoked while it was being built is disposed by the
  caller and never registered.
- **D-40** Built-in gating is canonical path equality against a host-derived
  bundled root plus an app-ID-to-directory allowlist. Dev-session and
  `settings.packages` sources are rejected. `isInstalledPluginPackagePath` alone
  is not sufficient and is not used as the gate.
- **D-41** The threat model contains a *defective* API caller and all
  third-party code. It does not contain a *compromised* bundled runtime, which
  runs in Electron main with full Node authority. Recorded as a known limit.
- **D-42** The live-session counter is never persisted; it is rebuilt from the
  host's live registry at startup. The created-session counter persists.
  Revocation writes `revoked` before it disposes.
- **D-43** A request carries no permission profile. The subject policy's profile
  is applied verbatim, so there is no subset negotiation at request time and
  nothing for a caller to inflate.
- **D-44** The reservation is two-phase and crash-safe. A `pending` reservation
  is written before construction and committed after it. At startup a pending
  reservation is committed when its session file exists and rolled back when it
  does not, so a crash can leak neither a bound-but-nonexistent session nor a
  lifetime-count slot.

### 34.3 Sessions and usage

- **D-11** Room sessions live in the host-owned
  `<SERO_SESSION_DIR>/<appId>/<grantId>/` directory. Pi names each session file.
- **D-12** Archiving keeps session files. Deleting a Room revokes the grant,
  then removes both the session and state directories. A retired member keeps
  its session file for the Room's lifetime.
- **D-13** Usage grouping is derived from the session path and the deterministic
  Pi session name `Room <roomTitle> — <memberRole>`. The Usage plugin's scanner
  is unchanged and never reads the Orchestrator store.

### 34.4 Consent summary

- **D-14** Team size, maximum time, maximum spend, access and warnings are
  computed in application code from the validated blueprint. The planner writes
  only the title, the one-sentence approach, role one-liners and the rationale.
- **D-15** The access mapping is fixed and ordered (architecture.md §7.1). An
  unmapped capability falls back to `Other tools` and is always listed in
  advanced settings. An unmappable capability class is a test failure.
- **D-16** The summary is recomputed after every blueprint change. The
  changed / preserved / removed report is **computed** in application code from
  a normalized member-granular diff of the previous and revised blueprints — it
  is never planner-authored. The diff covers each member's tools, skills, model,
  permissions and workspace mode, every envelope field, and the exact delivery
  target, so a member gaining a capability another member already holds is
  reported even though no union tile moves.
- **D-17** The access tile is the union across the whole team. Editing one
  member's tools does not change it while another member still holds the
  capability. Advanced settings say this explicitly.

### 34.5 User experience

- **D-18** Creation is one required question. Spend, time, access and delivery
  are optional chips carrying safe defaults. Presets sit below the primary
  action and never fix the final roster.
- **D-19** Adjust opens natural language, never a form. Forms exist only under
  advanced settings.
- **D-20** Rationale is disclosure, labelled `Planner reasoning`, and visually
  separated from the computed authority summary.
- **D-21** The live Room has three regions: roster with member state, activity,
  and the coordinator-owned Room brief. The Conductor's situation note is
  rendered as Conductor-authored and separate from computed brief fields.
- **D-22** Waiting and idle members show `0 turns held`. The copy presents
  waiting as normal and free, because releasing the slot is how the Room stays
  inside its concurrency limit.
- **D-23** A member is inspected through the Room — transcript, mandate,
  context, worktree, cost. The inspector states plainly that the session is real
  but not a chat, and that its usage is grouped under the Room.
- **D-24** Compaction appears as an in-transcript marker naming what was carried
  across, so shortened history above it is explained.
- **D-25** A revision inside the envelope is applied and recorded with inspect
  and undo. A revision needing authority the envelope does not hold is not
  applied; it becomes an approval request. The Room states which category each
  one is in.
- **D-26** One approval inbox covers every member and every Room. Each entry
  names the member, the request, the reason, and a computed consequence line.
  Every entry states that the Conductor cannot answer it.
- **D-27** Path claims are presented as advisory throughout. The overlap banner
  says worktrees are the real protection, and the two policies (warn, block) are
  shown as a Room setting with warn as default.
- **D-28** A chat-origin Room returns one result card: outcome, artifacts,
  unresolved items, cost, duration and a Room link. The Room's own completion
  view keeps per-member cost and each artifact's producer.
- **D-29** Failure, deadlock, block and pause states each state what happened,
  what it costs while in that state, and the next action.

### 34.5.1 Live observation

Added after the Phase 1 product review. Observation is a first-class part of
Room mode, not a debugging affordance.

- **D-30** A Room has two views of its members: **Timeline**, which records what
  has happened, and **Watch**, which shows what every member is doing right now.
  Both are reachable from the Room bar.
- **D-31** The Watch view streams each member's current turn live — the assistant
  text as it arrives and the tool call in flight with its elapsed time. A member
  that is waiting, idle, finished or queued states that instead of showing a
  stale last line, and says whether it holds a turn.
- **D-32** A member session view follows the live turn by default. Turning
  **Follow** off leaves the scroll where the user put it. The in-flight tool call
  is also shown in the side rail, so it stays visible when the user has scrolled
  away.
- **D-33** A turn strip above the transcript is the whole session at a glance —
  one mark per turn, with compaction points and Room messages marked — so the
  user can jump anywhere in the history, including before a compaction. Early
  turns collapse to a summary row that expands on demand.
- **D-34** A member's complete history stays readable for the Room's lifetime,
  including after it retires, is replaced, or fails. Disposing a live session
  never removes its history.
- **D-35** Observation is read-only. It cannot change what a member does, and it
  holds no execution slot.

### 34.5.2 Reuse corrections found at the Phase 1 gate

Three seams the specification listed as reuse are extensions. Each is scheduled
rather than assumed:

- **Usage grouping** — `extension/scan.ts` needs no change, but
  `extension/aggregate.ts` groups by provider, model and session and has no Room
  concept. Phase 6 adds path-derived grouping to the aggregator.
- **Agent Board** — `stores/agent-board.ts` watches the Workflow loop index, not
  generic agent presence. Phase 7 has it also watch the Room index.
- **Invoking-chat delivery** — delivery is agent-authored with a
  `DeliveryReceipt`, and destinations carry an `external` flag that decides
  whether an approval token is required. Four of the seven existing
  destinations are internal (`pr`, `workspace-files`, `saved-artifact`,
  `email-draft`) and three are external (`email-send`, `chat-post`,
  `webhook-post`). What is missing is specifically a destination that returns a
  result to the invoking **Sero chat session** — `chat-post` is an external chat
  service, not that. The new destination is `external: false`, so it needs no
  approval token, which is the correct behaviour. Added with a Room origin field
  in Phase 6.

### 34.6 Scope confirmed for the first release

In scope: everything in §31 FR-001 to FR-041.

Out of scope for the first release, unchanged from §6: cron or event-triggered
Rooms, nested subagents inside members, distributed execution, active
prompt-cache keep-warm, and a renewable path-claim lease service.

### 34.7 Prototype scenario check

The prototype is drawn with the issue-delivery scenario. The other two primary
scenarios were checked against the same states.

| Scenario | Fits the drawn states? | What changes |
| --- | --- | --- |
| Issue delivery | Yes — drawn end to end | — |
| Adversarial analysis | Yes | The roster is two opposed analysts plus a judge. The activity feed carries claim and rebuttal messages instead of commits. Access computes to `Read this workspace` only, so state 4 shows no warning and state 13 (path claims) does not appear. Completion delivers a report artifact, not a pull request. |
| Parallel issues | Yes | The roster is one implementer for each issue. State 13 is the common case rather than the exception, and the Conductor's integration work in state 14 collects several branches. The roster rail needs to stay readable past 8 members — Phase 7 must paginate it rather than scroll it. |

Two gaps found and folded into later phases:

- **Roster size.** The rail is drawn for 5 to 6 members. Parallel issues can
  reach the envelope's team cap. Phase 7 paginates the rail under the standard
  Sero list rule rather than making it scroll.
- **No-warning proposal.** A read-only Room produces a proposal with no warning
  row. State 4 must not leave a gap where the warning was — the warning is
  conditional, and the layout closes up without it.
