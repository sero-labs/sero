---
title: Local Plugin Dev Sessions Plan
date: 2026-04-19
status: proposed
author: OpenAI
related:
  - apps/desktop/electron/features/plugins/manager.ts
  - apps/desktop/electron/features/plugins/activation.ts
  - apps/desktop/electron/features/apps/discovery/index.ts
  - apps/desktop/electron/platform/protocols/ext-protocol.ts
  - apps/desktop/electron/ipc/integrations/plugins.ts
  - apps/desktop/electron/features/apps/runtime/manager.ts
  - apps/desktop/src/lib/federation-registry.ts
  - apps/desktop/src/stores/app/discovery.ts
  - plugins/sero-admin-plugin/ui/components/PluginsPanel.tsx
  - plugins/sero-admin-plugin/ui/hooks/useLinkedRoots.ts
  - packages/common/src/admin-bridge.ts
  - docs/plugins/guide.md
  - docs/plugins/technical.md
  - docs/plans/2026-04-10-multi-root-workspaces-for-plugin-dev.md
---

# Local Plugin Dev Sessions Plan

## Summary

Replace the earlier “linked source plugin” direction with a clearer model:

- **Attached folders** = generic multi-root workspace folders for explorer visibility
- **Plugin dev sessions** = profile-scoped local plugin authoring lifecycle
- **Installed plugins** = normal package installation lifecycle

This plan treats local plugin development as its **own product concept**, not as a variant of install and not as a variant of multi-root workspaces.

## Why replace the earlier plan

The previous plan mixed three separate concerns into one feature:

1. plugin activation
2. source-checkout visibility in the explorer
3. live-reload / dev-server behavior

That made the terminology confusing:

- “linked plugin folders” originally meant a workspace/explorer concept
- the new feature needed a plugin-runtime/dev concept
- the same word “linked” was being asked to describe both

This replacement plan separates them explicitly.

## Goal

Enable a plugin author to run **production Sero** and still:

- choose a local plugin checkout
- activate it as a dev plugin for the current profile
- use a UI dev server with HMR when available
- refresh tools / prompts / skills / runtimes **without reinstalling**
- optionally open the checkout in the explorer as an **Attached folder**

## Product terminology

### Attached folders

Use **Attached folders** as the product term for multi-root workspaces.

Attached folders are:

- generic workspace folders
- about explorer/editor/container visibility
- optional for plugin development

Attached folders are **not** plugin activation.

### Plugin dev session

Use **plugin dev session** as the product term for local plugin authoring.

A plugin dev session is:

- profile-scoped
- tied to one local plugin checkout
- responsible for activation, validation, status, refresh, and UI dev overrides
- independent from whether the folder is attached to a workspace

### Installed plugin

Keep the existing install model unchanged:

- npm / git / local install
- copied/prepared package lifecycle
- managed under the profile agent directory

## Non-goals

- Reusing “Attached folders” as plugin activation terminology
- Making local dev plugins appear as normal installed plugins
- Requiring a workspace attachment just to develop a plugin
- Depending on `SERO_DEV_PLUGINS` for local plugin authoring
- Full universal HMR for every plugin surface in v1

## Design principles

### 1. Keep activation separate from visibility

A plugin can be in active development without being attached to the explorer.

### 2. Keep dev separate from install

“Installed plugin” and “Develop local plugin” must remain distinct user actions with distinct status and failure modes.

### 3. Support production-mode local UI development explicitly

Local plugin UI development in production Sero must be an explicit runtime feature, not an environment-variable hack.

### 4. Be honest about reload semantics

For UI, true HMR is realistic.
For tools / prompts / skills / runtimes, the target is:

- no reinstall
- automatic or one-click refresh
- targeted restart where needed

not “magic zero-restart HMR for everything”.

## Recommended user experience

## New Admin section: Plugin Development

Add a dedicated section in Admin separate from installs and separate from Attached folders.

Primary action:

- **Develop local plugin…**

Each active dev session shows:

- plugin name
- app ID
- source path
- UI mode
  - Dev server active
  - Built UI fallback
  - No UI
- status
  - Active
  - Starting
  - Needs refresh
  - Broken
- actions
  - Open checkout
  - Refresh plugin backend
  - Stop developing
  - Attach folder to workspace

## Intended flow

1. User clicks **Develop local plugin…**
2. User picks a local plugin folder.
3. Sero validates `package.json`, `sero.app`, and dev-session conflict rules.
4. Sero creates a profile-scoped dev session.
5. If the plugin supports a UI dev server, Sero starts or reuses it from the real checkout.
6. Sero activates the plugin for the current profile.
7. The app appears immediately in Sero.
8. The user may optionally choose **Attach folder to workspace** to open the checkout in the explorer.

## Core model

A plugin dev session is the source of truth for local plugin development.

It should not be modeled as:

- an installed plugin
- an Attached folder
- a hidden “special case” of `settings.packages`

Those may be used internally, but the public/product model is the dev session.

## Persistence model

Persist dev sessions in the active profile’s:

- `~/.sero-ui/<profile>/agent/settings.json`

under a dedicated namespace:

- `settings.sero.pluginDev.sessions`

### Why this location

- dev sessions are profile-scoped
- the rest of plugin/package activation already lives under the profile agent dir
- this avoids mixing local-dev metadata with install provenance metadata

## Suggested storage shape

Use a stable session ID as the key, **not** the app ID.

Example:

```json
{
  "sero": {
    "pluginDev": {
      "sessions": {
        "dev_9f3a7f2b": {
          "sessionId": "dev_9f3a7f2b",
          "expectedAppId": "google",
          "lastKnownName": "Google",
          "sourcePath": "/Users/daniel/Code/sero-google-plugin",
          "linkedAt": "2026-04-19T12:34:56.000Z",
          "status": "active",
          "ui": {
            "strategy": "dev-server",
            "devPort": 5189
          }
        }
      }
    }
  }
}
```

### Why stable session IDs matter

They allow Sero to preserve broken/dev-state metadata even when:

- `package.json` becomes invalid
- `sero.app.id` changes
- the source path disappears
- a new conflict appears

That is much harder if records are keyed directly by app ID.

## Activation model

## Source checkout vs activation target

The source checkout is the authoring root.
The activation target is what Sero actually loads for the running profile.

The product model should hide this distinction from the user, but the architecture should preserve it.

### Required invariant

A dev session is **not** a managed install.

That means:

- it should not appear in the installed-plugin list
- it should not reuse install provenance metadata
- stopping a dev session should not behave like uninstall

### Practical activation rule

The dev-session manager owns activation.

Internally, it may project a dev session into runtime using one of these forms:

- direct source activation path
- Sero-managed dev activation directory
- a future shadow package / normalized package representation

The important contract is:

- the dev session owns the lifecycle
- installs do not
- Attached folders do not

## Phase 1 recommendation

For v1, prefer the smallest implementation that keeps the product model clean:

- treat the dev session as the source of truth
- project the active session into discovery/resource loading
- do **not** call it an install anywhere in the UI or persistence model

## UI loading model

## Explicit remote override for dev plugins

This is the key architectural simplification.

Do **not** rely on:

- `NODE_ENV === 'development'`
- `SERO_DEV_PLUGINS`

for local plugin authoring.

Instead, a dev session should explicitly declare a preferred UI remote override for its app.

### Suggested manifest/runtime shape

Extend the runtime-facing app model with something like:

```ts
interface SeroAppManifest {
  remoteEntryOverride?: string | null;
}
```

For an active dev session with a running UI server:

- `remoteEntryOverride = http://localhost:<port>/mf-manifest.json`

When absent:

- renderer falls back to normal `sero-ext://<app-id>/mf-manifest.json`

### Why this is better

- works in production Sero
- avoids reusing built-in monorepo dev gating
- makes local plugin dev an explicit feature
- lets renderer/federation code stay simple

## UI strategies

### Strategy A — Dev server preferred

If the plugin checkout declares:

- `sero.app.devPort`
- a usable `dev` script

then Sero should prefer a managed dev session UI server started in the real checkout.

Expected benefits:

- Vite HMR works naturally
- no UI file watcher complexity in v1
- source checkout remains authoritative for frontend work

### Strategy B — Built UI fallback

If no dev server is available, or it fails:

- activate the plugin anyway
- load UI from built assets via `sero-ext://`
- allow manual backend refresh in v1
- optionally add `dist/ui` refresh automation later

## Non-UI refresh model

## Phase 1: explicit manual refresh

To keep the first implementation simpler, Phase 1 should ship with:

- a **Refresh plugin backend** action in Admin
- optional automatic UI HMR when a dev server is active
- no reinstall required

Refresh should:

1. re-read and re-validate the dev session source
2. update the activation target if needed
3. clear manifest / compatibility / provider / bridge caches
4. dispose app sessions for that app ID
5. restart app runtimes for that app ID
6. reload active session resources
7. broadcast a plugin `updated` event
8. invalidate and re-register renderer remotes if needed

This gives plugin authors a clean v1 without forcing source-watch complexity everywhere.

## Phase 2: automatic non-UI refresh

After the manual-refresh lifecycle is solid, add one debounced watcher per dev-session source root.

Suggested buckets:

- `package.json` → manifest refresh
- `extension/**` → resource refresh
- `prompts/**` / `skills/**` → resource refresh
- `runtime/**` → runtime restart + resource refresh
- `shared/**` → runtime restart + resource refresh
- `dist/ui/**` → UI fallback refresh when no dev server is active

The watcher should trigger the same refresh pipeline as the manual action.

## Conflict policy

App ID conflicts must fail closed.

Reject all of these cases:

- dev session vs built-in app
- dev session vs installed plugin
- dev session vs another dev session
- install attempt vs active dev session with same app ID

## Startup rule

Conflicts must also fail closed at startup, not just during the “Develop local plugin…” flow.

That means the current discovery-level “last wins” behavior must not remain the final authority for dev sessions.

Recommended behavior:

- detect duplicates during dev-session initialization and activation
- mark the dev session broken
- do not activate the conflicting app
- surface a clear error in Admin

## Broken-state policy

If a dev session becomes invalid, keep the metadata and mark it broken.

Examples:

- path deleted
- invalid `package.json`
- changed app ID
- conflict introduced later
- dev server fails repeatedly

Broken sessions should:

- stay visible in Plugin Development
- keep source path and last-known metadata
- not participate in active loading while invalid
- be easy to remove or retry

## Attached folders integration

## Rename the existing concept

Rename the existing workspace/multi-root UI from plugin-specific wording to:

- **Attached folders**

Avoid “linked plugin folders”.

## Relationship to plugin dev sessions

Attached folders remain optional.

A plugin dev session may offer:

- **Attach folder to workspace**

but this should be a convenience action only.

### Important product rule

Attaching a folder must never be required to activate a dev plugin.

### Important architecture rule

Plugin-dev state should not depend on a special workspace-root kind.

If the current multi-root implementation still uses a plugin-specific root kind, plan to simplify it toward generic attached folders over time.

## IPC surface

Extend `window.sero.plugins` with explicit dev-session APIs.

Suggested additions:

- `startDevSession(sourcePath: string): Promise<PluginDevSessionIPC>`
- `stopDevSession(sessionId: string): Promise<void>`
- `refreshDevSession(sessionId: string): Promise<PluginDevSessionIPC>`
- `listDevSessions(): Promise<PluginDevSessionIPC[]>`

Suggested shape:

```ts
interface PluginDevSessionIPC {
  sessionId: string;
  appId: string | null;
  name: string | null;
  sourcePath: string;
  status: 'active' | 'starting' | 'needs-refresh' | 'broken';
  uiStrategy: 'dev-server' | 'built-ui' | 'none';
  devPort?: number;
  remoteEntryOverride?: string | null;
  error?: string | null;
}
```

## Plugin change events

Extend plugin change events with:

```ts
type PluginChangeEvent =
  | { type: 'installed'; manifest: SeroAppManifest }
  | { type: 'uninstalled'; pluginId: string }
  | { type: 'updated'; manifest: SeroAppManifest };
```

## Runtime restart support

The runtime manager currently restarts instances only when key manifest paths change.

Dev sessions need an explicit targeted restart API, for example:

- `restartApp(appId: string): Promise<void>`

This API should be used by both:

- manual refresh
- automatic non-UI refresh later

## Startup and profile lifecycle

On startup:

1. read `settings.sero.pluginDev.sessions`
2. validate each session
3. activate valid sessions
4. start dev servers where needed
5. expose remote overrides for active UI dev sessions
6. mark invalid sessions broken

On profile switch:

- app relaunch remains sufficient
- old profile sessions/processes die with the process
- new profile loads only its own dev sessions

This preserves profile isolation naturally.

## Suggested file changes

## New files

- `apps/desktop/electron/features/plugins/dev-session-manager.ts`
- `apps/desktop/electron/features/plugins/dev-session-settings.ts`
- `apps/desktop/electron/features/plugins/dev-session-refresh.ts`
- `apps/desktop/electron/features/plugins/dev-session-ui.ts`
- `apps/desktop/electron/features/plugins/dev-session-conflicts.ts`

## Existing files to extend

- `apps/desktop/electron/features/plugins/activation.ts`
- `apps/desktop/electron/features/apps/discovery/index.ts`
- `apps/desktop/electron/platform/protocols/ext-protocol.ts`
- `apps/desktop/electron/ipc/integrations/plugins.ts`
- `apps/desktop/electron/features/apps/runtime/manager.ts`
- `apps/desktop/src/lib/federation-registry.ts`
- `apps/desktop/src/stores/app/discovery.ts`
- `apps/desktop/src/types/plugins.ts`
- `apps/desktop/src/types/sero-apps.ts`
- `packages/common/src/admin-bridge.ts`
- `plugins/sero-admin-plugin/ui/hooks/usePlugins.ts`
- `plugins/sero-admin-plugin/ui/components/PluginsPanel.tsx`
- `plugins/sero-admin-plugin/ui/hooks/useLinkedRoots.ts`

## Likely terminology cleanup

- rename the “Linked plugin folders” UI to “Attached folders”
- stop describing workspace roots as plugin activation
- move plugin-dev actions into a separate Admin section

## Rollout plan

## Phase 1 — clear terminology + dev session lifecycle

Ship:

- Plugin Development section in Admin
- “Develop local plugin…” flow
- profile-scoped dev-session metadata
- explicit production-mode UI remote override
- start/stop/list dev sessions
- manual **Refresh plugin backend**
- Attached folders rename
- optional “Attach folder to workspace” action

Outcome:

- local plugin authoring is understandable
- UI HMR works when a dev server exists
- backend/resource changes no longer require reinstall
- workspace roots stay conceptually separate

## Phase 2 — automatic non-UI refresh

Ship:

- one watcher per dev session source root
- bucketed refresh triggers
- plugin `updated` events
- targeted runtime restart

Outcome:

- tools / prompts / skills / runtimes refresh automatically

## Phase 3 — polish and resilience

Ship:

- dev-server health transitions
- fallback transitions between localhost and built UI
- improved broken-state diagnostics
- optional smarter workspace-attachment affordances

Outcome:

- smoother long-running authoring sessions
- clearer recovery behavior when source/dev servers break

## Testing strategy

### Unit tests

- dev-session settings parsing and persistence
- stable-session-ID broken-state behavior
- app ID conflict rejection
- production-mode remote override selection
- dev-server detection logic
- manual refresh pipeline behavior

### Integration tests

- starting a dev session activates the plugin without creating a managed install
- production build prefers `remoteEntryOverride` when present
- built UI fallback works when no dev server is active
- manual refresh reloads session resources and restarts runtimes
- startup marks invalid dev sessions broken instead of shadowing apps
- stopping a dev session removes activation cleanly

### UX tests

- Attached folders UI remains separate from Plugin Development
- attaching a folder is optional and does not affect activation correctness
- dev sessions are not shown as installed plugins

## Why this plan is better

- **Clearer mental model** — Attached folders, installed plugins, and dev sessions are different things.
- **Works in production Sero** — local UI dev no longer depends on `SERO_DEV_PLUGINS`.
- **Smaller v1** — UI HMR plus manual backend refresh gets most of the value quickly.
- **Better failure handling** — stable session IDs support real broken-state diagnostics.
- **Less architectural confusion** — no overloaded “linked plugin” terminology.

## Recommendation

Adopt this plan as the replacement for the earlier linked-source plugin proposal.

If implementation complexity needs further trimming, keep the boundary intact:

- Plugin Development remains the product concept
- Attached folders remain generic multi-root UI
- installs remain installs

That separation is the main simplification and should not be compromised.
