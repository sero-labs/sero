# Plugin System — Technical Guide

Internal documentation for Sero developers working on the plugin system.
For user-facing plugin authoring instructions, see
[guide.md](guide.md).

## Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Plugin Package Format](#plugin-package-format)
- [Plugin Manifest](#plugin-manifest)
- [Installation Flow](#installation-flow)
- [Discovery & Loading](#discovery--loading)
- [Module Federation Integration](#module-federation-integration)
- [Tool Bridging](#tool-bridging)
- [IPC Surface](#ipc-surface)
- [File Layout](#file-layout)
- [Core vs Plugin Classification](#core-vs-plugin-classification)
- [Build Pipeline](#build-pipeline)
- [Security Considerations](#security-considerations)

---

## Overview

Sero supports **optional plugins** — apps that can be installed, updated, and
removed without modifying the core codebase. Plugins are standard Sero apps
(Pi extension + optional React UI) that are installed into
`~/.sero-ui/agent/packages/`.

Distribution format depends on the source:

- **npm** → pre-built package bundle (`dist/ui/` already present)
- **git / local source** → standalone source package that Sero builds locally
  during installation

The architecture leverages existing infrastructure:

- **`app-discovery.ts`** already scans `~/.sero-ui/agent/packages/`
- **`sero-ext://`** protocol already resolves from arbitrary package paths
- **Module Federation** already supports runtime remote registration
- **All extensions are independent** — zero cross-package dependencies

The plugin system adds: a manager for lifecycle operations, IPC bridging,
dynamic MF registration, manifest-driven tool bridging, and optional
plugin-defined provider metadata via `sero.providers`.

## Architecture

```
┌─ Plugin Sources ────────────────────────────┐
│  npm:@sero/plugin-todo@latest               │
│  git:https://github.com/user/plugin.git     │
│  /local/path/to/built/plugin                │
└──────────────┬──────────────────────────────┘
               │ installPlugin(source)
               ▼
┌─ Plugin Manager (electron/plugins/manager.ts) ─┐
│  1. Download / clone / copy to temp dir         │
│  2. Validate sero.app manifest                  │
│  3. Enforce app-id collision policy             │
│  4. npm: verify pre-built dist/ui exists        │
│     git/local: respect sero.plugin.preBuilt     │
│     and build locally when required             │
│  5. Move to ~/.sero-ui/agent/packages/<id>/     │
│  6. Register in settings.json                   │
│  7. Register with app-discovery + ext-protocol  │
└──────────────┬──────────────────────────────────┘
               │
               ▼
┌─ Existing Infrastructure ───────────────────┐
│  app-discovery.ts  → SeroAppManifest        │
│  ext-protocol.ts   → sero-ext://<id>/...    │
│  federation-registry.ts → MF remote load    │
│  cli/index.ts      → tool bridging          │
│  package-provider-manifests.ts → host UI    │
└─────────────────────────────────────────────┘
```

## Plugin Package Format

Plugins are published in one of two formats:

### npm bundle format

A published npm plugin is a pre-built package:

```
@sero/plugin-todo/
├── package.json            # sero.app + sero.plugin manifests
├── extension/
│   └── index.js            # Bundled Pi extension (runtime-ready JS)
├── shared/
│   └── types.js            # Transpiled shared modules
├── dist/
│   └── ui/
│       ├── remoteEntry.js  # Module Federation entry
│       ├── mf-manifest.json
│       └── *.js / *.css    # MF chunks
├── prompts/                # Optional prompt .md files
└── skills/                 # Optional skill definitions
```

### Git / local source format

A published Git source plugin is a standalone source package:

```
sero-plugin-todo/
├── package.json            # sero.app + sero.plugin manifests
├── extension/
│   └── index.ts            # Source extension entry
├── shared/
│   └── types.ts            # Source shared modules
├── ui/
│   ├── TodoApp.tsx
│   └── tsconfig.json
├── vite.config.ts
└── vendor/                 # Optional vendored unpublished workspace packages
```

During git/local installation, Sero uses `sero.plugin.preBuilt` to decide
whether the staged package should be built locally:

- `preBuilt: true` -> trust the checked-in `dist/ui/` bundle
- `preBuilt: false` or omitted -> run `npm install` + `npm run build`

After preparation, Sero validates that `dist/ui/remoteEntry.js` exists if the
UI is declared.

Built-in monorepo plugins that ship inside the desktop app follow one extra
rule: the staged copy under `dist/electron/builtin/plugins/<plugin>/` must be
self-contained for runtime resolution. If an extension imports runtime npm
packages (including native modules such as `better-sqlite3`), those packages
must be declared in the plugin's own `dependencies` and staged alongside the
plugin instead of relying on workspace hoisting or desktop-app-level
dependencies.

## Plugin Manifest

Plugins declare metadata via `sero.plugin` in `package.json`, alongside the
standard `sero.app` manifest. Plugins that register custom model providers can
also declare optional `sero.providers` metadata so the Electron host can render
provider-specific auth and model UI without hardcoded app-level logic:

```json
{
  "sero": {
    "app": {
      "id": "todo",
      "name": "Todo",
      "icon": "check-square",
      "stateFile": ".sero/apps/todo/state.json",
      "ui": "./dist/ui/remoteEntry.js",
      "component": "TodoApp",
      "devPort": 5174
    },
    "plugin": {
      "category": "productivity",
      "tags": ["todo", "tasks", "productivity"],
      "minSeroVersion": "0.1.0",
      "requiredHostCapabilities": ["appAgent.invokeTool"],
      "preBuilt": true
    },
    "providers": [
      {
        "id": "alibaba-coding-plan",
        "name": "Alibaba Coding Plan",
        "logo": "alibaba-cloud",
        "auth": {
          "type": "apiKey",
          "envVar": "ALIBABA_CODING_PLAN_KEY"
        },
        "defaults": {
          "LOW": "qwen3-coder-plus",
          "MED": "qwen3-coder-plus",
          "HIGH": "qwen3.5-plus"
        }
      }
    ]
  }
}
```

### `sero.plugin` Fields

See also: [`docs/plugins/host-compatibility.md`](./host-compatibility.md) for
the downstream migration guide and capability-selection rules.

| Field | Type | Description |
|-------|------|-------------|
| `category` | `PluginCategory` | Browsing category. One of: `productivity`, `developer-tools`, `entertainment`, `integrations`, `finance`, `health`, `creative`, `utilities`. |
| `tags` | `string[]` | Search/filter tags. |
| `minSeroVersion` | `string?` | Minimum Sero version required. Enforced during install/load. |
| `requiredHostCapabilities` | `string[]?` | Explicit host seams the plugin depends on (for example `appAgent.invokeTool` or `tool.cli`). Enforced during install/load. |
| `preBuilt` | `boolean?` | Controls git/local install behavior. `true` means the package already includes a valid pre-built UI bundle; `false`/omitted means Sero rebuilds it locally during install. npm bundles are always expected to ship pre-built artifacts. |
| `bridgeTools` | `boolean \| string[]` | Controls manifest-driven CLI bridging for plugin tools. `true`/omitted bridges all plugin tools, `false` bridges none, and `string[]` bridges only the named tools. |

### `sero.providers` Fields

Use this optional manifest when a plugin extension registers custom providers via
`pi.registerProvider(...)` and wants the desktop host to discover matching
provider metadata from the plugin package itself.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Provider ID. Must match the ID passed to `pi.registerProvider(...)`. |
| `name` | `string?` | Display name for auth UI and model selectors. Defaults to a title-cased provider ID. |
| `logo` | `string?` | Logo slug or absolute URL. Slugs resolve through `models.dev`. |
| `auth.type` | `"apiKey"` | Declares API-key auth for this provider. |
| `auth.envVar` | `string?` | Environment variable the host should check for auth. |
| `defaults` | `{ LOW?, MED?, HIGH? }` | Optional per-tier default model IDs used by onboarding and model tier suggestions. |

Notes:

- `sero.providers` is host metadata only. The plugin extension still owns the
  runtime provider registration.
- Keep `id`, auth env var, and default model IDs aligned with the provider the
  extension actually registers.
- Prefer plugin-owned env var names such as `ALIBABA_CODING_PLAN_KEY` over
  ambiguous upstream product names when exposing provider auth to users.

### Types

Shared cross-package contracts live in `packages/common/src/` and should be
re-exported from `packages/common/src/index.ts` so desktop, remotes, and
plugins can consume them via `@sero-ai/common`.

Current plugin-system types are defined in `packages/common/src/plugins.ts` and
re-exported to the renderer via `src/types/plugins.ts` / `src/types/ipc.ts`:

- **`PluginCategory`** — Union of category string literals
- **`PluginMeta`** — Shape of `sero.plugin` from package.json
- **`InstalledPlugin`** — Renderer-safe info about an installed plugin
- **`PluginRegistryEntry`** — Entry from the remote plugin registry

Rules for `@sero-ai/common`:
- keep it renderer-safe (`type`/utility code only; no Electron or Node-only imports)
- use it for neutral contracts shared across multiple packages
- keep app-local state in the app/plugin's own `shared/` directory instead of promoting everything prematurely

## Installation Flow

```
installPlugin("npm:@sero/plugin-todo@latest")
  │
  ├─ Detect source type (npm: / git: / local path)
  │
  ├─ npm:  → npm pack + tar extract to temp dir
  │  git:  → shallow clone source repo to temp dir
  │  local → fs.cp to temp dir
  │
  ├─ Validate: sero.app.id exists in package.json
  ├─ Resolve final install path ~/.sero-ui/agent/packages/<plugin-id>/
  ├─ Reject conflicts with built-in apps or a different installed plugin
  ├─ npm: verify dist/ui/remoteEntry.js exists (if UI declared)
  ├─ git/local: if sero.plugin.preBuilt !== true, run npm install + npm run build
  ├─ Strip install-only fields (e.g. devPort) from staged package.json
  │
  ├─ Move to ~/.sero-ui/agent/packages/<plugin-id>/
  ├─ Add path to settings.json packages array
  │
  ├─ registerAppPath() → makes app-discovery aware
  ├─ discoverApps() → parse manifest → SeroAppManifest
  ├─ registerExtAssets() → makes sero-ext:// protocol aware
  ├─ Dispose app-agent sessions for this app id
  ├─ Broadcast install event → invalidate stale MF cache → register runtime remote
  ├─ Reload active chat-session ResourceLoaders
  │
  └─ Return SeroAppManifest (app appears in the sidebar immediately)
```

### Uninstall Flow

```
uninstallPlugin("todo")
  │
  ├─ Verify plugin exists at ~/.sero-ui/agent/packages/todo/
  ├─ fs.rm() the directory
  ├─ Remove path from settings.json packages array
  ├─ Dispose app-agent sessions for this app id
  ├─ Broadcast uninstall event → invalidate runtime remote cache
  ├─ Reload active chat-session ResourceLoaders
  │
  └─ App disappears from the sidebar immediately
```

**Note:** Uninstall does NOT delete app state files. Workspace-scoped state
lives at `<workspace>/.sero/apps/<id>/state.json`; global state lives at
`~/.sero-ui/apps/<id>/state.json`. Users manage these independently.

## Discovery & Loading

`app-discovery.ts` gathers apps from:

1. `~/.sero-ui/agent/extensions/` — Sero extensions
2. `settings.json` package + extension paths
3. `~/.sero-ui/agent/packages/` — **installed plugins live here**
4. manually registered package paths (used by built-in monorepo packages / dev)

Plugins are just regular app packages in location 3. No special discovery
logic was needed — the existing infrastructure handles it.

### Provider manifest discovery

The desktop host also scans plugin `package.json` files for `sero.providers`.
That metadata is consumed by shared host helpers so optional provider plugins
can fully describe themselves without adding provider-specific conditionals to
Electron code.

Current host uses of `sero.providers` include:

- API-key provider list in the auth dialog
- provider display names and logos in model UIs
- environment-variable lookup for plugin-defined providers
- provider tier defaults used by onboarding / suggestions

This keeps optional provider plugins self-contained: uninstalling the plugin
removes both the extension and the host-visible provider metadata.

### `isPlugin` Flag

`SeroAppManifest` includes an `isPlugin: boolean` field, set by
`app-discovery.ts` based on whether the package has a `sero.plugin` key in
its `package.json`. This lets the renderer distinguish core apps from plugins
(e.g. for showing an "Uninstall" button in the UI).

## Module Federation Integration

### Build-time (Vite config)

`vite.config.ts` scans `plugins/sero-*-plugin/` for `sero.app` manifests and builds
the MF remotes config. Plugins installed at `~/.sero-ui/agent/packages/`
are NOT known at build time — they use pre-built bundles.

### Runtime (federation-registry.ts)

The federation registry lazily registers MF remotes via `ensureRemoteRegistered()`.
When a user opens a plugin app:

1. `getFederatedComponent()` calls `ensureRemoteRegistered(appId, devPort)`
2. This registers the remote pointing to `sero-ext://<id>/mf-manifest.json`
3. MF loads `remoteEntry.js` and component chunks via the `sero-ext://` protocol

For hot-loading after install (no restart needed):

```typescript
import { registerDynamicRemote, invalidateRemote } from '@/lib/federation-registry';

// After install/update — clear stale cache, then force-register the remote
invalidateRemote(appId);
registerDynamicRemote(appId);

// After uninstall — clear cached modules
invalidateRemote(appId);
```

The install IPC path also disposes any app-agent sessions for that app ID and
reloads active chat-session ResourceLoaders so plugin-local extensions,
prompts, skills, tools, and bridged CLI commands refresh immediately after
install/update.

At startup and after plugin install/uninstall, Sero also reconciles installed
plugin activation against the current host contract. Plugins that fail
`minSeroVersion` or `requiredHostCapabilities` checks stay installed on disk
and visible to discovery/UI, but they are removed from the active package list
until the host build becomes compatible.

For plugin authors, the practical migration guidance lives in
[`docs/plugins/host-compatibility.md`](./host-compatibility.md).

Additionally, `electron/ipc/apps/app-state.ts` watches the active profile's
`settings.json`. If package paths are added or removed outside the install IPC
path, Sero still reloads running session resources automatically.

### `sero-ext://` Protocol

`ext-protocol.ts` serves files from `<packagePath>/dist/ui/`. When a plugin
is installed, `registerExtAssets(manifest)` adds it to the protocol's app
registry. The protocol:

1. Looks up the app ID in the registry
2. Resolves the file path within `dist/ui/`
3. Prevents path traversal (security check)
4. Rewrites `mf-manifest.json` publicPath to `sero-ext://<id>/`

## Tool Bridging

### Core tools (static policy)

`CORE_TOOLS_TO_BRIDGE` in `electron/cli/index.ts` still exists for non-plugin
or legacy tool names that Sero always wants to expose through `sero-cli`.
Core coding tools like `bash`, `read`, `write`, `edit`, and `browser` remain
standalone.

### Plugin tools (manifest-driven)

Plugin tool bridging is resolved from the plugin package itself. The CLI bridge
walks up from each loaded extension path, reads the nearest `package.json`, and
checks `sero.plugin.bridgeTools`:

- `undefined` / `true` → bridge all tools from that plugin extension
- `false` → bridge none of that plugin's tools
- `string[]` → bridge only the listed tool names

This means plugin tools get bridged into `sero-cli` automatically without
editing a core allowlist.

### Session-scoped execution

The bridge is not just schema translation. It also preserves **session
correctness**:

- `bridgeExtensionTools()` records the loaded tools and commands for each
  active agent session.
- A bridged `sero <tool>` invocation resolves the **current session's**
  registered tool definition at execute time.
- Bridged extension commands do the same for the **current session's** command
  handler.
- Bridged tool/command contexts include a narrow execution-scoped
  `sessionRuntime` capability for current-session side effects such as:
  - `sendUserMessage(...)`
  - `sendMessage(...)`

This prevents session leakage when plugin logic depends on extension-local
state or on session-bound messaging behavior.

## IPC Surface

### Channels (`src/types/ipc-channels.ts`)

```typescript
plugins: {
  install:  'sero:plugins:install',   // source → SeroAppManifest
  uninstall: 'sero:plugins:uninstall', // pluginId → void
  list:     'sero:plugins:list',       // → InstalledPlugin[]
  isPlugin: 'sero:plugins:is-plugin',  // pluginId → boolean
  event:    'sero:plugins:event',      // main → renderer PluginChangeEvent
}
```

### Preload Bridge (`electron/preload/plugins.ts`)

Exposes `window.sero.plugins`:

```typescript
interface SeroPluginsAPI {
  install(source: string): Promise<SeroAppManifest>;
  uninstall(pluginId: string): Promise<void>;
  list(): Promise<InstalledPlugin[]>;
  isPlugin(pluginId: string): Promise<boolean>;
  onChanged(callback: (event: PluginChangeEvent) => void): () => void;
}
```

### IPC Handler (`electron/ipc/plugins.ts`)

Delegates to `electron/plugins/manager.ts` functions.

## File Layout

```
apps/desktop/
├── electron/
│   ├── plugins/
│   │   ├── bridge-policy.ts    # Manifest-driven tool bridge policy
│   │   ├── install-policy.ts   # App-id collision rules
│   │   ├── manager.ts          # Install / uninstall / list logic
│   │   ├── package-build.ts    # Build/prepare staged plugin packages
│   │   └── security.ts         # Safe plugin ids and install paths
│   ├── ipc/
│   │   └── plugins.ts          # IPC handlers
│   ├── preload/
│   │   └── plugins.ts          # Preload bridge
│   └── shared/
│       ├── auth/
│       │   └── provider-catalog.ts         # Built-in + plugin API-key providers
│       ├── providers/
│       │   └── package-provider-manifests.ts # Reads sero.providers metadata
│       └── settings/
│           └── provider-model-defaults.ts  # Static + plugin-defined tier defaults
├── src/
│   ├── types/
│   │   ├── ipc.ts              # Re-exports plugin types
│   │   ├── ipc-channels.ts     # Plugin IPC channel constants
│   │   ├── plugins.ts          # Renderer plugin types
│   │   └── electron.d.ts       # SeroPluginsAPI interface
│   └── lib/
│       └── federation-registry.ts  # registerDynamicRemote, invalidateRemote
packages/
└── common/
    └── src/plugins.ts          # Shared plugin metadata / InstalledPlugin types
scripts/
├── build-plugin.sh             # Build a pre-built npm package bundle
└── export-plugin-source.sh     # Export a standalone Git source repo
```

## Core vs Plugin Classification

### Core (stays in monorepo)

These packages are essential to Sero's functionality:

| Package | Reason |
|---------|--------|
| `app-runtime` | Infrastructure — required by all UI apps |
| `templates` | Workspace scaffolding |
| `sero-memory-plugin` | Foundational to agent learning |
| `sero-cron-plugin` | Scheduler, used by other extensions |
| `pi-research-extension` | Subagent orchestration pattern |
| `pi-plan-mode-extension` | Structured planning safeguard |
| `sero-admin-plugin` | Workspace administration |
| `sero-user-feedback-plugin` | Agent-user communication primitive |

### Extractable (can become plugins)

These are standalone and can be distributed independently:

| Package | Category |
|---------|----------|
| `pi-notes-extension` | productivity |
| `pi-calc-extension` | utilities |
| `pi-daily-quote` | utilities |
| `pi-tetris-extension` | entertainment |
| `pi-spotify-extension` | entertainment |
| `pi-starling-extension` | finance |
| `pi-google-extension` | integrations |
| `sero-git-plugin` | developer-tools |
| `sero-kanban-plugin` | productivity |
| `pi-imagegen-extension` | creative |
| `pi-humanizer-extension` | creative |
| `pi-slopzilla-extension` | creative |
| `pi-weight-tracker` | health |

## Build Pipeline

There are two authoring outputs:

### Pre-built npm bundle

```bash
bash scripts/build-plugin.sh plugins/sero-cron-plugin
```

This produces `plugins/sero-cron-plugin/dist/plugin/` with compiled UI,
bundled extension entrypoints, and a cleaned manifest suitable for `npm pack`
or `npm publish`.

### Standalone Git source repo

```bash
bash scripts/export-plugin-source.sh plugins/sero-cron-plugin
```

This produces `plugins/sero-cron-plugin/dist/plugin-source/` with source
files, resolved dependency versions, and vendored unpublished workspace
packages so Sero can clone it, run `npm install`, and build it locally during
Git-based installation.

## Security Considerations

### Path traversal

The `sero-ext://` protocol resolves symlinks and verifies the final path is
within `dist/ui/`. Null bytes are rejected.

### Plugin validation

The plugin manager validates:
- `sero.app.id` exists and is well-formed
- the app ID does not shadow a built-in app or a different installed plugin
- `dist/ui/remoteEntry.js` exists if UI is declared
- Installation path is within `~/.sero-ui/agent/packages/`

### Build execution model

- **npm bundles** are installed via `npm pack` + `tar extract` (not `npm install`).
  This avoids polluting global package state and skips lifecycle scripts.
- **git/local source plugins** run `npm install` + `npm run build` inside a
  temporary staging directory when `sero.plugin.preBuilt !== true`. Pre-built
  local bundles can skip the rebuild path.

Git source installs therefore execute repository code during installation and
must be treated as a trusted-code workflow.

### Uninstall safety

`uninstallPlugin()` verifies the target is within the plugins directory
before deletion, preventing accidental removal of monorepo packages.

### Future: permissions

The `sero.plugin` manifest supports a `permissions` field (not yet enforced).
This will declare plugin capabilities (`network`, `notifications`,
`filesystem:read`) shown during installation.
