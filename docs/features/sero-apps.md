# Sero Apps — Runtime Architecture

This document explains what a **Sero app** is at runtime: how a Pi extension,
a federated React UI, and a shared state file fit together inside Sero.

For packaging, distribution, installation, and plugin manifest details, see:

- `docs/plugins/guide.md`
- `docs/plugins/technical.md`

## Core Idea

A Sero app is a **standard Pi extension** with optional extra metadata under
`sero.app` in `package.json`.

- **Pi** loads the extension from `pi.extensions`
- **Sero** reads the same package and, if `sero.app` exists, can also mount a
  federated React UI for it
- **Persistent app state** lives in a JSON file on disk and is shared by both
  the extension and the UI

For durable app data, the state file is the source of truth.

```text
┌─────────────────────────────────────────────────────────────┐
│                         state.json                          │
│                durable shared app state on disk             │
│                                                             │
│       ┌──────────── read / write ────────────┐              │
│       │                                      │              │
│  Pi extension                          React UI             │
│  (tools, commands, hooks)              (module federation)  │
│  works in Pi + Sero                    works in Sero        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Built-in Apps vs Optional Plugins

Sero apps can be shipped in two ways:

| Kind | Location | Ships with desktop app | Removable |
|---|---|---:|---:|
| Built-in app | monorepo (`packages/`, `plugins/`) | Yes | No |
| Optional plugin | `~/.sero-ui/agent/packages/<id>/` | No | Yes |

The runtime model is the same in both cases:

- the extension is still a Pi extension
- the UI is still loaded via Module Federation
- the state file is still shared

The difference is mainly **distribution and lifecycle**, which the plugin docs
cover in detail.

## Package Shape

A typical source package looks like this:

```text
my-app/
├── package.json
├── extension/
│   └── index.ts
├── shared/
│   └── types.ts
├── ui/
│   └── MyApp.tsx
├── vite.config.ts
└── dist/
    └── ui/
        └── remoteEntry.js   # after build
```

### Minimal manifest

```json
{
  "name": "@sero/plugin-my-app",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extension/index.ts"]
  },
  "sero": {
    "app": {
      "id": "my-app",
      "name": "My App",
      "icon": "star",
      "stateFile": ".sero/apps/my-app/state.json",
      "scope": "workspace",
      "ui": "./dist/ui/remoteEntry.js",
      "component": "MyApp",
      "devPort": 5180
    }
  }
}
```

What each runtime cares about:

- **Pi CLI / Pi runtime** cares about `pi.extensions`
- **Sero** cares about `sero.app`
  - background runtimes may also declare `sero.app.runtimeExternals` when they
    need the TS runtime loader to leave native / non-bundle-safe packages
    external (for example `better-sqlite3` or `keytar`)
- **Plugin packaging/distribution** additionally uses `sero.plugin`
- **Optional provider plugins** may also declare `sero.providers`; see the
  plugin docs for that host metadata

Monorepo note:
- `packages/*` contains Sero-owned shared package sources
- external plugins should consume those packages by published name (for example
  `@sero-ai/common`, `@sero-ai/app-runtime`, `@sero-ai/ui`), not by importing
  monorepo source paths
- plugin-specific domain/state contracts should stay in the plugin's own
  `shared/` layer unless they truly become generic platform contracts

## Persistent State Model

### Workspace-scoped apps

Most apps are workspace-scoped. Their state lives under the workspace root:

```text
<workspace>/
└── .sero/
    └── apps/
        └── <app-id>/
            └── state.json
```

Example:

```text
<workspace>/.sero/apps/todo/state.json
```

### Global apps

Apps can also declare `scope: "global"`.

For those, Sero stores state under:

```text
~/.sero-ui/apps/<app-id>/state.json
```

Notes:

- `stateFile` still remains part of the manifest even for global apps
- Sero resolves the actual global path at runtime
- keeping `stateFile` in the manifest preserves a consistent app contract and
  remains useful as a fallback path convention outside the renderer

### Why file-backed state?

Because app state is a **workspace/global resource**, not a chat artifact.

That gives you:

- persistence across sessions
- a format the extension can manipulate directly
- a format the UI can watch reactively
- a simple, inspectable source of truth on disk

## Main Runtime Pieces

| Piece | Role |
|---|---|
| `sero.app` manifest | Declares app identity, scope, UI entry, component export |
| Pi extension | Tools, commands, hooks, background logic |
| Module Federation remote | Optional web UI mounted by Sero |
| `AppStateManager` | Main-process file read/write/watch service |
| `@sero-ai/app-runtime` | Shared hooks used by federated UIs |
| App discovery | Finds packages with `sero.app` and registers them |

## Extension Side

The extension should stay as close to a normal Pi extension as possible.

Typical responsibilities:

- register tools and commands
- read and write the app's state file
- react to session or app events
- remain usable outside the Sero renderer when that makes sense

A simplified pattern:

```ts
import path from 'path';
import { promises as fs } from 'fs';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';

export default function (pi: ExtensionAPI) {
  let statePath = '';

  async function readState() {
    try {
      const raw = await fs.readFile(statePath, 'utf8');
      return JSON.parse(raw);
    } catch {
      return { items: [] };
    }
  }

  async function writeState(next: unknown) {
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    const tmp = `${statePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(next, null, 2), 'utf8');
    await fs.rename(tmp, statePath);
  }

  pi.on('session_start', async (_event, ctx) => {
    statePath = path.join(ctx.cwd, '.sero', 'apps', 'todo', 'state.json');
  });

  pi.registerTool({
    name: 'todo',
    description: 'Manage todos',
    parameters: Type.Object({
      action: Type.String(),
      text: Type.Optional(Type.String()),
    }),
    async execute(_id, params) {
      const state = await readState();
      // mutate state based on params.action
      await writeState(state);
      return { content: [{ type: 'text', text: 'Done.' }] };
    },
  });
}
```

Key point: the extension owns behavior; Sero-specific UI metadata lives beside
it in the manifest.

## UI Side

The React UI runs only inside Sero. It is mounted as a Module Federation remote
and receives app context from the host shell.

### Core hooks from `@sero-ai/app-runtime`

Common hooks include:

- `useAppState<T>()` — reactive file-backed app state
- `useAppInfo()` — current app/workspace context
- `useAgentPrompt()` — send a prompt through the host-injected prompt bridge
- `useAI()` — talk to the app's dedicated app-agent session
- `useAvailableModels()` — inspect model availability from the UI
- `useTheme()` — react to host theme information

A typical component:

```tsx
import { useAppInfo, useAppState, useAI } from '@sero-ai/app-runtime';
import type { TodoState } from '../shared/types';

const DEFAULT_STATE: TodoState = { todos: [] };

export function TodoApp() {
  const [state, updateState] = useAppState<TodoState>(DEFAULT_STATE);
  const { workspacePath, appId } = useAppInfo();
  const ai = useAI();

  const toggleTodo = (id: number) => {
    updateState((prev) => ({
      ...prev,
      todos: prev.todos.map((todo) => (
        todo.id === id ? { ...todo, done: !todo.done } : todo
      )),
    }));
  };

  const askAI = async () => {
    const response = await ai.prompt('Summarize my todo list.');
    console.log(appId, workspacePath, response);
  };

  return null;
}
```

### How `useAppState()` works

`useAppState()` is file-backed and reactive:

1. the UI asks the main process for the current JSON value
2. the main process begins watching the file
3. updates from any writer are pushed back over IPC
4. UI writes go through IPC back to the main process
5. writes are persisted atomically and the watch pipeline fans the update out

This means the UI sees changes whether they came from:

- the UI itself
- the extension
- another part of the app writing the same file

## App State Infrastructure

The main-process `AppStateManager` handles shared state mechanics:

- JSON reads
- atomic writes via temp file + rename
- `fs.watch()` subscriptions
- per-file write serialization to avoid races
- push notifications back to renderer consumers

That manager lives in:

```text
apps/desktop/electron/features/apps/state/manager.ts
```

The IPC bridge for renderer consumers lives in:

```text
apps/desktop/electron/ipc/apps/app-state.ts
```

## Module Federation and Mounting

The UI side is loaded dynamically through Module Federation.

At a high level:

1. Sero discovers a package with `sero.app`
2. the host resolves its `ui` entry and exported `component`
3. the remote is loaded via the `sero-ext://` protocol
4. the host wraps it in `AppProvider`
5. hooks such as `useAppState()` and `useAppInfo()` become available

For app authors, the main requirement is that the manifest and build output
match what the host expects:

- `sero.app.ui` points at the built remote entry
- `sero.app.component` names the exported React component
- production builds should emit `dist/ui/remoteEntry.js`
- production `base` should be relative (`'./'`) so chunk URLs resolve under
  `sero-ext://`

## Discovery Model

Sero discovers apps by scanning package manifests for `sero.app`.

That includes:

- built-in monorepo packages/apps
- built-in monorepo plugins
- installed optional plugins in `~/.sero-ui/agent/packages/`
- explicitly configured package paths from settings

So for normal app/plugin work, registration is manifest-driven — not something
that should require hand-editing random Electron files.

## End-to-End Flow

A typical flow looks like this:

1. A package is available to Sero (built-in or installed as a plugin)
2. Pi loads its extension from `pi.extensions`
3. Sero discovers `sero.app` and adds the app to the runtime registry
4. The user opens the app
5. Sero loads the UI remote and mounts the exported component
6. The UI reads and watches the state file via `useAppState()`
7. The extension and the UI both read/write the same durable JSON state
8. Changes from either side propagate back to the other

## Relationship to Plugin Docs

Use this document when you want to understand:

- what a Sero app is conceptually
- how extension + UI + state fit together
- how `useAppState()` and the app runtime work
- how discovery and mounting work at runtime

Use the plugin docs when you want to know:

- how to package or publish an app as a plugin
- what `sero.plugin` does
- what `sero.providers` does for provider plugins
- how installation, updates, and uninstall work

## Tutorial / Next Step

For a step-by-step implementation walkthrough, use the `sero-plugin` skill and
then refer to:

- `docs/plugins/guide.md` for author-facing packaging guidance
- `docs/plugins/technical.md` for host/plugin-system internals
