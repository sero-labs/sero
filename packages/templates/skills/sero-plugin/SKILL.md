---
name: sero-plugin
description: |
  Step-by-step guide for creating new Sero plugins — self-contained packages
  with a Pi extension (agent tools/commands), an optional React web UI loaded
  via Module Federation, and an optional background runtime for long-lived
  workspace orchestration. Use this skill whenever the user asks to
  create a new Sero app, plugin, extension, or tool with a UI, or when they
  want to add a new sidebar panel, dashboard widget, or agent-integrated
  feature to Sero. Also use when converting an existing Pi extension into a
  Sero plugin. Trigger on phrases like "create a plugin", "new Sero app",
  "add a tool with UI", "build an extension", "convert this Pi extension",
  or any request that involves creating something under plugins/sero-*-plugin/.
---

# Building Sero Plugins

This skill guides you through creating a complete Sero plugin from scratch.
A Sero plugin can contain up to three coordinated surfaces:
- a **standard Pi extension** for tools / commands
- an optional **React web UI** loaded via Module Federation
- an optional **background runtime** for long-lived workspace orchestration

All three can share state through a JSON file on disk.

## When to read reference files

This SKILL.md contains the workflow and key rules. For detailed file templates
and code snippets, read these reference files as needed:

| Reference | When to read |
|-----------|--------------|
| `references/templates.md` | When creating any file (package.json, extension, runtime, UI, Vite, styles) |
| `references/api-and-widgets.md` | When using app-runtime hooks, background runtimes, dashboard widgets, or checking manifest fields |
| `references/conversion-guide.md` | Only when converting an existing Pi extension (not for new plugins) |

## Architecture

```
                           state.json
                         (source of truth)
                 +---------------+---------------+
                 |               |               |
           Pi Extension      Web UI (React)   Background Runtime
           (tools + cmds)   (module federation) (optional)
           Pi CLI-safe      Sero only          Sero only
```

Key properties:
- The extension is 100% standard Pi — works in Pi CLI with zero Sero-only imports
- The web UI is optional and Sero-only
- The background runtime is optional and Sero-only; use it for long-lived workspace watching, startup recovery, orchestration, and cleanup semantics
- Sero reads the `sero` key in `package.json` to discover and mount the UI and background runtime
- State is workspace-scoped (default) or global-scoped, and persists across sessions
- Plugin UIs should trigger plugin behavior by calling their own tools through `useAppTools()` / `window.sero.appAgent.invokeTool(...)`
- Do **not** ask the host to add a custom bridge like `window.sero.myPlugin.doThing()` unless you are intentionally changing the Sero platform itself
- Changes from the extension, UI, or runtime sync through the same file-backed state

## New external-plugin rules (important)

Recent external-plugin work added three host seams that plugin authors now
need to understand.

### 1) UI -> plugin tool calls

If your React UI needs to do something that belongs to the plugin extension
(sign in, refresh data, run a fetch, mutate state, call an API, etc.), the UI
should call one of the plugin's own tools.

Use:
- `useAppTools().run('tool_name', params)` inside React components
- `window.sero.appAgent.invokeTool(...)` only when you cannot use the hook

Do **not** build a plugin-specific host API such as:
- `window.sero.google.*`
- `window.sero.myPlugin.*`
- new plugin-specific preload / IPC channels

If your plugin UI depends on this bridge, add this to `package.json`:

```json
{
  "sero": {
    "plugin": {
      "requiredHostCapabilities": ["appAgent.invokeTool"]
    }
  }
}
```

### 2) Plugin-owned CLI commands

If you want a plugin tool to show up as a `sero ...` command, use manifest-driven
CLI bridging.

Simple rule:
- normal tool only -> just `pi.registerTool()`
- tool should also be callable as `sero mytool ...` -> use `bridgeTools`
- tool needs custom CLI help / summaries / raw arg handling -> add `cli` on the tool definition

If the plugin depends on bridged CLI behavior, add this capability:

```json
{
  "sero": {
    "plugin": {
      "requiredHostCapabilities": ["tool.cli"]
    }
  }
}
```

If you need both UI->tool calls and CLI bridging, declare both:

```json
{
  "sero": {
    "plugin": {
      "requiredHostCapabilities": ["appAgent.invokeTool", "tool.cli"]
    }
  }
}
```

### 3) Plugin-owned background runtimes

If your plugin needs long-lived, workspace-scoped behavior that should continue
outside the UI lifecycle, add a plugin-owned background runtime.

Good fits:
- file watching beyond simple UI state sync
- startup recovery / reconcile passes
- subagent orchestration
- worktree / PR / cleanup flows
- managed dev-server or verification coordination

Do **not** use a background runtime for:
- simple CRUD mutations that belong in extension tools
- one-shot UI actions that should just call a tool
- Pi CLI-safe logic that must remain usable outside Sero

Manifest pattern:

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit -p ui/tsconfig.json && tsc --noEmit -p extension/tsconfig.json && tsc --noEmit -p runtime/tsconfig.json"
  },
  "sero": {
    "app": {
      "runtime": "./runtime/index.ts"
    },
    "plugin": {
      "requiredHostCapabilities": ["appRuntime.background"]
    }
  }
}
```

Boundary rules:
- `extension/` stays Pi-safe and CLI-safe
- `runtime/` owns Sero-only orchestration
- `runtime/` should type against `@sero-ai/common` runtime contracts, not desktop-internal imports
- if logic exists only because of this plugin's runtime behavior, keep it in the plugin instead of pushing it into the Sero host

### Quick do / don't guide

| Situation | Do | Don't |
|-----------|----|-------|
| UI button needs to sign in, refresh, sync, or fetch data | Register a normal plugin tool and call it with `useAppTools().run(...)` | Ask the host for a custom API like `window.sero.myPlugin.signIn()` |
| Plugin tool should also work as `sero mytool ...` | Use `sero.plugin.bridgeTools` | Add special host-side command wiring for that plugin |
| Plugin CLI needs custom subcommands/help/raw args | Put that logic on the tool's `cli` field | Build a second parallel CLI implementation in the host |
| Plugin needs host support for direct UI->tool calls | Declare `requiredHostCapabilities: ["appAgent.invokeTool"]` | Assume every host supports it without declaring it |
| Plugin needs bridged CLI behavior | Declare `requiredHostCapabilities: ["tool.cli"]` | Rely on unstated host behavior |
| Plugin needs long-lived workspace orchestration, recovery, or watchers | Add `runtime/`, declare `sero.app.runtime`, and require `appRuntime.background` | Hide orchestration inside UI effects or ask the host for plugin-specific runtime glue |
| Extracting a built-in plugin to external | Move plugin-specific logic into the plugin | Leave plugin-specific preload/IPC/types in the Sero host |

### Mini examples

#### Example 1: UI button triggers plugin auth

Use this when a React button should start a plugin-owned action.

```tsx
import { useAppTools } from '@sero-ai/app-runtime';

export function MyApp() {
  const { run } = useAppTools();

  async function handleSignIn() {
    await run('myapp_auth', { action: 'login' });
  }

  return <button onClick={handleSignIn}>Sign in</button>;
}
```

Manifest requirement:

```json
{
  "sero": {
    "plugin": {
      "requiredHostCapabilities": ["appAgent.invokeTool"]
    }
  }
}
```

#### Example 2: Plugin exposes `sero myapp ...`

Use this when a plugin tool should be available as a normal Sero CLI command.

```json
{
  "sero": {
    "plugin": {
      "bridgeTools": ["myapp"]
    }
  }
}
```

```ts
pi.registerTool({
  name: 'myapp',
  label: 'My App',
  description: 'Manage My App data',
  parameters: Params,
  async execute() {
    return {
      content: [{ type: 'text', text: 'Done' }],
      details: {},
    };
  },
});
```

Result: users and the agent can invoke the bridged command as `sero myapp ...`.

#### Example 3: Plugin replaces a builtin command intentionally

Use this only when the plugin is deliberately taking over an existing command name.

```ts
pi.registerTool({
  name: 'google',
  label: 'Google',
  description: 'Google integration',
  parameters: Params,
  async execute() {
    return {
      content: [{ type: 'text', text: 'Done' }],
      details: {},
    };
  },
  cli: {
    summary: 'Google tools',
    help: 'sero google <subcommand>',
    overrideBuiltin: true,
    async execute(args, ctx) {
      return {
        output: `Handled: ${args.join(' ')}`,
        exitCode: 0,
      };
    },
  },
});
```

Manifest requirement:

```json
{
  "sero": {
    "plugin": {
      "bridgeTools": ["google"],
      "requiredHostCapabilities": ["tool.cli"]
    }
  }
}
```

## Step-by-step workflow

### Step 1: Determine the plugin details

Before writing any code, establish:
- **Plugin name** (e.g. `myapp`) — used in directory name, app ID, state path
- **Display name** (e.g. `My App`) — shown in sidebar
- **Icon** — Lucide icon name (e.g. `box`, `check-square`, `calculator`)
- **Scope** — `workspace` (default, project-specific data) or `global` (shared across workspaces)
- **State shape** — what data the extension, UI, and optional runtime will share
- **Tools** — what agent tools to register
- **Background runtime?** — only if the plugin needs long-lived workspace orchestration beyond UI/tool lifecycles
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
+-- runtime/                # optional: Sero-only background runtime
|   +-- index.ts
|   +-- tsconfig.json
+-- ui/
|   +-- <Name>App.tsx
|   +-- styles.css
|   +-- tsconfig.json
|   +-- vite-env.d.ts
|   +-- index.html
```

If the plugin is **extension-only** (no sidebar UI / no federated remote),
keep `package.json`, `shared/`, and `extension/`, and omit `vite.config.ts`,
`ui/`, and the `sero.app.ui` / `component` / `devPort` fields.

If the plugin does **not** need long-lived background orchestration, omit
`runtime/`, skip the runtime typecheck, and do not set `sero.app.runtime`.

Read `references/templates.md` for the exact content of each file.

### Step 3: Create package.json

The package.json serves triple duty: Pi manifest + Sero app manifest + Sero
plugin manifest. Read `references/templates.md` for the full template.

Critical rules:
- `"keywords": ["pi-package"]` for Pi compatibility
- Pi SDK packages go in `peerDependencies` (runtime provides them)
- `@sero-ai/app-runtime` is a `devDependency` (shared via MF at runtime)
- `@sero-ai/ui` is a `devDependency` (bundled at build time)
- Use `@sero-ai/common` for renderer-safe contracts shared across multiple plugins or desktop packages; keep app-local types in `shared/`
- Treat the monorepo `packages/*` folders as host-owned shared package sources that external plugins consume via published package names — do NOT import `../../packages/*` source paths from an external plugin, and do NOT move plugin-specific domain models into `packages/*`
- `stateFile` stays required even for global apps — Sero ignores it there, but Pi CLI uses it as the fallback path
- `ui`, `component`, and `devPort` are required only when the plugin ships a web UI
- `runtime` is required only when the plugin ships a background runtime; if present, add `runtime/tsconfig.json` to the package `typecheck` script
- If the plugin is extension-only, remove the Vite-based `dev` / `build` / UI typecheck scripts and keep an extension-only `typecheck`
- `devPort` must be unique across all plugins
- Declare `sero.plugin.requiredHostCapabilities` only for the host features your plugin actually uses:
  - `appAgent.invokeTool` -> your UI calls plugin tools with `useAppTools()` / `window.sero.appAgent.invokeTool(...)`
  - `tool.cli` -> your tool is exposed as `sero <command>` via `bridgeTools`, custom `cli`, or builtin override behavior
  - `appRuntime.background` -> your plugin declares `sero.app.runtime` and depends on the background-runtime host capability bag
- `sero.plugin.bridgeTools` controls which plugin tools become `sero ...` commands:
  - omit or `true` -> bridge all plugin tools
  - `false` -> bridge none of them
  - `string[]` -> bridge only the listed tool names

### Step 4: Define shared state types

Create `shared/types.ts` — the single source of truth imported by both
extension and UI.

Rules:
- Must be JSON-serialisable (no Date, Map, Set, functions)
- Provide a `DEFAULT_STATE` constant
- Keep the shape flat-ish
- Include auto-incrementing ID fields for lists
- If a type/helper stops being app-local, move that neutral **platform** contract into `@sero-ai/common` instead of duplicating it
- If the type/helper is still plugin-specific, keep it in the plugin's own `shared/` layer (or a plugin-owned published package) rather than promoting it into Sero's monorepo `packages/*`

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
- Resolve `statePath` from `ctx.cwd` inside execute handlers; keep registration-scoped session state only as a fallback
- Always use **atomic writes** (write to temp, then `fs.rename`)
- Keep tool output concise
- `session_start` is useful for warmup / fallback state resolution; do not depend on `session_switch` unless the SDK surface you target explicitly guarantees it

Read `references/templates.md` for the full extension template.

### Step 7: Build the optional background runtime

Create `runtime/index.ts` only when your plugin needs long-lived,
workspace-scoped behavior that should continue outside the UI lifecycle.

Good uses:
- startup recovery / reconcile passes
- background watchers for runtime-owned files
- subagent orchestration
- managed dev-server coordination
- worktree / PR / cleanup flows

Critical requirements:
- add `sero.app.runtime: "./runtime/index.ts"` to `package.json`
- add `runtime/tsconfig.json` and include it in the package `typecheck` script
- declare `requiredHostCapabilities: ["appRuntime.background"]`
- if the runtime imports native or otherwise non-bundle-safe packages, declare `sero.app.runtimeExternals: ["<package>"]` so the TS runtime loader leaves them external
- export `createAppRuntime(ctx)` from `runtime/index.ts` and default-export `{ createAppRuntime }`
- type against `@sero-ai/common` runtime contracts rather than desktop-host internals
- keep Pi-safe logic in `extension/`; keep Sero-only orchestration in `runtime/`

The runtime receives:
- `ctx.appId`
- `ctx.workspaceId`
- `ctx.workspacePath`
- `ctx.stateFilePath`
- `ctx.host.{appState, subagents, workspace, verification, git, devServers}`

Read `references/templates.md` and `references/api-and-widgets.md` for the runtime manifest and entry-template details.

### Step 8: Build the web UI

Create the React component in `ui/<Name>App.tsx`.

If the plugin is **extension-only**, skip this step and omit `vite.config.ts`,
`ui/`, and the `sero.app.ui` / `component` / `devPort` fields.

Critical requirements:
- **Both named and default exports required** — `export function MyApp()` AND `export default MyApp`
- Import components from `@sero-ai/ui/components/ui/*`
- Import `cn` from `@sero-ai/ui/lib/utils`
- Import `./styles.css` for Tailwind theme mapping
- Import the shared stylesheet from **every exposed Module Federation entry** (the main app, widgets, and any other directly exposed components) so installed external plugins ship their own CSS
- Use Tailwind semantic colors (`bg-background`, `text-foreground`, etc.)
- If the UI needs to trigger extension behavior, register a normal plugin tool and call it with `useAppTools().run(...)`
- Do **not** invent a one-off host API for that plugin unless you are intentionally changing Sero core
- Keep plugin UI aliases/plugin TS config local to the plugin package. Do not copy desktop host aliases like `@electron`, `@plugins`, or `@packages` into plugin UI code unless you intentionally depend on host source.

Also create:
- `vite.config.ts` at package root (not inside `ui/`)
- `ui/styles.css` with Tailwind + theme token mapping
- `ui/tsconfig.json`
- `ui/vite-env.d.ts` (or equivalent Vite client typing) when side-effect CSS imports are used
- `ui/index.html` (required for Vite build)

Read `references/templates.md` for all file templates.

### Step 9: Build and verify

```bash
pnpm install
pnpm --filter @sero-ai/plugin-<name> build
pnpm --filter @sero-ai/plugin-<name> typecheck
```

All three must pass before the plugin is ready.

Why these steps matter:
- `pnpm install` links the new workspace package and dependencies
- `build` validates Module Federation and produces `dist/ui/remoteEntry.js` when the plugin has a UI
- `typecheck` catches extension, UI, and optional runtime errors before Sero loads the plugin

For **extension-only** plugins, skip the Vite build and use an extension-only
`typecheck` script instead.

### Step 10: Test

```bash
cd apps/desktop
SERO_DEV_PLUGINS=<name> bash scripts/dev.sh
```

1. Click the app in the sidebar
2. Add items via UI -> state.json updates -> UI re-renders
3. Ask agent to use the tool -> writes state.json -> file watcher fires -> UI updates
4. If the plugin has `runtime/`, verify the runtime starts for an open workspace, reacts to state changes, and cleans up correctly when the workspace closes

## External plugin migration checklist

Use this when extracting a built-in Sero app into an external plugin, or when
updating an older plugin to the current host contract.

If you're unsure about a checkbox, re-read the "Quick do / don't guide" and
"Mini examples" above before you change host code.

### UI execution
- [ ] If the UI needs to trigger plugin behavior, it calls plugin-owned tools via `useAppTools().run(...)`
- [ ] No plugin-specific preload / IPC bridge was added (`window.sero.<plugin>.*`)
- [ ] If the UI depends on direct tool invocation, `sero.plugin.requiredHostCapabilities` includes `"appAgent.invokeTool"`

### CLI behavior
- [ ] Decide which tools should become `sero ...` commands
- [ ] Set `sero.plugin.bridgeTools` intentionally:
  - [ ] omit / `true` to bridge all tools
  - [ ] `false` to bridge none
  - [ ] `string[]` to bridge only selected tools
- [ ] If a bridged tool needs custom help / summary / raw-args parsing, that logic lives on the tool definition in `cli`
- [ ] If the plugin depends on bridged CLI behavior, `sero.plugin.requiredHostCapabilities` includes `"tool.cli"`
- [ ] If the plugin replaces a builtin command, `cli.overrideBuiltin: true` is used intentionally and documented

### Manifest + packaging
- [ ] `package.json` includes a valid `sero.app` manifest
- [ ] `package.json` includes a valid `sero.plugin` manifest
- [ ] `minSeroVersion` is set when the plugin requires a newer Sero host
- [ ] `requiredHostCapabilities` includes only the seams the plugin actually uses
- [ ] If the plugin owns a background runtime, `sero.app.runtime` is declared intentionally
- [ ] Production `vite.config.ts` uses `base: './'`
- [ ] Runtime npm dependencies are declared in the plugin's own `dependencies`
- [ ] The plugin does not rely on monorepo-only imports that will disappear after extraction

### State + paths
- [ ] Shared UI/extension state lives in `shared/` and is JSON-serialisable
- [ ] Persistent UI state goes through `useAppState`, not `localStorage`
- [ ] Writes to state files are atomic
- [ ] App-specific global config/cache paths use `process.env.SERO_HOME`
- [ ] Pi agent/resource paths use `process.env.PI_CODING_AGENT_DIR`
- [ ] The plugin does not hardcode `~/.pi` except as a Pi CLI fallback when env vars are missing

### Background runtime
- [ ] Add `runtime/` only when the plugin truly needs long-lived background behavior
- [ ] If `runtime/` exists, `requiredHostCapabilities` includes `"appRuntime.background"`
- [ ] Runtime code types against `@sero-ai/common` runtime contracts rather than desktop-internal imports
- [ ] Startup recovery, watch/reconcile, and long-lived orchestration semantics live in `runtime/`, not in renderer `useEffect`s
- [ ] Pi-safe logic remains in `extension/`

### UI bundling / styling
- [ ] Every exposed MF entry imports the plugin stylesheet (`./styles.css` or `../styles.css`)
- [ ] `ui/styles.css` includes the Tailwind `@source` paths the plugin depends on
- [ ] `ui/vite-env.d.ts` (or equivalent `vite/client` typing) exists when side-effect CSS imports are used

### Host ownership boundaries
- [ ] Plugin-specific business logic lives in the plugin, not in desktop host preload / IPC glue
- [ ] The plugin does not require new host-only types/channels unless you are intentionally extending the Sero platform itself
- [ ] If the plugin was converted from an older built-in app, any old bespoke host bridge was removed or replaced with a generic host seam

### Verification
- [ ] `pnpm install` passes
- [ ] `pnpm --filter @sero-ai/plugin-<name> build` passes (if the plugin has a UI)
- [ ] `pnpm --filter @sero-ai/plugin-<name> typecheck` passes
- [ ] The plugin appears in Sero without manual host wiring
- [ ] If bridged CLI behavior is used, reinstall/update refreshes help and execution truthfully
- [ ] If the UI uses `useAppTools()`, those calls work without any plugin-specific host bridge

## Development workflow

- Include the plugin ID in `SERO_DEV_PLUGINS` to get UI HMR from the remote Vite dev server
- UI file changes under `ui/` should reload quickly without restarting Electron
- Changes to `extension/`, `runtime/`, or `shared/types.ts` require restarting the desktop dev server / Electron main process
- `devPort` in `package.json` must match `server.port` in `vite.config.ts`
- Useful logs:
  - `/tmp/sero-vite.log` — host Vite + remote reload events
  - `/tmp/sero-remote-<name>.log` — remote Vite dev server
  - `/tmp/sero-electron.log` — Electron main + forwarded renderer errors

## Critical rules

### Tool bridging (AD-020)

App tools are bridged into the single `sero-cli` tool — they do NOT appear as
standalone tool schemas. Always use `pi.registerTool()` in extensions.

Think about it this way:
- `pi.registerTool()` defines what the plugin can do
- `bridgeTools` decides whether that tool is also available as `sero <tool> ...`
- `tool.cli` lets you customize how that CLI command behaves

Rules:
- Plugin packages with `sero.plugin` bridge **all tools by default**
- Use `sero.plugin.bridgeTools` only to disable bridging or select specific tool names
- If a tool needs custom CLI behavior, put it on `definition.cli` (summary/help/group/raw-args `execute`, optional `overrideBuiltin`)
- If the plugin depends on manifest-driven CLI bridging or custom `definition.cli` behavior, declare `requiredHostCapabilities: ["tool.cli"]`
- **Never** register app tools as `customTools` in `createAgentSession()`
- Bridged tools execute against the **current session's** loaded extension instance
- Bridged CLI help/execute behavior refreshes from the live session definition on reload/reinstall, so keep the source of truth on the tool definition itself
- If a bridged tool needs current-session side effects, depend on the execution context passed into the tool instead of capturing a registration-scoped `pi` object inside the tool logic

Common examples:
- Tool should stay agent-only -> set `bridgeTools: false` or exclude it from the bridged list
- Tool should be available as `sero mytool ...` with default generated help -> bridge it normally
- Tool should parse raw subcommands like `sero google auth list` -> add a custom `cli.execute(args, ctx)` handler
- Tool should replace an existing builtin command -> use `cli.overrideBuiltin: true` intentionally and document that choice

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
- If the UI needs to trigger extension-owned behavior, prefer `useAppTools()` over a custom preload/IPC API
- If you use that UI->tool bridge, declare `requiredHostCapabilities: ["appAgent.invokeTool"]`

### Module Federation

- `react` and `react-dom` are shared singletons via MF
- `@sero-ai/app-runtime` is NOT shared via MF — uses globalThis singleton
- Add `@sero-ai/app-runtime` to `optimizeDeps.exclude`
- Do NOT alias `@sero-ai/app-runtime`
- Root component MUST have a default export
- Import the shared stylesheet from every exposed entry so installed external remotes emit their own CSS assets

### Background runtimes

- Use `runtime/` only for long-lived, workspace-scoped Sero behavior
- `runtime/index.ts` must export `createAppRuntime(ctx)` and default-export `{ createAppRuntime }`
- Type background runtimes against `@sero-ai/common` (`AppRuntime`, `AppRuntimeContext`, `AppRuntimeModule`)
- Do not import desktop-only aliases such as `@electron`, `@plugins`, or `@/` into plugin runtime code
- Keep plugin-specific orchestration semantics in the plugin runtime; the host should only provide generic capabilities
- If the plugin depends on background-runtime APIs, declare `requiredHostCapabilities: ["appRuntime.background"]`

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
| `plugins/sero-admin-plugin/` | Rich app with multiple panels, settings, and dashboard surfaces |
| `plugins/sero-web-plugin/` | Converting an existing Pi extension |
| `plugins/sero-cron-plugin/` | Background jobs, command-oriented plugins |
| `../plugins/sero-kanban-plugin/` | External plugin with a plugin-owned background runtime, tool-driven UI actions, and dashboard widget styling |

## Related docs

- `docs/plugins/guide.md` — packaging and distributing installable plugins
- `docs/plugins/technical.md` — plugin system internals, federation, IPC, security
- `docs/plugins/host-compatibility.md` — when to declare `requiredHostCapabilities`, how CLI bridging/hot-reload works, and downstream migration guidance
- `docs/architecture.md` — desktop shell layout and host-side state flow
- `apps/desktop/AGENTS.md` — project-wide rules (500 LOC, storage bans, import rules)

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Build fails: "Could not resolve entry module" | Add `ui/index.html` |
| App not in sidebar | Check `sero.app.id`/`name` in package.json, run `pnpm install` |
| Agent missing tool | Restart dev server, check `pi.extensions` field |
| UI changes not showing | Check remote Vite dev server running, extension changes need full restart |
| Installed external plugin is missing styles | Import the shared stylesheet from every exposed MF entry and ensure `ui/styles.css` includes the needed `@source` paths |
| `Cannot find module './styles.css'` in plugin UI | Add `ui/vite-env.d.ts` with `/// <reference types="vite/client" />` or otherwise include Vite client CSS typings |
| Runtime never starts | Add `sero.app.runtime`, declare `requiredHostCapabilities: ["appRuntime.background"]`, and check `/tmp/sero-electron.log` |
| "No UI module registered" | Set `sero.app.component` and `devPort` in package.json |
| "No workspace selected" | Pick a workspace first, or make the plugin `scope: "global"` if it should work without one |
| State not syncing | Verify same `stateFile` path, use atomic writes |
| Keyboard stealing input | Scope listeners to container, not `window` |
| `lazy: Expected dynamic import` | Add `export default MyApp` to component file |
| MF errors | Check `devPort` matches `server.port` in vite.config.ts |
