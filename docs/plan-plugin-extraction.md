# Plan: Extract Sero Packages into Optional Plugins

## Problem

All 22 `pi-*` extensions live in the monorepo and ship as part of Sero. Many are optional (Tetris, Spotify, weight tracker, etc.) and bloat the app. We want a plugin system where:

- **Core packages** stay in `packages/` and ship with Sero
- **Extractable packages** become standalone plugins — published as npm packages (or git repos), installed on-demand into `~/.sero-ui/agent/packages/`, and loaded at runtime

## What Already Works

The architecture is surprisingly close to supporting this:

| Capability | Status |
|---|---|
| Runtime app discovery from `~/.sero-ui/agent/packages/` | Already works (`app-discovery.ts`) |
| `sero-ext://` protocol resolves from arbitrary `packagePath` | Already works (`ext-protocol.ts`) |
| `settings.json` supports `npm:` and `git:` package sources | Parsed but not resolved to disk yet |
| Extensions are fully independent (zero cross-package deps) | Already true |
| `sero.app` manifest is self-describing | Already true |

## What Needs to Change

### Phase 1: Plugin Package Format & Registry

**Goal:** Define what a published plugin looks like and where it lives on disk.

#### 1.1 — Plugin package format (npm)

A published Sero plugin is a normal npm package containing pre-built artifacts:

```
@sero-ai/plugin-spotify/
├── package.json          # Has sero.app manifest + pi.extensions
├── extension/
│   └── index.js          # Compiled Pi extension (JS, not TS)
├── shared/
│   └── types.js          # Compiled shared types
├── dist/
│   └── ui/
│       ├── remoteEntry.js
│       ├── mf-manifest.json
│       └── *.js / *.css   # MF chunks
├── prompts/              # Optional prompt files
│   └── *.md
└── skills/               # Optional skill definitions
    └── *.md
```

Key differences from development packages:
- **Extension code is pre-compiled** to JS (not raw `.ts`)
- **UI is pre-built** — `dist/ui/` contains the MF remote bundle
- **No `vite.config.ts`, `tsconfig.json`, or dev tooling** in the published artifact
- `package.json` includes a `"sero.plugin"` field (see 1.2) in addition to `"sero.app"`

#### 1.2 — Plugin metadata in `package.json`

Add a `sero.plugin` field to distinguish installable plugins from dev packages:

```json
{
  "sero": {
    "app": { /* existing manifest — unchanged */ },
    "plugin": {
      "category": "entertainment",
      "tags": ["spotify", "music", "playback"],
      "minSeroVersion": "0.5.0",
      "preBuilt": true
    }
  }
}
```

Categories: `productivity`, `developer-tools`, `entertainment`, `integrations`, `finance`, `health`, `creative`, `utilities`.

#### 1.3 — Plugin install location

Installed plugins live at:
```
~/.sero-ui/agent/packages/<plugin-id>/
```

This directory is **already scanned** by `app-discovery.ts` (`scanSettingsPaths` → `scanDir(pkgDir)`). No discovery changes needed.

#### 1.4 — Build pipeline for extractable packages

Add a `build:plugin` script to each extractable package that:

1. Bundles the Pi extension entrypoints to runtime-ready JS
2. Builds the MF UI remote (`vite build` → `dist/ui/`)
3. Copies/transpiles `shared/`, `prompts/`, and `skills` into the output
4. Generates a publish-ready `package.json` in `dist/plugin/`

Create a shared build script at `scripts/build-plugin.sh` that any package can use.

### Phase 2: Plugin Installation & Management

**Goal:** Install, update, and remove plugins from within Sero.

#### 2.1 — CLI-based plugin manager (`electron/plugins/`)

New module in the Electron main process:

```typescript
// electron/plugins/manager.ts
export interface PluginManager {
  install(source: string): Promise<SeroAppManifest>;   // npm:pkg, git:url, or local path
  uninstall(pluginId: string): Promise<void>;
  update(pluginId: string): Promise<SeroAppManifest>;
  list(): Promise<InstalledPlugin[]>;
  isInstalled(pluginId: string): boolean;
}
```

**Install flow:**
1. Resolve source → download/clone into temp dir
2. Validate `sero.app` manifest exists and is well-formed
3. Validate `sero.plugin.minSeroVersion` compatibility
4. Check for `dist/ui/remoteEntry.js` (pre-built requirement)
5. Move to `~/.sero-ui/agent/packages/<id>/`
6. Register in `settings.json` packages array
7. Trigger app re-discovery → hot-register the new MF remote

**Uninstall flow:**
1. Unload MF remote (remove from federation runtime registry)
2. Remove from `~/.sero-ui/agent/packages/<id>/`
3. Remove from `settings.json` packages array
4. Optionally clean app state (`~/.sero-ui/apps/<id>/` or workspace `.sero/apps/<id>/`)

For npm sources, use `npm pack` + extract (not `npm install`) to avoid node_modules pollution. For git sources, shallow clone + validate.

#### 2.2 — IPC bridge for plugin management

Expose plugin operations to the renderer:

```typescript
// electron/preload.ts — additions
sero: {
  plugins: {
    install(source: string): Promise<SeroAppManifest>;
    uninstall(pluginId: string): Promise<void>;
    update(pluginId: string): Promise<SeroAppManifest>;
    list(): Promise<InstalledPlugin[]>;
    getAvailable(): Promise<PluginRegistryEntry[]>;  // Phase 3
  }
}
```

#### 2.3 — Dynamic Module Federation remote registration

Currently, MF remotes are declared at **Vite build time** in `vite.config.ts`. Installed plugins won't be known at build time.

**Solution:** Use Module Federation's **runtime API** to register remotes dynamically.

The `federation-registry.ts` already has `registerRemote()` / `loadRemote()` helpers. Extend this:

```typescript
// src/lib/federation-registry.ts — additions
export function registerDynamicRemote(appId: string, manifestUrl: string): void {
  const remoteName = `sero_${appId.replace(/-/g, '_')}`;
  // Use @module-federation/runtime registerRemotes() API
  registerRemotes([{
    name: remoteName,
    entry: manifestUrl,  // sero-ext://<id>/mf-manifest.json
  }], { force: true });
}
```

When a plugin is installed at runtime:
1. Plugin manager copies files to `~/.sero-ui/agent/packages/<id>/`
2. `ext-protocol.ts` registers the new package path
3. Renderer calls `registerDynamicRemote(id, 'sero-ext://<id>/mf-manifest.json')`
4. App appears in sidebar — no restart needed

#### 2.4 — Dynamic tool bridging

Currently `TOOLS_TO_BRIDGE` is a hardcoded `Set` in `electron/cli/index.ts`. Make it manifest-driven:

```typescript
// Read from the plugin package's manifest
const toolBridge = pkgJson.sero?.plugin?.bridgeTools ?? true;  // default: bridge all tools
```

When `bridgeTools` is `true` (default), all tools from that extension are bridged into `sero-cli`. When `false`, they remain as standalone agent tools. This can also be an array of specific tool names to bridge.

### Phase 3: Plugin Discovery UI

**Goal:** Let users browse, install, and manage plugins from within Sero.

#### 3.1 — Plugin registry (GitHub label discovery)

**Primary discovery mechanism:** GitHub topic/label `sero-agent-plugin`.

Any GitHub repo tagged with `sero-agent-plugin` is discoverable as a Sero plugin. The plugin manager searches GitHub via the API:

```typescript
// Search for public Sero plugins on GitHub
const results = await fetch(
  'https://api.github.com/search/repositories?q=topic:sero-agent-plugin&sort=stars'
);
```

This is supplemented by a curated **registry JSON** (hosted in a GitHub repo or static file) for verified/featured plugins:

```json
{
  "plugins": [
    {
      "id": "spotify",
      "name": "Spotify",
      "description": "Control Spotify playback from Sero",
      "source": "npm:@sero-ai/plugin-spotify@latest",
      "github": "monobyte/sero-plugin-spotify",
      "category": "entertainment",
      "icon": "music",
      "author": "sero-team",
      "verified": true
    }
  ]
}
```

**Discovery hierarchy:**
1. **Curated registry** — verified first-party and community plugins (shown first)
2. **GitHub `sero-agent-plugin` topic** — broader community discovery
3. **Direct install** — user pastes an npm/git/local source

Sero fetches both sources at startup (with cache). Third-party plugins can be added via `settings.json` or by entering a source directly.

#### 3.2 — Plugin management UI (new Sero app)

A new **core** app: `pi-plugins-extension` (or integrate into `pi-admin-extension`):

- **Browse tab:** Grid of available plugins from registry, filterable by category
- **Installed tab:** List of installed plugins with update/uninstall buttons
- **Detail view:** Plugin description, version, size, permissions, install button
- **Manual install:** Text input for npm/git/local path sources

#### 3.3 — Plugin permissions & sandboxing (future)

Plugins can declare required capabilities:

```json
{
  "sero": {
    "plugin": {
      "permissions": ["network", "notifications", "filesystem:read"]
    }
  }
}
```

Show these during install. For now this is informational; enforcement can come later.

### Phase 4: Package Extraction

**Goal:** Move extractable packages out of the monorepo.

#### 4.1 — Package categorization

**Stay in monorepo (core):**
| Package | Reason |
|---|---|
| `app-runtime` | Infrastructure — required by all UI apps |
| `templates` | Workspace scaffolding |
| `pi-memory-extension` | Foundational to agent learning |
| `pi-cron-extension` | Scheduler — used by other extensions |
| `pi-context-extension` | Agent context debugging |
| `pi-kanban-extension` | Reference implementation + deep workflow |
| `pi-research-extension` | Subagent orchestration pattern |
| `pi-plan-mode-extension` | Structured planning safeguard |
| `pi-admin-extension` | Workspace administration |
| `pi-user-feedback` | Agent ↔ user communication primitive |
| `pi-resources-extension` | developer-tools | medium |

**Extract to plugins:**
| Package | Category | Priority |
|---|---|---|
| `pi-todo-extension` | productivity | low (good test candidate) |
| `pi-notes-extension` | productivity | medium |
| `pi-calc-extension` | utilities | low |
| `pi-daily-quote` | utilities | low |
| `pi-tetris-extension` | entertainment | low |
| `pi-spotify-extension` | entertainment | medium |
| `pi-starling-extension` | finance | medium |
| `pi-google-extension` | integrations | high |
| `pi-git-extension` | developer-tools | medium |
| `pi-imagegen-extension` | creative | medium |
| `pi-humanizer-extension` | creative | medium |
| `pi-slopzilla-extension` | creative | low |
| `pi-weight-tracker` | health | low |

#### 4.2 — Extraction process (per package)

1. **Inline monorepo-only dependencies.** Some packages import from `@sero-ai/ui`
   (e.g. `cn` from `@sero-ai/ui/lib/utils`). Since `@sero-ai/ui` is monorepo-only,
   these utilities must be inlined into the plugin (e.g. `ui/lib/utils.ts` with
   `clsx` + `tailwind-merge`). Check for `@sero-ai/ui` imports in `.ts`, `.tsx`,
   `.css` (Tailwind `@source` directives), and `tsconfig.json` (path aliases).
   Add the underlying npm packages (`clsx`, `tailwind-merge`) as devDependencies.
2. Add `build:plugin` script using the shared build pipeline
3. Add `sero.plugin` metadata to `package.json`
4. Verify the package works when loaded from `~/.sero-ui/agent/packages/` (not `packages/`)
5. Publish to npm as `@sero-ai/plugin-<id>`
6. Remove from monorepo `packages/`
7. Add to the plugin registry JSON
8. Update `TOOLS_TO_BRIDGE` if tool bridging was hardcoded for this package

#### 4.3 — Bundled defaults

For a good OOTB experience, Sero can **pre-install** a curated set of plugins during first launch:

```typescript
const DEFAULT_PLUGINS = [
  'npm:@sero-ai/plugin-todo@latest',
  'npm:@sero-ai/plugin-notes@latest',
  'npm:@sero-ai/plugin-google@latest',
];
```

These get installed into `~/.sero-ui/agent/packages/` on first run but can be uninstalled by the user.

## Implementation Order

```
Phase 1 (Foundation)        Phase 2 (Management)       Phase 3 (UI)          Phase 4 (Extraction)
┌─────────────────┐        ┌──────────────────┐       ┌──────────────┐      ┌─────────────────┐
│ 1.1 Package fmt │───────▶│ 2.1 Plugin mgr   │──────▶│ 3.1 Registry │─────▶│ 4.1 Categorize  │
│ 1.2 Metadata    │        │ 2.2 IPC bridge   │       │ 3.2 UI app   │      │ 4.2 Extract each│
│ 1.3 Install loc │        │ 2.3 Dynamic MF   │       │ 3.3 Perms    │      │ 4.3 Defaults    │
│ 1.4 Build pipe  │        │ 2.4 Dynamic tools│       └──────────────┘      └─────────────────┘
└─────────────────┘        └──────────────────┘
       ~2 days                   ~3 days                   ~2 days                ~1 day/pkg
```

**Start with:** Extract `pi-todo-extension` as the proof-of-concept — it's the simplest package and a good smoke test for the entire pipeline.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| MF version mismatch between host and plugin | Pin `@module-federation/vite` version in plugin build; validate at install |
| React version mismatch | MF `shared: { react: { singleton: true } }` already handles this; validate peer dep ranges at install |
| Plugin breaks Sero | Wrap plugin loading in error boundary; failed plugins show error card in sidebar instead of crashing |
| npm registry dependency | Support local paths and git URLs as alternatives; offline-first with cached registry |
| Plugin API surface changes | Version the `sero.app` manifest schema; plugins declare `minSeroVersion` |
| `@sero-ai/app-runtime` API changes | Treat as semver — breaking changes require major version bump; plugins declare compatible range |

## Open Questions

1. **Naming:** `@sero-ai/plugin-<id>` vs `sero-plugin-<id>` vs keep `@sero-ai/<id>`?
2. **Pre-install defaults:** Which plugins should ship pre-installed for OOTB experience?
3. **Auto-updates:** Should plugins auto-update, prompt, or stay manual?
4. **Third-party plugins:** Allow community plugins from day one, or start with first-party only?
5. **Plugin state migration:** When a core package becomes a plugin, how do we handle existing user state files?
