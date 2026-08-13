# Agent Rooms architecture record

Status: Phase 1  
Branch: feat/agent-rooms  
Decisions: [AD-028](../../decisions.md), [AD-029](../../decisions.md)  
Specification: [spec.md](./spec.md)  
Last updated: 2026-08-13

This record fixes the boundaries that Phase 2 onwards must implement. It is the
Phase 1 deliverable for architecture. Product and UX decisions from the
prototype are recorded in [spec.md](./spec.md) §34.

## 1. Verified reuse map

Every seam below was read in the current tree on branch `feat/agent-rooms`. A
new parallel service needs a new architecture decision.

| Room need | Verified seam | Reuse decision |
| --- | --- | --- |
| Plugin ownership | `plugins/sero-orchestrator-plugin/` | Room code lives here, under `runtime/rooms/` and `shared/room-*`. |
| Runtime entry | `runtime/index.ts` `createAppRuntime` | Room coordinator starts beside the Workflow coordinator in the same runtime instance. |
| Host seam | `runtime/host.ts` `OrchestratorHost` | Extended with `persistentSessions`. No new host object. |
| Host adapter | `runtime/host-adapter.ts` | Maps the new capability from `AppRuntimeHost`. |
| Limits | `runtime/limits.ts` `LimitCheck` | Shape reused. `LoopLimits` is Workflow-specific; Rooms get `RoomLimits` with the same check contract. |
| Run lock | `runtime/locks.ts` `LoopLocks` | Reused as-is. It is a plain keyed try-lock with no Loop dependency. Renamed `RunLocks` in Phase 2. |
| Restart recovery | `runtime/reconcile.ts` | Pattern reused, not the function. Workflow reconciles steps and attempts; Rooms reconcile members, turns, and messages. |
| Durable split store | `runtime/loop-store.ts`, `runtime/store.ts` | Same split-file + index + serialized-write pattern, in a separate `room-store.ts`. Single writer stays the rule. |
| App state primitives | `host.appState.read/update/watch` | Reused unchanged. |
| Structured planning | `runtime/planner.ts`, `planning-flow.ts`, `structured-call.ts`, `schema.ts` | Bounded structured call and one repair pass reused for the Room Planner. |
| Runtime revision | `runtime/revise.ts`, `recovery-apply.ts` | Pattern reused: build, validate, apply, record. Rooms record `RoomRevision`. |
| Worktrees | `runtime/workspace.ts`, `worktree-cleanup.ts` | Reused. Rooms request one worktree per editing member instead of one per loop. |
| Unified Git | `apps/desktop/electron/features/git` via `host.git.*` (AD-024) | Reused. Room code creates no Git runner, worktree helper, GitHub client, or repo cache. |
| Model resolution | `host.models.list` → one host `ModelRuntime` (AD-026) | Reused. Rooms add no model runtime. |
| Persistent Pi sessions | `SessionManager.create` / `.open`, `SERO_SESSION_DIR` | Reused through the new host capability (AD-029). |
| Resource loading | `DefaultResourceLoader` + overrides in `ipc/agent/core/agent-session-open.ts` | Pattern reused with a *filtered* override set — §5. |
| Tool bridge | `sero-cli` bridge (AD-020) | Room operations are bridged commands. No per-operation tool schema. |
| Attention | `shared/attention-types.ts`, `ui/components/AttentionQueue.tsx` | Reused. Room approvals join the same inbox. |
| Delivery | `runtime/delivery/`, `shared/delivery-types.ts` | Reused. A Room records the invoking chat as origin. |
| Artifacts | `runtime/artifacts.ts`, `host.writeArtifact/readArtifact` | Reused. |
| Notifications and choices | `host.notify`, `host.requestChoice` | Reused. |
| Usage analytics | `plugins/sero-usage-plugin/extension/scan.ts` | Reused unchanged — §8. |
| Agent Board | existing agent presence state | Reused. Rooms add no second fleet view. |

### 1.1 Corrections to the specification's reuse map

- `runtime/coordinator.ts` is **exactly 500 lines**, the repository limit. Room
  scheduling cannot be added to it. Room mode gets its own coordinator module.
- `LoopLocks` has no Loop dependency. It is a generic keyed try-lock and is
  shared directly, not generalised.
- There is no `runtime/loop-store.ts` interface both modes can implement
  without change. The Room store copies the *pattern* and keeps its own files.

## 2. Ownership and boundaries

### 2.1 What the plugin owns

Room navigation and UI, Room records and runtime state, the Room coordinator
and scheduler, the Room Planner, Room messages, mandates and revisions, Room
limits and usage aggregation, Room artifacts and delivery state, Room templates
and presets.

### 2.2 What the host owns

The one Pi `ModelRuntime`, credentials and provider registration, persistent
session construction and validation, workspace runtimes, the unified Git and
GitHub service, worktree operations, approval enforcement, app-state storage,
and cross-Sero agent presence.

### 2.3 Room mode storage

Current state is authoritative. The Room store mirrors the Workflow split
layout under the Orchestrator state directory:

    rooms/index.json                    — room summaries (watched by the UI)
    rooms/<roomId>/room.json            — definition, envelope, runtime state
    rooms/<roomId>/members/<id>.json    — member record and session reference
    rooms/<roomId>/messages/<seq>.json  — durable message pages
    rooms/<roomId>/revisions.json       — accepted revision history
    rooms/<roomId>/timeline.jsonl       — append-only audit timeline

The timeline explains transitions for the UI and diagnostics. State is **never**
rebuilt by replaying it. The runtime is the single writer; writes are
serialized, as in `loop-store.ts`.

### 2.4 Room commands under AD-020

Room operations register as normal plugin commands and are bridged into the one
`sero-cli` tool. Members never receive a separate tool schema per operation.
Conductor-only operations are enforced by runtime authority checks against the
caller's member ID, never by trusting prompt text.

### 2.5 Loop naming debt

Workflow records keep the internal `Loop` name. Renaming touches the store, its
migrations, the extension surface, and every persisted file, for no user-visible
gain. The user-facing product terms are **Workflow** and **Room** from Phase 7.
The rename is tracked debt to be scheduled after legacy engine removal
(Phase 8), when the record set is stable.

## 3. `appRuntime.persistentSessions` — capability design

### 3.1 Grant

The host issues a grant before any session exists, and stores it. The plugin
holds only its ID.

```ts
interface PersistentSessionGrant {
  grantId: string;
  /** Plugin app ID this grant was issued to. */
  appId: string;
  /** Opaque caller-defined identifiers. The host never parses them. */
  owner: string;
  scope: string;
  /** Session subjects this grant permits. A request outside the set is denied. */
  subjects: string[];
  workspaceId: string;
  /** Absolute directory every session file must resolve inside. */
  sessionDir: string;
  /** Absolute working directories a session may use (workspace root, worktrees). */
  allowedCwds: string[];
  /** Model IDs resolvable through the host ModelRuntime. */
  allowedModels: string[];
  allowedTools: string[];
  allowedSkills: string[];
  permissionProfile: PersistentSessionPermissionProfile;
  maxLiveSessions: number;
  maxTotalSessions: number;
  status: 'active' | 'revoked';
  issuedAt: string;
  revokedAt?: string;
}
```

The plugin **requests** a grant with the authority it wants. The host issues a
grant that is the intersection of that request, the current user authority, and
the workspace's real capability catalogue. It never issues more than was asked
for, and never more than the user holds.

### 3.2 Request

```ts
interface PersistentSessionRequest {
  grantId: string;
  subject: string;
  operation: 'create' | 'open';
  cwd: string;
  model: string;
  thinking?: string;
  tools: string[];
  skills: string[];
  systemPromptAdditions?: string[];
  sessionName: string;
  /** create only — relative to the grant's sessionDir. */
  sessionFile?: string;
  /** open only — the previously returned path. */
  sessionPath?: string;
}
```

### 3.3 Validation order

Each step denies with a distinct reason. No later step runs after a denial.

1. **Grant resolves** from the host store by `grantId`, or deny.
2. **Grant is live** (`status === 'active'`), or deny.
3. **Caller matches** `grant.appId`, or deny. The caller identity comes from the
   runtime instance the host constructed, never from the request payload.
4. **Subject is permitted** (`grant.subjects` contains `subject`), or deny.
5. **Path containment**: the resolved absolute session path is inside
   `grant.sessionDir` after `path.resolve` and symlink resolution, or deny.
   `..`, absolute overrides, and symlinks that escape are all denied.
6. **Working directory** is one of `grant.allowedCwds` or inside one, or deny.
7. **Model** is in `grant.allowedModels` **and** currently resolvable through
   the host `ModelRuntime`, or deny.
8. **Tools and skills** are subsets of the grant, or deny. An unknown name is a
   denial, not a silent drop.
9. **Permissions** are within `grant.permissionProfile`, or deny.
10. **Session count**: live sessions for the grant are below `maxLiveSessions`,
    and total created sessions are below `maxTotalSessions`, or deny.

Only after all ten does the host construct the resource loader and call
`SessionManager.create` or `SessionManager.open`.

### 3.4 Operations

`create`, `open`, `prompt`, `steer`, `abort`, `subscribe`, `compact`,
`getContextUsage`, `getSessionUsage`, `dispose`.

Every operation after `create`/`open` takes a host-issued session handle ID.
The host maps the handle to its live session and re-checks that its grant is
still active. A handle from a revoked grant fails.

`dispose` closes the live `AgentSession`. It does not delete the session file.

### 3.5 Revocation

A grant is revoked when its owning operation stops, is deleted, or loses
authority. Revocation aborts in-flight turns, disposes live sessions, and marks
the grant `revoked`. Every later request against it is denied. Revocation is
idempotent.

## 4. Security contract

| Threat | Control |
| --- | --- |
| External plugin obtains the capability | Provenance check (`!isInstalledPluginPackagePath(packagePath)`) **and** an explicit built-in app-ID allowlist. Both must pass. The manifest declaration grants nothing. |
| Plugin forges authority in a request | The host never reads authority from the request. It resolves the grant from its own store and intersects. |
| Plugin escapes the session directory | Resolve and compare against `grant.sessionDir`, after symlink resolution. |
| Plugin writes outside the workspace | `cwd` must be an approved workspace or worktree from the grant. |
| Plugin loads an unapproved model | Model must be in the grant **and** resolvable through the one host `ModelRuntime`. |
| Plugin widens its resource profile | The host builds the resource loader from the grant. The request cannot supply loader overrides. |
| Plugin exceeds session limits | Live and total session counters are held by the host, per grant. |
| Revoked grant keeps running | Revocation aborts and disposes; handles re-check grant status per operation. |
| Renderer reaches host authority | No grant, handle, session object, or credential crosses to the renderer. The renderer sees Room state only. |
| Peer message grants permission | Messages are untrusted member input. Authority changes travel only through a validated configuration revision plus user approval. |
| Prompt injection expands authority | The Conductor's requests are validated against the envelope in runtime code. Prompt text is never an authority source. |
| Secrets leak into records | Grants, blueprints, messages, and the audit timeline carry no credentials or raw prompts. |

Required deny tests in Phase 2: external-plugin denial, path escape via `..`,
path escape via symlink, unavailable model, tool outside grant, skill outside
grant, `cwd` outside grant, subject outside grant, session-count overflow,
revoked-grant use, and capability expansion between grant and request.

## 5. Filtered member resource policy

A member session sits between a full interactive chat and an isolated
completion. The host builds the loader; the plugin cannot widen it.

**Loaded**

- Project context files (`AGENTS.md` and the discovered chain).
- The approved member prompt and its current mandate.
- Skills selected in the validated blueprint, intersected with the grant.
- Approved platform tools for the resolved workspace runtime.
- The AD-020 `sero-cli` bridge, so Room commands are reachable.
- Room protocol context (how to ask, reply, wait, claim, publish, finish).

**Not loaded**

- Every installed plugin extension. Only extensions that supply an approved
  selected capability load.
- Prompt templates, themes, agent definitions, and UI resources.
- Third-party session-lifecycle hooks. Only host-required lifecycle behaviour
  and hooks from explicitly approved extensions run.

Persistence stays Pi `SessionManager`'s responsibility. It never depends on a
plugin lifecycle hook.

## 6. Session namespace and retention

Room sessions use the normal Sero session root with a Room namespace:

    <SERO_SESSION_DIR>/rooms/<roomId>/<memberId>.jsonl

where `SERO_SESSION_DIR` is `<SERO_AGENT_DIR>/sessions`. This keeps Room
members out of normal chat history — which lists the session root's own files —
while keeping the standard Pi format, tooling, and the Usage plugin's recursive
scan.

The member record stores the session ID, file path, directory, workspace ID,
current configuration revision, and last open and close times. It never stores
the transcript.

**Retention.** Archiving a Room keeps its session files. Deleting a Room
deletes `rooms/<roomId>/` in both the session root and the Orchestrator state
directory, after revoking the grant. A retired member keeps its session file for
the Room's lifetime, so its history stays inspectable.

## 7. Deterministic consent summary

The Room Planner writes prose. Application code computes every
authority-bearing field from the validated blueprint the runtime will enforce.

| Proposal field | Source |
| --- | --- |
| Team size | `blueprint.members.length` (Conductor included) |
| Maximum time | `envelope.maxWallClockMs` |
| Maximum spend | `envelope.maxCostUsd` |
| Access summary | Fixed mapping over the union of member tools, skills, permissions, workspace modes, and delivery capabilities |
| Warnings | Fixed mapping, emitted only for the flagged capability classes |
| Room title, approach, role one-liners, rationale | Planner prose |

The summary is recomputed after **every** blueprint change, including each
natural-language adjustment. A planner sentence can never reduce or replace a
computed field.

### 7.1 Fixed access-label mapping

Evaluated in order. The highest matching label for each class is shown.

| Effective capability | Label | Warning |
| --- | --- | --- |
| Any read tool over the workspace | Read this workspace | — |
| Any write or edit tool, or a worktree with write | Edit this workspace | — |
| Shared working tree write (not a worktree) | Edit your working files directly | Yes — work is not isolated in a worktree |
| `gh` or GitHub tools, read only | Read GitHub | — |
| `gh` or GitHub tools with write, push, or PR creation | GitHub write access | Yes — can push branches and open pull requests |
| Shell or command execution | Run commands | — |
| Network fetch or browser tools | Reach the internet | — |
| Deployment, publish, or release tools | Deployment access | Yes — can change live systems |
| External delivery to a destination outside Sero | Send results outside Sero | Yes — names the destination |

An unmapped capability falls back to `Other tools` and is always listed in
advanced settings, never hidden. A capability class that cannot be mapped is a
Phase 3 test failure, not a silent pass.

## 8. Usage analytics grouping

`plugins/sero-usage-plugin/extension/scan.ts` already walks the session root
recursively for `.jsonl` files and reads each file's `session_info.name`.
Nothing in the scanner changes.

- Grouping input is the **session path** (`rooms/<roomId>/`) and the **Pi
  session name**, which Room session creation sets deterministically as
  `Room <roomTitle> — <memberRole>`.
- The Usage plugin does **not** read the Orchestrator store. It has no
  cross-plugin store dependency.
- An optional published lookup may enrich a group with a current Room label or
  link. Aggregation and attribution must still be correct without it.
- Room member cost must never appear as an unexplained ordinary chat.

## 9. Room brief ownership

The **Room coordinator** owns the authoritative brief and rebuilds it from
current Room records after structural progress — an accepted revision,
completed work, a decision, a changed blocker, or a new artifact.

Computed fields: objective, success criteria, current roster, each member's
mandate, active work, decisions, blockers, open questions, artifact references.

The Conductor may publish a short **situation note**. It is stored and rendered
as Conductor-authored, and it cannot change any computed authority, permission,
limit, or assignment field.

Each member session receives only the projection relevant to its own work. The
full Room transcript is never needed to build the brief, and is never sent.

## 10. Shared interfaces and Room-specific records

**Shared** (same contract in both modes, no placeholder fields):

`RunLocks`, the `LimitCheck` result shape, workspace placement and worktree
handles, artifact write and read, the attention and approval queue entry, the
delivery target and receipt, and the split-store write discipline.

**Room-specific** (Phase 2):

`RoomDefinition`, `RoomBlueprint`, `OperatingEnvelope`, `RoomMember`,
`MemberMandate`, `RoomRuntimeState`, `RoomRevision`, `RoomMessage`, `WorkItem`,
`RoomArtifact`, `PathClaim`, `RoomLimits`.

No shared interface may carry a field that only one mode uses.

## 11. Event-driven member wake

Reply persistence and targeted wake signals emit a coordinator event
immediately. The 60-second tick in `runtime/index.ts` stays, but only as
recovery and reconciliation. It is not the normal wake path.

Target: a waiting member's resumed turn starts within two seconds at the 95th
percentile when local capacity and limits permit. Provider response time is
outside the target.
