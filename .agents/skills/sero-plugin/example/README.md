# Canonical Sero Plugin Example — `sero-notes-plugin`

Reference implementation for the `sero-plugin` skill. It is the smallest
plugin that exercises **every** surface a Sero plugin can ship.

> **Scope: in-repo built-in plugin.** This example is wired for the Sero
> monorepo — `workspace:*` devDependencies for local `@sero-ai/*` packages
> and catalog-managed shared versions — so it drops into
> `plugins/sero-<name>-plugin/` and typechecks immediately after `pnpm install`.
> For **external** plugins that consume published `@sero-ai/*` packages instead, use
> [`sero-kanban-plugin`](https://github.com/sero-labs/sero-kanban-plugin)
> as the reference and read `apps/docs-site/docs/reference/plugin-quickstart.md`.

## File map

| Surface | File | What it demonstrates |
|---------|------|----------------------|
| Manifest | `sero-notes-plugin/package.json` | Full `pi` + `sero.app` + `sero.plugin` manifest, `bridgeTools`, `requiredHostCapabilities`, static widget, runtime entry |
| Shared types | `sero-notes-plugin/shared/types.ts` | JSON-serialisable state + `DEFAULT_STATE` |
| Pi extension | `sero-notes-plugin/extension/index.ts` | `pi.registerTool` with `StringEnum`, atomic state writes, custom TUI render, bridged CLI metadata (`cli`), `pi.registerCommand`, `session_start` warm fallback |
| Background runtime | `sero-notes-plugin/runtime/index.ts` | `AppRuntime` implementation against `@sero-ai/common` — startup reconcile, `handleStateChange`, `dispose` |
| Web UI (main) | `sero-notes-plugin/ui/NotesApp.tsx` | `useAppState`, `useAppInfo`, `useAppTools`, `useAgentPrompt`, `useAI`, dynamic widget registration via `useWidgetRegistration` |
| Dashboard widget | `sero-notes-plugin/ui/widgets/NotesWidget.tsx` | Manifest-declared widget, compact layout, `h-full` wrapper contract |
| Module Federation | `sero-notes-plugin/vite.config.ts` | package-root Vite root, `ui/index.html` Rollup input, `base: './'` for prod, singleton React, MF remote name `sero_notes`, `@sero-ai/app-runtime` excluded from `optimizeDeps` |
| Styles | `sero-notes-plugin/ui/styles.css` | Imports Sero's shared plugin stylesheet and scans plugin-local Tailwind classes |
| TS configs | `extension/tsconfig.json`, `runtime/tsconfig.json`, `ui/tsconfig.json` | Self-contained compiler options; package resolution comes from workspace dependencies, not brittle relative `paths` |
| CSS typings | `ui/vite-env.d.ts` | `vite/client` reference so `import './styles.css'` typechecks |
| HTML shell | `ui/index.html` | Minimal entry used by `build.rollupOptions.input` |

## How to use this example (in-repo built-in plugin)

1. Copy `sero-notes-plugin/` into `plugins/` at the monorepo root.
2. Rename the directory, the npm package name, `sero.app.id`, the MF remote name
   in `vite.config.ts` (`sero_<id>`), the exported component, and the
   `devPort` (keep it unique — grep existing plugins first).
3. Delete the surfaces you don't need:
   - No UI? Remove `vite.config.ts`, `ui/`, and the `sero.app.ui` /
     `component` / `devPort` / `widgets` fields, and collapse
     `scripts.typecheck` to just `extension/tsconfig.json`.
   - No background runtime? Remove `runtime/`, `sero.app.runtime`, the
     `appRuntime.background` capability, and the runtime tsconfig from
     `scripts.typecheck`.
   - No UI-invoked tools? Remove `useAppTools` / `useAgentPrompt` / `useAI`
     usage and drop the `appAgent.invokeTool` capability.
   - No bridged CLI? Drop the tool's `cli` block, the `tool.cli` capability,
     and set `bridgeTools: false`.
4. Update `shared/types.ts` to model your actual state, then let the extension,
   runtime, and UI all import from there — it is the single source of truth.
5. `pnpm install && pnpm --filter @sero-ai/plugin-<name> typecheck` — should
   be green before you run `bash apps/desktop/scripts/dev.sh`.

## How to port this to an external plugin

External plugins live outside the Sero monorepo and consume
`@sero-ai/app-runtime`, `@sero-ai/common`, `@sero-ai/ui` as published
packages. Start from the in-repo copy above, then:

1. Replace every `workspace:*` with the published semver range for the
   `@sero-ai/*` packages you depend on.
2. Replace every `catalog:` / `catalog:peer` spec with the concrete published
   semver range you support.
3. Ship the plugin pre-built if you want install-time consumers to skip
   Vite (`sero.plugin.preBuilt: true`).

## What this plugin does

`sero-notes-plugin` manages a list of short notes stored in
`.sero/apps/notes/state.json`. Notes can be toggled done, removed, and listed
from the agent (tool), the CLI (`sero notes <list|add|toggle|remove>`),
the React UI, or the dashboard widget. The `/list-notes` slash command is a
distinct name on purpose — it would otherwise shadow the bridged
`sero notes ...` CLI entry point when tools and commands are both bridged.
If you want a same-name slash shortcut such as `/notes`, ship a prompt
template declared via `pi.prompts` instead of `pi.registerCommand('notes')`.
