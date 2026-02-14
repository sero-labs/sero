# Building Sero Apps

A step-by-step guide to building a new Sero app — from empty directory to
working agent tool + live web UI.

> **Prerequisite knowledge:** You should understand how Pi extensions work.
> See [Pi Extensions](../apps/desktop/docs/libs/pi-coding-agent/extensions.md)
> and [Pi Packages](../apps/desktop/docs/libs/pi-coding-agent/packages.md).

## Contents

- [What Is a Sero App?](#what-is-a-sero-app)
- [Architecture Overview](#architecture-overview)
- [Step 1: Create the Package](#step-1-create-the-package)
- [Step 2: Define the Shared State](#step-2-define-the-shared-state)
- [Step 3: Build the Pi Extension](#step-3-build-the-pi-extension)
- [Step 4: Build the Web UI](#step-4-build-the-web-ui)
- [Step 5: Register the App in Sero](#step-5-register-the-app-in-sero)
- [Step 6: Run and Test](#step-6-run-and-test)
- [App Runtime API Reference](#app-runtime-api-reference)
- [Styling Guide](#styling-guide)
- [Manifest Reference](#manifest-reference)
- [Conventions and Rules](#conventions-and-rules)
- [Troubleshooting](#troubleshooting)
- [Reference Implementation](#reference-implementation)

---

## What Is a Sero App?

A Sero app is a **standard Pi extension** with an optional **React web UI**.
Both sides read and write the same JSON file on disk. The file IS the API.

```
                      state.json
                    (source of truth)
                    ┌──────┴──────┐
                    │             │
              Pi Extension    Web UI (React)
              (tools + cmds)  (module federation)
              works in Pi CLI  works in Sero only
              + Sero
```

Key properties:

- The extension is 100% standard Pi. It works in the Pi CLI with zero Sero
  dependencies. Distributable as a Pi package via `pi install`.
- Sero reads the `sero` key in `package.json` (which Pi CLI ignores) to
  discover and mount the web UI.
- State is workspace-scoped, not session-scoped. Your app's data persists
  across agent conversations.
- Changes from either direction (agent tool call or user clicking in the UI)
  are reflected instantly via file watching.

## Architecture Overview

```
┌─ Electron Main ──────────────────────────────────────────┐
│                                                          │
│  Pi ResourceLoader discovers extension                   │
│    → pi.registerTool(...) ← agent calls this             │
│                                                          │
│  AppStateManager:                                        │
│    watches state files (fs.watch + FSEvents)             │
│    handles read/write IPC from renderer                  │
│    serialises writes (atomic temp → rename)              │
│                                                          │
│  App Discovery:                                          │
│    scans Pi packages for sero.app manifest               │
│    registers in app store + federation registry          │
│                                                          │
└──────────────────────────────────────────────────────────┘

┌─ Renderer ───────────────────────────────────────────────┐
│                                                          │
│  MainSidebar:                                            │
│    [Coding] [Todo] [YourApp]  ← from discovery           │
│                                                          │
│  When user clicks YourApp:                               │
│    Module Federation loads remoteEntry.js                 │
│    SeroAppMount wraps in AppProvider                      │
│    useAppState reads/watches via IPC                      │
│                                                          │
│  ChatPanel (unchanged):                                  │
│    Agent tool calls visible alongside the app UI         │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

## Step 1: Create the Package

Create a new directory under `packages/`:

```
packages/pi-myapp-extension/
├── package.json
├── vite.config.ts          ← root-level, uses root: 'ui'
├── shared/
│   └── types.ts
├── extension/
│   └── index.ts
├── ui/
│   ├── MyApp.tsx
│   ├── tsconfig.json
│   └── index.html
└── README.md
```

### `package.json`

The package.json serves double duty: Pi manifest + Sero app manifest.

```json
{
  "name": "@sero/myapp",
  "version": "0.1.0",
  "description": "My app for Sero",
  "keywords": ["pi-package"],
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc --noEmit -p ui/tsconfig.json"
  },
  "pi": {
    "extensions": ["./extension/index.ts"]
  },
  "sero": {
    "app": {
      "id": "myapp",
      "name": "My App",
      "icon": "box",
      "stateFile": ".sero/apps/myapp/state.json",
      "ui": "./dist/ui/remoteEntry.js",
      "component": "MyApp"
    }
  },
  "dependencies": {
    "@sinclair/typebox": "^0.34.48"
  },
  "peerDependencies": {
    "@mariozechner/pi-ai": ">=0.52.0",
    "@mariozechner/pi-coding-agent": ">=0.52.0",
    "@mariozechner/pi-tui": ">=0.52.0"
  },
  "devDependencies": {
    "@sero/app-runtime": "workspace:*",
    "@module-federation/vite": "^1.11.0",
    "@vitejs/plugin-react": "^4.7.0",
    "@tailwindcss/vite": "^4.1.18",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "tailwindcss": "^4.1.18",
    "typescript": "^5.9.3",
    "vite": "^6.4.1"
  }
}
```

**Important notes:**

- `"keywords": ["pi-package"]` makes it discoverable by Pi.
- `"pi"` section is standard Pi — see
  [Pi Packages](../apps/desktop/docs/libs/pi-coding-agent/packages.md) for full
  options.
- `"sero"` section is ignored by Pi CLI. Sero reads it for app discovery.
- Pi SDK packages (`@mariozechner/*`, `@sinclair/typebox`) go in
  `peerDependencies` — they're provided by the Pi runtime. See
  [Extension Dependencies](../apps/desktop/docs/libs/pi-coding-agent/packages.md#dependencies).
- `@sero/app-runtime` is a `devDependency` because it's shared via module
  federation at runtime — the host provides the singleton.

## Step 2: Define the Shared State

Create `shared/types.ts` — the single source of truth for your state shape.
Both the Pi extension and the web UI import this.

```typescript
// shared/types.ts

export interface MyItem {
  id: number;
  title: string;
  createdAt: string; // ISO string
}

export interface MyAppState {
  items: MyItem[];
  nextId: number;
}

export const DEFAULT_STATE: MyAppState = {
  items: [],
  nextId: 1,
};
```

**Rules for state shapes:**

- Must be JSON-serialisable (no `Date` objects, `Map`, `Set`, functions, etc.)
- Provide a `DEFAULT_STATE` constant for when the file doesn't exist yet.
- Keep the shape flat-ish. Deeply nested state makes updates verbose.
- Include an auto-incrementing ID field if you have a list of items.

### Where state lives

State is stored relative to the workspace root:

```
workspace-root/
└── .sero/
    └── apps/
        └── myapp/
            └── state.json
```

The path is configured in the manifest's `stateFile` field. This is a
workspace-scoped resource — it persists across agent sessions.

## Step 3: Build the Pi Extension

Create `extension/index.ts`. This is a standard Pi extension — see
[Pi Extensions](../apps/desktop/docs/libs/pi-coding-agent/extensions.md) for the
full API.

```typescript
// extension/index.ts

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Text } from '@mariozechner/pi-tui';
import { Type } from '@sinclair/typebox';

import type { MyAppState, MyItem } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';

// ── State file path ────────────────────────────────────────

const STATE_REL_PATH = path.join('.sero', 'apps', 'myapp', 'state.json');

function resolveStatePath(cwd: string): string {
  return path.join(cwd, STATE_REL_PATH);
}

// ── File I/O ───────────────────────────────────────────────

async function readState(filePath: string): Promise<MyAppState> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as MyAppState;
  } catch {
    return { ...DEFAULT_STATE };
  }
}

async function writeState(filePath: string, state: MyAppState): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  // Atomic write: temp file → rename (prevents corrupt partial reads)
  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

// ── Tool parameters ────────────────────────────────────────

const Params = Type.Object({
  action: StringEnum(['list', 'add', 'remove'] as const),
  title: Type.Optional(Type.String({ description: 'Item title (for add)' })),
  id: Type.Optional(Type.Number({ description: 'Item ID (for remove)' })),
});

// ── Extension entry point ──────────────────────────────────

export default function (pi: ExtensionAPI) {
  let statePath = '';

  // Resolve state path from workspace cwd
  pi.on('session_start', async (_event, ctx) => {
    statePath = resolveStatePath(ctx.cwd);
  });
  pi.on('session_switch', async (_event, ctx) => {
    statePath = resolveStatePath(ctx.cwd);
  });

  // ── Register a tool (callable by the LLM) ─────────────

  pi.registerTool({
    name: 'myapp',
    label: 'My App',
    description:
      'Manage items. Actions: list (show all), add (requires title), remove (requires id).',
    parameters: Params,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const resolvedPath = ctx ? resolveStatePath(ctx.cwd) : statePath;
      if (!resolvedPath) {
        return {
          content: [{ type: 'text', text: 'Error: no workspace cwd' }],
          details: {},
        };
      }
      statePath = resolvedPath;
      const state = await readState(statePath);

      switch (params.action) {
        case 'list': {
          const text = state.items.length
            ? state.items.map((i) => `#${i.id}: ${i.title}`).join('\n')
            : 'No items yet.';
          return { content: [{ type: 'text', text }], details: {} };
        }

        case 'add': {
          if (!params.title) {
            return {
              content: [{ type: 'text', text: 'Error: title is required' }],
              details: {},
            };
          }
          const item: MyItem = {
            id: state.nextId,
            title: params.title,
            createdAt: new Date().toISOString(),
          };
          state.items.push(item);
          state.nextId++;
          await writeState(statePath, state);
          return {
            content: [{ type: 'text', text: `Added #${item.id}: ${item.title}` }],
            details: {},
          };
        }

        case 'remove': {
          if (params.id === undefined) {
            return {
              content: [{ type: 'text', text: 'Error: id is required' }],
              details: {},
            };
          }
          state.items = state.items.filter((i) => i.id !== params.id);
          await writeState(statePath, state);
          return {
            content: [{ type: 'text', text: `Removed #${params.id}` }],
            details: {},
          };
        }

        default:
          return {
            content: [{ type: 'text', text: `Unknown action: ${params.action}` }],
            details: {},
          };
      }
    },

    // Optional: custom TUI rendering (Pi CLI only — see extensions.md)
    renderCall(args, theme) {
      let text = theme.fg('toolTitle', theme.bold('myapp '));
      text += theme.fg('muted', args.action);
      if (args.title) text += ` ${theme.fg('dim', `"${args.title}"`)}`;
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme) {
      const text = result.content[0];
      const msg = text?.type === 'text' ? text.text : '';
      return new Text(
        msg.startsWith('Error:')
          ? theme.fg('error', msg)
          : theme.fg('success', '✓ ') + theme.fg('muted', msg),
        0, 0,
      );
    },
  });

  // ── Register a command (user-callable) ─────────────────

  pi.registerCommand('myapp', {
    description: 'Show all items',
    handler: async (_args, _ctx) => {
      pi.sendUserMessage('List all items using the myapp tool.');
    },
  });
}
```

**Key patterns:**

- Use `StringEnum` from `@mariozechner/pi-ai` for action enums — `Type.Union`
  doesn't work with Google's API. See
  [Custom Tools](../apps/desktop/docs/libs/pi-coding-agent/extensions.md#custom-tools).
- Resolve `statePath` from `ctx.cwd` in the `execute` handler (reliable) with
  fallback to the cached session path.
- Always use **atomic writes** (write to temp, then `fs.rename`) to prevent
  corrupt reads from the file watcher.
- Extension tools should keep output concise. See
  [Output Truncation](../apps/desktop/docs/libs/pi-coding-agent/extensions.md#output-truncation).

## Step 4: Build the Web UI

The UI is a React component loaded into Sero via
[Vite Module Federation](https://module-federation.io/guide/framework/vite.html).
It uses hooks from `@sero/app-runtime` to read/write the same state file.

### `ui/MyApp.tsx`

```tsx
// ui/MyApp.tsx

import { useState, useCallback } from 'react';
import { useAppState, useAppInfo, useAgentPrompt } from '@sero/app-runtime';
import type { MyAppState } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';

export function MyApp() {
  const [state, updateState] = useAppState<MyAppState>(DEFAULT_STATE);
  const { appId, workspacePath } = useAppInfo();
  const prompt = useAgentPrompt();
  const [newTitle, setNewTitle] = useState('');

  const addItem = useCallback(() => {
    const title = newTitle.trim();
    if (!title) return;

    updateState((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        { id: prev.nextId, title, createdAt: new Date().toISOString() },
      ],
      nextId: prev.nextId + 1,
    }));
    setNewTitle('');
  }, [newTitle, updateState]);

  const removeItem = useCallback(
    (id: number) => {
      updateState((prev) => ({
        ...prev,
        items: prev.items.filter((i) => i.id !== id),
      }));
    },
    [updateState],
  );

  // Example: ask the agent to do something from the UI
  const askAgent = () => {
    prompt('List all my items using the myapp tool.');
  };

  return (
    <div className="flex h-full flex-col bg-[var(--bg-base)]">
      {/* Header */}
      <div className="border-b border-border/50 px-6 py-4">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">
          My App
        </h1>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          {state.items.length} items
        </p>
      </div>

      {/* Add form */}
      <div className="border-b border-border/50 px-6 py-3">
        <form onSubmit={(e) => { e.preventDefault(); addItem(); }} className="flex gap-2">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Add an item…"
            className="flex-1 rounded-md border border-border/50 bg-[var(--bg-surface)] px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
          <button
            type="submit"
            disabled={!newTitle.trim()}
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Add
          </button>
        </form>
      </div>

      {/* Item list */}
      <div className="flex-1 overflow-y-auto">
        {state.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-sm text-[var(--text-muted)]">No items yet</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/30">
            {state.items.map((item) => (
              <li key={item.id} className="group flex items-center gap-3 px-6 py-2.5 hover:bg-[var(--bg-surface)]">
                <span className="flex-1 text-sm text-[var(--text-primary)]">
                  {item.title}
                </span>
                <button
                  onClick={() => removeItem(item.id)}
                  className="text-xs text-[var(--text-muted)] opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default MyApp;
```

### `vite.config.ts` (package root)

The vite config lives at the **package root** (not inside `ui/`). This lets
`pnpm build` / Turborepo find and run it automatically.

```typescript
// vite.config.ts

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: 'ui',                          // Vite serves from ui/
  plugins: [
    react(),
    tailwindcss(),
    federation({
      name: 'sero_myapp',              // Convention: sero_<appId>
      filename: 'remoteEntry.js',
      dts: false,
      exposes: {
        './MyApp': './ui/MyApp.tsx',    // Relative to config, not root
      },
      shared: {
        react: { singleton: true },
        'react-dom': { singleton: true },
        // NOTE: @sero/app-runtime is NOT shared here — MF's loadShare
        // virtual module breaks named exports. It resolves via node_modules
        // and uses a globalThis singleton for the React context.
      },
    }),
  ],
  server: {
    port: 5175,                        // Pick a unique port (5174 is Todo)
    strictPort: true,
    origin: 'http://localhost:5175',   // Ensures absolute chunk URLs
  },
  build: {
    target: 'esnext',
    outDir: '../dist/ui',              // Relative to root (ui/), so → dist/ui/
    emptyOutDir: true,
  },
});
```

**Key points:**
- `root: 'ui'` tells Vite the HTML entry is in `ui/`. Dev server serves from
  there.
- `exposes` paths are relative to the **config file** (package root), not
  `root`. So use `./ui/MyApp.tsx`.
- `outDir: '../dist/ui'` is relative to `root`, so output goes to
  `<package>/dist/ui/`.
- Do NOT alias `@sero/app-runtime` — the MF plugin must intercept that import
  so the host's singleton is used at runtime.

### `ui/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "paths": {
      "@sero/app-runtime": ["../../app-runtime/src/index.ts"]
    }
  },
  "include": ["./**/*", "../shared/**/*"]
}
```

### `ui/index.html`

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>Sero MyApp (remote)</title></head>
<body><div id="root"></div></body>
</html>
```

## Step 5: Register the App in Sero

Three files in `apps/desktop/` need edits. Each is small and documented with
comments explaining the convention.

### 5a. Host Vite config — declare the remote

Add your remote to `apps/desktop/vite.config.ts`:

```typescript
remotes: {
  sero_todo: { /* ... existing ... */ },

  // ⬇ Add your app
  sero_myapp: {
    type: 'module',
    name: 'sero_myapp',
    entry: isDev
      ? 'http://localhost:5175/remoteEntry.js'
      : 'sero-ext://myapp/remoteEntry.js',
    entryGlobalName: 'sero_myapp',
    shareScope: 'default',
  },
},
```

### 5b. Type declaration — tell TypeScript about the remote

Add to `apps/desktop/src/types/module-federation.d.ts`:

```typescript
declare module 'sero_myapp/MyApp' {
  const MyApp: React.ComponentType;
  export default MyApp;
}
```

### 5c. Federation registry — register the lazy component

Add to `apps/desktop/src/lib/federation-registry.ts`:

```typescript
registry.set('myapp', lazy(() => import('sero_myapp/MyApp')));
```

That's it. `SeroAppMount` reads from the registry automatically — it doesn't
need editing.

### 5d. Dev script (optional) — start your remote in dev

If you want the dev script to auto-start your remote, add a block to
`apps/desktop/scripts/dev.sh`:

```bash
# ── Start myapp remote ───────────────────────────────────
MYAPP_DIR="$(cd ../../packages/pi-myapp-extension && pwd)"
(cd "$MYAPP_DIR" && npx vite) > /tmp/sero-remote-myapp.log 2>&1 &
MYAPP_PID=$!
for i in {1..10}; do
  curl -s http://localhost:5175/remoteEntry.js > /dev/null 2>&1 && break
  sleep 1
done
```

### 5e. Discovery path (development only)

If developing locally, register your package path in
`apps/desktop/electron/main.ts`:

```typescript
if (process.env.NODE_ENV === 'development') {
  const todoExtPath = path.resolve(__dirname, '../../../../packages/pi-todo-extension');
  registerAppPath(todoExtPath);

  // ⬇ Add your app
  const myappExtPath = path.resolve(__dirname, '../../../../packages/pi-myapp-extension');
  registerAppPath(myappExtPath);
}
```

In production, apps are discovered automatically via
`pi install npm:@sero/myapp` — no manual registration needed.

## Step 6: Run and Test

```bash
cd apps/desktop
bash scripts/dev.sh
```

1. Click your app in the sidebar → the federated UI loads.
2. Add items via the UI → `state.json` updates → UI re-renders.
3. Ask the agent "add an item called test" → agent calls the tool → writes
   `state.json` → file watcher fires → UI re-renders.
4. Both directions are instant because they share the same file.

---

## App Runtime API Reference

`@sero/app-runtime` provides three hooks. All must be used inside a component
mounted by `SeroAppMount` (which wraps your component in `<AppProvider>`).

### `useAppState<T>(defaultState: T)`

File-backed reactive state. The core hook for Sero apps.

```typescript
const [state, updateState] = useAppState<MyState>(DEFAULT_STATE);

// Read state
state.items.length;

// Update state (updater function, like React's setState)
updateState((prev) => ({
  ...prev,
  items: [...prev.items, newItem],
}));
```

**How it works under the hood:**
1. On mount: IPC call starts `fs.watch()` on the state file + reads current
   contents.
2. On file change (from agent, UI, or external edit): main process reads the
   file, pushes new state via IPC → React re-renders.
3. On `updateState`: optimistic local update + IPC write to disk. Writes are
   serialised through a queue (no concurrent writes). Atomic write
   (temp → rename) prevents corrupt reads.

### `useAppInfo()`

Read-only context about the current app and workspace.

```typescript
const { appId, workspacePath } = useAppInfo();
// appId: "myapp"
// workspacePath: "/Users/you/projects/myproject"
```

### `useAgentPrompt()`

Send a message to the active agent session from your app UI.

```typescript
const prompt = useAgentPrompt();
prompt('Do something with the myapp tool.');
```

The shell injects the actual prompt function via context — your app never needs
to know about session IDs.

---

## Styling Guide

Sero apps render inside the main app area. Use CSS variables from the Sero
theme for consistency:

| Variable | Usage |
|----------|-------|
| `var(--bg-base)` | Primary background |
| `var(--bg-surface)` | Cards, elevated sections |
| `var(--bg-elevated)` | Active/hover states |
| `var(--text-primary)` | Main text |
| `var(--text-secondary)` | Less prominent text |
| `var(--text-muted)` | Hints, metadata |
| `var(--accent)` | Primary accent colour |
| `var(--border)` or `border-border/50` | Borders |

Tailwind CSS is available (shared from the host). Use standard Tailwind
classes. The app fills `h-full w-full` — structure your layout with
`flex flex-col` and `overflow-y-auto` for scrollable content.

---

## Manifest Reference

The `sero.app` object in `package.json`:

| Field | Required | Description |
|-------|----------|-------------|
| `id` | ✅ | Unique identifier. Used in file paths, registry keys, MF remote name. Lowercase, no spaces. |
| `name` | ✅ | Display name shown in the sidebar. |
| `icon` | ✅ | Lucide icon name (e.g. `"check-square"`, `"box"`, `"calendar"`). Mapped to emoji in the sidebar. |
| `stateFile` | ✅ | State file path relative to workspace root. Convention: `.sero/apps/<id>/state.json`. |
| `ui` | ❌ | Path to the built `remoteEntry.js`, relative to package root. Null if no UI. |
| `component` | ❌ | Exported component name from the MF remote (e.g. `"MyApp"`). Required if `ui` is set. |

---

## Conventions and Rules

### Naming

- Package: `packages/pi-<name>-extension/`
- MF remote name: `sero_<id>` (underscore, not hyphen — MF requires valid JS
  identifiers)
- Exposed module: `./<Component>` (e.g. `./MyApp`)
- State file: `.sero/apps/<id>/state.json`

### File size

**No file over 500 lines.** Extract sub-components, utils, and types into
separate files. See `apps/desktop/AGENTS.md` for full rules.

### State management

- **Do NOT use `localStorage`** for app state. All state goes through
  `useAppState` (file-backed) or Zustand stores (in-memory shell state).
  See `apps/desktop/AGENTS.md` for the full policy.
- **Keep state serialisable.** No `Date` objects, `Map`, `Set`, classes, or
  functions in state.
- **Atomic writes always.** Write to a temp file, then `fs.rename()`. Both the
  extension and the `AppStateManager` do this.

### Module Federation

- `react` and `react-dom` are shared singletons via MF — the host provides
  them. Do NOT bundle your own copy.
- `@sero/app-runtime` is NOT shared via MF (its `loadShare` wrapper breaks
  named exports). Instead it resolves via `node_modules` and uses a
  `globalThis` singleton for the React context. Add it to
  `optimizeDeps.exclude` so Vite doesn't pre-bundle it.
- Do NOT alias `@sero/app-runtime` in any vite config — aliases conflict
  with both MF sharing and the `globalThis` singleton pattern.
- Each remote runs its own Vite dev server on a unique port.

---

## Troubleshooting

**App doesn't appear in sidebar:**
- Check that `sero.app.id` and `sero.app.name` are set in `package.json`.
- Verify the package path is registered in `electron/main.ts` (dev) or
  installed via `pi install` (production).
- Check the electron log for `[app-discovery]` messages.

**UI shows "No UI module registered":**
- You need to add the lazy import to
  `apps/desktop/src/lib/federation-registry.ts`.
- You need to declare the remote in `apps/desktop/vite.config.ts`.

**UI shows "No workspace selected":**
- The app needs an active workspace. Click a workspace in the sidebar first.

**State doesn't sync between agent and UI:**
- Verify both sides use the same `stateFile` path.
- Check that writes are atomic (temp file → rename). Non-atomic writes can
  produce corrupt JSON that the watcher silently ignores.
- Look for errors in the electron console (`Cmd+Option+I` → Console).

**Module Federation errors in console:**
- Make sure the remote dev server is running on the correct port.
- Check that the remote name in `vite.config.ts` matches the host's
  `remotes` declaration exactly.
- The `@sero/app-runtime` shared module warning ("alias conflicts") is
  expected in dev mode and can be safely ignored.

---

## Reference Implementation

The **Todo app** (`packages/pi-todo-extension/`) is the canonical reference:

| File | What to learn |
|------|---------------|
| `package.json` | Dual Pi + Sero manifest, scripts, dependency structure |
| `vite.config.ts` | MF remote configuration, `root: 'ui'` pattern, shared singletons |
| `shared/types.ts` | Shared state shape pattern |
| `extension/index.ts` | Tool registration, atomic file I/O, TUI rendering |
| `ui/TodoApp.tsx` | `useAppState` usage, Tailwind styling, sub-components |

### Related documentation

- [Sero Apps Architecture](../apps/desktop/docs/sero-apps.md) — full design
  doc with architecture diagrams and open decisions
- [Pi Extensions](../apps/desktop/docs/libs/pi-coding-agent/extensions.md) —
  complete extension API: events, tools, commands, rendering, state management
- [Pi Packages](../apps/desktop/docs/libs/pi-coding-agent/packages.md) —
  packaging, distribution, npm/git install
- [Sero Architecture](../apps/desktop/docs/architecture.md) — shell layout,
  component hierarchy, state management
- [Sero Desktop AGENTS.md](../apps/desktop/AGENTS.md) — file size rules, state
  management rules, dev conventions
