# Sero Apps — Pi Extensions with Web UI

## Core Concept

A Sero app is a **standard Pi extension** that reads/writes a JSON state file.
Sero can optionally mount a **web UI** (loaded via Vite module federation) that
reads/writes the **same JSON file**. The file IS the shared state.

```
┌─────────────────────────────────────────────────────────┐
│                    state.json                            │
│                   (source of truth)                      │
│                                                         │
│          ┌──── reads/writes ────┐                       │
│          │                      │                       │
│    Pi Extension             Web UI (React)               │
│    (tools, commands)        (module federation)           │
│    works in Pi CLI          works in Sero only            │
│    + Sero                                                │
└─────────────────────────────────────────────────────────┘
```

- Extension is 100% standard Pi. Distributable as a Pi package.
- The `sero` key in `package.json` is metadata Pi CLI ignores.
- Sero reads it to discover and mount the UI.

## Package Structure

```
pi-todo/
├── package.json              # Pi package manifest + sero app manifest
├── shared/
│   └── types.ts              # State shape (imported by both extension & UI)
├── extension/
│   └── index.ts              # Standard Pi extension (tools, commands, events)
├── ui/
│   ├── TodoApp.tsx           # React component
│   ├── vite.config.ts        # Module federation (exposes TodoApp)
│   └── dist/
│       └── assets/           # Built output (shipped with package)
└── README.md
```

```json
{
  "name": "@sero/todo",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extension/index.ts"]
  },
  "sero": {
    "app": {
      "id": "todo",
      "name": "Todo",
      "icon": "check-square",
      "stateFile": ".sero/apps/todo/state.json",
      "ui": "./ui/dist/remoteEntry.js",
      "component": "TodoApp"
    }
  }
}
```

Pi CLI sees `pi.extensions` → loads the extension, ignores `sero`.
Sero sees both → loads the extension AND mounts the UI.

## Shared State File

State lives relative to the workspace root:

```
workspace-root/
└── .sero/
    └── apps/
        └── todo/
            └── state.json
```

### Why File-Based, Not Session Entries

- The todo list is a **workspace resource**, not a conversation artifact.
  It persists across sessions.
- Session entries are for conversation-scoped state. An "app" is
  workspace-scoped — your todos exist whether or not you're chatting.
- The agent reads/modifies the file like it reads/modifies any source file.

### Concurrency

- Writes are atomic: write to temp file, then `fs.rename()`.
- Writes from the UI are serialised through a queue in the main process.
- `fs.watch()` on macOS uses FSEvents — reliable for our use case.

## Extension Pattern (Standard Pi)

The extension uses plain `fs` to read/write the state file. It resolves the
path from `ctx.cwd` on session events. Tools are callable by the LLM. Commands
are callable by the user. TUI rendering is optional.

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export default function (pi: ExtensionAPI) {
  let statePath: string;

  async function readState() { /* fs.readFile(statePath) */ }
  async function writeState(state) { /* atomic write to statePath */ }

  pi.on("session_start", async (_event, ctx) => {
    statePath = path.join(ctx.cwd, ".sero", "apps", "todo", "state.json");
  });

  pi.registerTool({
    name: "todo",
    description: "Manage workspace todos: list, add, toggle, clear",
    parameters: Type.Object({ action: ..., text: ..., id: ... }),
    async execute(_id, params) {
      const state = await readState();
      // mutate based on action
      await writeState(state);
      return { content: [...], details: {} };
    },
  });

  pi.registerCommand("todos", { handler: async (_args, ctx) => { ... } });
}
```

This extension works in Pi CLI with zero Sero dependencies.

## Web UI Pattern (Sero Only)

The UI is a React component loaded via module federation. It uses `useAppState`
from Sero's app runtime — a hook that reads/watches/writes the same JSON file.

```tsx
import { useAppState } from "@sero-ai/app-runtime";
import type { TodoState } from "../shared/types";

export function TodoApp() {
  const [state, updateState] = useAppState<TodoState>(DEFAULT);

  const toggleTodo = (id: number) => {
    updateState(prev => ({
      ...prev,
      todos: prev.todos.map(t => t.id === id ? { ...t, done: !t.done } : t),
    }));
  };

  return ( /* full React component — shadcn, Tailwind, animations */ );
}
```

## Module Federation

Sero (host) shares React, ReactDOM, Tailwind, and `@sero-ai/app-runtime`.
App UIs (remotes) consume these — no bundled React per app.

```typescript
// Sero vite.config.ts (host)
federation({ name: "sero", shared: ["react", "react-dom"] })

// App ui/vite.config.ts (remote)
federation({
  name: "sero-todo",
  filename: "remoteEntry.js",
  exposes: { "./TodoApp": "./TodoApp.tsx" },
  shared: ["react", "react-dom"],
})
```

## Sero App Runtime (`@sero-ai/app-runtime`)

Hooks provided by Sero to federated app modules:

```typescript
// Core: file-backed reactive state
useAppState<T>(defaultState: T): [T, (updater: (prev: T) => T) => void]

// Context: which workspace, session, etc.
useAppInfo(): { workspaceId: string, workspacePath: string, appId: string }

// Optional: send a message to the agent from the app UI
useAgentPrompt(): (text: string) => void
```

### useAppState Under the Hood

1. Initial read — IPC call to read the JSON file
2. File watching — main process watches with `fs.watch()`, pushes via IPC
3. Writes — `updateState` writes via IPC → atomic file write → watcher fires
4. Concurrency — writes serialised through a queue in main process

## Sero Infrastructure

| Piece | What |
|-------|------|
| **AppStateManager** | Generic file watcher + read/write + IPC for state files |
| **App discovery** | Scan Pi packages for `sero.app` manifest, register in app store |
| **App mount point** | Dynamic import of federation remote, mount in main area |
| **`@sero-ai/app-runtime`** | `useAppState`, `useAppInfo`, `useAgentPrompt` hooks |
| **App registry store** | Zustand store for discovered apps + active app |

## Architecture Flow

```
┌─ Electron Main ──────────────────────────────────────────┐
│                                                          │
│  DefaultResourceLoader discovers extension                │
│    → pi.registerTool("todo", ...) ← agent calls this     │
│                                                          │
│  AppStateManager (generic):                              │
│    watches state files for all mounted apps               │
│    handles read/write IPC from renderer                   │
│    serialises writes (atomic rename)                      │
│                                                          │
│  App discovery (sero manifest in package.json):           │
│    registers app in app registry                          │
│    resolves UI entry path                                 │
│                                                          │
└──────────────────────────────────────────────────────────┘

┌─ Renderer ───────────────────────────────────────────────┐
│                                                          │
│  App Switcher (MainSidebar):                             │
│    [Explorer] [Todo] [...]  ← discovered from manifests    │
│                                                          │
│  When user selects Todo:                                 │
│    Module federation loads remoteEntry.js                 │
│    Mounts TodoApp in main area                            │
│    useAppState reads/watches via AppStateManager IPC      │
│                                                          │
│  ChatPanel (unchanged):                                  │
│    Agent tool calls visible. User also sees items         │
│    appear in TodoApp simultaneously.                     │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

## The Full Loop

1. User installs: `pi install npm:@sero/todo`
2. **Pi CLI:** extension loads, agent has `todo` tool, `/todos` works. No UI.
3. **Sero:** extension loads the same way. ALSO reads `sero.app` manifest →
   registers Todo in app switcher.
4. User clicks Todo → module federation loads TodoApp → renders from state.json
5. User adds via UI → `useAppState` writes state.json → UI re-renders
6. Agent calls `todo add` → writes state.json → file watcher → UI re-renders
7. Both paths write the same file. Both see each other's changes instantly.

## Build Order

1. AppStateManager (main process — generic file watcher + read/write IPC)
2. `useAppState` hook (renderer — reads/watches/writes via IPC)
3. Todo extension (standard Pi extension, file-based state)
4. Todo UI (React component using `useAppState`)
5. App discovery + mount (scan manifests, module federation loader)

## Tutorial

For a step-by-step guide to building a new app use the `sero-plugin` skill

## Open Decisions

- **State file location** — `.sero/apps/<id>/state.json` relative to workspace
  cwd. Configurable per-app in manifest.
- **Multiple state files** — Some apps may want a directory. `stateFile`
  could support patterns. `useAppState` could accept a path.
- **State file location for non-workspace apps** — Global apps could use
  `~/.sero-ui/apps/<id>/state.json`.
