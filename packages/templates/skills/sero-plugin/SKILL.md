---
name: sero-plugin
description: |
  Step-by-step guide for creating new Sero plugins — self-contained packages
  with a Pi extension (agent tools/commands) and an optional React web UI
  loaded via Module Federation. Use this skill whenever the user asks to
  create a new Sero app, plugin, extension, or tool with a UI, or when they
  want to add a new sidebar panel, dashboard widget, or agent-integrated
  feature to Sero. Also use when converting an existing Pi extension into a
  Sero plugin. Trigger on phrases like "create a plugin", "new Sero app",
  "add a tool with UI", "build an extension", "convert this Pi extension",
  or any request that involves creating something under plugins/sero-*-plugin/.
---

# Building Sero Plugins

This skill guides you through creating a complete Sero plugin from scratch.
A Sero plugin is a **standard Pi extension** with an optional **React web UI**,
both sharing state through a JSON file on disk.

## When to read reference files

This SKILL.md contains the workflow and key rules. For detailed file templates
and code snippets, read these reference files as needed:

| Reference | When to read |
|-----------|--------------|
| `references/templates.md` | When creating any file (package.json, vite.config, extension, UI, styles) |
| `references/api-and-widgets.md` | When using app-runtime hooks, adding dashboard widgets, or checking manifest fields |
| `references/conversion-guide.md` | Only when converting an existing Pi extension (not for new plugins) |

## Architecture

```
                      state.json
                    (source of truth)
                    +------+------+
                    |             |
              Pi Extension    Web UI (React)
              (tools + cmds)  (module federation)
              works in Pi CLI  works in Sero only
              + Sero
```

Key properties:
- The extension is 100% standard Pi — works in Pi CLI with zero Sero deps
- Sero reads `sero` key in `package.json` to discover and mount the web UI
- State is workspace-scoped (default) or global-scoped, persists across sessions
- Changes from either side (agent tool or user clicking UI) sync instantly via file watching

## Step-by-step workflow

### Step 1: Determine the plugin details

Before writing any code, establish:
- **Plugin name** (e.g. `myapp`) — used in directory name, app ID, state path
- **Display name** (e.g. `My App`) — shown in sidebar
- **Icon** — Lucide icon name (e.g. `box`, `check-square`, `calculator`)
- **Scope** — `workspace` (default, project-specific data) or `global` (shared across workspaces)
- **State shape** — what data the extension and UI will share
- **Tools** — what agent tools to register
- **Dev port** — unique port for Vite dev server (5174+, check existing plugins first)

Check existing ports:
```bash
grep -r '"devPort"' plugins/sero-*-plugin/package.json
```

### Step 2: Create the directory structure

For plugins with a web UI, use this shape:

```
plugins/sero-<name>-plugin/
+-- package.json
+-- vite.config.ts          # root-level, uses root: 'ui'
+-- shared/
|   +-- types.ts
+-- extension/
|   +-- index.ts
|   +-- tsconfig.json
+-- ui/
|   +-- <Name>App.tsx
|   +-- styles.css
|   +-- tsconfig.json
|   +-- index.html
```

If the plugin is **extension-only** (no sidebar UI / no federated remote),
keep `package.json`, `shared/`, and `extension/`, and omit `vite.config.ts`,
`ui/`, and the `sero.app.ui` / `component` / `devPort` fields.

Read `references/templates.md` for the exact content of each file.

### Step 3: Create package.json

The package.json serves triple duty: Pi manifest + Sero app manifest + Sero
plugin manifest. Read `references/templates.md` for the full template.

Critical rules:
- `"keywords": ["pi-package"]` for Pi compatibility
- Pi SDK packages go in `peerDependencies` (runtime provides them)
- `@sero-ai/app-runtime` is a `devDependency` (shared via MF at runtime)
- `@sero-ai/ui` is a `devDependency` (bundled at build time)
- Use `@sero/common` for renderer-safe contracts shared across multiple plugins or desktop packages; keep app-local types in `shared/`
- `stateFile` stays required even for global apps — Sero ignores it there, but Pi CLI uses it as the fallback path
- `ui`, `component`, and `devPort` are required only when the plugin ships a web UI
- If the plugin is extension-only, remove the Vite-based `dev` / `build` / UI typecheck scripts and keep an extension-only `typecheck`
- `devPort` must be unique across all plugins

### Step 4: Define shared state types

Create `shared/types.ts` — the single source of truth imported by both
extension and UI.

Rules:
- Must be JSON-serialisable (no Date, Map, Set, functions)
- Provide a `DEFAULT_STATE` constant
- Keep the shape flat-ish
- Include auto-incrementing ID fields for lists
- If a type/helper stops being app-local, move that neutral contract into `@sero/common` instead of duplicating it

### Step 5: Mount the Plugin in the Workspace

To make the `plugins/sero-*-plugin/` directory visible within the Sero interface, you must mount its path to your workspace. This creates a **multi-root workspace**, allowing you to view and edit the plugin source code directly inside Sero.

1.  **Identify the full path** to your plugin source. 
    * *Example:* `/Users/danielcarter/Documents/Dev/projects/sero/sero/plugins/sero-sample-plugin/`
2.  **Run the mount command** using the `sero-cli`:

```bash
sero workspace mount-plugin [full-path-to-plugin]
```

> **Note:** Ensure you use the absolute path to the specific plugin directory so the CLI can resolve the location correctly.

### Step 6: Build the Pi extension

Create `extension/index.ts`. This is a standard Pi extension.

Key patterns:
- Use `StringEnum` from `@mariozechner/pi-ai` for action enums (not `Type.Union`)
- Resolve `statePath` from `ctx.cwd` in execute handler with session fallback
- Always use **atomic writes** (write to temp, then `fs.rename`)
- Keep tool output concise
- Handle `session_start` and `session_switch` events for state path resolution

Read `references/templates.md` for the full extension template.

### Step 7: Build the web UI

Create the React component in `ui/<Name>App.tsx`.

If the plugin is **extension-only**, skip this step and omit `vite.config.ts`,
`ui/`, and the `sero.app.ui` / `component` / `devPort` fields.

Critical requirements:
- **Both named and default exports required** — `export function MyApp()` AND `export default MyApp`
- Import components from `@sero-ai/ui/components/ui/*`
- Import `cn` from `@sero-ai/ui/lib/utils`
- Import `./styles.css` for Tailwind theme mapping
- Use Tailwind semantic colors (`bg-background`, `text-foreground`, etc.)

Also create:
- `vite.config.ts` at package root (not inside `ui/`)
- `ui/styles.css` with Tailwind + theme token mapping
- `ui/tsconfig.json`
- `ui/index.html` (required for Vite build)

Read `references/templates.md` for all file templates.

### Step 8: Build and verify

```bash
pnpm install
pnpm --filter @sero-ai/plugin-<name> build
pnpm --filter @sero-ai/plugin-<name> typecheck
```

All three must pass before the plugin is ready.

Why these steps matter:
- `pnpm install` links the new workspace package and dependencies
- `build` validates Module Federation and produces `dist/ui/remoteEntry.js` when the plugin has a UI
- `typecheck` catches both extension and UI errors before Sero loads the plugin

For **extension-only** plugins, skip the Vite build and use an extension-only
`typecheck` script instead.

### Step 8: Test

```bash
cd apps/desktop
SERO_DEV_PLUGINS=<name> bash scripts/dev.sh
```

1. Click the app in the sidebar
2. Add items via UI -> state.json updates -> UI re-renders
3. Ask agent to use the tool -> writes state.json -> file watcher fires -> UI updates

## Development workflow

- Include the plugin ID in `SERO_DEV_PLUGINS` to get UI HMR from the remote Vite dev server
- UI file changes under `ui/` should reload quickly without restarting Electron
- Changes to `extension/` or `shared/types.ts` require restarting the desktop dev server / Electron main process
- `devPort` in `package.json` must match `server.port` in `vite.config.ts`
- Useful logs:
  - `/tmp/sero-vite.log` — host Vite + remote reload events
  - `/tmp/sero-remote-<name>.log` — remote Vite dev server
  - `/tmp/sero-electron.log` — Electron main + forwarded renderer errors

## Critical rules

### Tool bridging (AD-020)

App tools are bridged into the single `sero-cli` tool — they do NOT appear as
standalone tool schemas. Always use `pi.registerTool()` in extensions.

- Plugin packages with `sero.plugin` bridge **all tools by default**
- Use `sero.plugin.bridgeTools` only to disable or be selective
- **Never** register app tools as `customTools` in `createAgentSession()`
- Bridged tools execute against the **current session's** loaded extension instance
- If a bridged tool needs current-session side effects, depend on the execution context passed into the tool instead of capturing a registration-scoped `pi` object inside the tool logic

### Auto-discovery

Registration is fully automatic. The host auto-discovers all
`plugins/sero-*-plugin/` directories with a `sero.app` manifest.
No manual edits to vite config, federation registry, electron main, or dev.sh.

### File size

No source file over 500 lines. Split into sub-components, utils, types files.

### State management

- **Never use localStorage** — all state through `useAppState` (file-backed)
- Keep state JSON-serialisable
- Always use atomic writes (temp file -> rename)

### Module Federation

- `react` and `react-dom` are shared singletons via MF
- `@sero-ai/app-runtime` is NOT shared via MF — uses globalThis singleton
- Add `@sero-ai/app-runtime` to `optimizeDeps.exclude`
- Do NOT alias `@sero-ai/app-runtime`
- Root component MUST have a default export

### Keyboard events

Scope listeners to the app's container element, never `window`.
Add `tabIndex={0}` and auto-focus the container on mount.

### Responsive sizing

Use `ResizeObserver` for dynamic dimensions, never fixed pixel values.

### Naming conventions

- Built-in plugin dir: `plugins/sero-<name>-plugin/`
- MF remote name: `sero_<id>` (underscore, valid JS identifier)
- Exposed module: `./<Component>`
- State file: `.sero/apps/<id>/state.json`
- npm package: `@sero-ai/plugin-<name>`

### Profile-aware paths

If the extension needs global config/cache outside workspace state:
- App-specific: `process.env.SERO_HOME` (e.g. `path.join(SERO_HOME, 'apps', '<id>', 'config.json')`)
- Pi SDK resources: `process.env.PI_CODING_AGENT_DIR`
- Pi CLI fallback: `~/.pi` only when env vars are unset

Never hardcode `~/.pi` — it breaks Sero profile isolation.

### Imports

- Always use top-level imports, never inline `import('...')` type expressions
- No unnecessary dynamic `await import('...')` for source modules

## Reference implementations

When in doubt, study these existing plugins:

| Plugin | Best for |
|--------|----------|
| `plugins/sero-git-plugin/` | Clean, focused app with single tool + substantial UI |
| `plugins/sero-kanban-plugin/` | Rich app with subagents, widgets, complex state |
| `plugins/sero-web-plugin/` | Converting an existing Pi extension |
| `plugins/sero-cron-plugin/` | Background jobs, command-oriented plugins |

## Related docs

- `docs/plugins-guide.md` — packaging and distributing installable plugins
- `docs/plugins-technical.md` — plugin system internals, federation, IPC, security
- `docs/architecture.md` — desktop shell layout and host-side state flow
- `apps/desktop/AGENTS.md` — project-wide rules (500 LOC, storage bans, import rules)

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Build fails: "Could not resolve entry module" | Add `ui/index.html` |
| App not in sidebar | Check `sero.app.id`/`name` in package.json, run `pnpm install` |
| Agent missing tool | Restart dev server, check `pi.extensions` field |
| UI changes not showing | Check remote Vite dev server running, extension changes need full restart |
| "No UI module registered" | Set `sero.app.component` and `devPort` in package.json |
| "No workspace selected" | Pick a workspace first, or make the plugin `scope: "global"` if it should work without one |
| State not syncing | Verify same `stateFile` path, use atomic writes |
| Keyboard stealing input | Scope listeners to container, not `window` |
| `lazy: Expected dynamic import` | Add `export default MyApp` to component file |
| MF errors | Check `devPort` matches `server.port` in vite.config.ts |
