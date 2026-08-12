---
name: sero-plugin
description: |
  Create Sero plugins — self-contained packages with a Pi extension (agent
  tools/commands), an optional React UI loaded via Module Federation, and an
  optional background runtime. Use when the user asks to create a Sero
  plugin/app/extension, add a sidebar panel, dashboard widget, or
  agent-integrated feature, or convert a Pi extension into a Sero plugin.
  Trigger on phrases like "create a plugin", "new Sero app", "add a tool
  with UI", "build an extension", "convert this Pi extension", or any
  request that touches `plugins/sero-*-plugin/`.
---

# Building Sero Plugins

A Sero plugin can expose up to three coordinated surfaces, all backed by a
single JSON state file:

- **Pi extension** (`extension/`) — standard Pi. Pi-CLI-safe, no Sero imports. Registers tools and commands.
- **Web UI** (`ui/`) — optional React UI loaded via Module Federation. Sero-only.
- **Background runtime** (`runtime/`) — optional. Sero-only. Long-lived workspace orchestration.

```
                    state.json (source of truth)
            ┌──────────────┼──────────────┐
       Pi extension     Web UI     Background runtime
       (Pi-CLI safe)   (Sero only)    (Sero only)
```

Sero auto-discovers `plugins/sero-*-plugin/` directories with a `sero.app`
manifest in `package.json`. No manual registry edits.

## When to read reference files

| Reference | When to read |
|-----------|--------------|
| `example/sero-notes-plugin/` | **Start here.** Canonical, minimal plugin that exercises every surface (extension + CLI bridge, background runtime, UI hooks, static + dynamic widgets, MF config). Copy and rename it as your starting point. See `example/README.md` for the file map. |
| `references/templates.md` | Creating any file (package.json, extension, runtime, UI, Vite, styles). Also contains the Quick do/don't guide and mini examples. |
| `references/api-and-widgets.md` | Using app-runtime hooks, background runtimes, dashboard widgets, manifest fields |
| `references/conversion-guide.md` | Converting an existing Pi extension into a plugin |
| `references/installing.md` | Making the package installable, and what each install failure means |

## Core rules

### UI → plugin behavior
If the UI must trigger plugin-owned logic (sign in, refresh, mutate state,
call an API), register a normal plugin tool and invoke it from React:

```ts
const { run } = useAppTools();
await run('myapp_auth', { action: 'login' });
```

Never add a plugin-specific host bridge (`window.sero.myPlugin.*`, custom
preload/IPC channels). Declare the host seams you actually use in
`sero.plugin.requiredHostCapabilities`:

| Capability | Declare when |
|------------|--------------|
| `appAgent.invokeTool` | UI uses `useAppTools()` or `window.sero.appAgent.invokeTool(...)` |
| `tool.cli` | Plugin uses `bridgeTools`, custom `cli` metadata, or `cli.overrideBuiltin` |
| `appRuntime.background` | Plugin declares `sero.app.runtime` |

### Tool bridging (AD-020)
App tools are bridged into the single `sero-cli` tool — always use `pi.registerTool()`.

- Plugins bridge all tools to `sero <tool> ...` by default
- `sero.plugin.bridgeTools`: omit/`true` = bridge all, `false` = none, `string[]` = selected tool names
- Custom CLI help / summary / raw-args parsing goes on the tool's `cli` field
- `cli.overrideBuiltin: true` only when intentionally replacing a builtin command
- Never register app tools as `customTools` in `createAgentSession()`
- Bridged tools run against the current session's extension — don't capture registration-scoped `pi` state in tool logic
- If a tool exposes CLI subcommands, keep them self-explanatory and consistent with any structured tool actions; support aliases when needed and return explicit errors for unknown subcommands rather than silently falling back to another action

### Prompt templates, skills, and slash-command naming
- Plugin-owned prompt templates and skills are **manifest-driven**. Declaring `prompts/` or `skills/` folders is not enough by itself.
- Add prompt templates to `pi.prompts` in `package.json` (for example `"./prompts/myapp.md"`).
- Add plugin skills to `pi.skills` in `package.json` (for example `"./skills"`).
- If a bridged tool should also have a same-name slash shortcut (for example `/mcp` for the bridged `mcp` tool), prefer a prompt template declared in `pi.prompts`.
- Keep `pi.registerCommand(...)` names **distinct** from bridged tool names unless you intentionally want to shadow/replace that CLI entry point.
- After adding or changing `pi.prompts` / `pi.skills`, reload resources (`/reload`) or restart the session before testing the slash menu.

### Background runtime
Use `runtime/` **only** for long-lived workspace-scoped behavior: startup
recovery/reconcile, watchers beyond simple UI sync, subagent orchestration,
worktree/PR/cleanup flows, managed dev-server coordination.

Do **not** use it for simple CRUD, one-shot UI actions, or Pi-CLI-safe logic.

Boundaries:
- `extension/` stays Pi-safe
- `runtime/` is Sero-only; type against `@sero-ai/common`, never desktop internals
- Plugin-specific orchestration stays in the plugin, not the host

### Host ownership
- Plugin-specific business logic lives in the plugin, not desktop preload/IPC
- External plugins consume `packages/*` via published package names — do **not** import `../../packages/*` source paths
- Keep plugin-specific types in `shared/`; only promote neutral cross-plugin contracts to `@sero-ai/common`
- Never copy desktop host aliases (`@electron`, `@plugins`, `@packages`, `@/`) into plugin TS config

### State
- **Never use `localStorage`** — all UI state through `useAppState` (file-backed)
- Keep state JSON-serialisable (no Date/Map/Set/functions)
- Always use atomic writes (temp file → `fs.rename`)
- Resolve global paths from `SERO_HOME` / `PI_CODING_AGENT_DIR`; fall back to `~/.pi` only when env vars are unset (Pi CLI mode)

## Step-by-step workflow

### 1. Plan
Decide up front:
- **Plugin name** (e.g. `myapp`) — directory, app ID, state path
- **Display name**, **Lucide icon**, **scope** (`workspace` default, or `global`)
- **State shape** shared across surfaces
- **Tools** to register
- **Runtime?** Only for long-lived orchestration
- **Dev port** — unique 5174+; check existing:
  ```bash
  grep -r '"devPort"' plugins/sero-*-plugin/package.json
  ```

### 2. Create the directory

```
plugins/sero-<name>-plugin/
├── package.json
├── vite.config.ts            # UI only, at package root
├── prompts/                  # optional prompt templates (declare in pi.prompts)
├── skills/                   # optional plugin skills (declare in pi.skills)
├── shared/types.ts
├── extension/
│   ├── index.ts
│   └── tsconfig.json
├── runtime/                  # optional
│   ├── index.ts
│   └── tsconfig.json
└── ui/                       # optional
    ├── <Name>App.tsx
    ├── styles.css
    ├── tsconfig.json
    ├── vite-env.d.ts
    └── index.html
```

Extension-only plugins omit `vite.config.ts`, `ui/`, and the
`sero.app.ui`/`component`/`devPort` fields.

### 3. Write `package.json`

Triple-duty: Pi manifest + Sero app manifest + Sero plugin manifest.
See `references/templates.md` for the full template.

Critical:
- `"keywords": ["pi-package"]`
- Pi SDK packages in `peerDependencies`
- `@sero-ai/app-runtime` and `@sero-ai/ui` in `devDependencies`
- `stateFile` is required even for global apps (Pi-CLI fallback)
- `ui`, `component`, `devPort` only when the plugin ships a UI
- `runtime` only when the plugin ships a runtime; add `runtime/tsconfig.json` to the `typecheck` script
- Declare prompt templates in `pi.prompts` and plugin skills in `pi.skills`; folders alone are not auto-loaded
- If you need a same-name slash shortcut for a bridged tool, use a prompt template in `pi.prompts` rather than `pi.registerCommand` with the same name
- Declare `requiredHostCapabilities` only for seams you use
- For extension-only plugins, drop the Vite `dev`/`build` scripts
- For built-in plugins with non-trivial extension deps, set `sero.plugin.bundleExtensions: true`; list native, large, or runtime-loaded extension packages in `sero.plugin.extensionExternals`

### 4. Define `shared/types.ts`

Single source of truth imported by extension, UI, and runtime.
- JSON-serialisable only
- Export a `DEFAULT_STATE` constant
- Auto-incrementing IDs for lists

### 5. Mount the plugin into your workspace (dev only)

Expose the plugin source inside Sero as a multi-root workspace:

```bash
sero workspace mount-plugin /absolute/path/to/plugins/sero-<name>-plugin
```

### 6. Build the Pi extension

`extension/index.ts` is standard Pi. Template in `references/templates.md`.

Key patterns:
- Use `StringEnum` from `@earendil-works/pi-ai` for action enums (not `Type.Union`)
- Resolve `statePath` from `ctx.cwd` inside `execute` handlers; use `session_start` only as a warm fallback
- Atomic writes only (temp → rename)
- Keep tool output concise
- Do not depend on `session_switch` unless your target SDK guarantees it

### 7. Optional: background runtime

`runtime/index.ts` must export `createAppRuntime(ctx)` and default-export `{ createAppRuntime }`.

Required wiring:
- `sero.app.runtime: "./runtime/index.ts"` in `package.json`
- `runtime/tsconfig.json` included in the `typecheck` script
- `requiredHostCapabilities: ["appRuntime.background"]`
- If the runtime imports native/non-bundle-safe packages, list them in `sero.app.runtimeExternals`
- If the extension imports native/non-bundle-safe packages and uses bundled release packaging, list them in `sero.plugin.extensionExternals`

Context provides: `appId`, `workspaceId`, `workspacePath`, `stateFilePath`,
and `host.{appState, subagents, workspace, verification, git, devServers}`.

### 8. Optional: build the UI

React component in `ui/<Name>App.tsx`. Template in `references/templates.md`.

Required:
- **Both** exports: `export function MyApp()` AND `export default MyApp`
- Import UI components from `@sero-ai/ui`
- Import `./styles.css` from **every** exposed MF entry (main app, widgets, etc.)
- Tailwind semantic colors (`bg-background`, `text-foreground`, etc.)
- `ui/styles.css` should import `@sero-ai/ui/styles/plugin.css` and scan plugin-local files with `@source "./**/*.{ts,tsx}"`
- UI plugins must set `sero.app.styleIsolation` to `"scope"` and add `seroPluginCssScope({ pluginId: '<app-id>' })` after Tailwind in `vite.config.ts`.
- Do not alias `@sero-ai/app-runtime`
- Scope keyboard listeners to the container (`tabIndex={0}`), never `window`
- Use `ResizeObserver` for dynamic sizing

Also create: `vite.config.ts` (at package root), `ui/styles.css`,
`ui/tsconfig.json`, `ui/vite-env.d.ts`, `ui/index.html`.

### 9. Verify

```bash
pnpm install
pnpm --filter @sero-ai/plugin-<name> build       # UI only
pnpm --filter @sero-ai/plugin-<name> typecheck
bash scripts/build-plugin.sh plugins/sero-<name>-plugin   # installable bundle / release packaging
```

All must pass before the plugin is ready.

### 10. Test end-to-end

```bash
cd apps/desktop
SERO_DEV_PLUGINS=<name> bash scripts/dev.sh
```

Verify:
1. Plugin appears in the sidebar
2. UI mutations → `state.json` → UI re-renders
3. Agent tool call → `state.json` → file watcher → UI updates
4. If the plugin ships `pi.prompts` / `pi.skills`, reload resources (`/reload`) and confirm the slash menu shows them
5. If tools are CLI-bridged, confirm no command name shadows the bridged entry point (`help <tool>` / `sero <tool> ...` still hit the real tool)
6. If `runtime/`: starts on workspace open, reacts to state, cleans up on close

## Module Federation

- `react` / `react-dom` are shared singletons
- `@sero-ai/app-runtime` is **not** shared via MF — uses `globalThis` singleton; add to `optimizeDeps.exclude`
- Production `vite.config.ts` must use `base: './'`
- MF remote name convention: `sero_<id>` (valid JS identifier)
- Exposed module: `./<Component>`
- Every exposed entry must import the plugin stylesheet so external remotes ship their own CSS

## Development workflow

- UI changes (`ui/`) are handled by the remote Vite dev server. Sero also sends a lightweight cache-busted UI refresh for active local dev sessions; this should remount only the plugin surface, not refresh shell resources or restart agent/runtime state.
- Changes to `extension/`, `runtime/`, `shared/types.ts`, `prompts/`, `skills/`, or `package.json` refresh the local plugin development session and may reload plugin resources
- `devPort` in `package.json` must match `server.port` in `vite.config.ts`
- Logs: `/tmp/sero-vite.log`, `/tmp/sero-remote-<name>.log`, `/tmp/sero-electron.log`
- If Local Plugin Development fails before Vite starts with an `esbuild` host/binary version mismatch or a missing Rollup native package, suspect stale platform-specific optional dependencies in the plugin's own `node_modules`. Sero attempts a one-time host-side `pnpm install --force` repair for these failures. If repair still fails, delete `node_modules` and reinstall from inside that plugin directory on the **macOS host** before changing source code. Do not run the reinstall from a Sero workspace/container terminal, because that can install Linux native packages into a path that the macOS host dev server later executes.

## Conventions

- Plugin directory: `plugins/sero-<name>-plugin/`
- npm package: `@sero-ai/plugin-<name>`
- State file: `.sero/apps/<id>/state.json` (workspace) or under `SERO_HOME` (global)
- No source file over 500 LOC — split into sub-components, utils, or types files
- Always top-level imports; no dynamic `await import(...)` for source modules

## Reference implementations

| Plugin | Best for |
|--------|----------|
| `example/sero-notes-plugin/` (in this skill) | **Canonical minimal plugin.** Every surface (tool + CLI bridge, command, runtime, UI hooks, static + dynamic widgets) in the smallest possible footprint. |

The plugins in Sero's own repository (`sero-git-plugin`, `sero-admin-plugin`,
`sero-cron-plugin`, `sero-web-plugin`) are further examples. They are readable
only when you are working inside that repository.

## Related skills

- **`sero-dashboard-ui`** (`../sero-dashboard-ui/SKILL.md`) — building or
  redesigning dashboard widgets and compact plugin views with the shared
  `@sero-ai/ui` dashboard components. Read it whenever a plugin has a widget.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Build fails: `Could not resolve entry module "node_modules/__mf__virtual/...hostAutoInit..."` | Keep Vite root at the package root; use `build.rollupOptions.input: 'ui/index.html'` instead of `root: 'ui'` |
| Local Plugin Development fails: `Cannot start service: Host version "..." does not match binary version "..."` from `esbuild` | The plugin has stale/mismatched native optional dependencies. Sero should try one host-side auto-repair. If it still fails, from the plugin directory on the **macOS host** (not inside the Sero container), run `rm -rf node_modules && pnpm install --force`, then retry `pnpm exec vite --host 127.0.0.1` or Local Plugin Development. Do not patch Vite config/package versions first. |
| Local Plugin Development fails: `Cannot find module @rollup/rollup-darwin-arm64` or another `@rollup/rollup-*` native package | Same root cause: platform-specific optional dependencies were not installed for the current machine. Sero should try one host-side auto-repair. If it still fails, from the plugin directory on the macOS host, run `rm -rf node_modules && pnpm install --force`. |
| App not in sidebar | Check `sero.app.id`/`name` in package.json, run `pnpm install` |
| Agent missing tool | Restart dev server, check `pi.extensions` field |
| UI changes not showing | Check remote Vite running; extension changes need full restart |
| External plugin missing styles | Import `./styles.css` from every exposed MF entry; verify `@source` paths in `ui/styles.css` |
| Packaged plugin missing an extension dependency | If it must stay in `node_modules`, add the package name to `sero.plugin.extensionExternals`; otherwise keep it in `dependencies` and let `bundleExtensions` include it in the JS entrypoint |
| `Cannot find module './styles.css'` | Add `ui/vite-env.d.ts` with `/// <reference types="vite/client" />` |
| Runtime never starts | Declare `sero.app.runtime` + `requiredHostCapabilities: ["appRuntime.background"]`; check `/tmp/sero-electron.log` |
| Build fails because no HTML entry exists | Add `ui/index.html` |
| "No UI module registered" | Set `sero.app.component` and `devPort` |
| "No workspace selected" | Pick one, or set `scope: "global"` |
| State not syncing | Verify same `stateFile` path, use atomic writes |
| Keyboard stealing input | Scope listeners to container, not `window` |
| `lazy: Expected dynamic import` | Add `export default MyApp` to component file |
| MF errors | `devPort` in package.json must match `server.port` in vite.config.ts |
