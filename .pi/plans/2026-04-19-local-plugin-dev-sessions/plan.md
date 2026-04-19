# Local Plugin Dev Sessions Implementation Plan

**Date:** 2026-04-19
**Status:** Draft
**Spec:** `.pi/plans/2026-04-19-local-plugin-dev-sessions/spec.md`
**Scout:** `.pi/plans/2026-04-19-local-plugin-dev-sessions/scout-context.md`
**Directory:** `/Users/danielcarter/Documents/Dev/projects/sero/sero`

## Overview

This feature adds a **profile-scoped Local Plugin Development lifecycle** to production Sero without collapsing it into either of the two adjacent concepts that already exist today:

- **Installed Plugins** — managed package installs under `~/.sero-ui/<profile>/agent/packages`
- **Attached folders** — workspace-root visibility/mounting under `WorkspaceConfig.roots`
- **Plugin dev sessions** — new source-of-truth records for running a local checkout directly

The implementation should **not** repurpose installs or roots as the public model. Instead, it should add a dedicated main-process lifecycle owner that:

1. persists dev-session records under the active profile,
2. validates and activates local plugin checkouts,
3. manages an optional host-side UI dev server,
4. projects active sessions into discovery/resource loading,
5. preserves broken sessions as recoverable records,
6. auto-refreshes on source changes without forcing reinstall flows.

The existing codebase already gives us most of the supporting pieces:

- discovery + manifest parsing (`apps/desktop/electron/features/apps/discovery/index.ts`)
- install lifecycle (`apps/desktop/electron/features/plugins/manager.ts`)
- settings/package projection (`apps/desktop/electron/features/plugins/activation.ts`)
- runtime restart/reconcile (`apps/desktop/electron/features/apps/runtime/manager.ts`)
- renderer remote invalidation (`apps/desktop/src/lib/federation-registry.ts`)
- admin plugin surfaces (`plugins/sero-admin-plugin/ui/**`)

The cleanest path is to add a **new dev-session manager** that owns the lifecycle and uses the existing package/discovery/runtime machinery as an internal activation layer.

## Investigation Summary

Relevant current behavior:

- Installed plugins become active because they are ultimately projected into `settings.packages` and discovered from there.
- Discovery currently deduplicates by app ID with **last-wins** shadowing.
- Production UI remote resolution only knows about `sero-ext://`; localhost MF remotes are still tied to `devPort` + `NODE_ENV === 'development'` + `SERO_DEV_PLUGINS`.
- `AppRuntimeManager` already exists, but it only restarts when manifest keys change; it has no targeted restart API for same-path source edits.
- Admin currently conflates installs with `linked-plugin` workspace roots inside `PluginsPanel.tsx`, and that file is already **exactly 500 LOC**.
- Workspace-root attachment is already a real persisted concept with container-mount consequences, so it must remain distinct from the new dev-session lifecycle.

## Approaches Considered

### 1. Treat a dev session as a disguised install

Store the local source path in install metadata and let the current plugin install lifecycle activate it.

**Pros**
- Reuses existing install/discovery flow.
- Smallest initial code footprint.

**Cons**
- Violates the product model immediately.
- Blurs uninstall vs stop-developing semantics.
- Makes broken-session recovery awkward because install provenance and dev-session diagnostics are different concerns.
- Encourages the exact “masquerading as installed plugin” confusion the spec rejects.

**Decision:** reject as the public architecture.

### 2. Add a dedicated dev-session manager, but internally project active sessions into package discovery (**recommended**)

Persist dev-session records separately, then project only **active** sessions into `settings.packages` for extension/resource loading and into discovery via a dev-session overlay.

**Pros**
- Keeps the product model clean while reusing the proven activation pipeline.
- Lets chat resources, extension loading, and discovery stay compatible with the current host architecture.
- Supports broken-session persistence because the dev-session record remains the source of truth.
- Keeps installs and attached folders separate in both storage and UI.

**Cons**
- Requires careful reconciliation so projected package paths never masquerade as installs.
- Needs a new overlay layer to inject session-specific UI mode / localhost remote data.

**Decision:** use this.

### 3. Build a shadow package / activation directory for every dev session

Copy or synthesize a normalized package under `~/.sero-ui/<profile>/agent/...` and activate that shadow path instead of the real checkout.

**Pros**
- Stronger isolation from arbitrary source trees.
- Could eventually support more normalization/build steps.

**Cons**
- Much more machinery than v1 needs.
- Makes file-watching, UI fallback, and “current source of truth” harder to explain.
- Risks reintroducing reinstall-like semantics.

**Decision:** defer. Keep the source checkout authoritative in v1.

## Recommended Approach

Introduce a new main-process subsystem under:

- `apps/desktop/electron/features/plugins/dev-sessions/`

This subsystem owns the full lifecycle for local plugin authoring.

### Key Decisions

- **Source of truth:** persist dev sessions under `settings.sero.pluginDev.sessions`, keyed by stable session ID.
- **Internal activation layer:** project only active dev-session source paths into `settings.packages`; never treat them as installed plugins.
- **Remote selection:** add `remoteEntryOverride` to `SeroAppManifest`; renderer prefers it before legacy `devPort` logic.
- **Dev-server runtime:** run plugin dev servers as **host-side child processes**, not workspace/container-managed dev servers.
- **Refresh:** use a debounced source watcher plus a targeted refresh pipeline; do not relaunch Electron or require reinstall.
- **Conflict policy:** fail closed before discovery shadowing by validating against built-ins, installed plugins, and other active dev sessions.
- **Attached folders:** rename UI/copy only; keep the existing `linked-plugin` root kind internal for now. Do not reuse roots for activation.
- **Out of scope adherence:** do **not** add “Attach folder to workspace” from the dev-session rows in this release.

## Architecture

### 1. Persisted Dev-Session Model

Persist dev sessions in the active profile’s `settings.json` under a dedicated namespace:

```json
{
  "sero": {
    "pluginDev": {
      "sessions": {
        "dev_9f3a7f2b": {
          "sessionId": "dev_9f3a7f2b",
          "sourcePath": "/Users/daniel/Code/sero-my-plugin",
          "expectedAppId": "my-plugin",
          "lastKnownName": "My Plugin",
          "status": "active",
          "uiMode": "dev-server",
          "lastError": null,
          "createdAt": "2026-04-19T20:00:00.000Z",
          "updatedAt": "2026-04-19T20:05:00.000Z"
        }
      }
    }
  }
}
```

Recommended persisted enums:

- `status`: `starting | active | needs-attention | broken`
- `uiMode`: `dev-server | built-fallback | backend-only | unavailable`

Important rules:

- **Stable session IDs** preserve recoverable metadata when the source folder breaks.
- `expectedAppId` is load-bearing. If the source folder later changes app IDs, that is **hard invalidity**, not silent migration.
- A manual **stop** may remove the record entirely; a **broken** session must stay persisted until retried or removed.
- Do not persist ephemeral child-process IDs or in-memory watcher handles.

### 2. Main-Process Modules

Create a dedicated folder to keep file sizes under control:

- `apps/desktop/electron/features/plugins/dev-sessions/types.ts`
- `apps/desktop/electron/features/plugins/dev-sessions/settings.ts`
- `apps/desktop/electron/features/plugins/dev-sessions/manifest.ts`
- `apps/desktop/electron/features/plugins/dev-sessions/conflicts.ts`
- `apps/desktop/electron/features/plugins/dev-sessions/activation.ts`
- `apps/desktop/electron/features/plugins/dev-sessions/dev-server.ts`
- `apps/desktop/electron/features/plugins/dev-sessions/watcher.ts`
- `apps/desktop/electron/features/plugins/dev-sessions/refresh.ts`
- `apps/desktop/electron/features/plugins/dev-sessions/manager.ts`

Recommended responsibilities:

| Module | Responsibility |
|---|---|
| `settings.ts` | read/write `settings.sero.pluginDev.sessions` using shared settings helpers |
| `manifest.ts` | read a source checkout’s package manifest, including raw `sero.app.devPort` |
| `conflicts.ts` | classify conflicts vs built-in apps, installed plugins, and active dev sessions |
| `activation.ts` | reconcile active session source paths into `settings.packages`; register/unregister `sero-ext` assets |
| `dev-server.ts` | host-side child-process start/stop/probe for `scripts.dev` + declared dev port |
| `watcher.ts` | recursive host FS watch + debounce per active session |
| `refresh.ts` | refresh pipeline, failure categorization, cache invalidation, targeted restarts |
| `manager.ts` | orchestration: initialize, start, list, refresh, stop, bootstrap on startup |

### 3. Discovery + Manifest Overlay

The current discovery pipeline should remain the scanner, but dev sessions need an overlay stage.

Recommended refactor:

1. Extract reusable manifest reading from `apps/desktop/electron/features/apps/discovery/index.ts` into a helper that can return:
   - `id`, `name`, `component`, `uiEntry`, `runtimeEntry`
   - raw declared `devPort`
   - plugin metadata / compatibility
2. Keep normal discovery scanning intact.
3. Add a dev-session overlay pass that, for active session paths:
   - sets `remoteEntryOverride` when a live dev server is healthy,
   - suppresses `component`/`uiEntry` when UI is unavailable,
   - preserves `component` with `sero-ext://` fallback when built assets exist,
   - leaves backend-only sessions with no UI surface.

Recommended `SeroAppManifest` addition:

```ts
export interface SeroAppManifest {
  // existing fields...
  remoteEntryOverride: string | null;
}
```

This keeps the renderer simple: it always receives the **effective** UI source for the current session state.

### 4. Activation Model

The dev-session record is the source of truth. Activation is an internal projection.

Recommended activation rules:

- On successful validation/startup, the manager projects `sourcePath` into `settings.packages`.
- On stop or broken deactivation, the manager removes that path from `settings.packages`.
- Projected source paths must never be surfaced by `listInstalledPlugins()` because that API only reads `~/.sero-ui/.../agent/packages/`.
- `registerExtAssets(manifest)` should be called for active sessions with usable built UI assets; `unregisterExtAssets(appId)` should be called when the session deactivates.

Why this is the right compromise:

- Pi’s resource loading already follows `settings.packages`.
- We keep the product boundary clean without rewriting extension/resource discovery.
- Active dev sessions can participate in prompts, skills, runtime entries, and tool bridging immediately.

### 5. Dev-Server Lifecycle

Do **not** reuse `startManagedDevServer()` or the container `DevServerRegistry` for v1.

Those systems are workspace/container scoped. Dev sessions are profile scoped and must work without attaching the folder to a workspace.

Recommended host-side manager behavior:

- eligibility = package has both:
  - `scripts.dev`
  - declared `sero.app.devPort`
- spawn from `sourcePath` using the host shell
- poll `http://127.0.0.1:<declaredDevPort>/mf-manifest.json` until healthy
- if healthy: mark `uiMode = 'dev-server'` and set `remoteEntryOverride`
- if start fails but `dist/ui/mf-manifest.json` exists: mark `uiMode = 'built-fallback'`
- if start fails and no usable UI exists but backend is still valid: mark `uiMode = 'unavailable'` and keep session active with `status = 'needs-attention'`
- if the plugin declares no UI at all: `uiMode = 'backend-only'`

Recommended shape:

```ts
export interface PluginDevServerResult {
  remoteEntryOverride: string | null;
  uiMode: 'dev-server' | 'built-fallback' | 'backend-only' | 'unavailable';
  error?: string | null;
}
```

### 6. Refresh Pipeline

Both manual refresh and file-watch refresh should call the same pipeline.

Recommended steps:

1. re-read and re-validate the source checkout,
2. classify failure as soft vs hard,
3. reconcile session projection in `settings.packages`,
4. update ext-asset registration,
5. clear manifest/provider/compatibility/CLI bridge caches,
6. `disposeAppSessionsForApp(appId)`,
7. `reloadAllSessionResources()`,
8. `appRuntimeManager.restartApp(appId)`,
9. broadcast a plugin-change event so the renderer invalidates/remounts the remote when needed.

Recommended cache clear calls mirror install/uninstall behavior:

- `clearAppManifestCache()`
- `clearPluginBridgePolicyCache()`
- `clearPackageCompatibilityCache()`
- `invalidatePackageProviderManifestCache()`

### 7. Failure Categorization

Use explicit categories so the lifecycle matches the spec:

| Failure | Classification | Runtime action |
|---|---|---|
| source folder missing | hard | deactivate + keep broken record |
| app ID drift vs `expectedAppId` | hard | deactivate + broken |
| conflict with built-in / install / active dev session | hard | deactivate + broken |
| invalid manifest that persists after revalidation retry | hard | deactivate + broken |
| temporary parse failure during save | soft initially | keep active, mark `needs-attention`, retry once |
| dev server start/health failure with built fallback | soft | stay active, fall back to built UI |
| dev server failure with no built UI but backend usable | soft | stay active, `uiMode = unavailable` |
| refresh exception while backend was previously valid | soft | keep last-known-good activation |

Implementation recommendation:

- first soft failure → keep current activation and show `needs-attention`
- only hard categories, or repeated invalid manifest after retry, should deactivate the session

### 8. Startup / Profile Lifecycle

On startup, `PluginDevSessionManager.initialize()` should:

1. load persisted session records,
2. validate each record,
3. project active sessions into `settings.packages`,
4. register ext assets for active sessions,
5. start watchers for active sessions,
6. kick off dev-server health/start asynchronously,
7. mark invalid sessions broken without blocking window creation.

Important race guard:

- `apps.discover` should idempotently await manager initialization before returning manifests, so the first renderer discovery sees the active sessions.
- `ensureInfra()` should initialize the dev-session manager **before** `appRuntimeManager.initialize()` so runtime discovery sees session-projected packages.

Profile switching needs no special migration work because SERO already restarts against a different `SERO_HOME`.

### 9. IPC + Renderer Bridge

Follow the four-layer rule exactly:

- React hook/component → typed renderer hook → preload bridge → main IPC handler → dev-session manager

Recommended new bridge surface on `window.sero.plugins`:

```ts
interface PluginDevSessionIPC {
  sessionId: string;
  appId: string | null;
  name: string | null;
  sourcePath: string;
  status: 'starting' | 'active' | 'needs-attention' | 'broken';
  uiMode: 'dev-server' | 'built-fallback' | 'backend-only' | 'unavailable';
  remoteEntryOverride: string | null;
  lastError: string | null;
  updatedAt: string;
}

interface SeroPluginsBridge {
  listDevSessions(): Promise<PluginDevSessionIPC[]>;
  startDevSession(sourcePath?: string): Promise<PluginDevSessionIPC | null>;
  refreshDevSession(sessionId: string): Promise<PluginDevSessionIPC>;
  stopDevSession(sessionId: string): Promise<void>;
}
```

Use new extracted type files because:

- `apps/desktop/src/types/ipc.ts` is already **471 LOC**
- `packages/common/src/admin-bridge.ts` is already **350 LOC**

### 10. Renderer Remote Resolution

Update the federation registry to prefer explicit session overrides.

Recommended candidate order:

```ts
function getRemoteEntryCandidates(manifest: Pick<SeroAppManifest, 'id' | 'devPort' | 'remoteEntryOverride'>): string[] {
  if (manifest.remoteEntryOverride) {
    return [manifest.remoteEntryOverride, `sero-ext://${manifest.id}/mf-manifest.json`];
  }

  if (process.env.NODE_ENV === 'development' && manifest.devPort) {
    return [
      `http://localhost:${manifest.devPort}/mf-manifest.json`,
      `sero-ext://${manifest.id}/mf-manifest.json`,
    ];
  }

  return [`sero-ext://${manifest.id}/mf-manifest.json`];
}
```

Also update callers that currently pass `(appId, component, devPort)` so widgets and app mounts both honor the new manifest field.

### 11. Admin UI Structure

`plugins/sero-admin-plugin/ui/components/PluginsPanel.tsx` is already at the file-size limit, so do **not** extend it in place.

Recommended split:

- `plugins/sero-admin-plugin/ui/components/plugins/PluginsPanel.tsx` — container only
- `.../InstalledPluginsSection.tsx`
- `.../LocalPluginDevelopmentSection.tsx`
- `.../AttachedFoldersSection.tsx`
- `.../PluginDevSessionCard.tsx`
- `plugins/sero-admin-plugin/ui/hooks/usePluginDevSessions.ts`
- optionally `plugins/sero-admin-plugin/ui/hooks/useAttachedFolders.ts` as a renamed wrapper around the existing linked-roots logic

UI requirements:

- show **Installed Plugins**, **Local Plugin Development**, and **Attached folders** as separate concepts
- local dev rows show:
  - name / app ID / source path
  - status badge
  - UI mode badge
  - last error when present
  - actions: refresh/retry, stop/remove, reveal folder
- explain profile scope inline
- explicitly say attaching a folder is **not required** for activation
- do not add the out-of-scope attach-folder convenience action in this section

## File-Level Integration Points

### New main-process files

- `apps/desktop/electron/features/plugins/dev-sessions/types.ts`
- `apps/desktop/electron/features/plugins/dev-sessions/settings.ts`
- `apps/desktop/electron/features/plugins/dev-sessions/manifest.ts`
- `apps/desktop/electron/features/plugins/dev-sessions/conflicts.ts`
- `apps/desktop/electron/features/plugins/dev-sessions/activation.ts`
- `apps/desktop/electron/features/plugins/dev-sessions/dev-server.ts`
- `apps/desktop/electron/features/plugins/dev-sessions/watcher.ts`
- `apps/desktop/electron/features/plugins/dev-sessions/refresh.ts`
- `apps/desktop/electron/features/plugins/dev-sessions/manager.ts`

### Existing main-process files to extend

- `apps/desktop/electron/features/apps/discovery/index.ts`
- `apps/desktop/electron/features/plugins/install-policy.ts`
- `apps/desktop/electron/features/apps/runtime/manager.ts`
- `apps/desktop/electron/ipc/integrations/plugins.ts`
- `apps/desktop/electron/ipc/apps/apps.ts`
- `apps/desktop/electron/preload/integrations/plugins.ts`
- `apps/desktop/electron/shared/infra/singletons.ts`
- `apps/desktop/electron/shared/infra/shared-infra.ts`
- `apps/desktop/electron/platform/protocols/ext-protocol.ts` (integration points; likely no deep rewrite)

### Existing renderer/shared files to extend

- `apps/desktop/src/lib/federation-registry.ts`
- `apps/desktop/src/stores/app/discovery.ts`
- `apps/desktop/src/stores/app/state.ts`
- `apps/desktop/src/stores/dashboard.ts`
- `apps/desktop/src/components/apps/SeroAppMount.tsx`
- `apps/desktop/src/components/apps/dashboard/WidgetMount.tsx` (if needed)
- `apps/desktop/src/types/sero-apps.ts`
- `apps/desktop/src/types/plugins.ts`
- `apps/desktop/src/types/ipc.ts` (via extracted re-exports)
- `apps/desktop/src/types/electron.d.ts`
- `packages/common/src/admin-bridge.ts`
- `packages/common/src/index.ts`

### Admin UI files to split/update

- `plugins/sero-admin-plugin/ui/components/PluginsPanel.tsx`
- `plugins/sero-admin-plugin/ui/hooks/usePlugins.ts`
- `plugins/sero-admin-plugin/ui/hooks/useLinkedRoots.ts`
- `plugins/sero-admin-plugin/ui/hooks/host.ts`
- `apps/desktop/src/components/apps/explorer/file-tree/MultiRootFileTree.tsx`

## Sequencing

### Phase 1 — Type + discovery contract

Ship the new shared types, manifest overlay contract, and renderer remote override support first. This creates the rails for the rest of the feature.

### Phase 2 — Main-process dev-session lifecycle

Add persistence, validation, projection, install conflict blocking, startup bootstrap, and targeted runtime restart.

### Phase 3 — Host-side dev server + refresh/watchers

Add host child-process management, fallback logic, watcher-driven refresh, and failure categorization.

### Phase 4 — Admin UI + terminology cleanup

Split the Plugins panel, add Local Plugin Development UI, and rename linked-root copy to Attached folders.

### Phase 5 — Docs + tests

Land thorough main-process and renderer coverage, then document the feature and author workflow.

## File-Size / Refactor Notes

These files are already at or near the repo limit and should be split instead of inflated:

- `plugins/sero-admin-plugin/ui/components/PluginsPanel.tsx` — **500 LOC now**
- `apps/desktop/src/types/ipc.ts` — **471 LOC now**
- `apps/desktop/electron/features/plugins/manager.ts` — **458 LOC now**
- `apps/desktop/src/lib/federation-registry.ts` — **313 LOC**, but likely to grow significantly

Recommended refactors while implementing:

- extract plugin-dev IPC types into new `plugin-dev.ts` files in both renderer + common packages
- extract discovery manifest parsing / overlay helpers if `features/apps/discovery/index.ts` starts to bloat
- split Admin UI into section components immediately instead of after the fact

## Risks & Premortem

### Riskiest Assumptions

| Assumption | If Wrong |
|---|---|
| Projecting active dev-session source paths into `settings.packages` is sufficient for resource loading without polluting install semantics | We would need a deeper custom resource-loader hook, which is much more invasive |
| Host-side child processes are enough for plugin UI dev servers | We may need to generalize the dev-server subsystem to support non-workspace runtimes |
| Suppressing `component` when UI is unavailable is an acceptable v1 UX | We may need a dedicated “UI unavailable” app placeholder screen |
| A retry-once strategy is enough to distinguish transient manifest save blips from hard invalidity | We may need a more explicit confirmation timer/state machine |
| Startup initialization can happen fast enough without blocking the window | We may need a two-stage bootstrap where discovery waits on metadata but not on dev-server health |

### Realistic Failure Modes

- **Built the wrong internal model** — dev sessions accidentally behave like installs because projection and UI boundaries drift.
- **Works for healthy repos, fails for broken ones** — missing-folder and app-ID-drift recovery semantics are under-tested.
- **Renderer/main divergence** — discovery, federation registry, and Admin UI disagree about the current UI mode.
- **Refresh too destructive** — every file save tears down runtimes or app sessions even for UI-only edits.
- **Startup race** — the first `apps.discover` call happens before dev sessions are projected, causing flicker or missing apps.

### Accepted Mitigations

- Keep the dev-session record as the source of truth and only use `settings.packages` as an internal projection.
- Add a dedicated `remoteEntryOverride` contract so discovery and federation use the same source of truth.
- Keep host-managed dev servers local to this subsystem in v1; do not broaden the workspace/container dev-server system unless forced.
- Add targeted runtime restart + cache invalidation instead of full app relaunches.
- Gate startup discovery on idempotent dev-session initialization.

## Verification Matrix

| Scenario | Automated target | Relevant ISC |
|---|---|---|
| start valid dev session from local folder | main-process manager + IPC test | ISC-2, ISC-3, ISC-4 |
| dev session does not appear in installed list | Admin/render + listInstalledPlugins test | ISC-5, ISC-A-1 |
| attached-folder wording is separated from activation wording | Admin/render copy test | ISC-6, ISC-A-2 |
| live dev server becomes preferred UI source | discovery/federation test | ISC-7, ISC-8, ISC-A-3 |
| dev server fails and built UI fallback is used | manager + renderer test | ISC-9, ISC-17 |
| backend-only / UI-unavailable session stays active | manager/discovery/UI test | ISC-10, ISC-12, ISC-18 |
| watcher triggers auto refresh | watcher/refresh test | ISC-11 |
| app ID conflicts fail closed | conflict + install-policy tests | ISC-13, ISC-14, ISC-21 |
| broken session persists across restart | settings/bootstrap tests | ISC-15, ISC-16 |
| transient failure does not deactivate | refresh categorization tests | ISC-19 |
| confirmed hard invalidity deactivates | refresh + startup tests | ISC-20 |
| profile switch isolates sessions | profile-scoped settings/bootstrap test | ISC-A-4, ISC-A-5 |

## Dependencies

- Existing activation pattern: `apps/desktop/electron/features/plugins/activation.ts`
- Existing install conflict surface: `apps/desktop/electron/features/plugins/install-policy.ts`
- Existing runtime lifecycle: `apps/desktop/electron/features/apps/runtime/manager.ts`
- Existing remote registry: `apps/desktop/src/lib/federation-registry.ts`
- Existing Admin bridge: `packages/common/src/admin-bridge.ts`
- Existing Admin plugin patterns: `plugins/sero-admin-plugin/ui/hooks/usePlugins.ts`
- Existing file-watch debounce pattern: `apps/desktop/electron/features/workspace/watcher.ts`
- Existing plugin install/update cache invalidation pattern: `apps/desktop/electron/features/plugins/manager.ts`

## Implementation Todos

> The structured todo tool is not available in this planner session, so the worker backlog is embedded here as executable markdown todos.
>
> **Rule for every todo:** keep dev sessions distinct from installs and Attached folders; honor the four-layer IPC rule; keep all touched source files under 500 LOC.

### LPD-01 — Add shared plugin-dev types and the manifest remote-override contract
- **Plan artifact:** `.pi/plans/2026-04-19-local-plugin-dev-sessions/plan.md`
- **Status:** completed (2026-04-19)
- **Files:**
  - new `packages/common/src/plugin-dev.ts`
  - `packages/common/src/admin-bridge.ts`
  - `packages/common/src/index.ts`
  - new `apps/desktop/src/types/plugin-dev.ts`
  - `apps/desktop/src/types/sero-apps.ts`
  - `apps/desktop/src/types/plugins.ts`
  - `apps/desktop/src/types/ipc.ts`
  - `apps/desktop/src/types/electron.d.ts`
- **Reference code:** follow the extracted-type pattern already used in `apps/desktop/src/types/ipc.ts` (`subagent`, `skills`, etc.) and the bridge typing style in `packages/common/src/admin-bridge.ts`.
- **Expected shape:**
  ```ts
  export type PluginDevSessionStatus = 'starting' | 'active' | 'needs-attention' | 'broken';
  export type PluginDevSessionUiMode = 'dev-server' | 'built-fallback' | 'backend-only' | 'unavailable';

  export interface PluginDevSessionIPC {
    sessionId: string;
    appId: string | null;
    name: string | null;
    sourcePath: string;
    status: PluginDevSessionStatus;
    uiMode: PluginDevSessionUiMode;
    remoteEntryOverride: string | null;
    lastError: string | null;
    updatedAt: string;
  }

  export interface SeroAppManifest {
    remoteEntryOverride: string | null;
  }
  ```
- **Constraints:** extract into new files rather than bloating `ipc.ts`; keep types renderer-safe; distinguish backend-only from UI-unavailable explicitly.
- **Do NOT:**
  - **Anti-pattern: Type Creep in `ipc.ts`** — do not inline another 100+ LOC into the existing near-limit file.
  - **Anti-pattern: Hidden UI States** — do not collapse backend-only and unavailable UI into the same enum value.
- **Acceptance:** type surface supports the UI/source distinctions required by ISC-8, ISC-9, ISC-10, ISC-15, ISC-18; touched source files stay under 500 LOC.

### LPD-02 — Build dev-session settings persistence and startup manager skeleton
- **Plan artifact:** `.pi/plans/2026-04-19-local-plugin-dev-sessions/plan.md`
- **Status:** completed (2026-04-19)
- **Files:**
  - new `apps/desktop/electron/features/plugins/dev-sessions/types.ts`
  - new `apps/desktop/electron/features/plugins/dev-sessions/settings.ts`
  - new `apps/desktop/electron/features/plugins/dev-sessions/manager.ts`
  - `apps/desktop/electron/shared/infra/singletons.ts`
  - `apps/desktop/electron/shared/infra/shared-infra.ts`
  - `apps/desktop/electron/ipc/apps/apps.ts`
- **Reference code:** initialization/idempotency pattern from `apps/desktop/electron/features/apps/runtime/manager.ts`; settings helpers in `apps/desktop/electron/shared/settings/settings-helpers.ts`.
- **Expected shape:**
  ```ts
  export class PluginDevSessionManager {
    private initialized = false;
    private initializationTask: Promise<void> | null = null;

    async initialize(): Promise<void> { /* idempotent bootstrap */ }
    async list(): Promise<PluginDevSessionRecord[]> { /* ... */ }
  }
  ```
- **Constraints:** store records under `settings.sero.pluginDev.sessions`; stable `sessionId` is the key; initialization must be safe to call from both `ensureInfra()` and `apps.discover()`.
- **Do NOT:**
  - **Anti-pattern: Settings Root Pollution** — do not store session records in top-level `settings.packages` or install metadata.
  - **Anti-pattern: Workspace Masquerade** — do not put dev-session state into workspace roots/config.
- **Acceptance:** startup can load persisted dev-session records without activating installs or roots; foundation supports ISC-4, ISC-15, ISC-16, ISC-A-1, ISC-A-5.

### LPD-03 — Implement manifest validation, conflict classification, and active-session projection
- **Plan artifact:** `.pi/plans/2026-04-19-local-plugin-dev-sessions/plan.md`
- **Status:** completed (2026-04-19)
- **Files:**
  - new `apps/desktop/electron/features/plugins/dev-sessions/manifest.ts`
  - new `apps/desktop/electron/features/plugins/dev-sessions/conflicts.ts`
  - new `apps/desktop/electron/features/plugins/dev-sessions/activation.ts`
  - `apps/desktop/electron/features/plugins/install-policy.ts`
  - `apps/desktop/electron/features/apps/discovery/index.ts`
  - `apps/desktop/electron/platform/protocols/ext-protocol.ts`
- **Reference code:**
  - installed-plugin settings reconciliation in `apps/desktop/electron/features/plugins/activation.ts`
  - plugin folder validation in `apps/desktop/electron/features/workspace/plugin-validation.ts`
  - install conflict guard in `apps/desktop/electron/features/plugins/install-policy.ts`
- **Expected shape:**
  ```ts
  export interface PluginDevConflict {
    kind: 'built-in-app' | 'installed-plugin' | 'active-dev-session';
    appId: string;
    ownerPath?: string;
    ownerSessionId?: string;
    message: string;
  }

  export async function reconcileActiveDevSessionPackages(activeSourcePaths: string[]): Promise<void> {
    // remove known dev-session paths, append active ones, preserve unrelated packages
  }
  ```
- **Constraints:** classify conflict owner clearly; only active sessions are projected into `settings.packages`; inactive/broken records stay visible but unprojected; register/unregister ext assets for active sessions.
- **Do NOT:**
  - **Anti-pattern: Discovery Shadowing as Policy** — do not rely on last-wins dedupe to resolve dev-session conflicts.
  - **Anti-pattern: `registerAppPath()` Activation** — do not use transient registered paths as the source of truth for dev sessions.
- **Acceptance:** start/install conflicts fail closed with explicit owner messaging; active dev sessions are discoverable without appearing in installed-plugin lists; covers ISC-3, ISC-5, ISC-13, ISC-14, ISC-21, ISC-A-1, ISC-A-2, ISC-A-4.

### LPD-04 — Add host-side dev-server lifecycle and UI-mode resolution for sessions
- **Plan artifact:** `.pi/plans/2026-04-19-local-plugin-dev-sessions/plan.md`
- **Status:** completed (2026-04-19)
- **Files:**
  - new `apps/desktop/electron/features/plugins/dev-sessions/dev-server.ts`
  - `apps/desktop/electron/features/plugins/dev-sessions/manager.ts`
  - `apps/desktop/electron/features/plugins/dev-sessions/manifest.ts`
- **Reference code:**
  - command detection in `apps/desktop/electron/features/workspace/runtime/verification.ts`
  - start/fallback shape in `apps/desktop/electron/features/workspace/runtime/start-managed-dev-server.ts`
- **Expected shape:**
  ```ts
  const result = await ensurePluginDevServer({
    sourcePath,
    declaredDevPort,
    command: 'pnpm run dev',
  });

  // => { remoteEntryOverride: 'http://127.0.0.1:5193/mf-manifest.json', uiMode: 'dev-server' }
  ```
- **Constraints:** start dev servers from the host `sourcePath`; use declared `sero.app.devPort` + `scripts.dev`; fall back to built UI or unavailable UI without deactivating backend-only/usable sessions.
- **Do NOT:**
  - **Anti-pattern: Container-Coupled Dev Sessions** — do not route these through workspace containers or `startManagedDevServer()`.
  - **Anti-pattern: Dev-Env Gate** — do not require `NODE_ENV === 'development'` or `SERO_DEV_PLUGINS`.
- **Acceptance:** managed local UI startup/fallback supports ISC-7, ISC-8, ISC-9, ISC-10, ISC-17, ISC-18, ISC-A-3.

### LPD-05 — Implement watcher-driven refresh, soft/hard invalidity handling, and targeted runtime restart
- **Plan artifact:** `.pi/plans/2026-04-19-local-plugin-dev-sessions/plan.md`
- **Status:** completed (2026-04-19)
- **Files:**
  - new `apps/desktop/electron/features/plugins/dev-sessions/watcher.ts`
  - new `apps/desktop/electron/features/plugins/dev-sessions/refresh.ts`
  - `apps/desktop/electron/features/plugins/dev-sessions/manager.ts`
  - `apps/desktop/electron/features/apps/runtime/manager.ts`
  - `apps/desktop/electron/ipc/integrations/plugins.ts`
- **Reference code:**
  - recursive watch/debounce pattern in `apps/desktop/electron/features/workspace/watcher.ts`
  - cache invalidation/install lifecycle in `apps/desktop/electron/features/plugins/manager.ts`
  - runtime lifecycle in `apps/desktop/electron/features/apps/runtime/manager.ts`
- **Expected shape:**
  ```ts
  await refreshPluginDevSession(sessionId, { reason: 'file-change' });
  await appRuntimeManager.restartApp(appId);
  ```
- **Constraints:** use one refresh pipeline for manual + automatic refresh; keep last-known-good activation on soft failure; only deactivate on confirmed hard invalidity; add a targeted `restartApp(appId)` API instead of forcing full `reconcile()` or app relaunches.
- **Do NOT:**
  - **Anti-pattern: Full-App Restart on Save** — do not relaunch Electron to refresh a session.
  - **Anti-pattern: First-Failure Tear-Down** — do not break an active session on the first transient parse/dev-server blip.
- **Acceptance:** automatic refresh attempts exist and preserve working sessions through transient issues while deactivating on hard invalidity; covers ISC-11, ISC-17, ISC-19, ISC-20.

### LPD-06 — Expose dev-session CRUD over typed plugin IPC and bridge events into the renderer
- **Plan artifact:** `.pi/plans/2026-04-19-local-plugin-dev-sessions/plan.md`
- **Status:** completed (2026-04-19)
- **Files:**
  - `apps/desktop/src/types/ipc-channels.ts`
  - `apps/desktop/electron/ipc/integrations/plugins.ts`
  - `apps/desktop/electron/preload/integrations/plugins.ts`
  - `packages/common/src/admin-bridge.ts`
  - `plugins/sero-admin-plugin/ui/hooks/host.ts`
  - `apps/desktop/src/types/electron.d.ts`
  - `apps/desktop/src/types/plugins.ts`
- **Reference code:** existing plugin bridge in `apps/desktop/electron/preload/integrations/plugins.ts` and handler registration in `apps/desktop/electron/ipc/integrations/plugins.ts`.
- **Expected shape:**
  ```ts
  ipcMain.handle(IpcChannels.plugins.listDevSessions, async () => pluginDevSessionManager.list());
  ipcMain.handle(IpcChannels.plugins.startDevSession, async (_e, sourcePath?: string) => pluginDevSessionManager.start(sourcePath));
  ```
- **Constraints:** use the existing `window.sero.plugins` namespace; add a generic plugin change event variant that can represent dev-session start/refresh/stop; keep the preload bridge typed.
- **Do NOT:**
  - **Anti-pattern: IPC Shortcutting** — do not call `ipcRenderer.invoke(...)` directly from federated UI components; go through `getSero()`.
  - **Anti-pattern: Ad-hoc DOM Events as Source of Truth** — do not invent a second plugin-change channel outside `IpcChannels.plugins.event`.
- **Acceptance:** renderer can list/start/refresh/stop dev sessions over typed IPC and receives push events for app-store refresh; supports ISC-1, ISC-2, ISC-4, ISC-15, ISC-21.

### LPD-07 — Update renderer remote loading and app-store refresh logic to use `remoteEntryOverride`
- **Plan artifact:** `.pi/plans/2026-04-19-local-plugin-dev-sessions/plan.md`
- **Status:** completed (2026-04-19)
- **Files:**
  - `apps/desktop/src/lib/federation-registry.ts`
  - `apps/desktop/src/stores/app/discovery.ts`
  - `apps/desktop/src/stores/app/state.ts`
  - `apps/desktop/src/stores/dashboard.ts`
  - `apps/desktop/src/components/apps/SeroAppMount.tsx`
  - `apps/desktop/src/components/apps/dashboard/WidgetMount.tsx`
- **Reference code:**
  - current remote-candidate logic in `apps/desktop/src/lib/federation-registry.ts`
  - plugin-change refresh flow in `apps/desktop/src/stores/app/discovery.ts`
- **Expected shape:**
  ```ts
  const candidates = manifest.remoteEntryOverride
    ? [manifest.remoteEntryOverride, `sero-ext://${manifest.id}/mf-manifest.json`]
    : legacyCandidates(manifest);
  ```
- **Constraints:** prefer `remoteEntryOverride` in every environment; keep legacy `devPort` behavior only for monorepo dev; if the effective manifest suppresses `component`, render the existing placeholder instead of trying to lazy-load a dead remote.
- **Do NOT:**
  - **Anti-pattern: Production Dev Sessions Behind `NODE_ENV`** — do not hide dev-session remotes behind the old development-only branch.
  - **Anti-pattern: Renderer-Side Conflict Logic** — do not re-infer dev-session state from URL heuristics in the renderer.
- **Acceptance:** active sessions clearly use live or fallback UI sources as exposed by discovery; renderer hot-refresh flow supports ISC-8, ISC-9, ISC-10, ISC-17, ISC-18, ISC-A-3.

### LPD-08 — Split the Admin Plugins screen and add the Local Plugin Development section
- **Plan artifact:** `.pi/plans/2026-04-19-local-plugin-dev-sessions/plan.md`
- **Files:**
  - `plugins/sero-admin-plugin/ui/components/PluginsPanel.tsx` (split/shrink)
  - new `plugins/sero-admin-plugin/ui/components/plugins/InstalledPluginsSection.tsx`
  - new `plugins/sero-admin-plugin/ui/components/plugins/LocalPluginDevelopmentSection.tsx`
  - new `plugins/sero-admin-plugin/ui/components/plugins/AttachedFoldersSection.tsx`
  - new `plugins/sero-admin-plugin/ui/components/plugins/PluginDevSessionCard.tsx`
  - new `plugins/sero-admin-plugin/ui/hooks/usePluginDevSessions.ts`
  - `plugins/sero-admin-plugin/ui/hooks/usePlugins.ts`
- **Reference code:** card/layout patterns in the current `plugins/sero-admin-plugin/ui/components/PluginsPanel.tsx` and async hook pattern in `plugins/sero-admin-plugin/ui/hooks/usePlugins.ts`.
- **Expected shape:**
  ```tsx
  <InstalledPluginsSection ... />
  <LocalPluginDevelopmentSection
    sessions={sessions}
    onStart={startDevSession}
    onRefresh={refreshDevSession}
    onStop={stopDevSession}
  />
  <AttachedFoldersSection ... />
  ```
- **Constraints:** split because `PluginsPanel.tsx` is already 500 LOC; Local Plugin Development must be visually separate from Installed Plugins and Attached folders; show profile-scope help copy; no attach-folder action in this section for v1.
- **Do NOT:**
  - **Anti-pattern: One Giant Panel File** — do not keep extending the existing 500-line component.
  - **Anti-pattern: Install/Dev Conflation** — do not reuse installed-plugin cards or copy for dev sessions.
- **Acceptance:** Admin has a dedicated Local Plugin Development section and dev sessions are not shown as installs; supports ISC-1, ISC-2, ISC-5, ISC-8, ISC-9, ISC-10, ISC-15, ISC-16, ISC-A-1, ISC-A-2, ISC-A-6.

### LPD-09 — Rename linked-root product wording to Attached folders while keeping root semantics unchanged
- **Plan artifact:** `.pi/plans/2026-04-19-local-plugin-dev-sessions/plan.md`
- **Files:**
  - `plugins/sero-admin-plugin/ui/hooks/useLinkedRoots.ts` (or new `useAttachedFolders.ts` wrapper)
  - `plugins/sero-admin-plugin/ui/components/plugins/AttachedFoldersSection.tsx`
  - `apps/desktop/src/components/apps/explorer/file-tree/MultiRootFileTree.tsx`
  - `apps/desktop/electron/cli/commands/workspace/workspace.ts` (user-facing wording only)
  - relevant user-facing copy/comments touched by the new UI
- **Reference code:** existing linked-roots hook and `MultiRootFileTree.tsx` badge handling.
- **Expected shape:**
  ```tsx
  <p>Attached folders</p>
  <Badge>attached</Badge>
  ```
- **Constraints:** only change user-facing language and hook/component naming; the underlying `kind: 'linked-plugin'` discriminant may remain internal for v1; explicitly state that attachment is explorer visibility only, not activation.
- **Do NOT:**
  - **Anti-pattern: Semantic Reuse** — do not turn attached folders into dev-session activation.
  - **Anti-pattern: Type Churn Without Value** — do not rename the persisted root discriminant unless required by implementation.
- **Acceptance:** plugin-workspace wording is renamed to Attached folders and no longer implies activation; covers ISC-6 and ISC-A-2.

### LPD-10 — Document the feature and the author workflow
- **Plan artifact:** `.pi/plans/2026-04-19-local-plugin-dev-sessions/plan.md`
- **Files:**
  - new `docs/features/local-plugin-development.md`
  - `docs/plugins/guide.md`
  - optional small note in `docs/features/sero-apps.md` if app discovery/runtime semantics need mention
- **Reference code:** doc structure in `docs/features/memory.md` and plugin author guidance in `docs/plugins/guide.md`.
- **Expected shape:**
  ```md
  ## Local Plugin Development
  - distinct from Installed Plugins
  - distinct from Attached folders
  - profile-scoped
  - live dev server vs built fallback vs no UI
  ```
- **Constraints:** document profile scope, recovery states, and fallback behavior; explicitly say production local authoring does not rely on `SERO_DEV_PLUGINS`.
- **Do NOT:**
  - **Anti-pattern: Dev-Only Documentation** — do not document this as a monorepo-only or experimental flow.
  - **Anti-pattern: Attached-Folder Confusion** — do not describe folder attachment as a prerequisite for activation.
- **Acceptance:** docs cover the user-facing distinction required by ISC-1, ISC-6, ISC-A-2, ISC-A-3, ISC-A-5.

### LPD-11 — Add main-process tests for lifecycle, conflicts, fallback, and refresh
- **Plan artifact:** `.pi/plans/2026-04-19-local-plugin-dev-sessions/plan.md`
- **Files:**
  - new `apps/desktop/electron/__tests__/features/plugins/dev-sessions/*.test.ts`
  - `apps/desktop/electron/__tests__/features/apps/app-discovery.test.ts`
  - `apps/desktop/electron/__tests__/features/plugins/plugin-manager.test.ts`
  - `apps/desktop/electron/__tests__/features/apps/runtime/manager.test.ts`
- **Reference code:**
  - install/discovery patterns in `plugin-manager.test.ts`
  - discovery manifest assertions in `app-discovery.test.ts`
  - runtime lifecycle tests in `features/apps/runtime/manager.test.ts`
- **Expected coverage:**
  - bootstrap active vs broken sessions on startup
  - conflict owner classification and install blocking
  - app-ID drift handling
  - missing-folder persistence
  - dev-server fallback to built UI / unavailable UI
  - watcher refresh soft vs hard failure behavior
  - targeted runtime restart invoked on refresh
- **Do NOT:**
  - **Anti-pattern: Happy-Path-Only Coverage** — do not stop at “start session works”.
  - **Anti-pattern: Monolithic E2E Dependence** — do not rely only on manual testing for conflict and invalidity cases.
- **Acceptance:** automated coverage proves ISC-3, ISC-13, ISC-14, ISC-15, ISC-16, ISC-17, ISC-19, ISC-20, ISC-21.

### LPD-12 — Add renderer/Admin tests for remote override behavior and UI separation
- **Plan artifact:** `.pi/plans/2026-04-19-local-plugin-dev-sessions/plan.md`
- **Files:**
  - `apps/desktop/src/stores/app.test.ts`
  - new `apps/desktop/src/lib/federation-registry.test.ts` cases if needed
  - new `plugins/sero-admin-plugin/ui/hooks/usePluginDevSessions.test.tsx`
  - new `plugins/sero-admin-plugin/ui/components/plugins/*.test.tsx` or focused helper tests under `ui/lib/`
- **Reference code:** renderer store/event tests in `apps/desktop/src/stores/app.test.ts`; UI helper tests in `plugins/sero-admin-plugin/ui/lib/plugins.test.ts`.
- **Expected coverage:**
  - plugin-change event triggers rediscovery for dev-session updates
  - `remoteEntryOverride` wins over legacy devPort candidates
  - Admin renders Local Plugin Development / Installed Plugins / Attached folders distinctly
  - UI mode badges map correctly for dev server / fallback / backend-only / unavailable
- **Do NOT:**
  - **Anti-pattern: Untested Event Drift** — do not change plugin event semantics without store tests.
  - **Anti-pattern: Snapshot-Only UI Testing** — assert the actual labels/actions/status text, not just rendered trees.
- **Acceptance:** renderer/Admin coverage supports ISC-1, ISC-5, ISC-6, ISC-8, ISC-9, ISC-10, ISC-11.

## Final Notes for Workers

- Keep dev-session lifecycle code under `features/plugins/dev-sessions/`; do not scatter ownership across install, workspace-root, and renderer modules.
- Do not widen the workspace/container dev-server subsystem unless the host-process approach proves insufficient.
- If `apps/desktop/electron/features/apps/discovery/index.ts` starts trending toward 500 LOC, extract manifest parsing or overlay helpers immediately.
- Run `pnpm typecheck` from the repo root after each major slice, and keep every touched source file under 500 LOC.
- The remaining product-copy choices are small and non-blocking: the exact degraded label (“Needs attention” is the recommended default), whether toasts accompany fallback transitions (inline status is sufficient for v1), and the final help-copy wording for profile scope.
