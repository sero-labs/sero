# Plugin Author Quick Path

This page is the shortest conservative path for authoring a Sero plugin during
the source-only OSS alpha. It connects the starter examples, app-runtime hooks,
file-backed state model, host capabilities, and Module Federation rules without
pretending the plugin API is frozen.

If you only want to install or manage plugins, start with
[App Store, Favorites, and Installed Plugins](/guide/app-store-favorites). If you
want the broad model first, read [Plugins and Apps](/guide/plugins-and-apps).

## Alpha expectations

During alpha:

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
| UI + extension, fastest path | [Plugin Quickstart](/reference/plugin-quickstart) |
| UI + extension + background runtime/widgets | [Plugin End-to-End Example](/reference/plugin-end-to-end-example) |
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
alpha-safe app-runtime hooks include:

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

Current docs describe app state as profile/workspace scoped:

- global app state: `<SERO_HOME>/apps/<app-id>/state.json`
- workspace app state: `<workspace>/.sero/apps/<app-id>/state.json`

See [State and Folders](/reference/state-and-folders) for the canonical storage
map.

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

- production builds should use `base: './'`
- expose both named and default component exports when following current examples
- import your stylesheet from every exposed UI/widget entry
- do not depend on host-internal desktop aliases
- do not treat loader internals as stable public API

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

## Compatibility checklist

Before sharing a plugin publicly:

- [ ] `package.json` has explicit `pi.extensions`, `sero.app`, and `sero.plugin`
  fields.
- [ ] `requiredHostCapabilities` lists only canonical capabilities the plugin
  actually needs.
- [ ] UI state uses `useAppState`, not browser storage.
- [ ] UI actions that mutate plugin-owned data call plugin tools through
  `useAppTools`.
- [ ] `vite.config.ts` uses `base: './'` for production.
- [ ] Tool bridging policy is intentional.
- [ ] Source/plugin install instructions tell users to trust and review the
  source.
- [ ] The plugin has been tested in container-backed and/or host mode as claimed.

## What not to claim

Do not claim during alpha that:

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
- [Plugin Quickstart](/reference/plugin-quickstart)
- [Plugin End-to-End Example](/reference/plugin-end-to-end-example)
- [State and Folders](/reference/state-and-folders)
- [Security / Privacy](/reference/security-privacy)
