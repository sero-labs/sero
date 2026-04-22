# Sero Plugin Author Quickstart

This is the fastest path to understanding the shape of a small complete Sero
plugin reference.

For the full install, packaging, manifest, and distribution story, see
[`guide.md`](./guide.md).

If you need a runtime-enabled example that shows **UI + extension + background
runtime** together, also see
[`end-to-end-example.md`](./end-to-end-example.md).

## Canonical starter example

Use the **Daily Quote** plugin as the canonical small complete reference
plugin:

- GitHub: `https://github.com/monobyte/sero-daily-quote-plugin`
- local adjacent checkout example: `../plugins/sero-daily-quote-plugin/`

Why this example:
- it is small and complete
- it has one extension, one UI component, and one shared state contract
- it shows the standard Sero plugin shape without extra runtime complexity
- it is **structurally minimal, not visually minimal** — the UI is more polished
  than the smallest possible starter, so copy the manifest/layout/contracts,
  not the presentation complexity

## Minimal file shape

```text
sero-daily-quote-plugin/
├── package.json
├── extension/
│   └── index.ts
├── shared/
│   └── types.ts
├── ui/
│   ├── DailyQuote.tsx
│   ├── index.html
│   └── tsconfig.json
└── vite.config.ts
```

These are the first files to study.

The point is to understand the plugin contract surface, not to reproduce the
Daily Quote app's visual styling one-for-one.

## What each file is doing

### `package.json`

This is the contract surface for both Pi and Sero.

It defines:
- `pi.extensions` — the extension entrypoint
- `sero.app` — app identity, UI entry, component export, state file, scope
- `sero.plugin` — category, tags, compatibility metadata
- scripts such as `dev`, `build`, and `typecheck`

A minimal example shape looks like:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc --noEmit -p ui/tsconfig.json"
  },
  "pi": {
    "extensions": ["./extension/index.ts"]
  },
  "sero": {
    "app": {
      "id": "daily-quote",
      "name": "Daily Quote",
      "icon": "sparkles",
      "scope": "global",
      "stateFile": ".sero/apps/daily-quote/state.json",
      "ui": "./dist/ui/remoteEntry.js",
      "component": "DailyQuote",
      "devPort": 5177
    },
    "plugin": {
      "category": "utilities",
      "tags": ["quotes", "inspiration", "daily"],
      "minSeroVersion": "0.1.0",
      "preBuilt": false
    }
  }
}
```

### `extension/index.ts`

This is the Pi extension side.

The Daily Quote example shows a good minimum:
- register one tool
- register one command
- resolve a state file path
- read/write a JSON file safely
- keep the implementation understandable without extra framework layers

### `shared/types.ts`

Put the durable shared state contract here.

This file should hold the types that both the extension and the UI need to
agree on.

### `ui/DailyQuote.tsx`

This is the Sero UI side.

The example shows a single React component that:
- reads app state
- presents a focused UI
- triggers agent-backed behavior without depending on unrelated app surfaces

### `ui/index.html` and `ui/tsconfig.json`

These are the minimal web-entry files for the federated UI.

### `vite.config.ts`

This is the Module Federation remote config.

Important pattern:
- use `base: './'` for production builds
- expose exactly the component Sero should mount
- keep the dev server on the manifest's `devPort`

## Run the starter example

From inside the plugin repository:

```bash
pnpm install
pnpm dev
pnpm build
pnpm typecheck
```

These are the smallest useful author commands.

## How to try it in Sero

### Option 1: run directly from a checkout

Use **Admin → Plugins → Local Plugin Development** in Sero and point it at the
plugin checkout.

This is the best way to iterate on a real plugin source tree without packaging
it first.

### Option 2: install from git

The Daily Quote example can also be installed from its source repository through
Sero's plugin install flow. See [`guide.md`](./guide.md) for the full install
and distribution story.

## What to copy into your own plugin

If you are starting a new plugin, copy the structure and principles, not the
feature itself:
- one clear `pi.extensions` entry
- one clear `sero.app` manifest
- one shared `types.ts`
- one focused UI component
- one simple Vite federation config

## What to read next

- [`guide.md`](./guide.md) — full plugin author and user guide
- [`host-compatibility.md`](./host-compatibility.md) — host capability and compatibility rules
- [`../features/local-plugin-development.md`](../features/local-plugin-development.md) — running a local checkout directly
