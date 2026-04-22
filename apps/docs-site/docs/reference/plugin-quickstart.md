# Plugin Quickstart

This page shows the fastest way to understand the shape of a small complete
Sero plugin.

## Canonical starter example

Use the external **Daily Quote** plugin as the reference example:
- `https://github.com/monobyte/sero-daily-quote-plugin`

Important framing:
- it is **structurally minimal**
- it is **not visually minimal**

That means you should copy the plugin contract surface and file layout, not
assume that the polished UI styling is part of the minimum plugin bar.

## Core file shape

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

## What to copy into your own plugin

Study these pieces first:
- `package.json` — `pi.extensions`, `sero.app`, `sero.plugin`, scripts
- `extension/index.ts` — one focused Pi extension entry
- `shared/types.ts` — shared state/data contract
- `ui/DailyQuote.tsx` — one mounted React component
- `vite.config.ts` — Module Federation remote config with `base: './'`

## Minimal author commands

From inside the starter plugin repo:

```bash
pnpm install
pnpm dev
pnpm build
pnpm typecheck
```

## What success looks like

A good first plugin has:
- one clear app manifest
- one clear extension entry
- one small shared type contract
- one focused UI surface
- one understandable local dev/build flow

## Next steps

For the full packaging, install, compatibility, and local-development story,
continue with:
- [Plugins](/reference/plugins)
- `docs/plugins/guide.md` in the repo source material
- `docs/plugins/host-compatibility.md` in the repo source material
