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
- [Step 5: Build and Start](#step-5-build-and-start)
- [Step 6: Run and Test](#step-6-run-and-test)
- [Converting an Existing Pi Extension](#converting-an-existing-pi-extension)
- [App Runtime API Reference](#app-runtime-api-reference)
- [Styling Guide](#styling-guide)
- [Dashboard Widgets](#dashboard-widgets)
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
│    [Explorer] [Todo] [YourApp]  ← from discovery           │
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

Create a new directory under `plugins/`:

```
plugins/sero-myapp-plugin/
├── package.json
├── vite.config.ts          ← root-level, uses root: 'ui'
├── shared/
│   └── types.ts
├── extension/
│   ├── index.ts
│   └── tsconfig.json
├── ui/
│   ├── MyApp.tsx
│   ├── styles.css
│   ├── tsconfig.json
│   └── index.html
└── README.md
```

### `package.json`

The package.json serves triple duty: Pi manifest + Sero app manifest + Sero
plugin manifest.

```json
{
  "name": "@sero-ai/plugin-myapp",
  "version": "0.1.0",
  "description": "My app for Sero",
  "keywords": ["pi-package"],
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc --noEmit -p ui/tsconfig.json && tsc --noEmit -p extension/tsconfig.json"
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
    },
    "plugin": {
      "category": "productivity",
      "tags": ["myapp", "example"],
      "minSeroVersion": "0.1.0"
    }
  },
  "dependencies": {
    "@sinclair/typebox": "catalog:"
  },
  "peerDependencies": {
    "@mariozechner/pi-ai": "catalog:peer",
    "@mariozechner/pi-coding-agent": "catalog:peer",
    "@mariozechner/pi-tui": "catalog:peer",
    "zod": "catalog:peer"
  },
  "devDependencies": {
    "@sero-ai/app-runtime": "workspace:@sero-ai/app-runtime@*",
    "@sero/common": "workspace:*",
    "@sero-ai/ui": "workspace:*",
    "@module-federation/vite": "catalog:",
    "@vitejs/plugin-react": "catalog:",
    "@tailwindcss/vite": "catalog:",
    "react": "catalog:",
    "react-dom": "catalog:",
    "tailwindcss": "catalog:",
    "typescript": "catalog:",
    "vite": "catalog:"
  }
}
```

**Important notes:**

- Built-in Sero apps in this monorepo live under `plugins/sero-*-plugin/`.
  The host auto-discovers them — no manual registration files to edit.
- `"keywords": ["pi-package"]` keeps the package compatible with Pi tooling.
- `"pi"` is standard Pi metadata — see
  [Pi Packages](../docs/libs/pi-coding-agent/packages.md) for full options.
- `"sero.app"` is the Sero app manifest used for sidebar discovery, app state,
  and module federation.
- `"sero.plugin"` marks the package as a plugin-style app. Omit
  `bridgeTools` to bridge **all** plugin tools into `sero-cli` by default; use
  `false` or a string array only if you need to opt out or be selective.
- Pi SDK packages (`@mariozechner/*`, `@sinclair/typebox`) stay in
  `peerDependencies` — the Pi runtime provides them. See
  [Extension Dependencies](../docs/libs/pi-coding-agent/packages.md#dependencies).
- `@sero-ai/app-runtime` is a `devDependency` because it's shared via module
  federation at runtime — the host provides the singleton.
- `@sero-ai/ui` is a `devDependency` that provides shared shadcn/ui components
  (`Button`, `Card`, etc.) and utilities (`cn`). Components are bundled into
  your app at build time — no MF sharing needed.
- `@sero/common` is the place for **renderer-safe shared contracts** used across
  desktop, remotes, and plugins **inside this monorepo**. If a type/helper
  stops being app-local, move it into `packages/common/src/`, re-export it
  from `packages/common/src/index.ts`, add `@sero/common` to the consuming
  package's `devDependencies`, and import it via `@sero/common`.
- `"devPort"` must be unique (see [Port conventions](#port-conventions)). The
  host auto-discovers it from the manifest — no central registry or Vite remotes
  file to update.

## Step 2: Define the Shared State

Create `shared/types.ts` — the single source of truth for your app-local
state shape. Both the Pi extension and the web UI import this.

If a type/helper needs to be shared more broadly across the desktop app,
multiple plugins, or web/remotes **in this monorepo**, move that neutral
contract into `@sero/common` instead of duplicating it. Keep `@sero/common`
renderer-safe, re-export new types from `packages/common/src/index.ts`, and
then import them from each consumer via `@sero/common`.

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

> **⚠️ Tool bridging — no standalone app tool schemas in Sero.**
>
> App/plugin tools are bridged into the single `sero-cli` tool at runtime (see
> [AD-020](../docs/decisions.md#ad-020)). In Sero, your tool schema is removed
> from the agent's direct tool list and re-registered as a CLI subcommand
> (for example `sero myapp list`, `sero myapp add --title "Test"`).
>
> **What this means for you:**
> - Keep writing normal Pi extensions with `pi.registerTool()`.
> - Built-in/core tool names may still be matched by a static allowlist, but
>   plugin packages with `sero.plugin` bridge **all tools by default**.
>   Use `sero.plugin.bridgeTools` only when you need to disable bridging or
>   bridge a selective subset.
> - The tool name becomes a CLI command. Required params come first; optional
>   params become `--flags`. Array/object params accept JSON strings.
> - **Single-command** `sero-cli` invocations preserve `text`, `image`, and
>   `details` blocks end-to-end. **Multi-command** batches are text-only by
>   design and set `details.richOutputFallback = true` when rich content must
>   be rerun alone.
> - Bridged tools execute against the **current session's loaded extension
>   instance**, not the first session that registered the command.
> - If a bridged tool needs current-session side effects (for example queueing
>   follow-up messages or sending custom status messages), depend on the
>   execution context passed into the tool instead of capturing a registration-
>   scoped `pi` object inside tool logic.
> - Your tool still works unchanged in the **Pi CLI** where it remains a normal
>   standalone Pi tool. The bridging behavior is Sero-only.
> - **Do NOT** register app tools directly as `customTools` in
>   `createAgentSession()` — those bypass the bridge and waste token budget.
>
> **Why:** Each standalone tool schema costs ~200–400 tokens. With many
> extensions, that adds thousands of tokens before the user even sends a
> message. `sero-cli` collapses app tools into one compact schema (`command`
> + `timeout`), saving a large chunk of context budget every session.

### Profile-aware config and cache paths

If your extension needs **global config, caches, or usage files** outside the
workspace state file, do **not** hardcode `~/.pi` or `~/.pi/agent` when running
inside Sero.

Use these rules instead:

- **App-specific config/cache** → `process.env.SERO_HOME`
  (for example `path.join(process.env.SERO_HOME!, 'apps', '<id>', 'config.json')`)
- **Pi SDK / agent resources** (`settings.json`, `auth.json`, `skills/`, etc.)
  → `process.env.PI_CODING_AGENT_DIR`
- **Pi CLI fallback only** → if those env vars are unset, then fall back to the
  legacy Pi location under `~/.pi`

```typescript
import os from 'node:os';
import path from 'node:path';

function resolveConfigPath(appId: string, filename: string): string {
  const seroHome = process.env.SERO_HOME;
  if (seroHome) {
    return path.join(seroHome, 'apps', appId, filename);
  }
  return path.join(os.homedir(), '.pi', filename);
}
```

Hardcoded `homedir() + '/.pi/...'` paths break Sero profile isolation: every
profile would share one config file and one cache. Keep Sero data inside the
active `SERO_HOME` instead.

## Step 4: Build the Web UI

The UI is a React component loaded into Sero via
[Vite Module Federation](https://module-federation.io/guide/framework/vite.html).
It uses hooks from `@sero-ai/app-runtime` to read/write the same state file.

### `ui/MyApp.tsx`

```tsx
// ui/MyApp.tsx

import { useState, useCallback } from 'react';
import { useAppState, useAppInfo, useAgentPrompt } from '@sero-ai/app-runtime';
import { cn } from '@sero-ai/ui/lib/utils';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Card } from '@sero-ai/ui/components/ui/card';
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

- **Both named and default exports are required.** The component must have
  `export function MyApp()` AND `export default MyApp` at the bottom of the
  file. The host uses `React.lazy()` with `loadRemote<{ default: ComponentType }>()`,
  which requires a default export. Without it you'll get:
  `lazy: Expected the result of a dynamic import() call`.
- Import `Button`, `Card`, and other components from `@sero-ai/ui/components/ui/*`
  instead of writing raw HTML elements with custom classes.
- Import `cn` from `@sero-ai/ui/lib/utils` for conditional class name merging.
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
        // NOTE: @sero-ai/app-runtime is NOT shared here — MF's loadShare
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
    exclude: ['@sero-ai/app-runtime'],
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
- Do NOT alias `@sero-ai/app-runtime` — the MF plugin must intercept that import
  so the host's singleton is used at runtime.
- `@sero-ai/ui` does NOT need to be in `optimizeDeps.exclude` — unlike
  `@sero-ai/app-runtime`, it's bundled into your remote at build time (no
  runtime singleton). Vite handles it automatically.

### `ui/styles.css`

Each app needs a small CSS file that imports Tailwind and maps the host's
CSS variables to Tailwind utilities via `@theme inline`. This is required
because each remote has its own independent Tailwind build.

```css
@import "tailwindcss";

/* REQUIRED: Scan @sero-ai/ui component sources so Tailwind generates CSS
   for utility classes used inside shared components (Button, Card, etc.).
   Without this, complex classes like has-[...]:flex-col won't be generated
   and layouts will break. Path is relative to this CSS file. */
@source "../../ui/src/components";

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

**Why this is needed:**

- **`@source`**: Tailwind CSS 4 doesn't automatically scan monorepo
  packages. Without this directive, Tailwind won't see the utility classes
  inside `@sero-ai/ui` components (e.g. `has-[>[data-align=block-end]]:flex-col`
  in InputGroup), and layouts will silently break. The path is relative to
  the CSS file — adjust based on your package's location.
- **`@theme inline`**: Tells Tailwind to generate utility classes like
  `bg-background`, `text-muted-foreground`, `border-border`, etc. Without
  it, those classes won't exist in your app's CSS output. The actual values
  come from the host's CSS variables at runtime, so your app automatically
  picks up the correct theme (light/dark).

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
      "@sero-ai/app-runtime": ["../../app-runtime/src/index.ts"],
      "@sero-ai/ui": ["../../ui/src/index.ts"],
      "@sero-ai/ui/*": ["../../ui/src/*"]
    }
  },
  "include": ["./**/*", "../shared/**/*"]
}
```

### `ui/index.html`

> **This file is required.** Because `vite.config.ts` sets `root: 'ui'`, Vite
> expects `ui/index.html` as the build entry point. Without it, `vite build`
> fails with `Could not resolve entry module "ui/index.html"`.

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>Sero MyApp (remote)</title></head>
<body><div id="root"></div></body>
</html>
```

## Step 5: Build and Start

App registration is **fully automatic**. For built-in monorepo apps, the host
auto-discovers all `plugins/sero-*-plugin/` directories that have a `sero.app`
manifest. No manual edits to Vite remotes, federation registries, Electron
startup, or CLI bridge files are needed.

**After creating a new built-in plugin, run these commands from the monorepo
root before starting or restarting the desktop dev server:**

```bash
pnpm install
pnpm --filter @sero-ai/plugin-myapp build
pnpm --filter @sero-ai/plugin-myapp typecheck

cd apps/desktop
SERO_DEV_PLUGINS=myapp bash scripts/dev.sh
```

> **You MUST run `pnpm install`, `build`, and `typecheck` after creating a new
> app package.** `pnpm install` links workspace dependencies. The build step
> produces `dist/ui/remoteEntry.js`, which validates the MF setup and is used
> whenever the plugin is not running in dev mode. `typecheck` catches extension
> and UI errors early. For UI HMR, include your app ID in `SERO_DEV_PLUGINS`;
> otherwise the host loads the built bundle.

On startup (and on profile settings reload for installed plugins):

1. **`vite.config.ts`** scans `plugins/sero-*-plugin/package.json` for
   `sero.app` manifests and builds the Module Federation remotes map from
   `id` + `devPort`.
2. **`dev.sh`** discovers the same packages and starts Vite dev servers only
   for the plugin IDs listed in `SERO_DEV_PLUGINS`; everything else loads from
   pre-built bundles.
3. **`electron/main.ts`** registers built-in plugin paths in the active
   profile's `settings.json` so the Pi resource loader sees their extensions.
4. **`app-state.ts`** watches that `settings.json`; when it changes (for
   example after installing an external plugin), Sero reloads active session
   resources so new `sero-cli` commands appear without a manual restart.
5. **`federation-registry.ts`** uses MF's `loadRemote()` at runtime — it
   derives the module path from the manifest's `id` and `component` fields.
   No static per-app imports are needed.

### How auto-discovery works

The host reads three fields from each plugin's `sero.app` manifest:

| Field | Used by | Example |
|-------|---------|---------|
| `id` | MF remote name (`sero_<id>`), state path, sidebar | `"myapp"` |
| `component` | `loadRemote("sero_myapp/MyApp")` | `"MyApp"` |
| `devPort` | Dev server URL, Vite remotes config | `5175` |

All other fields (`name`, `icon`, `stateFile`, `ui`) are used for sidebar
display and app state management — they don't affect the federation wiring.

### External / installed plugins

For plugins distributed outside the monorepo, package and install them via the
Sero plugin flow described in [plugins-guide.md](plugins-guide.md). Installed
plugins are added to the active profile's `settings.json` and their tools,
commands, and UI refresh into running sessions automatically.

## Step 6: Run and Test

```bash
cd apps/desktop
SERO_DEV_PLUGINS=myapp bash scripts/dev.sh
```

1. Click your app in the sidebar → the federated UI loads.
2. Add items via the UI → `state.json` updates → UI re-renders.
3. Ask the agent "add an item called test" → agent calls the tool → writes
   `state.json` → file watcher fires → UI re-renders.
4. Both directions are instant because they share the same file.
5. Edit your UI code → the host auto-reloads within ~300ms (see
   [Dev Workflow](#dev-workflow) below).

---

## Converting an Existing Pi Extension

When building a Sero plugin from an existing Pi extension or package
(e.g. `pi-web-access`, `pi-todoist-extension`), you must **internalize all
source code** into the plugin. Do not import the original package as a
dependency.

### The rule: copy, don't import

> **All extension code must live inside the plugin directory.** Never
> `import` from, `require`, or list an external Pi extension as a
> dependency. Sero plugins are self-contained units — they must not rely
> on external Pi packages for their core functionality.

**Why:**

- Pi extensions are loaded by the Pi SDK's TypeScript loader. Transitive
  TypeScript imports from `node_modules` are unreliable — the loader may
  not handle them, and module resolution for packages without `"main"` or
  `"exports"` fields is undefined.
- External packages couple your plugin to the original author's release
  schedule and internal structure. A breaking change in an internal module
  (e.g. `pi-web-access/exa.js`) silently breaks your plugin.
- You need to modify the extension code to integrate with Sero's state
  file, which is impossible with an opaque dependency.
- Sero plugins should work in isolation — installing the plugin installs
  everything it needs, with no implicit dependency on a separate
  `pi install` step.

### Step-by-step conversion process

#### 1. Read and understand the source

Clone or locate the original extension. Read its `package.json` to find:

- **Entry point:** `pi.extensions` — usually `["./index.ts"]`
- **Dependencies:** direct `dependencies` (you'll add these to your plugin)
- **Peer dependencies:** Pi SDK packages (`@mariozechner/pi-*`,
  `@sinclair/typebox`) — these are provided by the Pi runtime; list them
  as `peerDependencies` in your plugin

Read the entry point to understand the tool registrations, commands,
session handlers, and any in-memory storage.

#### 2. Copy source files into `extension/`

Copy all `.ts` source files from the original package into your plugin's
`extension/` directory. Keep them flat (same directory level) so relative
imports between files (`import { foo } from "./bar.js"`) continue to work
without path changes.

```bash
# Example: copying from a local clone
SRC=/path/to/pi-some-extension
DEST=plugins/sero-some-plugin/extension

for f in "$SRC"/*.ts; do
  cp "$f" "$DEST/$(basename "$f")"
done
```

#### 3. Split files over 500 lines

The [500 LOC rule](../apps/desktop/AGENTS.md) applies to every source file
you create. After copying, check all files:

```bash
wc -l plugins/sero-some-plugin/extension/*.ts | sort -rn | head
```

Split any file exceeding 500 lines. Common split strategies:

| Original pattern | Split into |
|------------------|------------|
| Monolithic `index.ts` with multiple tool registrations | `index.ts` (entry + session) + `tools-<name>.ts` per tool group |
| Large provider file (API + MCP proxy) | `provider.ts` (API) + `provider-mcp.ts` (MCP) |
| Extractor with HTTP + specialized logic | `extract.ts` (orchestrator) + `http-extract.ts` (HTTP/HTML) |
| Content generation (trees, formatting) | Main file + `<name>-content.ts` (pure helpers) |

When splitting, keep the original file's public exports stable so other
files that import from it don't need changes. Extract internal helpers
into the new file and import them back.

#### 4. Add Sero state sync

The original extension likely uses in-memory storage (a `Map`, module-level
variables) or Pi's session entries (`pi.appendEntry`). Neither of these is
visible to the Sero web UI. You need to also write to the state file.

**Pattern — write-through to state.json:**

Every time the extension stores a result (tool execution complete,
background fetch done), also write a lightweight summary to the state file.
The UI reads this via `useAppState`.

```typescript
// In your tool's execute handler or storage wrapper:
storeResult(id, data);                        // original in-memory store
pi.appendEntry("my-results", data);           // original session persistence
syncEntryToState(statePath, data).catch(noop); // NEW: write to state.json
```

Create a `state-sync.ts` module that handles:
- Resolving the state file path from `ctx.cwd`
- Atomic read/write of the state JSON
- Converting the extension's internal data format to the lighter state
  shape consumed by the UI (strip large content, images, etc.)

> **Critical:** If the original Pi extension reads or writes files under
> `~/.pi` or `~/.pi/agent`, rewrite those paths for Sero. App-specific config
> and caches should resolve from `process.env.SERO_HOME` (usually under
> `~/.sero-ui/apps/<id>/...`), and Pi SDK resources should resolve from
> `process.env.PI_CODING_AGENT_DIR`. Only fall back to `~/.pi` when running in
> the Pi CLI with those env vars unset.

**Pattern — sync provider/config info on session start:**

```typescript
pi.on('session_start', async (_event, ctx) => {
  statePath = resolveStatePath(ctx.cwd);
  // Restore entries from session branch
  const branch = ctx.sessionManager.getBranch();
  await syncFromSession(statePath, branch);
  // Write provider availability to state for UI display
  await updateProviderInfo(statePath, { ... });
});
```

#### 5. Replace TUI-specific features

Sero plugins run in Electron, not a terminal. Several Pi extension features
are TUI-only and must be replaced or removed:

| TUI feature | Sero replacement |
|-------------|-----------------|
| `pi.registerShortcut()` | Remove or map to a command. Sero has its own keybinding system. |
| `ctx.ui.setWidget()` (TUI widget) | Use the Sero web UI dashboard widget instead. |
| `ctx.ui.select()` / `ctx.ui.confirm()` | Remove — use the web UI for interactive selection. |
| `ctx.ui.notify()` | Use `pi.events.emit('sero:notify', { message })` for desktop notifications, or show state in the web UI. |
| Glimpse windows / `open()` | Remove — the Sero web UI replaces external browser windows. |
| Curator / interactive browser UIs | Remove the HTTP server + HTML template code entirely. Build the equivalent as a React component in `ui/`. |
| Activity monitor (TUI widget) | Track activity in the state file and display it in the web UI. |

**For tools with interactive workflows** (e.g. a search tool that opens a
curator browser for result review), simplify to the non-interactive path.
If the original tool has `if (shouldCurate) { ... } else { ... }`, use only
the `else` branch. The Sero web UI provides the review experience instead.

#### 6. Add direct dependencies

Any npm packages the original extension imports go directly in your plugin's
`dependencies` — not as a transitive dependency through the original package:

```json
{
  "dependencies": {
    "@sinclair/typebox": "catalog:",
    "@mozilla/readability": "^0.5.0",
    "linkedom": "^0.16.0",
    "turndown": "^7.2.0"
  }
}
```

Pi SDK packages remain as `peerDependencies` — they're provided by the runtime.

**Built-in/internalized plugin packaging rule:** if the plugin ships inside the
Sero app bundle (for example under `plugins/sero-*-plugin/`), every runtime npm
package imported by the extension must also be declared in that plugin's own
`dependencies` and must be installable as a plugin-local production
`node_modules/` tree. Do **not** rely on monorepo hoisting or unrelated
`apps/desktop` dependencies for packaged builds. Packaged Sero stages built-in
plugins as self-contained directories under `dist/electron/builtin/`, so the
plugin must carry everything its extension resolves at runtime (including native
modules like `better-sqlite3`).

#### 7. Design the state shape for the UI

The original extension's internal data structures are optimised for the
agent. The Sero state file should be optimised for the UI — lighter, with
only the fields the web components need:

```typescript
// Original (in-memory, agent-facing):
interface StoredSearchData {
  id: string;
  queries: Array<{
    query: string;
    answer: string;  // potentially huge
    results: Array<{ title: string; url: string; snippet: string }>;
    error: string | null;
  }>;
}

// Sero state (UI-facing):
interface WebEntry {
  id: string;
  type: 'search' | 'fetch';
  timestamp: number;
  queries?: Array<{
    query: string;
    resultCount: number;  // just the count, not the full results
    provider?: string;
    error?: string | null;
    sources: Array<{ title: string; url: string }>;
  }>;
}
```

Strip large text content, base64 images, and anything the UI doesn't
render. The full data is still accessible to the agent via the original
in-memory storage and session entries.

### Conversion checklist

- [ ] All extension `.ts` files copied into `extension/`
- [ ] No `import` from the original package anywhere in the plugin
- [ ] Original package removed from `dependencies`
- [ ] Original package's npm dependencies added directly
- [ ] Every source file under 500 LOC (split if needed)
- [ ] State sync added: tool results → state.json
- [ ] Any hardcoded `~/.pi` / `~/.pi/agent` paths rewritten to use `SERO_HOME` / `PI_CODING_AGENT_DIR` in Sero
- [ ] Session restore: existing entries synced to state on session start
- [ ] TUI-specific code removed (shortcuts, widgets, interactive prompts, Glimpse)
- [ ] Web UI built to replace removed TUI features
- [ ] `pnpm install && pnpm build && pnpm typecheck` all pass

### Reference: Web Access plugin (`sero-web-plugin`)

The **Web Access plugin** (`plugins/sero-web-plugin/`) is the canonical
reference for converting an existing Pi extension. It was built from
[pi-web-access](https://github.com/nicobailon/pi-web-access) (11K+ lines,
22 source files) and demonstrates every pattern above:

| Conversion pattern | Files |
|--------------------|-------|
| Monolithic entry split into tool modules | `index.ts` → `index.ts` + `tools-search.ts` + `tools-fetch.ts` + `tools-code-search.ts` |
| Provider file split (API + MCP) | `exa.ts` → `exa.ts` + `exa-mcp.ts` |
| Extractor split (orchestrator + HTTP) | `extract.ts` → `extract.ts` + `http-extract.ts` |
| Content generation extracted | `github-extract.ts` → `github-extract.ts` + `github-content.ts` |
| TUI curator removed, replaced by web UI | Curator server/page skipped; `ui/WebApp.tsx` provides history browsing |
| State sync added | `state-sync.ts` converts internal `StoredSearchData` → `WebEntry` |
| Session restore | `index.ts` reads session branch entries on `session_start` |

---

## App Runtime API Reference

`@sero-ai/app-runtime` provides three hooks. All must be used inside a component
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

### `useWidgetRegistration(options)`

Register a dashboard widget component at runtime. The widget appears in
the Add Widget picker and can be placed on the dashboard grid.

```typescript
import { useWidgetRegistration } from '@sero-ai/app-runtime';
import { MyWidget } from './widgets/MyWidget';

export function MyApp() {
  useWidgetRegistration({
    widgetId: 'summary',
    name: 'Summary',
    component: MyWidget,
    defaultSize: { w: 2, h: 2 },
  });
  // ...
}
```

Registers on mount, unregisters on unmount. See
[Dashboard Widgets](#dashboard-widgets) for full details and the imperative
`registerWidget()` API.

---

## Styling Guide

Sero apps render inside the main app area. Use **`@sero-ai/ui`** for pre-built
shadcn/ui components and **Tailwind CSS** for layout and custom styling.

### Using `@sero-ai/ui` Components

The `@sero-ai/ui` package provides 60+ shadcn/ui components shared across the
Sero platform. Import them via subpaths for tree-shaking:

```tsx
import { Button } from '@sero-ai/ui/components/ui/button';
import { Card } from '@sero-ai/ui/components/ui/card';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { cn } from '@sero-ai/ui/lib/utils';
```

Common components for apps:

| Component | Import path | Use for |
|-----------|-------------|---------|
| `Button` | `@sero-ai/ui/components/ui/button` | Actions, toggles, form submissions |
| `Card` | `@sero-ai/ui/components/ui/card` | Content containers, panels, sections |
| `Badge` | `@sero-ai/ui/components/ui/badge` | Status indicators, counts |
| `Separator` | `@sero-ai/ui/components/ui/separator` | Visual dividers |
| `ScrollArea` | `@sero-ai/ui/components/ui/scroll-area` | Custom scrollable regions |
| `Checkbox` | `@sero-ai/ui/components/ui/checkbox` | Toggle items, multi-select |
| `cn()` | `@sero-ai/ui/lib/utils` | Class name merging (clsx + tailwind-merge) |

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

**Prefer `@sero-ai/ui` components** over raw HTML elements with custom Tailwind
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

## Dashboard Widgets

Apps can provide **dashboard widgets** — compact, interactive views that appear
on the Dashboard landing page. Widgets live on a draggable/resizable grid
(powered by `react-grid-layout`) and have full access to `useAppState`,
`useAgentPrompt`, and all other `@sero-ai/app-runtime` hooks.

There are two ways to register widgets: **static** (declared in `package.json`)
and **dynamic** (registered at runtime via a hook).

### Static widgets (manifest)

Declare widgets in the `sero.app.widgets` array in `package.json`. Each entry
tells the host what component to load and how to size it on the grid.

```json
{
  "sero": {
    "app": {
      "id": "myapp",
      "name": "My App",
      "icon": "box",
      "stateFile": ".sero/apps/myapp/state.json",
      "ui": "./dist/ui/remoteEntry.js",
      "component": "MyApp",
      "devPort": 5175,
      "widgets": [
        {
          "id": "summary",
          "name": "Summary",
          "component": "MyAppWidget",
          "description": "Quick overview of items",
          "defaultSize": { "w": 2, "h": 2 },
          "minSize": { "w": 1, "h": 1 },
          "maxSize": { "w": 4, "h": 3 }
        }
      ]
    }
  }
}
```

**Widget manifest fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `id` | ✅ | Unique identifier within the app (e.g. `"summary"`). |
| `name` | ✅ | Display name shown in the widget header and Add Widget picker. |
| `component` | ✅ | Exported component name from the MF remote (e.g. `"MyAppWidget"`). Must match the `exposes` key in `vite.config.ts`. |
| `description` | ❌ | Short description shown in the Add Widget picker. |
| `defaultSize` | ✅ | Default grid size in columns × rows (e.g. `{ "w": 2, "h": 2 }`). The dashboard uses a 6-column grid with 120px row height. |
| `minSize` | ❌ | Minimum resize constraint. |
| `maxSize` | ❌ | Maximum resize constraint. |

### Expose the widget via Module Federation

Add the widget component to `exposes` in `vite.config.ts` alongside the main
app component:

```typescript
// vite.config.ts
federation({
  name: 'sero_myapp',
  exposes: {
    './MyApp': './ui/MyApp.tsx',
    './MyAppWidget': './ui/widgets/MyAppWidget.tsx',  // ← widget
  },
  // ...
}),
```

### Build the widget component

Create the widget in `ui/widgets/`. It's a regular React component — it
receives the same `AppProvider` context as the full app, so all hooks work.

```tsx
// ui/widgets/MyAppWidget.tsx

import { useMemo } from 'react';
import { useAppState } from '@sero-ai/app-runtime';
import type { MyAppState } from '../../shared/types';
import { DEFAULT_STATE } from '../../shared/types';

export function MyAppWidget() {
  const [state] = useAppState<MyAppState>(DEFAULT_STATE);

  const count = state.items.length;

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <div className="flex items-center gap-2">
        <span className="text-lg font-bold tabular-nums text-[var(--text-primary)]">
          {count}
        </span>
        <span className="text-xs text-[var(--text-muted)]">items</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-auto">
        {state.items.slice(0, 5).map((item) => (
          <div
            key={item.id}
            className="truncate rounded-md bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--text-primary)]"
          >
            {item.title}
          </div>
        ))}
        {count > 5 && (
          <span className="text-[10px] text-[var(--text-muted)]">
            +{count - 5} more
          </span>
        )}
      </div>
    </div>
  );
}

export default MyAppWidget;
```

**Widget component conventions:**

- **Both named and default exports are required** (same as main app components).
- **Fill `h-full`** — the widget wrapper provides the container with header
  and resize handle. Your component fills the remaining content area.
- **Use `p-3` padding** — the content area has no built-in padding.
- **Keep it compact** — widgets are small. Use `text-xs` / `text-[10px]` for
  details, `text-lg` for headline numbers.
- **Respect overflow** — add `overflow-auto` on scrollable areas and
  `min-h-0` on flex children to prevent layout blowout.
- **Limit data shown** — show top 3–5 items with a "+N more" overflow
  indicator rather than rendering all data.

### Dynamic widgets (runtime registration)

Apps can also register widgets at runtime using the `useWidgetRegistration`
hook. This is useful for widgets that depend on runtime state or configuration.

```tsx
// In your main app component (e.g. MyApp.tsx)

import { useWidgetRegistration } from '@sero-ai/app-runtime';
import { MyAppWidget } from './widgets/MyAppWidget';

export function MyApp() {
  // Registers on mount, unregisters on unmount
  useWidgetRegistration({
    widgetId: 'summary',
    name: 'Summary',
    component: MyAppWidget,
    defaultSize: { w: 2, h: 2 },
    description: 'Quick overview of items',
  });

  // ... rest of app
}
```

For lower-level control, use `registerWidget` directly:

```typescript
import { registerWidget } from '@sero-ai/app-runtime';

const unregister = registerWidget({
  appId: 'myapp',
  widgetId: 'summary',
  name: 'Summary',
  component: MyAppWidget,
  defaultSize: { w: 2, h: 2 },
});

// Later: unregister();
```

### Widget runtime API

| Export | Description |
|--------|-------------|
| `useWidgetRegistration(opts)` | Hook — registers a widget on mount, unregisters on unmount. |
| `registerWidget(widget)` | Imperative — returns an `unregister()` function. |
| `getRuntimeWidgets()` | Returns all runtime-registered widgets. |
| `onWidgetRegistryChange(fn)` | Subscribe to registration changes. Returns unsubscribe function. |

### Dashboard grid sizing

The dashboard uses a **6-column grid** with **120px row height** and **16px
margins**. When choosing `defaultSize`:

| Size | Columns × Rows | Approx pixel size |
|------|----------------|-------------------|
| Small | 1×1 | ~160×120 |
| Standard | 2×2 | ~340×256 |
| Wide | 3×2 | ~520×256 |
| Large | 4×3 | ~700×392 |

Widget positions and sizes are persisted to `~/.sero-ui/layout.json` and
restored on restart.

### Example widgets

The following apps ship with built-in widgets you can use as reference:

| App | Widget | File | What it shows |
|-----|--------|------|---------------|
| Kanban | Board Overview | `sero-kanban-plugin/ui/widgets/KanbanWidget.tsx` | Animated column bars, priority dots, status glow, distribution bar |
| Cron | Scheduler | `sero-cron-plugin/ui/widgets/CronWidget.tsx` | Status light, job list, active reminders, run history sparkline |
| Notes | Pinboard | `pi-notes-extension/ui/widgets/NotesWidget.tsx` | Pastel sticky-note cards, pin indicators, body previews |
| ImageGen | Gallery | `pi-imagegen-extension/ui/widgets/ImageGenWidget.tsx` | Gradient image counter, recent generation grid, prompt hover overlays |

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
| `widgets` | ❌ | Array of widget definitions for the dashboard. Each entry declares a component, display name, and grid size constraints. See [Dashboard Widgets](#dashboard-widgets). |

### Plugin Metadata (`sero.plugin`)

If your app will be distributed as an installable plugin, add a `sero.plugin`
key alongside `sero.app`. This marks the package as extractable from the
monorepo and provides metadata for the plugin browser.

```json
{
  "sero": {
    "app": { /* ... */ },
    "plugin": {
      "category": "productivity",
      "tags": ["todo", "tasks"],
      "minSeroVersion": "0.1.0",
      "preBuilt": true
    }
  }
}
```

See [Plugin Guide](../docs/plugins-guide.md) for full details on creating,
building, and publishing plugins.

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

### Tool registration

**All app tools go through the `sero-cli` bridge.** Never add app tools as
`customTools` in `createAgentSession()` — always use `pi.registerTool()` in
your extension.

For plugin packages with `sero.plugin`, tool bridging is now **manifest-driven**:

- omit `sero.plugin.bridgeTools` or set it to `true` to bridge all tools
- set it to `false` to keep all plugin tools standalone in Sero
- set it to `string[]` to bridge only selected tool names

Sero resolves bridged tools and bridged extension commands against the
**current session's loaded extension instance**, so session-local plugin state
and command behavior stay correct across workspaces and sessions.

If a bridged tool needs to perform current-session side effects (for example
queueing follow-up messages), make that dependency explicit in the execution
context instead of relying on a registration-time captured `pi` object.

### Naming

- **Built-in plugin:** `plugins/sero-<name>-plugin/` (auto-discovered,
  not installed/uninstalled)
- **External distribution package:** publishable bundle/source derived from
  your plugin (see [plugins-guide.md](plugins-guide.md))
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
- `@sero-ai/app-runtime` is NOT shared via MF (its `loadShare` wrapper breaks
  named exports). Instead it resolves via `node_modules` and uses a
  `globalThis` singleton for the React context. Add it to
  `optimizeDeps.exclude` so Vite doesn't pre-bundle it.
- Do NOT alias `@sero-ai/app-runtime` in any vite config — aliases conflict
  with both MF sharing and the `globalThis` singleton pattern.
- Each remote runs its own Vite dev server on a unique port declared via
  `devPort` in `package.json`.
- **The root component MUST have a default export.** The federation registry
  loads modules via `loadRemote<{ default: React.ComponentType }>()` and
  wraps them in `React.lazy()`. A named export alone will cause a runtime
  error (`lazy: Expected the result of a dynamic import() call`). Always
  add `export default MyApp` at the bottom of the component file.
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

To get HMR for a plugin's UI, start `dev.sh` with `SERO_DEV_PLUGINS`
set to that plugin's ID(s).

This starts:
1. The Vite dev servers for the plugins listed in `SERO_DEV_PLUGINS`
2. The host Vite dev server (port 5173)
3. Electron

### Live reload for remote apps

The host includes a `watchRemotes` Vite plugin that monitors the `ui/`
directories for plugins running in dev mode. When you edit a remote app's UI
code:

1. The remote's Vite dev server detects the change and rebuilds (~50ms)
2. The host's watcher detects the same file change (300ms debounce)
3. The host sends `full-reload` via Vite's WebSocket
4. The Electron renderer reloads with the updated code

This gives **near-instant feedback** (~300–500ms) when editing app UI code
for plugins that are running in dev mode. No manual restart needed.

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
Check the existing plugin manifests under `plugins/sero-*-plugin/package.json`
before picking a new port.

### Logs

| File | Contents |
|------|----------|
| `/tmp/sero-vite.log` | Host Vite + live reload events |
| `/tmp/sero-remote-<name>.log` | Remote Vite dev server |
| `/tmp/sero-electron.log` | Electron main + forwarded renderer errors |

---

## Troubleshooting

**Build fails with `Could not resolve entry module "ui/index.html"`:**
- You're missing `ui/index.html`. Every app with a web UI needs this file
  because `vite.config.ts` sets `root: 'ui'`. Add a minimal HTML file — see
  the [`ui/index.html`](#uiindexhtml) template above.

**App doesn't appear in sidebar:**
- Check that `sero.app.id` and `sero.app.name` are set in `package.json`.
- Verify the package directory is under `plugins/` and matches
  `sero-<name>-plugin/`.
- Check that `pnpm install` was run after creating the package.
- Check the electron log for `[app-discovery]` messages.

**Agent doesn't have the tool:**
- For a **new built-in monorepo plugin**, restart the desktop dev server after
  adding the package so startup discovery and Vite remotes pick it up.
- For an **installed/external plugin**, a manual restart should not be needed:
  changes to the active profile's `settings.json` are watched and active
  session resources reload automatically.
- Verify the package's `pi.extensions` field points to the correct file.
- Run `sero help <tool-name>` to confirm the CLI bridge sees the tool.

**UI changes don't appear after editing:**
- Check that the remote Vite dev server is running (look for its log file).
- The host's `watchRemotes` plugin triggers reload on file saves to
  `plugins/sero-*/ui/`. Check `/tmp/sero-vite.log` for
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

**`lazy: Expected the result of a dynamic import() call`:**
- Your root component file is missing `export default MyApp` at the bottom.
  The host loads federated components via `React.lazy()` which requires a
  default export. Add both `export function MyApp()` (named) and
  `export default MyApp` (default) to the component file.

**Module Federation errors in console:**
- Make sure the remote dev server is running on the correct port.
- Check that `devPort` in `package.json` matches `server.port` in
  `vite.config.ts`.
- If you see `RUNTIME-004: Failed to locate remote`, the remote isn't
  registered. Verify the `devPort` is set and the remote is running.
- The `@sero-ai/app-runtime` shared module warning ("alias conflicts") is
  expected in dev mode and can be safely ignored.

---

## Reference Implementations

The **Git plugin** (`plugins/sero-git-plugin/`) is a strong reference for a
clean, focused app with a single core tool and a substantial UI:

| File | What to learn |
|------|---------------|
| `package.json` | Modern built-in plugin manifest shape (`sero.app` + `sero.plugin`) |
| `extension/index.ts` | Single-tool extension structure with cached workspace state |
| `ui/GitApp.tsx` | `useAppState`, app composition, renderer-side state derivation |
| `ui/components/CommitGraph.tsx` | Larger UI broken into focused sub-components |
| `ui/lib/graph-layout.ts` | Pure UI logic extracted from React |

The **Kanban plugin** (`plugins/sero-kanban-plugin/`) is the canonical full
reference for a rich Sero app:

| File | What to learn |
|------|---------------|
| `package.json` | Built-in plugin manifest, prompts, widgets, and dependency setup |
| `shared/types.ts` | Shared state + helper functions used by extension and UI |
| `extension/index.ts` | Entry point wiring, session lifecycle, and tool registration |
| `extension/workflow-actions.ts` | Extracting complex tool behavior into focused modules |
| `extension/session-runtime.ts` | Adapting current-session runtime capabilities for bridged execution |
| `ui/KanbanApp.tsx` | Main app shell with `useAppState`, derived board state, and composition |
| `ui/components/*` | Splitting a large app into maintainable UI modules under the 500 LOC rule |
| `ui/widgets/KanbanWidget.tsx` | Dashboard widget integration |

The **Web Access plugin** (`plugins/sero-web-plugin/`) demonstrates converting
an existing Pi extension into a self-contained Sero plugin:

| File | What to learn |
|------|---------------|
| `extension/index.ts` | Entry point with session handlers, state sync, and delegated tool modules |
| `extension/commands.ts` | Slash commands that route users toward tool-driven workflows |
| `extension/tools-search.ts` | Extracted tool registration as a standalone module |
| `extension/tools-fetch.ts` | Rich output, progress updates, and persisted fetch history |
| `extension/state-sync.ts` | Atomic state file writes and session-entry conversion |
| `ui/WebApp.tsx` | Web UI replacing TUI widgets (search history, provider status) |
| `ui/components/*` | Real-world use of `@sero-ai/ui` primitives inside a remote app |
| `ui/widgets/WebWidget.tsx` | Dashboard widget showing recent activity |

The **Cron plugin** (`plugins/sero-cron-plugin/`) is a good reference for
background jobs and command-oriented plugins:

| File | What to learn |
|------|---------------|
| `extension/index.ts` | Long-lived service initialization with session lifecycle hooks |
| `extension/state-io.ts` | Isolated persistence helpers |
| `extension/notifier.ts` | Separating delivery/integration code from core logic |

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
- [Plugin Guide](../docs/plugins-guide.md) — how to turn a Sero app into a
  distributable plugin (npm/git/local install, `sero.plugin` manifest,
  `sero-agent-plugin` GitHub topic for discovery)
- [Plugin Technical Reference](../docs/plugins-technical.md) — plugin system
  internals: manager, IPC, federation, tool bridging, security
