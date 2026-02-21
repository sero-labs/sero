# Building Sero Apps

A step-by-step guide to building a new Sero app — from empty directory to
working agent tool + live web UI.

> **Prerequisite knowledge:** You should understand how Pi extensions work.
> See [Pi Extensions](../docs/libs/pi-coding-agent/extensions.md)
> and [Pi Packages](../docs/libs/pi-coding-agent/packages.md).

## Contents

- [What Is a Sero App?](#what-is-a-sero-app)
- [Architecture Overview](#architecture-overview)
- [Step 1: Create the Package](#step-1-create-the-package)
- [Step 2: Define the Shared State](#step-2-define-the-shared-state)
- [Step 3: Build the Pi Extension](#step-3-build-the-pi-extension)
- [Step 4: Build the Web UI](#step-4-build-the-web-ui)
- [Step 5: Install and Restart](#step-5-install-and-restart)
- [Step 6: Run and Test](#step-6-run-and-test)
- [App Runtime API Reference](#app-runtime-api-reference)
- [Styling Guide](#styling-guide)
- [Manifest Reference](#manifest-reference)
- [Conventions and Rules](#conventions-and-rules)
- [Troubleshooting](#troubleshooting)
- [Reference Implementations](#reference-implementations)

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
│   ├── styles.css
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
      "component": "MyApp",
      "devPort": 5175
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
    "@sero/ui": "workspace:*",
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
  [Pi Packages](../docs/libs/pi-coding-agent/packages.md) for full
  options.
- `"sero"` section is ignored by Pi CLI. Sero reads it for app discovery.
- Pi SDK packages (`@mariozechner/*`, `@sinclair/typebox`) go in
  `peerDependencies` — they're provided by the Pi runtime. See
  [Extension Dependencies](../docs/libs/pi-coding-agent/packages.md#dependencies).
- `@sero/app-runtime` is a `devDependency` because it's shared via module
  federation at runtime — the host provides the singleton.
- `@sero/ui` is a `devDependency` that provides shared shadcn/ui components
  (`Button`, `Card`, etc.) and utilities (`cn`). Components are bundled into
  your app at build time — no MF sharing needed.
- `"devPort"` must be a unique port (see [Port conventions](#port-conventions)).
  The host auto-discovers this at build time — no manual Vite config edits
  needed.

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

**Workspace-scoped** (default) — state is stored relative to the workspace root:

```
workspace-root/
└── .sero/
    └── apps/
        └── myapp/
            └── state.json
```

The path is configured in the manifest's `stateFile` field. This is a
workspace-scoped resource — it persists across agent sessions. Each
workspace gets its own independent state file.

**Global-scoped** (`"scope": "global"`) — state is stored in Sero's
config directory, shared across all workspaces:

```
~/.sero-ui/
└── apps/
    └── myapp/
        └── state.json
```

The path is derived from the app `id` — the `stateFile` field is only
used as a fallback for Pi CLI. See [State Scope](#state-scope) in the
manifest reference for details.

## Step 3: Build the Pi Extension

Create `extension/index.ts`. This is a standard Pi extension — see
[Pi Extensions](../docs/libs/pi-coding-agent/extensions.md) for the
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
  [Custom Tools](../docs/libs/pi-coding-agent/extensions.md#custom-tools).
- Resolve `statePath` from `ctx.cwd` in the `execute` handler (reliable) with
  fallback to the cached session path.
- Always use **atomic writes** (write to temp, then `fs.rename`) to prevent
  corrupt reads from the file watcher.
- Extension tools should keep output concise. See
  [Output Truncation](../docs/libs/pi-coding-agent/extensions.md#output-truncation).

## Step 4: Build the Web UI

The UI is a React component loaded into Sero via
[Vite Module Federation](https://module-federation.io/guide/framework/vite.html).
It uses hooks from `@sero/app-runtime` to read/write the same state file.

### `ui/MyApp.tsx`

```tsx
// ui/MyApp.tsx

import { useState, useCallback } from 'react';
import { useAppState, useAppInfo, useAgentPrompt } from '@sero/app-runtime';
import { cn } from '@sero/ui/lib/utils';
import { Button } from '@sero/ui/components/ui/button';
import { Card } from '@sero/ui/components/ui/card';
import type { MyAppState } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';
import './styles.css';

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
    <div className="flex h-full flex-col bg-background p-4">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-foreground">My App</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {state.items.length} items
        </p>
      </div>

      {/* Add form */}
      <form
        onSubmit={(e) => { e.preventDefault(); addItem(); }}
        className="mb-4 flex gap-2"
      >
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add an item…"
          className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Button size="sm" disabled={!newTitle.trim()}>
          Add
        </Button>
      </form>

      {/* Item list */}
      <Card className="flex-1 gap-0 overflow-hidden py-0 shadow-none">
        {state.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-sm text-muted-foreground">No items yet</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {state.items.map((item) => (
              <div
                key={item.id}
                className="group flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0 hover:bg-secondary"
              >
                <span className="flex-1 text-sm text-foreground">
                  {item.title}
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                  onClick={() => removeItem(item.id)}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

export default MyApp;
```

**Key patterns in the UI:**

- Import `Button`, `Card`, and other components from `@sero/ui/components/ui/*`
  instead of writing raw HTML elements with custom classes.
- Import `cn` from `@sero/ui/lib/utils` for conditional class name merging.
- Import `./styles.css` for Tailwind + theme token mapping (see below).
- Use Tailwind semantic color classes (`bg-background`, `text-foreground`,
  `text-muted-foreground`, `bg-secondary`) instead of raw CSS variable
  references like `bg-[var(--bg-base)]`.
- Override shadcn component defaults via `className` — `cn()` and
  `tailwind-merge` handle deduplication automatically.

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
      manifest: true,
      exposes: {
        './MyApp': './ui/MyApp.tsx',    // Relative to config, not root
      },
      shared: {
        react: { singleton: true },
        'react/': { singleton: true },
        'react-dom': { singleton: true },
        'react-dom/': { singleton: true },
        // NOTE: @sero/app-runtime is NOT shared here — MF's loadShare
        // virtual module breaks named exports. It resolves via node_modules
        // and uses a globalThis singleton for the React context.
      },
    }),
  ],
  server: {
    port: 5175,                        // Must match devPort in package.json
    strictPort: true,
    origin: 'http://localhost:5175',   // Ensures absolute chunk URLs
  },
  optimizeDeps: {
    exclude: ['@sero/app-runtime'],
    // Pre-include shared deps to avoid the "new dependencies optimized →
    // reloading" cycle that causes 504 "Outdated Optimize Dep" errors.
    include: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
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
- The `server.port` **must match** the `devPort` in `package.json` — the host
  reads `devPort` to auto-configure Module Federation remotes.
- Do NOT alias `@sero/app-runtime` — the MF plugin must intercept that import
  so the host's singleton is used at runtime.
- `@sero/ui` does NOT need to be in `optimizeDeps.exclude` — unlike
  `@sero/app-runtime`, it's bundled into your remote at build time (no
  runtime singleton). Vite handles it automatically.

### `ui/styles.css`

Each app needs a small CSS file that imports Tailwind and maps the host's
CSS variables to Tailwind utilities via `@theme inline`. This is required
because each remote has its own independent Tailwind build.

```css
@import "tailwindcss";

@custom-variant dark (&:is(.dark *));

/*
 * Theme tokens — maps Sero/shadcn CSS variables to Tailwind utilities.
 * The CSS variables themselves are provided by the host shell at runtime.
 */
@theme inline {
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --radius-2xl: calc(var(--radius) + 8px);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
}
```

**Why this is needed:** The `@theme inline` block tells Tailwind to generate
utility classes like `bg-background`, `text-muted-foreground`,
`border-border`, etc. Without it, those classes won't exist in your app's
CSS output. The actual values come from the host's CSS variables at runtime,
so your app automatically picks up the correct theme (light/dark).

You can add app-specific `@keyframes` and `@utility` rules to this file too.

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
      "@sero/app-runtime": ["../../app-runtime/src/index.ts"],
      "@sero/ui": ["../../ui/src/index.ts"],
      "@sero/ui/*": ["../../ui/src/*"]
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

## Step 5: Build, Install, and Restart

App registration is **fully automatic**. The host auto-discovers all
`packages/pi-*/` directories that have a `sero.app` manifest. No manual
edits to any `apps/desktop/` file are needed.

**After creating your package, run these commands from the monorepo root
before restarting Sero:**

```bash
# From the monorepo root — install deps + build the new package:
pnpm install
pnpm --filter @sero/myapp build

# Then restart the dev server:
cd apps/desktop
bash scripts/dev.sh
```

> **You MUST run `pnpm install` and `pnpm --filter <package-name> build`
> after creating a new app package.** `pnpm install` links the workspace
> dependencies (including `@sero/app-runtime`). The build step produces
> `dist/ui/remoteEntry.js` which the host needs for production mode and
> which validates that the MF config is correct. In dev mode the remote
> Vite server serves the UI live, but the initial build catches errors
> early.

On startup:

1. **`vite.config.ts`** scans `packages/pi-*/package.json` for `sero.app`
   manifests and builds the Module Federation remotes map from `id` +
   `devPort`.
2. **`dev.sh`** discovers the same packages and starts a Vite dev server
   for each one on its `devPort`.
3. **`electron/main.ts`** scans packages and registers their paths for
   app discovery + adds them to `~/.sero-ui/agent/settings.json` so the
   agent loads the extension tools.
4. **`federation-registry.ts`** uses MF's `loadRemote()` at runtime —
   it derives the module path from the manifest's `id` and `component`
   fields. No static per-app imports needed.

### How auto-discovery works

The host reads three fields from each package's `sero.app` manifest:

| Field | Used by | Example |
|-------|---------|---------|
| `id` | MF remote name (`sero_<id>`), state path, sidebar | `"myapp"` |
| `component` | `loadRemote("sero_myapp/MyApp")` | `"MyApp"` |
| `devPort` | Dev server URL, Vite remotes config | `5175` |

All other fields (`name`, `icon`, `stateFile`, `ui`) are used for sidebar
display and app state management — they don't affect the federation wiring.

### Production

In production, apps are discovered via `pi install`:

```bash
pi install npm:@sero/myapp        # from npm
pi install ./packages/pi-myapp-extension  # local path
```

See [Pi Packages](../docs/libs/pi-coding-agent/packages.md) for
full install/publish documentation.

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
5. Edit your UI code → the host auto-reloads within ~300ms (see
   [Dev Workflow](#dev-workflow) below).

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

> **Note:** `useAgentPrompt` requires an active chat session. If the user hasn't
> started a chat, the prompt is silently dropped. For LLM calls that should work
> regardless of chat state, use `useAI` instead.

### `useAI()`

Make ad-hoc LLM calls from your app UI — no active chat session required.

Each app gets a **dedicated agent session** managed by the main process, keyed
by app ID + workspace. Sessions are created lazily on first call and persist
for the lifetime of the app, accumulating context across calls.

```typescript
const ai = useAI();

// Simple request/response — returns the LLM's text output
const response = await ai.prompt('Generate an inspirational quote.');

// Use with async state management
const [loading, setLoading] = useState(false);
const handleClick = async () => {
  setLoading(true);
  try {
    const result = await ai.prompt('Summarise my progress this week.');
    // ... use result
  } finally {
    setLoading(false);
  }
};
```

**Key properties:**
- Works without an active chat session — apps can call the LLM at any time.
- The dedicated session is in-memory only (no persistence). Apps should store
  results in their own state file via `useAppState`.
- The session accumulates conversation history, so follow-up calls can
  reference earlier interactions.
- Uses the same model, auth, and settings as chat sessions.
- App sessions run independently — they don't interfere with or appear in
  the user's chat panel.

---

## Styling Guide

Sero apps render inside the main app area. Use **`@sero/ui`** for pre-built
shadcn/ui components and **Tailwind CSS** for layout and custom styling.

### Using `@sero/ui` Components

The `@sero/ui` package provides 60+ shadcn/ui components shared across the
Sero platform. Import them via subpaths for tree-shaking:

```tsx
import { Button } from '@sero/ui/components/ui/button';
import { Card } from '@sero/ui/components/ui/card';
import { Badge } from '@sero/ui/components/ui/badge';
import { cn } from '@sero/ui/lib/utils';
```

Common components for apps:

| Component | Import path | Use for |
|-----------|-------------|---------|
| `Button` | `@sero/ui/components/ui/button` | Actions, toggles, form submissions |
| `Card` | `@sero/ui/components/ui/card` | Content containers, panels, sections |
| `Badge` | `@sero/ui/components/ui/badge` | Status indicators, counts |
| `Separator` | `@sero/ui/components/ui/separator` | Visual dividers |
| `ScrollArea` | `@sero/ui/components/ui/scroll-area` | Custom scrollable regions |
| `Checkbox` | `@sero/ui/components/ui/checkbox` | Toggle items, multi-select |
| `cn()` | `@sero/ui/lib/utils` | Class name merging (clsx + tailwind-merge) |

**Customising components:** Override defaults via `className` — shadcn
components are designed for this. `cn()` with `tailwind-merge` handles
deduplication, so your overrides replace (not append to) conflicting defaults:

```tsx
// Card defaults: rounded-xl py-6 gap-6 shadow-sm
// Your overrides replace those specific properties:
<Card className="rounded-2xl py-0 gap-0 shadow-none">
  {/* compact card with no gap or shadow */}
</Card>

// Button with conditional styling:
<Button
  variant="secondary"
  className={cn('h-12 rounded-xl', isActive && 'bg-accent')}
>
  Click me
</Button>
```

**Prefer `@sero/ui` components** over raw HTML elements with custom Tailwind
classes. Use `<Button>` instead of `<button>`, `<Card>` instead of a styled
`<div>`. This ensures visual consistency across Sero apps and gets you
built-in accessibility, focus management, and theme support for free.

### Tailwind Semantic Colors

Use Tailwind's semantic color classes (powered by the `@theme inline` block
in your `styles.css`) instead of raw CSS variable references:

| Tailwind class | Instead of | Use for |
|----------------|------------|---------|
| `bg-background` | `bg-[var(--bg-base)]` | Primary background |
| `bg-card` | `bg-[var(--bg-surface)]` | Card/panel backgrounds |
| `bg-secondary` | `bg-[var(--bg-elevated)]` | Hover/active states |
| `text-foreground` | `text-[var(--text-primary)]` | Main text |
| `text-muted-foreground` | `text-[var(--text-muted)]` | Hints, metadata |
| `border-border` | `border-[var(--border)]` | Standard borders |
| `text-destructive` | `text-red-500` | Error/danger text |
| `bg-primary` | — | Primary action backgrounds |

### Sero Design System Variables

For colours outside the shadcn palette, use Sero's CSS variables directly:

| Variable | Usage |
|----------|-------|
| `var(--bg-base)` | Primary background |
| `var(--bg-surface)` | Cards, elevated sections |
| `var(--bg-elevated)` | Active/hover states |
| `var(--text-primary)` | Main text |
| `var(--text-secondary)` | Less prominent text |
| `var(--text-muted)` | Hints, metadata |

### Layout

The app fills `h-full w-full` — structure your layout with `flex flex-col`
and `overflow-y-auto` for scrollable content.

---

## Manifest Reference

The `sero.app` object in `package.json`:

| Field | Required | Description |
|-------|----------|-------------|
| `id` | ✅ | Unique identifier. Used in file paths, registry keys, MF remote name. Lowercase, no spaces. |
| `name` | ✅ | Display name shown in the sidebar. |
| `icon` | ✅ | Lucide icon name (e.g. `"check-square"`, `"box"`, `"calculator"`). Mapped to emoji in the sidebar. |
| `scope` | ❌ | `"workspace"` (default) or `"global"`. See [State Scope](#state-scope) below. |
| `stateFile` | ✅ | State file path relative to workspace root. Convention: `.sero/apps/<id>/state.json`. Used by workspace-scoped apps; global apps ignore this (state resolves from `SERO_HOME`). |
| `ui` | ❌ | Path to the built `remoteEntry.js`, relative to package root. Null if no UI. |
| `component` | ❌ | Exported component name from the MF remote (e.g. `"MyApp"`). Required if `ui` is set. |
| `devPort` | ❌ | Vite dev server port for this remote. Required if `ui` is set. Must be unique across all apps. Must match `server.port` in the package's `vite.config.ts`. |

### State Scope

Apps can be **workspace-scoped** (default) or **global-scoped**.

| | Workspace | Global |
|---|-----------|--------|
| **State location** | `<workspacePath>/.sero/apps/<id>/state.json` | `~/.sero-ui/apps/<id>/state.json` |
| **Instances** | One per workspace — independent data | One shared instance across all workspaces |
| **Requires workspace** | Yes — shows "No workspace selected" otherwise | No — works without a workspace |
| **Use when** | Data is project-specific (todos, notes) | Data is personal/cross-project (weight, quotes, settings) |

**Manifest example (global):**

```json
{
  "sero": {
    "app": {
      "id": "weight-tracker",
      "name": "Weight",
      "icon": "heart-pulse",
      "scope": "global",
      "stateFile": ".sero/apps/weight-tracker/state.json",
      "ui": "./dist/ui/remoteEntry.js",
      "component": "WeightTracker",
      "devPort": 5176
    }
  }
}
```

> **Note:** The `stateFile` field is still required (for Pi CLI fallback) but
> Sero ignores it for global apps — the state path is computed as
> `~/.sero-ui/apps/<id>/state.json`.

**Extension changes for global apps:**

Global app extensions should resolve their state path from `SERO_HOME` when
running inside Sero, falling back to workspace-relative for Pi CLI:

```typescript
function resolveStatePath(cwd: string): string {
  const seroHome = process.env.SERO_HOME;
  if (seroHome) {
    return path.join(seroHome, 'apps', 'myapp', 'state.json');
  }
  return path.join(cwd, STATE_REL_PATH);
}
```

`SERO_HOME` is set automatically by Sero's main process (`~/.sero-ui`). In
Pi CLI it's unset, so the extension falls back to the workspace-relative path
(which is fine — Pi CLI has a single working directory).

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

### Keyboard events

Apps that listen for keyboard events **must scope listeners to their own
container element**, not `window`. The shell has multiple panels (ChatPanel,
sidebar, other apps) — a `window`-level listener will steal keystrokes when
the user clicks into another panel.

**Pattern:**

```tsx
// In your hook or component, accept a container ref:
function useMyKeyboard(containerRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const target = containerRef.current;
    if (!target) return;
    const handler = (e: KeyboardEvent) => {
      // Only fires when this container is focused
      e.preventDefault();
      // ... handle key
    };
    target.addEventListener('keydown', handler);
    return () => target.removeEventListener('keydown', handler);
  }, [containerRef]);
}
```

Make the app's root container focusable and auto-focus it on mount:

```tsx
export function MyApp() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="h-full w-full outline-none"
    >
      {/* ... */}
    </div>
  );
}
```

**Key rules:**
- Never use `window.addEventListener('keydown', ...)` — always scope to the
  app container.
- Add `tabIndex={0}` so the container can receive focus.
- Add `outline-none` (Tailwind) to suppress the browser focus ring.
- Auto-focus the container in a `useEffect` so keyboard works immediately
  when the app is activated.
- If you need focus to stay on the container when child elements are clicked,
  add an `onFocus` handler that redirects focus back:
  ```tsx
  onFocus={(e) => {
    if (e.target !== containerRef.current) containerRef.current?.focus();
  }}
  ```

### Responsive sizing

Apps fill the entire main content area (`h-full w-full`). If your app has
fixed-ratio content (game boards, canvases, grids), **compute dimensions
dynamically** from the container size rather than using fixed pixel values.

**Pattern — `ResizeObserver` hook:**

```tsx
function useDynamicSize(containerRef: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  return size;
}
```

Use the measured size to derive layout values (e.g. cell size for a grid):

```tsx
const { height } = useDynamicSize(containerRef);
const cellSize = Math.floor((height - overhead) / ROWS);
```

**Key rules:**
- Always use `ResizeObserver`, not a one-time measurement — the container
  resizes when the sidebar or chat panel is toggled.
- Derive from the **minimum** of width and height constraints to maintain
  aspect ratio.
- Add breathing room (padding) so content doesn't touch container edges.
- Use `Math.floor()` for pixel values to avoid sub-pixel rendering issues.

### Module Federation

- `react` and `react-dom` are shared singletons via MF — the host provides
  them. Do NOT bundle your own copy.
- `@sero/app-runtime` is NOT shared via MF (its `loadShare` wrapper breaks
  named exports). Instead it resolves via `node_modules` and uses a
  `globalThis` singleton for the React context. Add it to
  `optimizeDeps.exclude` so Vite doesn't pre-bundle it.
- Do NOT alias `@sero/app-runtime` in any vite config — aliases conflict
  with both MF sharing and the `globalThis` singleton pattern.
- Each remote runs its own Vite dev server on a unique port declared via
  `devPort` in `package.json`.
- **No host-side edits needed.** The host auto-discovers remotes at build
  time and uses `loadRemote()` at runtime. Adding a new app never requires
  touching `apps/desktop/`.

---

## Dev Workflow

### Starting the dev environment

```bash
cd apps/desktop
bash scripts/dev.sh
```

This starts:
1. Each remote's Vite dev server (one per app with a UI)
2. The host Vite dev server (port 5173)
3. Electron

### Live reload for remote apps

The host includes a `watchRemotes` Vite plugin that monitors all
`packages/pi-*/ui/` directories. When you edit a remote app's UI code:

1. The remote's Vite dev server detects the change and rebuilds (~50ms)
2. The host's watcher detects the same file change (300ms debounce)
3. The host sends `full-reload` via Vite's WebSocket
4. The Electron renderer reloads with the updated code

This gives **near-instant feedback** (~300–500ms) when editing app UI code.
No manual restart needed.

> **Note:** Changes to the Pi extension (`extension/index.ts`) or
> `shared/types.ts` require restarting the Electron main process
> (`bash scripts/dev.sh`) because extensions are loaded by Pi at startup.

### Port conventions

| Server | Port |
|--------|------|
| Host (Sero) | 5173 |
| Remotes | 5174+ (each app declares its own via `devPort`) |

Each app's `devPort` in `package.json` must be unique. The dev script and
Vite config both read it automatically — no central port registry to maintain.
Current assignments: Todo=5174, Calc=5175, Weight=5176, Quote=5177.

### Logs

| File | Contents |
|------|----------|
| `/tmp/sero-vite.log` | Host Vite + live reload events |
| `/tmp/sero-remote-<name>.log` | Remote Vite dev server |
| `/tmp/sero-electron.log` | Electron main + forwarded renderer errors |

---

## Troubleshooting

**App doesn't appear in sidebar:**
- Check that `sero.app.id` and `sero.app.name` are set in `package.json`.
- Verify the package directory is under `packages/` and starts with `pi-`.
- Check that `pnpm install` was run after creating the package.
- Check the electron log for `[app-discovery]` messages.

**Agent doesn't have the tool:**
- The host auto-registers packages in `~/.sero-ui/agent/settings.json` on
  startup. Restart Sero after adding a new package.
- Verify the package's `pi.extensions` field points to the correct file.

**UI changes don't appear after editing:**
- Check that the remote Vite dev server is running (look for its log file).
- The host's `watchRemotes` plugin triggers reload on file saves to
  `packages/pi-*/ui/`. Check `/tmp/sero-vite.log` for
  `[sero-watch-remotes]` messages.
- Extension code changes (in `extension/`) require a full restart.

**UI shows "No UI module registered":**
- Check that `sero.app.component` is set in `package.json`.
- Check that `sero.app.devPort` is set and matches `server.port` in
  `vite.config.ts`.
- Verify the remote Vite dev server is running on the correct port.

**UI shows "No workspace selected":**
- The app needs an active workspace. Click a workspace in the sidebar first.

**State doesn't sync between agent and UI:**
- Verify both sides use the same `stateFile` path.
- Check that writes are atomic (temp file → rename). Non-atomic writes can
  produce corrupt JSON that the watcher silently ignores.
- Look for errors in the electron console (`Cmd+Option+I` → Console).

**Keyboard events in my app steal input from other panels (ChatPanel, etc.):**
- Your app is using `window.addEventListener('keydown', ...)`. Scope the
  listener to the app's container element instead. See
  [Keyboard events](#keyboard-events) in Conventions and Rules.

**App content is tiny / doesn't fill the available space:**
- You're using fixed pixel sizes. Use a `ResizeObserver` to compute
  dimensions dynamically from the container. See
  [Responsive sizing](#responsive-sizing) in Conventions and Rules.

**Module Federation errors in console:**
- Make sure the remote dev server is running on the correct port.
- Check that `devPort` in `package.json` matches `server.port` in
  `vite.config.ts`.
- If you see `RUNTIME-004: Failed to locate remote`, the remote isn't
  registered. Verify the `devPort` is set and the remote is running.
- The `@sero/app-runtime` shared module warning ("alias conflicts") is
  expected in dev mode and can be safely ignored.

---

## Reference Implementations

The **Calculator app** (`packages/pi-calc-extension/`) is the best reference
for using `@sero/ui` components with Tailwind:

| File | What to learn |
|------|---------------|
| `ui/CalcApp.tsx` | `Button` and `Card` from `@sero/ui`, `cn()` usage, container-scoped keyboard events |
| `ui/styles.css` | Minimal Tailwind + `@theme inline` setup for remote apps |
| `ui/calc-engine.ts` | Pure logic separated from React (testable, no side effects) |
| `package.json` | `@sero/ui` as workspace devDependency |

The **Todo app** (`packages/pi-todo-extension/`) is the canonical reference
for app structure:

| File | What to learn |
|------|---------------|
| `package.json` | Dual Pi + Sero manifest, scripts, dependency structure |
| `vite.config.ts` | MF remote configuration, `root: 'ui'` pattern, shared singletons |
| `shared/types.ts` | Shared state shape pattern |
| `extension/index.ts` | Tool registration, atomic file I/O, TUI rendering |
| `ui/TodoApp.tsx` | `useAppState` usage, Tailwind styling, sub-components |

The **Tetris app** (`packages/pi-tetris-extension/`) demonstrates patterns
for interactive/game-style apps:

| File | What to learn |
|------|---------------|
| `ui/TetrisApp.tsx` | Dynamic sizing with `ResizeObserver`, container-scoped keyboard events, `tabIndex` focus management |
| `ui/game/useGame.ts` | Game loop hook with scoped keyboard listener (accepts `containerRef`), `setInterval` lifecycle |
| `ui/game/engine.ts` | Pure game logic separated from React (testable, no side effects) |
| `shared/types.ts` | Persisted stats (high score) vs. ephemeral game state (board, current piece) |

### Related documentation

- [Sero Apps Architecture](../docs/sero-apps.md) — full design
  doc with architecture diagrams and open decisions
- [Pi Extensions](../docs/libs/pi-coding-agent/extensions.md) —
  complete extension API: events, tools, commands, rendering, state management
- [Pi Packages](../docs/libs/pi-coding-agent/packages.md) —
  packaging, distribution, npm/git install
- [Sero Architecture](../docs/architecture.md) — shell layout,
  component hierarchy, state management
- [Sero Desktop AGENTS.md](../apps/desktop/AGENTS.md) — file size rules, state
  management rules, dev conventions
