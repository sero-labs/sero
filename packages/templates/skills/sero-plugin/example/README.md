# Canonical Sero Plugin Example — `sero-notes-plugin`

Reference implementation for the `sero-plugin` skill. It is intentionally the
simplest plugin that exercises **every** surface a Sero plugin can ship:

| Surface | File | What it demonstrates |
|---------|------|----------------------|
| Manifest | `sero-notes-plugin/package.json` | Full `pi` + `sero.app` + `sero.plugin` manifest, `bridgeTools`, `requiredHostCapabilities`, static widget, runtime entry |
| Shared types | `sero-notes-plugin/shared/types.ts` | JSON-serialisable state + `DEFAULT_STATE` |
| Pi extension | `sero-notes-plugin/extension/index.ts` | `pi.registerTool` with `StringEnum`, atomic state writes, custom TUI render, bridged CLI metadata (`cli`), `pi.registerCommand`, `session_start` warm fallback |
| Background runtime | `sero-notes-plugin/runtime/index.ts` | `AppRuntime` implementation against `@sero-ai/common` — startup reconcile, `handleStateChange`, `dispose` |
| Web UI (main) | `sero-notes-plugin/ui/NotesApp.tsx` | `useAppState`, `useAppInfo`, `useAppTools`, `useAgentPrompt`, `useAI`, dynamic widget registration via `useWidgetRegistration` |
| Dashboard widget | `sero-notes-plugin/ui/widgets/NotesWidget.tsx` | Manifest-declared widget, compact layout, `h-full` wrapper contract |
| Module Federation | `sero-notes-plugin/vite.config.ts` | `root: 'ui'`, `base: './'` for prod, singleton React, MF remote name `sero_notes`, `@sero-ai/app-runtime` excluded from `optimizeDeps` |
| Styles | `sero-notes-plugin/ui/styles.css` | Tailwind 4 `@source` directives for plugin UI **and** `@sero-ai/ui` components, `@theme inline` mapping of semantic CSS variables |
| TS configs | `extension/tsconfig.json`, `runtime/tsconfig.json`, `ui/tsconfig.json` | Self-contained compiler options with `paths` for workspace packages |
| CSS typings | `ui/vite-env.d.ts` | `vite/client` reference so `import './styles.css'` typechecks |
| HTML shell | `ui/index.html` | Minimal entry required by `root: 'ui'` |

## How to use this example

1. Copy `sero-notes-plugin/` into `plugins/` (or an external plugin repo).
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

## What this plugin does

`sero-notes-plugin` manages a list of short notes stored in
`.sero/apps/notes/state.json`. Notes can be toggled done, removed, and listed
from the agent (tool + CLI), the React UI, or the dashboard widget. It is
deliberately trivial so each surface reads in a few minutes.
