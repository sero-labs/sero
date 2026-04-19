# Sero Plugins — Author & User Guide

How to create, distribute, install, and manage Sero plugins.

For internal architecture details, see
[technical.md](technical.md).

## Contents

- [What Is a Plugin?](#what-is-a-plugin)
- [Installing Plugins](#installing-plugins)
- [Uninstalling Plugins](#uninstalling-plugins)
- [Creating a Plugin](#creating-a-plugin)
- [Plugin Manifest Reference](#plugin-manifest-reference)
- [Building for Distribution](#building-for-distribution)
- [Publishing](#publishing)
- [Plugin Discovery](#plugin-discovery)
- [FAQ](#faq)

---

## What Is a Plugin?

A plugin is a **Sero app that lives outside the monorepo**. It can be
installed on-demand, updated independently, and removed without affecting
the core application.

Plugins are identical to built-in Sero apps — they have an optional web UI
(React, loaded via Module Federation) and an optional Pi extension (agent
tools, commands, hooks). The only difference is where they're stored:

> Runtime note: plugin UIs and tools load in both container-backed workspaces
> and host-mode workspaces, but some platform capabilities remain container-only
> today (for example browser automation, containerized LSP, and some managed
> preview flows). See [`docs/sero.md`](../sero.md) and
> [`docs/guides/macos-containers.md`](../guides/macos-containers.md).

| | Core app | Plugin |
|---|----------|--------|
| **Location** | `plugins/sero-*-plugin/` in the monorepo | `~/.sero-ui/agent/packages/<id>/` |
| **Ships with Sero** | Yes | No — installed separately |
| **Removable** | No | Yes |
| **Source** | Monorepo | npm, git, or local path |

## Installing Plugins

Plugins can be installed from three source types:

### From npm

```typescript
await window.sero.plugins.install('npm:@sero/plugin-todo@latest');
```

### From a Git repository

```typescript
await window.sero.plugins.install('git:https://github.com/user/sero-plugin-todo.git');
```

Git installs clone the **source repository**, run `npm install`, run the
plugin's build script locally, and then install the built result into
`~/.sero-ui/agent/packages/<id>/`.

For git installs, Sero treats `sero.plugin.preBuilt` as the switch that decides
whether a local build is required:

- `preBuilt: true` -> use the checked-in `dist/ui/` bundle as-is
- `preBuilt: false` or omitted -> run `npm install` + `npm run build` locally

> Git installs execute plugin code during the local build step. Only install
> source plugins from repositories you trust.

### From a local path

```typescript
await window.sero.plugins.install('/path/to/my/plugin');
```

Local installs accept either:

- a **pre-built bundle** (for example `dist/plugin/`), or
- a **standalone source package** that Sero can `npm install` + build locally.

Re-installing a plugin with the same `sero.app.id` replaces the existing plugin
at that install path. A plugin may **not** shadow a different installed plugin
or a built-in Sero app with the same app ID.

After installation the plugin appears in the sidebar immediately — no restart
required.

### Where plugins are stored

All plugins are installed to:

```
~/.sero-ui/agent/packages/<plugin-id>/
```

This directory is automatically scanned by Sero's app discovery system on
startup and whenever a new plugin is installed.

## Uninstalling Plugins

```typescript
await window.sero.plugins.uninstall('todo');
```

This removes the plugin from disk and from `settings.json`. App state files
(in `<workspace>/.sero/apps/<id>/` or `~/.sero-ui/apps/<id>/`) are NOT
deleted — you can clean those up manually if desired.

## Creating a Plugin

Any existing Sero app can become a plugin. For a step-by-step guide to building
a new app, use the `sero-plugin` skill, then add the plugin metadata described
below.

### 1. Start with a standard Sero app

Your package should have the standard structure:

```
my-plugin/
├── package.json          # sero.app manifest
├── extension/
│   └── index.ts          # Pi extension (tools, commands)
├── shared/
│   └── types.ts          # Shared state types
├── ui/
│   ├── MyApp.tsx          # React component
│   ├── index.html
│   └── tsconfig.json
└── vite.config.ts        # Module Federation remote config
```

Keep app-local state/types in `shared/types.ts`.

For **generic monorepo-shared platform contracts** used across desktop,
remotes, and multiple built-in plugins, move that neutral code into
`packages/common/src/`, re-export it from `packages/common/src/index.ts`, and
consume it via `import type { ... } from '@sero-ai/common'`. Keep
`@sero-ai/common` renderer-safe — no Electron, Node-only APIs, or desktop-only
internals.

Important ownership rule for external plugins:
- `packages/*` is **not** where external-plugin domain code should live
- external plugins should **consume** published packages like
  `@sero-ai/common`, `@sero-ai/app-runtime`, and `@sero-ai/ui`
- external plugins should **not** import monorepo source paths like
  `../../packages/common/src/*` or move plugin-specific domain models into
  `packages/*` just because the plugin is external
- if a contract is plugin-specific, keep it inside the plugin's own `shared/`
  layer (or a plugin-owned published package), not in Sero's monorepo packages

If you later extract/publish the plugin outside this monorepo, vendor or
publish any shared code it still depends on instead of assuming the workspace
package will exist in the installed plugin environment.

### 2. Add plugin metadata

Add a `sero.plugin` key to your `package.json` alongside `sero.app`:

```json
{
  "name": "@sero/plugin-my-app",
  "version": "1.0.0",
  "description": "A useful Sero plugin",
  "sero": {
    "app": {
      "id": "my-app",
      "name": "My App",
      "icon": "star",
      "stateFile": ".sero/apps/my-app/state.json",
      "ui": "./dist/ui/remoteEntry.js",
      "component": "MyApp",
      "devPort": 5180
    },
    "plugin": {
      "category": "productivity",
      "tags": ["my-app", "example"],
      "minSeroVersion": "0.1.0",
      "requiredHostCapabilities": ["appAgent.invokeTool"],
      "preBuilt": true
    }
  }
}
```

If your plugin registers one or more custom model providers via
`pi.registerProvider(...)`, also add a `sero.providers` section so the Electron
host can discover provider metadata directly from the plugin package instead of
hardcoding it:

```json
{
  "sero": {
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

This metadata is used for:

- the auth dialog API-key provider list
- provider display names and logos in model pickers
- environment-variable lookup for plugin-defined providers
- onboarding / tier default suggestions for plugin-defined models

When you do this, keep the extension's provider ID and env var in sync with the
manifest entry. For example, if your manifest declares
`id: "alibaba-coding-plan"` and `envVar: "ALIBABA_CODING_PLAN_KEY"`, your
extension should also register `alibaba-coding-plan` and resolve the same env
var when calling `pi.registerProvider(...)`.

### 3. Build and test locally

For **npm distribution**, build a ready-to-install plugin bundle:

```bash
bash scripts/build-plugin.sh plugins/sero-my-app-plugin
```

This produces a publishable bundle at:

```
plugins/sero-my-app-plugin/dist/plugin/
```

For **GitHub source distribution**, export a standalone source repo:

```bash
bash scripts/export-plugin-source.sh plugins/sero-my-app-plugin
```

This produces a source repo at:

```
plugins/sero-my-app-plugin/dist/plugin-source/
```

Install either locally from the Sero renderer console:

```typescript
await window.sero.plugins.install(
  '/absolute/path/to/plugins/sero-my-app-plugin/dist/plugin'
);

await window.sero.plugins.install(
  '/absolute/path/to/plugins/sero-my-app-plugin/dist/plugin-source'
);
```

The plugin should appear in the sidebar immediately — no restart required.
Active chat sessions also reload their resource loaders, so `sero help <tool>`
and other CLI-bridged plugin commands become available without manually
restarting Sero.

Sero also enforces `minSeroVersion` plus any declared
`requiredHostCapabilities` during install/load. If a plugin is incompatible
with the current host build, the install fails closed (or an already-installed
plugin is kept out of the active package list) until the host becomes
compatible.

For a downstream-friendly migration checklist covering host capabilities,
bridged CLI behavior, and manifest examples, see
[`docs/plugins/host-compatibility.md`](./host-compatibility.md).

## Plugin Manifest Reference

### `sero.app` (required)

The standard Sero app manifest used by all Sero apps and plugins. For a
step-by-step guide to building a new app, use the `sero-plugin` skill.

### `sero.plugin` (required for plugins)

See also: [`docs/plugins/host-compatibility.md`](./host-compatibility.md) for
when to declare `requiredHostCapabilities` and how the host enforces them.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `category` | string | Yes | Plugin category for browsing. See [categories](#categories) below. |
| `tags` | string[] | Yes | Search and filter tags. |
| `minSeroVersion` | string | No | Minimum compatible Sero version (semver). Enforced during install/load. |
| `requiredHostCapabilities` | string[] | No | Explicit host seams the plugin depends on, such as `appAgent.invokeTool` or `tool.cli`. Enforced during install/load. |
| `preBuilt` | boolean | No | Controls install behavior for git/local plugins. Set `true` only when the package already ships a valid `dist/ui/` bundle and should be installed without rebuilding. Set `false` or omit it for source repos that Sero should build locally on install. npm bundles are always expected to ship pre-built artifacts. |
| `bridgeTools` | boolean \| string[] | No | Controls whether plugin tools are bridged into `sero-cli`. Omit or set `true` to bridge all tools; `false` to bridge none; or provide a list of tool names to bridge selectively. |

### `sero.providers` (optional)

Declare this when a plugin registers one or more custom model providers with
`pi.registerProvider(...)` and wants the Electron host to surface matching
provider metadata automatically.

Each entry supports:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Provider ID. Must match the ID passed to `pi.registerProvider(...)`. |
| `name` | string | No | Display name shown in auth UI and model selectors. Defaults to a title-cased version of `id`. |
| `logo` | string | No | Logo slug or absolute URL used by the host UI. Slugs resolve to `https://models.dev/logos/<slug>.svg`. |
| `auth.type` | `"apiKey"` | No | Declares that the provider authenticates via API key. |
| `auth.envVar` | string | No | Environment variable name the host should check for this provider. |
| `defaults` | object | No | Optional default LOW/MED/HIGH model IDs for onboarding and tier suggestions. |

Notes:

- `sero.providers` is metadata for the Electron host. It does **not** register
  models by itself — your extension still needs to call `pi.registerProvider(...)`.
- Keep `id`, auth env var, and default model IDs aligned with the provider your
  extension actually registers.
- Use plugin-owned env var names such as `ALIBABA_CODING_PLAN_KEY` rather than
  reusing ambiguous upstream product names where possible.

### Categories

| Category | Description | Examples |
|----------|-------------|---------|
| `productivity` | Task management, notes, planning | Todo, Notes |
| `developer-tools` | Code tools, git, debugging | Git Manager, Resources |
| `entertainment` | Games, media, fun | Tetris, Spotify |
| `integrations` | External service connectors | Google (Gmail/Calendar) |
| `finance` | Banking, budgeting | Starling |
| `health` | Fitness, wellness tracking | Weight Tracker |
| `creative` | Image gen, writing tools | Image Gen, Humanizer |
| `utilities` | Calculators, converters | Calculator, Daily Quote |

## Building for Distribution

### Pre-built npm bundle

From the monorepo root:

```bash
bash scripts/build-plugin.sh plugins/sero-cron-plugin
```

This builds a ready-to-install plugin bundle at `dist/plugin/` containing:

- `dist/ui/` — pre-built Module Federation remote
- `extension/` — bundled JS extension entrypoints
- `shared/` — transpiled JS shared modules
- `prompts/` / `skills/` — copied runtime resources
- `package.json` — cleaned manifest with compiled `pi.extensions` paths

Verify the output contains:

```
dist/plugin/
├── package.json           # Cleaned plugin manifest
├── extension/
│   └── index.js           # Bundled Pi extension
├── shared/
│   └── *.js               # Transpiled shared modules (if any)
└── dist/
    └── ui/
        ├── remoteEntry.js # Required — MF entry point
        ├── mf-manifest.json
        ├── *.js
        └── *.css
```

### Standalone Git source repo

```bash
bash scripts/export-plugin-source.sh plugins/sero-cron-plugin
```

This exports a standalone source repository at `dist/plugin-source/` containing:

- plugin source files (`extension/`, `shared/`, `ui/`, `vite.config.ts`)
- resolved catalog versions in `package.json`
- vendored unpublished workspace packages under `vendor/`
- `preBuilt: false` in `sero.plugin` so Sero rebuilds it during git/local install

Smoke test the exported source repo before publishing:

```bash
cd plugins/sero-cron-plugin/dist/plugin-source
npm install
npm run build
```

### Important: relative base path

Your Vite config **must** use a relative `base` in production so that
`sero-ext://` can resolve chunk URLs correctly:

```typescript
// vite.config.ts
export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? './' : '/',
  // ...
});
```

## Publishing

### To npm

Publish from the **built bundle** directory, not the source package root:

```bash
cd my-plugin/dist/plugin
npm publish
```

Users install with:

```typescript
window.sero.plugins.install('npm:@sero/plugin-my-app@latest');
```

### To GitHub

Push the contents of `dist/plugin-source/` to a public repository. Tag it with
the **`sero-agent-plugin`** topic for discoverability.

```bash
bash scripts/export-plugin-source.sh plugins/sero-my-app-plugin
```

Users install with:

```typescript
window.sero.plugins.install('git:https://github.com/user/sero-plugin-my-app.git');
```

Sero clones that source repo, runs `npm install`, runs `npm run build`, and
then installs the prepared plugin locally.

### GitHub topic for discovery

Add the `sero-agent-plugin` topic to your GitHub repository. This makes your
plugin discoverable via the GitHub API:

```
https://api.github.com/search/repositories?q=topic:sero-agent-plugin&sort=stars
```

Sero's plugin browser searches for this topic to populate the available
plugins list.

## Plugin Discovery

Sero discovers plugins from three sources, in priority order:

1. **Curated registry** — A static JSON list of verified/featured plugins
   maintained by the Sero team
2. **GitHub `sero-agent-plugin` topic** — Any public repo with this topic
   appears in the broader community plugins list
3. **Direct install** — Users can paste any npm/git/local source directly

### For plugin authors

To maximize discoverability:

- Add `sero-agent-plugin` as a GitHub topic on your repository
- Include `"pi-package"` and `"sero-plugin"` in your `package.json` keywords
- Write a clear description in `package.json` — it's shown in the plugin
  browser
- Choose an appropriate `category` and descriptive `tags`

## FAQ

### Can I develop a plugin inside the monorepo?

Yes. During development, built-in plugins live in `plugins/sero-*-plugin/`
like any other shipped Sero app. When ready to distribute one externally,
keep the same package self-contained, add or keep the `sero.plugin` metadata,
build it, and publish the extracted bundle/source package.

### Do plugins auto-update?

Not yet. Users manually update by re-installing from the same source.
If the app ID matches an existing installed plugin, Sero replaces that plugin
in place and hot-loads the updated UI, tools, and active-session CLI bridge
state without a restart. If the updated plugin now requires a newer host
version or additional host capabilities, Sero blocks activation until the host
contract is satisfied.
Auto-update support is planned for a future release.

### What happens to my data if I uninstall a plugin?

App state files are preserved. Workspace-scoped state lives at
`<workspace>/.sero/apps/<id>/state.json` and global state at
`~/.sero-ui/apps/<id>/state.json`. Reinstalling the plugin picks up where
you left off.

### Can I have a plugin without a UI?

Yes. Extensions without a web UI are supported — just omit `ui`, `component`,
and `devPort` from the `sero.app` manifest. The extension's tools and
commands will still work through the agent.

### How does a plugin differ from a Pi package?

A Pi package works in the Pi CLI. A Sero plugin adds a `sero.app` manifest
(for sidebar + UI) and a `sero.plugin` manifest (for distribution metadata).
Plugins that register custom model providers can also add `sero.providers` so
Sero's Electron host can surface provider auth and model metadata without core
changes. Every Sero plugin is also a valid Pi package — it works in both
environments.

### Can third-party plugins be installed?

Yes. Any npm package or git repository with a valid `sero.app` manifest can
be installed as a plugin. The `sero-agent-plugin` GitHub topic helps with
discovery, but it's not required for installation.

### Can a plugin replace a built-in Sero app?

No. Plugin app IDs must be unique across the runtime. Re-installing the same
plugin ID updates that installed plugin, but third-party plugins cannot shadow
core apps or a different installed plugin.

### What's the `devPort` for in a published plugin?

Published plugins don't use the dev port — they serve pre-built bundles via
`sero-ext://`. The `devPort` is only active during development when the app
runs a local Vite dev server. It's safe to include in the manifest; Sero
ignores it for installed plugins.
