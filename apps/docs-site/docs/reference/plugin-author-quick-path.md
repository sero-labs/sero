# Plugin Author Quick Path

This page is the shortest conservative path for authoring a Sero plugin during
the public beta. It connects the starter examples, app-runtime hooks,
file-backed state model, host capabilities, and Module Federation rules without
pretending the plugin API is frozen.

If you only want to install or manage plugins, start with
[App Store, Favorites, and Installed Plugins](/guide/app-store-favorites). If you
want the broad model first, read [Plugins and Apps](/guide/plugins-and-apps). Use
[App Runtime Reference](/reference/app-runtime) for the source-checked hook/API
table.

## Beta expectations

During beta:

- plugin/runtime contracts may still evolve
- third-party plugins are trusted source code, not sandboxed marketplace items
- host capabilities can differ across Sero versions and runtime modes
- installed plugins can remain on disk but be inactive when requirements are not
  met
- screenshots, examples, and widget placement should be verified against the
  current app before publishing user-facing docs

Use explicit manifests, small state contracts, and conservative compatibility
requirements.

## Pick the right starting point

Start with the smallest example that matches your plugin shape:

| Goal | Start here |
| --- | --- |
| UI + extension, fastest path | [Plugin Quickstart](/reference/plugin-quickstart) — the external [Daily Quote](https://github.com/sero-labs/sero-daily-quote-plugin) plugin |
| Every surface (runtime, prompts, skills, widgets) | [Plugin End-to-End Example](/reference/plugin-end-to-end-example) — the external [Logbook](https://github.com/sero-labs/sero-logbook-plugin) plugin |
| Existing Pi extension to convert | repo source docs under `docs/plugins/` |

In this checkout, useful in-repo references include:

- `plugins/sero-admin-plugin` — standard app metadata, UI, extension, and app
  state shape
- `plugins/sero-git-plugin` — larger UI + extension integration
- `plugins/sero-cron-plugin` — UI + extension + widget metadata

Treat these as examples of current implementation patterns, not as a frozen
public API contract. For example, the Scheduler/Cron plugin demonstrates how a
plugin can combine a dedicated UI with tools, commands, and widget metadata.

## Minimal plugin shape

A typical Sero plugin has these parts:

```text
sero-example-plugin/
├── package.json
├── shared/
│   └── types.ts
├── extension/
│   └── index.ts
├── ui/
│   ├── ExampleApp.tsx
│   ├── index.html
│   └── styles.css
└── vite.config.ts
```

Add `runtime/` only when you need long-lived workspace orchestration. Extension
only plugins can omit the UI and Vite files.

### `package.json`

The package manifest does three jobs:

- declares the Pi extension entry through `pi.extensions`
- declares the app surface through `sero.app`
- declares plugin metadata and host requirements through `sero.plugin`

Important fields to understand:

| Field | Purpose |
| --- | --- |
| `pi.extensions` | points Pi at your extension entry |
| `sero.app.id` / `name` / `icon` | app identity and sidebar metadata |
| `sero.app.scope` | whether state is workspace or global in the host model |
| `sero.app.stateFile` | plugin-owned state file name/path hint |
| `sero.app.ui` / `component` / `devPort` | UI remote entry, exposed component, and dev server port |
| `sero.app.runtime` | optional background runtime entry |
| `sero.app.widgets` | optional static widget metadata |
| `sero.plugin.minSeroVersion` | minimum host version expectation |
| `sero.plugin.requiredHostCapabilities` | host seams your plugin needs |
| `sero.plugin.bridgeTools` | whether extension tools bridge to CLI commands |

Keep manifest requirements specific. Unknown or unavailable host capabilities
should be treated as unmet.

### Dependencies for external plugins

An external plugin is a standalone npm package that installs on its own, outside
the Sero repo. Two rules keep it installable:

- **Depend on published versions only. Never use the `workspace:*` protocol.**
  `workspace:*` resolves only inside the Sero monorepo, so any external install
  fails on it. Copy the starter's exact version ranges (for example
  `"@sero-ai/app-runtime": "^0.1.3"` and the pi packages as `peerDependencies`).
- **Prefer plain React for the UI.** The external examples (Daily Quote,
  Kanban, Logbook) build their UI with plain React + Tailwind rather than
  `@sero-ai/ui`, Sero's host design-system library. `@sero-ai/ui` is published
  and can be used, but it is a large dependency you rarely need — reach for it
  only if you specifically want Sero's components, and rely on the host's shared
  React singleton through Module Federation either way.

From the `@sero-ai` family, an external plugin normally needs only
`@sero-ai/app-runtime` (the renderer bridge). Use `@sero-ai/common` only for
genuinely neutral shared types. If you copy a built-in plugin from the Sero repo
as a starting point, replace every `workspace:*` dependency with a published
version before installing.

## Shared state and types

Keep plugin-owned durable data contracts in `shared/types.ts`.

Good shared state:

- JSON-serialisable values only
- explicit defaults such as `DEFAULT_STATE`
- stable IDs for list items
- no `Date`, `Map`, `Set`, functions, or class instances

Only move a type into `@sero-ai/common` when it is truly neutral and shared
across multiple plugins or host surfaces.

## Pi extension

The extension is standard Pi-facing code. It is the right place for tools,
commands, and Pi-safe logic.

Authoring guidance:

- keep one focused `extension/index.ts` entry first
- use `pi.registerTool()` for plugin tools
- keep tool outputs concise and structured
- avoid desktop-only imports in extension code
- resolve plugin state through the current session/workspace context when needed
- keep CLI metadata on tool definitions instead of adding custom host wiring

### Tool bridging

Sero can bridge plugin tools into the `sero-cli` tool surface. The current policy
is controlled by `sero.plugin.bridgeTools`:

| Value | Meaning |
| --- | --- |
| omitted or `true` | bridge all plugin tools |
| `false` | bridge none |
| `string[]` | bridge selected tool names |

If your plugin depends on bridged CLI behavior, declare the canonical host
capability:

```json
"requiredHostCapabilities": ["tool.cli"]
```

Do not register app tools as host-level custom tools. Let the plugin package and
manifest describe the bridge policy.

## React UI and app-runtime hooks

Plugin UIs are React modules loaded by Sero as federated remotes. Current
beta app-runtime hooks include the table below; see
[App Runtime Reference](/reference/app-runtime) for source paths, host caveats,
and widget registry APIs.

| Hook | Use for |
| --- | --- |
| `useAppInfo()` | current `appId`, `workspaceId`, and `workspacePath` |
| `useAppState(defaultState)` | file-backed reactive app state |
| `useAgentPrompt()` | send text to the active agent session |
| `useAppTools()` | call plugin/app tools through the host bridge |
| `useWidgetRegistration()` | register runtime widgets for the current renderer session |
| `useTheme()` | read effective theme information when available |

Other exports may exist, but document them only after verifying current host
behavior and support intent.

### File-backed state

Use `useAppState(defaultState)` for plugin UI state that should persist.

```tsx
import { useAppState, useAppInfo } from '@sero-ai/app-runtime';
import { DEFAULT_STATE, type ExampleState } from '../shared/types';

export function ExampleApp() {
  const { appId, workspaceId } = useAppInfo();
  const [state, updateState] = useAppState<ExampleState>(DEFAULT_STATE);

  return (
    <button onClick={() => updateState((prev) => ({ ...prev, count: prev.count + 1 }))}>
      {appId} / {workspaceId}: {state.count}
    </button>
  );
}
```

The host reads, watches, and writes the state file. Do **not** use
`localStorage` or `sessionStorage` for plugin app state.

`sero.app.scope` decides where that state file lives:

- `scope: "global"` → `<SERO_HOME>/apps/<app-id>/state.json`
- `scope: "workspace"` → `<workspace>/.sero/apps/<app-id>/state.json`

`sero.app.stateFile` is a path hint, not an override — the resolved location
still follows `scope`. See [State and Folders](/reference/state-and-folders) for
the canonical storage map.

**When the extension and UI share state, they read and write the same JSON
file.** The UI reaches it through `useAppState`; the extension resolves the path
itself and must match the scope above. A global-scoped app resolves it from
`SERO_HOME`; a workspace-scoped app resolves it relative to the session `cwd`:

```ts
import path from 'node:path';

function resolveStatePath(cwd: string): string {
  const seroHome = process.env.SERO_HOME; // set by Sero; absent under plain Pi CLI
  return seroHome
    ? path.join(seroHome, 'apps', '<app-id>', 'state.json')          // global
    : path.join(cwd, '.sero', 'apps', '<app-id>', 'state.json');      // workspace
}
```

Resolving only from `cwd` for a global-scoped app points the extension at the
wrong file, so the UI never sees its writes.

### Calling plugin-owned behavior from UI

If the UI needs to trigger plugin-owned logic, expose that behavior as a plugin
tool and call it with `useAppTools()`:

```tsx
import { useAppTools } from '@sero-ai/app-runtime';

export function SyncButton() {
  const { run } = useAppTools();

  return <button onClick={() => void run('example_sync', { force: true })}>Sync</button>;
}
```

Declare the host capability when relying on this bridge:

```json
"requiredHostCapabilities": ["appAgent.invokeTool"]
```

Do not add plugin-specific `window.sero.myPlugin.*` host bridges for ordinary
plugin behavior.

## Module Federation basics

A UI plugin should expose a React component through Vite Module Federation. The
host resolves the remote entry, loads the exposed component, and mounts it inside
the active app area.

Important rules:

- production builds should use `base: './'` (dev uses `'/'`)
- the `sero.app.component` name must match the exposed module key — for
  `component: "MyApp"`, expose `{ './MyApp': './ui/MyApp.tsx' }`
- import your stylesheet from every exposed UI/widget entry
- do not depend on host-internal desktop aliases
- do not treat loader internals as stable public API

Copy the starter's `vite.config.ts` — a few fields are load-bearing and easy to
miss:

- **share React as a singleton** so your remote uses the host's React, not its
  own copy:
  ```ts
  shared: {
    react: { singleton: true },
    'react/': { singleton: true },
    'react-dom': { singleton: true },
    'react-dom/': { singleton: true },
  }
  ```
- **exclude `@sero-ai/app-runtime` from dependency optimisation** so Module
  Federation intercepts the import and the host's singleton is used at runtime:
  `optimizeDeps: { exclude: ['@sero-ai/app-runtime'] }`
- **set `server.origin` to your dev server URL** so cross-origin chunk URLs
  resolve when the host loads your remote.

Published/prebuilt plugins are expected to include their UI build output, such
as `dist/ui/remoteEntry.js`, when their manifest says they are prebuilt. Source
installs may rebuild locally depending on the install path.

## Background runtime

Use a plugin runtime only for long-lived Sero-specific orchestration, such as:

- startup recovery or reconciliation
- workspace watchers beyond simple UI sync
- subagent orchestration
- managed development server coordination
- cleanup flows that need to live beyond one UI action

Do not use runtime code for simple CRUD or one-shot UI actions. Put Pi-safe logic
in the extension and call it through tools when needed.

When using a runtime, declare the runtime entry and capability:

```json
"sero": {
  "app": {
    "runtime": "./runtime/index.ts"
  },
  "plugin": {
    "requiredHostCapabilities": ["appRuntime.background"]
  }
}
```

## Widgets

Plugins can expose compact dashboard widgets through static manifest metadata or
runtime registration.

Keep widget claims narrow:

- use widgets for summaries, counts, quick status, or shortcuts
- do not promise exact dashboard placement or sizing beyond declared hints
- verify screenshots in the current app before publishing docs
- use runtime registration only when your plugin actually needs it

## Run your plugin in Sero

Once it builds, load the checkout into a running Sero to see the UI mount:
**Admin → Plugins → Local Plugin Development**, then point it at your plugin
folder. Keep the dev server running if you want live UI; otherwise Sero uses the
built output. See [Plugins](/reference/plugins) for the dev-session states and
how UI resolution falls back from the dev server to `dist/ui`.

## Compatibility checklist

Before sharing a plugin publicly:

- [ ] `package.json` has explicit `pi.extensions`, `sero.app`, and `sero.plugin`
  fields.
- [ ] `requiredHostCapabilities` lists only canonical capabilities the plugin
  actually needs.
- [ ] UI state uses `useAppState`, not browser storage.
- [ ] UI actions that mutate plugin-owned data call plugin tools through
  `useAppTools`.
- [ ] No `workspace:*` dependencies; every dependency is a published version.
- [ ] `vite.config.ts` uses `base: './'` for production.
- [ ] `typecheck` covers both the UI and the extension `tsconfig`, not just one.
- [ ] Tool bridging policy is intentional.
- [ ] Source/plugin install instructions tell users to trust and review the
  source.
- [ ] The plugin has been tested in container-backed and/or host mode as claimed.

## What not to claim

Do not claim during beta that:

- app-runtime APIs are permanently stable
- Discover is a stable commercial marketplace
- third-party plugins are reviewed or sandboxed by Sero
- auto-update is a public guarantee
- every plugin works in every profile, workspace, or runtime mode
- widget placement and sizing are fixed beyond declared hints
- provider metadata alone registers a provider end to end

## Related docs

- [Plugins and Apps](/guide/plugins-and-apps)
- [App Store, Favorites, and Installed Plugins](/guide/app-store-favorites)
- [Plugins](/reference/plugins)
- [Plugin Catalog](/plugins/catalog)
- [App Runtime Reference](/reference/app-runtime)
- [Plugin Quickstart](/reference/plugin-quickstart)
- [Plugin End-to-End Example](/reference/plugin-end-to-end-example)
- [State and Folders](/reference/state-and-folders)
- [Security / Privacy](/reference/security-privacy)
