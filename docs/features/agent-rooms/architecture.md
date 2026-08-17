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
| Delivery | `runtime/delivery/`, `shared/delivery-types.ts` | Mechanism reused (agent-authored send + `DeliveryReceipt` proof + the `external` flag that decides whether an approval token is required). **Extension needed:** no destination returns a result to the invoking Sero chat session — `chat-post` is an external chat service. Phase 6 adds a Room origin field and an `external: false` invoking-chat destination. |
| Artifacts | `runtime/artifacts.ts`, `host.writeArtifact/readArtifact` | Reused. |
| Notifications and choices | `host.notify`, `host.requestChoice` | Reused. |
| Usage analytics | `plugins/sero-usage-plugin/extension/scan.ts` | Scanner reused **unchanged** — it already walks nested `.jsonl` and reads `session_info.name`. **Extension needed:** `extension/aggregate.ts` groups by provider, model and session only; Room grouping is new. Phase 6 — §8. |
| Agent Board | `apps/desktop/src/stores/agent-board.ts` | Pattern reused (watches an index file per workspace through `window.sero.appState`). **Extension needed:** it watches `ORCHESTRATOR_INDEX_FILE`, the Workflow loop index, not generic agent presence. Phase 7 has it also watch the Room index. Rooms still add no second fleet view. |

### 1.1 Corrections to the specification's reuse map

- `runtime/coordinator.ts` is **exactly 500 lines**, the repository limit. Room
  scheduling cannot be added to it. Room mode gets its own coordinator module.
- `LoopLocks` has no Loop dependency. It is a generic keyed try-lock and is
  shared directly, not generalised.
- There is no `runtime/loop-store.ts` interface both modes can implement
  without change. The Room store copies the *pattern* and keeps its own files.
- Three seams the specification lists as reuse are **extensions**, not
  drop-in reuse. Each is now scheduled:
  - **Usage grouping.** `extension/scan.ts` needs no change, but
    `extension/aggregate.ts` groups by provider, model and session. It has no
    concept of a Room. Phase 6 adds path-derived grouping to the aggregator.
  - **Agent Board.** `stores/agent-board.ts` watches the Workflow loop index
    (`ORCHESTRATOR_INDEX_FILE`). Phase 7 has it also watch the Room index.
  - **Invoking-chat delivery.** Four of the seven `DeliveryDestinationId` values
    are internal (`pr`, `workspace-files`, `saved-artifact`, `email-draft`) and
    three are external (`email-send`, `chat-post`, `webhook-post`). The
    `external` flag decides whether the receipt must carry an approval token, so
    the distinction is load-bearing. What is missing is a destination that
    returns a result to the invoking **Sero chat session**; `chat-post` is an
    external chat service, not that. The new destination is `external: false`
    and needs no approval token. Added with a Room origin field in Phase 6.

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

### 3.0 Threat model

State this before the mechanism, because the mechanism is only sound against
the threats it actually addresses.

A plugin runtime module is loaded by `loadAppRuntimeModule` and executes **in
the Electron main process**, with full Node authority: filesystem, child
processes, and every other host module it can import. It is not sandboxed.

Therefore:

- **Bundled runtime code is trusted code**, at the same trust level as the host
  itself. A *compromised* bundled runtime is not contained by this capability —
  it could construct sessions, read credentials, or run commands without ever
  calling the capability. Containing that would need an isolated runtime process
  with a capability-only facade, which is out of scope for this feature and
  recorded as a known limit in §4.1.
- **What the grant does contain is a defective API caller.** A bug in Room code
  — a wrong path, a stale model, an unclamped loop, a member asking for a tool
  it was never given — cannot exceed what the user approved. This is a
  correctness and blast-radius boundary, and every deny path is tested.
- **What the built-in gate does contain is third-party code.** An installed or
  side-loaded plugin can never reach the capability at all (§3.6).

`NFR-013` is scoped accordingly: *a defective plugin cannot create or open a
session beyond its host-issued grant.*

### 3.1 Authority comes from a stored approval, not from the request

The plugin does not decide what a grant contains.

1. The plugin submits a **grant proposal**: the capability set it wants, plus
   opaque `owner`, `scope` and subject identifiers.
2. The host **clamps** the proposal to the user's current authority and the
   workspace's real capability catalogue.
3. The host **presents the clamped set to the user** and records the approval.
   In Room mode this is the Start room press: the computed consent summary the
   user approves and the grant the host stores are projections of the same
   clamped set, so they cannot disagree.
4. The host **stores the approved set** as the grant. The plugin receives only
   `grantId`.

The proposal is an input to an approval, never a source of authority. Widening
an existing grant is impossible; it requires a new approval, which produces a
new grant or a recorded amendment. This is what closes the gap where a plugin
could ask for more than the user was shown.

### 3.2 Grant

```ts
/** What one session subject may do. Capabilities are per subject, never grant-wide. */
interface PersistentSessionSubjectPolicy {
  /** Absolute working directories this subject may use, already realpath-resolved. */
  allowedCwds: string[];
  /** Model IDs resolvable through the host ModelRuntime. */
  allowedModels: string[];
  allowedTools: string[];
  allowedSkills: string[];
  /** Thinking levels this subject may run at — caller-selectable and cost-bearing. */
  allowedThinkingLevels: string[];
  /** Applied verbatim. A request carries no profile of its own. */
  permissionProfile: PersistentSessionPermissionProfile;
  /** Max bytes of appended system-prompt text this subject may supply. */
  maxSystemPromptAdditionBytes: number;
}

interface PersistentSessionGrant {
  grantId: string;
  /** Plugin app ID this grant was issued to. */
  appId: string;
  /** Opaque caller-defined identifiers. The host never parses them. */
  owner: string;
  scope: string;
  workspaceId: string;
  /** Absolute directory every session file must resolve inside, realpath-resolved. */
  sessionDir: string;
  /** Per-subject policy. A subject absent from this map is denied outright. */
  subjects: Record<string, PersistentSessionSubjectPolicy>;
  maxLiveSessions: number;
  maxTotalSessions: number;
  /** Host-owned reference to the approval this grant was issued from. */
  approvalId: string;
  status: 'active' | 'revoked';
  issuedAt: string;
  revokedAt?: string;
}
```

Per-subject policy is the important change from a flat capability list. With
flat lists, a read-only reviewer could request the implementer's `gh` tool and
pass validation, because the union contained it.

### 3.3 Permission profile

```ts
interface PersistentSessionPermissionProfile {
  /** Filesystem reach. Each level is a strict superset of the one above. */
  filesystem: 'none' | 'read' | 'write';
  /** Shell and command execution. */
  commands: 'none' | 'readOnly' | 'all';
  /** Outbound network. */
  network: 'none' | 'fetch';
  /** Version-control reach. Each level is a strict superset of the one above. */
  vcs: 'none' | 'read' | 'commit' | 'push';
}
```

Subset semantics: profile `A` is within profile `B` when, for every field, `A`'s
value is at or below `B`'s in that field's declared order. The orders are
total, so the check is a per-field index comparison with no lattice ambiguity.
A field absent from a request is treated as `none`, never as inherited.

### 3.4 Request

```ts
interface PersistentSessionRequest {
  grantId: string;
  subject: string;
  operation: 'create' | 'open';
  cwd: string;
  model: string;
  /** Must be in the subject's allowedThinkingLevels. */
  thinking?: string;
  tools: string[];
  skills: string[];
  // No permissionProfile field: the subject policy's profile is applied
  // verbatim, so there is nothing here for a caller to inflate.
  /** Appended after the base prompt. Never replaces it. Size-bounded per subject. */
  systemPromptAdditions?: string[];
  sessionName: string;
  // No path field, for either operation.
}
```

**Neither operation takes a path.**

- `create` passes the grant's session directory to
  `SessionManager.create(cwd, sessionDir)` and lets Pi name the file. The host
  binds whatever path Pi returns.
- `open` resolves the path from the host's own immutable subject registry.

A caller that cannot name a path cannot aim one. This removes path traversal and
the leaf-symlink class **by construction** rather than by validation, which is
strictly stronger than checking a caller-supplied name — the earlier design
validated a leaf, and a symlink planted at that leaf still passed a
parent-directory containment check.

### 3.5 Validation order

Each step denies with a distinct reason. No later step runs after a denial.

1. **Grant resolves** from the host store by `grantId`, or deny.
2. **Grant is live** (`status === 'active'`), or deny.
3. **Caller matches** `grant.appId`, or deny. Caller identity comes from the
   runtime instance the host constructed, never from the request payload.
4. **Subject has a policy** — `grant.subjects[subject]` exists, or deny.
   Everything after this validates against *that subject's* policy.
5. **Path resolution.**
   - `create`: no path is computed. The request carries none, and Pi names the
     file inside `grant.sessionDir`. A subject that already has a binding is
     denied — it must `open`, or it would orphan its first session.
   - `open`: the path comes from the subject registry, and its containment in
     `grant.sessionDir` is re-checked after symlink resolution on every open, so
     a link swapped in after the binding was made is caught.
6. **Working directory**: `realpath(cwd)` equals or is inside a realpath-resolved
   entry of the subject's `allowedCwds`, or deny. Resolution happens before the
   comparison, so a symlink cannot escape.
7. **Model** is in the subject's `allowedModels` **and** currently resolvable
   through the host `ModelRuntime`, or deny.
8. **Thinking level** — the EFFECTIVE level (the request's, or the host default
   when omitted) is in the subject's `allowedThinkingLevels`, or deny. Omitting
   the field must not be a way to reach an unapproved default, so validation
   returns the level it checked and the host applies exactly that.
9. **Tools and skills** are subsets of the subject's lists, or deny. An unknown
   name is a denial, not a silent drop.
10. **Prompt additions** total at or below the subject's
    `maxSystemPromptAdditionBytes`, or deny. They are appended after the base
    prompt and host-required blocks and can never replace them.
11. **Atomic two-phase reservation** — §3.5.1.

Permissions are not a validation step. A request carries no permission profile;
the subject policy's profile is applied verbatim when the host builds the
session, so there is no subset negotiation at request time. The §3.3 ordering
still governs how the host clamps a *proposal* at approval time.

Only after all of these does the host build the resource loader from the grant
and call `SessionManager.create` or `SessionManager.open`.

### 3.5.1 The reservation is two-phase and crash-safe

A count check followed by a create is a race, and a durable write followed by a
crash is a leak. Both are handled by the same critical section.

Under one lock held for the grant:

1. re-check `status === 'active'`;
2. check `live + pending` against `maxLiveSessions`, and
   `createdSessions + pending` against `maxTotalSessions` — pending reservations
   count, so concurrent creates cannot collectively overshoot either cap;
3. bind subject→path if the subject has no binding yet (first binding wins and
   is never rewritten, which is what makes a pathless `open` safe);
4. write a **pending** reservation and persist.

Then construction runs outside the lock. On success the reservation is
committed and `createdSessions` increments; on failure it is released, and the
binding it created is removed.

At startup, every pending reservation is **rolled back** — never committed. A
commit deletes its own reservation, so a surviving pending record means
construction did not complete. File existence is not proof of completion:
construction can create the file and then fail, and committing on that would
register a session that was never usable. Rollback releases the reserved count,
drops the binding, and removes the partial file so the next `create` for that
subject starts clean. Without the reservation, a crash between persist and
construct would leave a subject bound to a nonexistent session and permanently
shrink the lifetime cap.

Two invariants make the rollback safe to delete a file:

- a subject's binding is **immutable** — a bound subject must `open`, not
  `create`, so re-creating cannot orphan an earlier session; and
- a path belongs to **exactly one subject** — two subjects can never reserve the
  same file, so a deleted partial file can only be the one this reservation
  made.

A commit can also lose a race with revocation: revoke disposes the handles it
can see, and a session still under construction is not one of them. So the
commit re-checks status, and on a revoked grant it releases instead and tells
the caller to dispose the session it just built.

The **live** count is never persisted. After a restart nothing is live, so it is
rebuilt from the host's in-memory live registry and correctly starts at zero. A
persisted live count would leak on a crash and wedge the grant forever.

### 3.6 Identifying a built-in plugin

`SERO_HOST_CAPABILITIES` is a *compatibility* list. It tells a plugin whether
this host build supports a capability. It grants nothing.

`isInstalledPluginPackagePath()` is **not sufficient** on its own. It only
covers `SERO_PLUGINS_DIR` and `<SERO_FIXED_ROOT>/agent/plugins`. An app
discovered from an arbitrary `settings.packages` entry, or from a plugin dev
session, returns `false` from it — and the app ID it claims comes from its own
`package.json`. So "not installed, and claims an allowlisted ID" is a hole.

The gate is **canonical path equality**:

1. The host derives one canonical bundled-plugin root — the packaged resources
   directory in a release build, the repository `plugins/` directory in a source
   run. It is host-derived, never manifest-derived.
2. The allowlist maps each permitted app ID to its **expected directory name**
   under that root.
3. `realpath(manifest.packagePath)` must equal
   `realpath(join(bundledRoot, expectedDirName))` exactly. Not a prefix test.
4. The path must also be one the host itself enumerated as a bundled plugin
   (`discoverBuiltinPluginPaths()`, which additionally applies
   `isBuiltinPackageDir`).

A directory that merely claims `sero.app.id: "orchestrator"` fails step 3,
whichever discovery source produced its manifest — `settings.packages`, a
registered path, or a plugin dev session. Path equality is the whole gate
because the path is what decides which runtime code loads, so no per-source
carve-out is needed and legitimate development of a bundled plugin still works.

This matters because `discoverApps()` de-duplicates by app id with **last write
wins**: a later source can override an earlier one for the same id. Gating on
the final manifest's resolved path is what makes that ordering irrelevant.

`SERO_DEV_PLUGINS` does not affect this gate. It only controls whether a
built-in plugin's UI is served from its dev port
(`getManifestDevPort`); it changes no package path and grants nothing.

### 3.7 Operations

`create`, `open`, `prompt`, `steer`, `abort`, `subscribe`, `compact`,
`getContextUsage`, `getSessionUsage`, `dispose`.

Every operation after `create`/`open` takes a host-issued session handle ID.
The host maps the handle to its live session and re-checks that the grant is
still active. A handle from a revoked grant fails.

`dispose` closes the live `AgentSession` and decrements the live count. It does
not delete the session file and does not clear the subject→path binding.

### 3.8 Grant store durability

The grant store is host-owned durable state, not in-memory.

- Grants and subject→path bindings persist through the host's app-state
  primitives. They survive a restart.
- `maxTotalSessions` counts **created** sessions, so its counter persists with
  the grant.
- `maxLiveSessions` counts **open** sessions. After a restart no session is
  live, so the live count is rebuilt from the host's own live-session registry
  and correctly starts at zero. It is never persisted, because a persisted live
  count would leak on a crash and permanently wedge the grant.
- **Revocation is write-first.** The host writes `status: 'revoked'` before it
  aborts and disposes. A crash mid-revocation leaves the grant revoked, which is
  the safe direction. Revocation is idempotent.
- On restart the host reattaches grants before any plugin runtime starts, so a
  runtime cannot race the store into issuing work against an unloaded grant.

### 3.9 Revocation

A grant is revoked when its owning operation stops, is deleted, or loses
authority. Revocation aborts in-flight turns, disposes live sessions, and marks
the grant `revoked`. Every later request against it is denied.

## 4. Security contract

| Threat | Control |
| --- | --- |
| Third-party plugin obtains the capability | Canonical bundled-path equality plus an app-ID→directory allowlist, with dev-session and `settings.packages` sources rejected outright (§3.6). |
| Plugin is granted more than the user approved | Authority comes from a host-stored approval, not from the request. The consent summary and the grant are projections of the same clamped set (§3.1). |
| Plugin forges authority in a request | The host resolves the grant from its own store and validates against it. Caller identity comes from the runtime instance, not the payload. |
| One subject uses another subject's capabilities | Policy is per subject. Validation runs against `grant.subjects[subject]` only (§3.2). |
| One subject opens another subject's session | `open` takes no path. The host resolves it from the immutable subject registry (§3.4). |
| Plugin escapes the session directory | Neither operation accepts a path. Pi names the file inside the grant's directory on `create`; `open` re-checks the registered path's containment after symlink resolution. |
| Plugin writes outside the workspace | `realpath(cwd)` compared against realpath-resolved allowed roots (§3.5 step 6). |
| Plugin loads an unapproved model | Model must be in the subject's list **and** resolvable through the one host `ModelRuntime`. |
| Plugin widens its resource profile | The host builds the resource loader from the grant. The request supplies no loader overrides. |
| Plugin overrides the base system prompt | Additions are appended only, after host-required blocks, and are size-bounded per subject. |
| Concurrent creates exceed the session cap | Count check, subject binding and pending reservation are one atomic critical section; pending reservations count toward both caps (§3.5.1). |
| Crash leaks a lifetime-count slot or binds a nonexistent session | Reservations are two-phase and always rolled back at startup (§3.5.1). |
| Two subjects alias one session file | A path is bound to exactly one subject; a bound subject cannot re-create under a different path (§3.5.1). |
| Symlink planted at a chosen session leaf | Not reachable: the caller never chooses a leaf. |
| Revocation races construction and a session survives its grant | Commit re-checks status and requires the caller to dispose on a revoked grant (§3.5.1). |
| Omitted `thinking` reaches an unapproved host default | The **effective** level is validated, and the validated value is what the host applies (§3.5 step 8). |
| Caller inflates the thinking level to raise cost | `allowedThinkingLevels` is part of the per-subject policy and validated (§3.5 step 8). |
| Caller inflates permissions | A request carries no permission profile; the subject policy's is applied verbatim. |
| Revoked grant keeps running | Revocation is write-first, then aborts and disposes; handles re-check status per operation. |
| Crash leaks the live-session count | The live count is never persisted; it is rebuilt from the live registry at startup (§3.8). |
| Renderer reaches host authority | No grant, handle, session object, or credential crosses to the renderer. The renderer sees Room state only. |
| Peer message grants permission | Messages are untrusted member input. Authority changes travel only through a validated configuration revision plus user approval. |
| Prompt injection expands authority | The Conductor's requests are validated against the envelope in runtime code. Prompt text is never an authority source. |
| Secrets leak into records | Grants, blueprints, messages, and the audit timeline carry no credentials or raw prompts. |

### 4.1 Known limit

This capability does **not** contain a compromised bundled runtime. Runtime
modules execute in Electron main with full Node authority, so a bundled runtime
that has been tampered with can bypass the capability rather than misuse it.
Containing that needs an isolated runtime process with a capability-only host
facade. That is a host-wide change affecting every runtime plugin, not an Agent
Rooms change, and it is out of scope here. It is recorded so the boundary is not
mistaken for a sandbox.

### 4.2 Required deny tests (Phase 2)

**Gate.** Third-party-plugin denial; `settings.packages` source denial;
plugin-dev-session source denial; path-equality denial for a directory claiming
an allowlisted app id.

**Validation.** Subject with no policy; a registered session path that resolves
out of the grant directory via symlink; `cwd` escape via symlink; a `cwd`
sibling that shares a string prefix with an allowed root (proves containment is
segment-wise); model outside the policy; model in the policy but unavailable at
runtime; explicit thinking level outside the policy; **omitted** thinking level
whose host default is outside the policy; tool outside the policy; skill outside
the policy; prompt additions over the cap measured in UTF-8 bytes;
`create` for a subject that is already bound; `open` for a subject with no
registered session.

**Reservation and lifecycle.** Two concurrent creates against a one-session cap
(exactly one succeeds); use of a revoked grant; a commit that lands after
revocation (must refuse and demand the caller dispose); restart with a persisted
grant and a zeroed live count; restart with a pending reservation, which always
rolls back whether or not a session file exists; the startup sweep removing an
unbound session file while leaving every bound one.

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

Room sessions use the normal Sero session root with a host-owned grant namespace:

    <SERO_SESSION_DIR>/<appId>/<grantId>/<pi-session>.jsonl

where `SERO_SESSION_DIR` is `<SERO_AGENT_DIR>/sessions`. This keeps Room
members out of normal chat history — which lists the session root's own files —
while keeping the standard Pi format, tooling, and the Usage plugin's recursive
scan.

The member record stores the session ID, file path, directory, workspace ID,
current configuration revision, and last open and close times. It never stores
the transcript.

**Retention.** Archiving a Room keeps its session files. Deleting a Room removes
the host-owned grant directory and grant record, plus the Room's Orchestrator
state directory, after durable revocation. A retired member keeps its session
file for the Room's lifetime, so its history stays inspectable.

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

### 7.0 The adjustment report is computed, not written

The planner returns a **revised blueprint only**. It does not return a proposal
summary, and it does not author the changed / preserved / removed report.

That report is computed in application code as a normalized diff of the previous
and revised validated blueprints. The union tiles alone are not enough: a member
can gain a tool that another member already holds, which leaves every tile
identical while the member's own authority grew. The diff therefore covers, at
member granularity:

- members added, removed and replaced;
- each member's tools, skills, model and permission profile;
- each member's workspace mode and worktree need;
- every operating-envelope field; and
- the exact delivery destination and its parameters.

A change at member granularity is reported even when it does not move a tile.
No planner-authored preservation statement is displayed.

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
**Nothing in the scanner changes.**

The aggregator does change. `extension/aggregate.ts` currently accumulates by
period, provider, model and session; it has no Room concept, so Room sessions
would appear today as ordinary unexplained sessions. Phase 6 adds a grouping
pass over the already-parsed sessions.

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

## 12. Live observation contract

Added after the Phase 1 product review (spec.md §34.5.1). Two questions need
different plumbing: *what has happened* is Room state, and *what is happening
right now* is a live stream.

### 12.1 Live stream

The capability's `subscribe` operation is the seam. It already exists in the
AD-029 operation set — no new host surface is needed.

    Pi AgentSession events
      → host persistent-session capability (subscribe)
        → Orchestrator runtime (per-member live buffer, bounded)
          → Room live event
            → renderer

Rules:

- The renderer never holds a session handle. It receives live events only.
- The live buffer is **transient view state**. It is bounded per member (last
  turn only) and is never written into Room records, so it cannot become a
  second transcript store (NFR-002, NFR-016).
- Subscribing is read-only and holds no execution slot (NFR-017). A member that
  nobody is watching behaves identically.
- When no client is watching, the runtime still needs turn-completion events for
  scheduling, but it does not need to retain streamed text. Retention follows
  demand, in the same way `attachDemandSync` already gates event-source
  adapters in `runtime/index.ts`.

### 12.2 History

History is the Pi session file. It is not copied into Room state.

- The renderer requests a page of a member's history through an Orchestrator
  plugin action. The plugin reads the session file through the host capability.
  The renderer never opens a session file itself (NFR-005).
- Reads are paged from the tail, so opening a long session does not load the
  whole file.
- The turn index — turn boundaries, compaction points, Room messages, tool-call
  counts — is derived on read from the same file. It is not a stored structure
  that could drift from the transcript.
- History survives member disposal, retirement, replacement and failure, for the
  Room's lifetime. Disposing a live session closes the `AgentSession`; it does
  not touch the file (AD-029, §3.4).

### 12.3 Phase placement

- **Phase 4** implements `subscribe` and the bounded per-member live buffer, and
  the paged history read.
- **Phase 7** implements the Watch view, the follow toggle, the turn strip and
  the collapsed-history row.
