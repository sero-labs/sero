# Sero Plugins — Author & User Guide

How to create, distribute, install, and manage Sero plugins.

For internal architecture details, see
[plugins-technical.md](plugins-technical.md).

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

| | Core app | Plugin |
|---|----------|--------|
| **Location** | `packages/pi-*` in the monorepo | `~/.sero-ui/agent/packages/<id>/` |
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

### From a local path

```typescript
await window.sero.plugins.install('/path/to/my/built/plugin');
```

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

Any existing Sero app can become a plugin. Follow the
[Building Sero Apps](apps-tutorial.md) tutorial to create an app, then add
the plugin metadata described below.

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
      "preBuilt": true
    }
  }
}
```

### 3. Build and test locally

```bash
# Build a ready-to-install plugin bundle
bash scripts/build-plugin.sh packages/pi-my-app-extension
```

This produces a publishable package at:

```
packages/pi-my-app-extension/dist/plugin/
```

Install that built bundle from the Sero renderer console:

```typescript
await window.sero.plugins.install(
  '/absolute/path/to/packages/pi-my-app-extension/dist/plugin'
);
```

The plugin should appear in the sidebar immediately — no restart required.

## Plugin Manifest Reference

### `sero.app` (required)

The standard Sero app manifest. See the
[Manifest Reference](apps-tutorial.md#manifest-reference) in the apps tutorial.

### `sero.plugin` (required for plugins)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `category` | string | Yes | Plugin category for browsing. See [categories](#categories) below. |
| `tags` | string[] | Yes | Search and filter tags. |
| `minSeroVersion` | string | No | Minimum compatible Sero version (semver). |
| `preBuilt` | boolean | No | Set to `true` if the package includes pre-built UI artifacts in `dist/ui/`. Should always be `true` for published plugins. |
| `bridgeTools` | boolean \| string[] | No | Controls whether plugin tools are bridged into `sero-cli`. Omit or set `true` to bridge all tools; `false` to bridge none; or provide a list of tool names to bridge selectively. |

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

### Using the build script

From the monorepo root:

```bash
bash scripts/build-plugin.sh packages/pi-todo-extension
```

This builds a ready-to-install plugin bundle at `dist/plugin/` containing:

- `dist/ui/` — pre-built Module Federation remote
- `extension/` — bundled JS extension entrypoints
- `shared/` — transpiled JS shared modules
- `prompts/` / `skills/` — copied runtime resources
- `package.json` — cleaned manifest with compiled `pi.extensions` paths

### Verify the output

After building, confirm these files exist:

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

Publish from the built bundle directory, not the source package root:

```bash
cd my-plugin/dist/plugin
npm publish
```

Users install with:

```typescript
window.sero.plugins.install('npm:@sero/plugin-my-app@latest');
```

### To GitHub

Push to a public repository. Tag it with the **`sero-agent-plugin`** topic
for discoverability.

Users install with:

```typescript
window.sero.plugins.install('git:https://github.com/user/sero-plugin-my-app.git');
```

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

Yes. During development, your plugin lives in `packages/pi-*` like any other
app. When ready to extract, add the `sero.plugin` metadata, build it, and
publish. The `sero.plugin` key in `package.json` marks it as extractable.

### Do plugins auto-update?

Not yet. Users manually update by re-installing from the same source.
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
Every Sero plugin is also a valid Pi package — it works in both environments.

### Can third-party plugins be installed?

Yes. Any npm package or git repository with a valid `sero.app` manifest can
be installed as a plugin. The `sero-agent-plugin` GitHub topic helps with
discovery, but it's not required for installation.

### What's the `devPort` for in a published plugin?

Published plugins don't use the dev port — they serve pre-built bundles via
`sero-ext://`. The `devPort` is only active during development when the app
runs a local Vite dev server. It's safe to include in the manifest; Sero
ignores it for installed plugins.
