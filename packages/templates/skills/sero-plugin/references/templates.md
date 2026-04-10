# File Templates

Complete file templates for every file in a Sero plugin. Replace `myapp`/`MyApp`
with your actual plugin name throughout.

If the plugin is **extension-only** (no federated web UI), keep `package.json`,
`shared/`, and `extension/`, and omit `vite.config.ts`, `ui/`, and the
`sero.app.ui` / `component` / `devPort` fields. Also replace the Vite-based
`scripts` with extension-only ones (for example, `typecheck` should point only
at `extension/tsconfig.json`).

## Table of Contents

- [package.json](#packagejson)
- [shared/types.ts](#sharedtypests)
- [extension/index.ts](#extensionindexts)
- [extension/tsconfig.json](#extensiontsconfigjson)
- [vite.config.ts](#viteconfigts)
- [ui/MyApp.tsx](#uimyapptsx)
- [ui/styles.css](#uistylescss)
- [ui/tsconfig.json](#uitsconfigjson)
- [ui/index.html](#uiindexhtml)

---

## package.json

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

**Key notes:**
- `keywords: ["pi-package"]` keeps Pi CLI compatibility
- Pi SDK packages in `peerDependencies` (runtime provides them)
- `@sero-ai/app-runtime` in `devDependencies` (shared via MF singleton)
- `@sero-ai/ui` in `devDependencies` (bundled at build time)
- Use `@sero/common` for renderer-safe contracts shared across multiple plugins or desktop packages; keep app-local types in `shared/`
- `stateFile` remains required even for global apps — Sero ignores it there, but Pi CLI uses it as a fallback path
- `ui`, `component`, and `devPort` are only needed when the plugin ships a web UI
- For extension-only plugins, remove the Vite `dev` / `build` scripts and keep an extension-only `typecheck`
- `devPort` must be unique — check existing plugins first
- Omit `bridgeTools` in `sero.plugin` to bridge all tools by default

---

## shared/types.ts

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

**Rules:**
- JSON-serialisable only (no Date, Map, Set, functions)
- Always provide `DEFAULT_STATE`
- Keep shape flat-ish
- Include auto-incrementing ID for lists
- If a type/helper stops being app-local, move that neutral contract into `@sero/common`

---

## extension/index.ts

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

// -- State file path --

const STATE_REL_PATH = path.join('.sero', 'apps', 'myapp', 'state.json');

function resolveStatePath(cwd: string): string {
  return path.join(cwd, STATE_REL_PATH);
}

// -- File I/O --

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

  // Atomic write: temp file -> rename (prevents corrupt partial reads)
  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

// -- Tool parameters --

const Params = Type.Object({
  action: StringEnum(['list', 'add', 'remove'] as const),
  title: Type.Optional(Type.String({ description: 'Item title (for add)' })),
  id: Type.Optional(Type.Number({ description: 'Item ID (for remove)' })),
});

// -- Extension entry point --

export default function (pi: ExtensionAPI) {
  let statePath = '';

  // Resolve state path from workspace cwd
  pi.on('session_start', async (_event, ctx) => {
    statePath = resolveStatePath(ctx.cwd);
  });
  pi.on('session_switch', async (_event, ctx) => {
    statePath = resolveStatePath(ctx.cwd);
  });

  // -- Register a tool (callable by the LLM) --

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

    // Optional: custom TUI rendering (Pi CLI only)
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
          : theme.fg('success', '+ ') + theme.fg('muted', msg),
        0, 0,
      );
    },
  });

  // -- Register a command (user-callable) --

  pi.registerCommand('myapp', {
    description: 'Show all items',
    handler: async (_args, _ctx) => {
      pi.sendUserMessage('List all items using the myapp tool.');
    },
  });
}
```

**Key patterns:**
- Use `StringEnum` (not `Type.Union`) for action enums — Google's API needs it
- Resolve `statePath` from `ctx.cwd` in execute handler (reliable) with session fallback
- Atomic writes always (temp -> rename)
- Handle both `session_start` and `session_switch`
- If a bridged tool needs current-session side effects, depend on the execution context instead of capturing a registration-scoped `pi` object inside tool logic

**Profile-aware config/cache paths:**
- App-specific config/caches outside the workspace state file should resolve from `process.env.SERO_HOME`
- Pi SDK / agent resources (`settings.json`, `auth.json`, `skills/`, `extensions/`) should resolve from `process.env.PI_CODING_AGENT_DIR`
- Only fall back to `~/.pi` when those env vars are unset (Pi CLI mode)

**Global app state path example:**

```typescript
function resolveStatePath(cwd: string): string {
  const seroHome = process.env.SERO_HOME;
  if (seroHome) {
    return path.join(seroHome, 'apps', 'myapp', 'state.json');
  }
  return path.join(cwd, STATE_REL_PATH);
}
```

---

## extension/tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "lib": ["ES2023"]
  },
  "include": ["./**/*", "../shared/**/*"]
}
```

---

## vite.config.ts

Lives at **package root** (not inside `ui/`).

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
        // NOTE: @sero-ai/app-runtime is NOT shared here
      },
    }),
  ],
  server: {
    port: 5175,                        // Must match devPort in package.json
    strictPort: true,
    origin: 'http://localhost:5175',
  },
  optimizeDeps: {
    exclude: ['@sero-ai/app-runtime'],
    include: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  },
  build: {
    target: 'esnext',
    outDir: '../dist/ui',              // Relative to root (ui/) -> dist/ui/
    emptyOutDir: true,
  },
});
```

**Key points:**
- `root: 'ui'` — Vite HTML entry is in `ui/`
- `exposes` paths relative to **config file** (package root), not `root`
- `outDir: '../dist/ui'` relative to `root`
- `server.port` MUST match `devPort` in package.json
- Do NOT alias `@sero-ai/app-runtime`
- Do NOT add `@sero-ai/ui` to `optimizeDeps.exclude`

---

## ui/MyApp.tsx

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

  const askAgent = () => {
    prompt('List all my items using the myapp tool.');
  };

  return (
    <div className="flex h-full flex-col bg-background p-4">
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-foreground">My App</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {state.items.length} items
        </p>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); addItem(); }}
        className="mb-4 flex gap-2"
      >
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add an item..."
          className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Button size="sm" disabled={!newTitle.trim()}>
          Add
        </Button>
      </form>

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

**Critical:**
- Both `export function MyApp()` AND `export default MyApp` are required
- Import components from `@sero-ai/ui/components/ui/*`
- Use Tailwind semantic colors (`bg-background`, `text-foreground`, etc.)
- Use `@sero-ai/ui` components (Button, Card) over raw HTML elements

---

## ui/styles.css

```css
@import "tailwindcss";

/* REQUIRED: Scan @sero-ai/ui component sources so Tailwind generates CSS
   for utility classes used inside shared components (Button, Card, etc.). */
@source "../../ui/src/components";

@custom-variant dark (&:is(.dark *));

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

**Why needed:**
- `@source` — Tailwind 4 doesn't auto-scan monorepo packages; without it, component
  utility classes won't be generated
- `@theme inline` — generates semantic Tailwind classes (`bg-background`, etc.) from
  host CSS variables at runtime

---

## ui/tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "baseUrl": ".",
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

Notes:
- `baseUrl: "."` makes the `paths` mappings explicit and reliable in standalone plugin TS configs.
- These mappings are for plugin-local source only. Desktop host code uses its own aliases (`@`, `@electron`, `@plugins`, `@packages`) and those should not be copied into plugin `ui/tsconfig.json` unless the plugin truly depends on host source files.

---

## ui/index.html

Required because `vite.config.ts` sets `root: 'ui'`.

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>Sero MyApp (remote)</title></head>
<body><div id="root"></div></body>
</html>
```
