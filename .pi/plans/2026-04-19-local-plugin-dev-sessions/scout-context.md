# Context for: local plugin dev sessions in Sero

## Relevant Files
- `docs/plans/2026-04-19-local-plugin-dev-sessions.md` — product brief and target terminology; explicitly separates attached folders, installs, and dev sessions.
- `apps/desktop/electron/features/plugins/manager.ts` — install/uninstall/list lifecycle for installed plugins; writes plugin install provenance and reconciles installed plugin activation.
- `apps/desktop/electron/features/plugins/activation.ts` — keeps installed plugins projected into `settings.packages` so discovery picks them up.
- `apps/desktop/electron/features/apps/discovery/index.ts` — current app discovery and remote-entry selection; includes `SERO_DEV_PLUGINS` gating and `devPort` handling.
- `apps/desktop/electron/platform/protocols/ext-protocol.ts` — `sero-ext://` asset serving and manifest rewriting.
- `apps/desktop/electron/ipc/integrations/plugins.ts` — main-process IPC for plugin install/uninstall/list/search and plugin change broadcasts.
- `apps/desktop/electron/features/apps/runtime/manager.ts` — runtime start/dispose/reconcile keyed by appId + workspaceId; restarts on manifest/runtime path changes.
- `apps/desktop/src/lib/federation-registry.ts` — renderer remote registration, fallback remote selection, cache invalidation, and transient fallback behavior.
- `apps/desktop/src/stores/app/discovery.ts` — discovery-to-store flow, preload of federated modules, and plugin change event handling.
- `apps/desktop/src/stores/app/state.ts` — active app selection and transient remote reload logic.
- `packages/common/src/admin-bridge.ts` — current renderer bridge surface for plugins, workspace roots, profiles, etc.
- `plugins/sero-admin-plugin/ui/components/PluginsPanel.tsx` — current Admin UI for installs + linked roots.
- `plugins/sero-admin-plugin/ui/hooks/usePlugins.ts` — plugin list/install/uninstall state and IPC subscription.
- `plugins/sero-admin-plugin/ui/hooks/useLinkedRoots.ts` — current multi-root / “linked plugin” flow.
- `apps/desktop/electron/ipc/workspace/workspace.ts` and `apps/desktop/electron/features/workspace/roots.ts` — workspace root IPC and persistence for additional roots.
- `apps/desktop/electron/features/workspace/plugin-validation.ts` — main-process validation for `linked-plugin` roots.
- `apps/desktop/src/types/ipc.ts` and `packages/common/src/admin-bridge.ts` — current IPC types for workspaces, roots, plugins, and renderer bridge contracts.
- `apps/desktop/src/types/layout.ts` and `apps/desktop/src/lib/persist-layout.ts` — persisted layout state and allowed persistence locations.
- `apps/desktop/electron/features/profile/manager.ts` and `apps/desktop/electron/ipc/workspace/profiles.ts` — profile-scoped SERO_HOME lifecycle and relaunch behavior.
- `apps/desktop/electron/features/plugins/settings.ts` — plugin-related `settings.json` persistence.

## Project Structure
- Sero is a monorepo with Electron main process code under `apps/desktop/electron`, renderer code under `apps/desktop/src`, shared bridge/types under `packages/common`, and built-in plugins under `plugins/sero-*-plugin`.
- Plugin lifecycle is currently split across:
  - install/uninstall bookkeeping (`features/plugins/manager.ts`)
  - settings reconciliation (`features/plugins/activation.ts`)
  - app discovery (`features/apps/discovery/index.ts`)
  - remote serving/protocol (`platform/protocols/ext-protocol.ts`)
  - renderer federation registry (`src/lib/federation-registry.ts`)
  - Admin UI (`plugins/sero-admin-plugin/...`).
- Multi-root workspace support already exists and persists as `WorkspaceConfig.roots`, with a special `kind: 'linked-plugin'` marker used by the Admin UI and IPC validation.

## Conventions
- Cross-process changes must follow the 4-layer flow: React component → Zustand store → preload IPC → main-process handler → Pi SDK.
- Renderer persistence should use `persistLayout()`/IPC, not `localStorage` or `sessionStorage`.
- The repo is strict about file size; any touched source file should stay under 500 LOC.
- Existing patterns favor explicit main-process validation, typed IPC channel constants, and cache invalidation after plugin/package changes.
- Store code prefers Zustand + derived actions over `useEffect`, except for external subscriptions like IPC listeners.

## Key Findings
- Installed plugins are treated as packages under `~/.sero-ui/agent/packages`, then projected back into `settings.packages` so discovery can find them; installed-plugin activation is therefore coupled to settings reconciliation.
- Discovery currently deduplicates by app ID with “last wins,” which means a local dev override can shadow an installed or built-in app unless a separate conflict policy is added.
- `SERO_DEV_PLUGINS` is the existing dev-only switch for selecting remote dev servers in both discovery and Vite build config; this is tied to monorepo dev, not profile-scoped plugin authoring.
- The renderer federation registry already supports HTTP dev-server-first / `sero-ext://` fallback resolution via `devPort`, plus transient fallback invalidation when an app becomes active again.
- `sero-ext://` serves files from `<packagePath>/dist/ui`, with a manifest rewrite that sets `publicPath` to the same protocol. This is the main asset-serving surface for built plugin UIs.
- Current runtime manager keys instances by `appId:workspaceId` and restarts only when manifest package path, runtime entry, or state file path changes. There is no explicit targeted restart API yet.
- Current Admin UI conflates plugin management with multi-root “linked plugin folders”; the UI copy and hook naming still describe linked folders as a way to “develop” plugins inside a workspace.
- Workspace roots are persisted separately from plugin installs and are already validated in the main process, which makes them the closest existing abstraction to reuse for “Attach folder to workspace” — but they are not a dev-session abstraction.
- Profile state is isolated at the SERO_HOME level (`profiles.json` points at a per-profile home, which contains `agent/settings.json`, `agent/workspaces.json`, and `layout.json`). This is the natural boundary for profile-scoped plugin dev session persistence.

## Gotchas
- Discovery currently scans `settings.json` packages plus registered paths and installed packages; adding dev sessions will need to avoid masquerading as normal installed packages or generic workspace roots.
- There are two overlapping concepts already in the codebase: plugin installs under `agent/packages` and workspace additional roots. The brief explicitly says dev sessions must stay distinct from both.
- `linked-plugin` is currently a first-class discriminant in types, UI, and IPC validation. Reusing that name for dev sessions would collide with existing workspace-root semantics.
- The Admin bridge and plugin IPC surface do not currently expose any dev-session CRUD APIs, so a new bridge surface will require touching the preload contracts and renderer types in sync.
- `app-discovery` and `federation-registry` both make remote-entry decisions today; a dev-session remote override likely needs a single source of truth to avoid divergence.
- If dev-session state is stored in settings, the current settings helpers are generic JSON read/write utilities and will need careful extension to preserve existing plugin/package behavior.
- Startup behavior matters: discovery currently tolerates duplicates via last-wins, so dev-session conflict handling will need to fail closed earlier than current discovery does.
