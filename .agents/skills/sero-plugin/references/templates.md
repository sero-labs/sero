# File Templates

Complete file templates for every file in a Sero plugin. Replace `myapp`/`MyApp`
with your actual plugin name throughout.

If the plugin is **extension-only** (no federated web UI), keep `package.json`,
`shared/`, and `extension/`, and omit `vite.config.ts`, `ui/`, and the
`sero.app.ui` / `component` / `devPort` fields. Also replace the Vite-based
`scripts` with extension-only ones (for example, `typecheck` should point only
at `extension/tsconfig.json`).

If the plugin needs a **background runtime**, add `runtime/`, declare
`sero.app.runtime`, and include `runtime/tsconfig.json` in the package
`typecheck` script.

If the plugin ships **prompt templates** or **skills**, add `prompts/` and/or
`skills/` directories and declare them in `pi.prompts` / `pi.skills` inside
`package.json`. The folders are not auto-loaded just because they exist.

## Table of Contents

- [package.json](#packagejson)
- [shared/types.ts](#sharedtypests)
- [extension/index.ts](#extensionindexts)
- [extension/tsconfig.json](#extensiontsconfigjson)
- [runtime/index.ts](#runtimeindexts)
- [runtime/tsconfig.json](#runtimetsconfigjson)
- [vite.config.ts](#viteconfigts)
- [ui/MyApp.tsx](#uimyapptsx)
- [ui/styles.css](#uistylescss)
- [ui/tsconfig.json](#uitsconfigjson)
- [ui/vite-env.d.ts](#uivite-envdts)
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
    "extensions": ["./extension/index.ts"],
    "prompts": ["./prompts/myapp.md"],
    "skills": ["./skills"]
  },
  "sero": {
    "app": {
      "id": "myapp",
      "name": "My App",
      "icon": "box",
      "stateFile": ".sero/apps/myapp/state.json",
      "ui": "./dist/ui/remoteEntry.js",
      "component": "MyApp",
      "contributes": {
        "components": [
          {
            "id": "summary",
            "extensionPoint": "ui.dashboard.widget",
            "component": "MyAppWidget",
            "name": "Summary",
            "defaultSize": { "w": 2, "h": 2 }
          }
        ]
      },
      "devPort": 5175
    },
    "plugin": {
      "category": "productivity",
      "tags": ["myapp", "example"],
      "minSeroVersion": "0.1.0",
      "runtimeAbi": 3
    }
  },
  "dependencies": {
    "@sero-ai/extension-runtime": "^0.2.4",
    "typebox": "catalog:"
  },
  "peerDependencies": {
    "@earendil-works/pi-ai": "catalog:peer",
    "@earendil-works/pi-coding-agent": "catalog:peer",
    "@earendil-works/pi-tui": "catalog:peer",
    "zod": "catalog:peer"
  },
  "devDependencies": {
    "@sero-ai/app-runtime": "workspace:@sero-ai/app-runtime@*",
    "@sero-ai/common": "workspace:*",
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
- Pi SDK packages in `peerDependencies` (runtime provides them); the current
  peer minimum is `>=0.83.0`, with exact `0.83.0` development packages
- `@sero-ai/app-runtime` in `devDependencies` (shared via MF singleton)
- `@sero-ai/ui` in `devDependencies` (bundled at build time)
- Use `@sero-ai/common` for renderer-safe contracts shared across multiple plugins or desktop packages; keep app-local types in `shared/`
- Treat monorepo `packages/*` folders as shared package sources consumed by external plugins via published package names — do NOT point an external plugin at `../../packages/*` source paths, and do NOT move plugin-specific domain models into `packages/*`
- `stateFile` remains required even for global apps — Sero ignores it there, but Pi CLI uses it as a fallback path
- `ui`, `component`, and `devPort` are only needed when the plugin ships a web UI
- `component` is the main app surface. Put extra components and standard host
  controls under `contributes.components` and `contributes.controls`. Use only
  host-defined extension points. Never generate a legacy contribution field
  for a new plugin.
- `runtime` is only needed when the plugin ships a background runtime; if present, add `runtime/tsconfig.json` to the package `typecheck` script
- `pi.prompts` and `pi.skills` are optional, but when a plugin ships prompt templates or skills they must be declared there — folders alone are not discovered
- For extension-only plugins, remove the Vite `dev` / `build` scripts and keep an extension-only `typecheck`
- For built-in release packaging, `sero.plugin.bundleExtensions: true` ships compiled JS `pi.extensions` instead of raw source. Extension dependencies are bundled and pruned from `dist/plugin/package.json` unless listed in `sero.plugin.extensionExternals`.

### Contribution templates

Use only host-defined extension points. Component contributions name a Module
Federation export. Control contributions contain host-rendered control data and
an app-local tool action.

```json
"contributes": {
  "components": [
    {
      "id": "explorer-view",
      "extensionPoint": "ui.explorer.view",
      "component": "MyExplorerView",
      "label": "My view",
      "icon": "box"
    }
  ],
  "controls": [
    {
      "id": "workspace-setup",
      "extensionPoint": "workspace.create.option",
      "control": {
        "type": "switch",
        "label": "Set up My App",
        "defaultValue": false
      },
      "action": {
        "type": "tool",
        "tool": "myapp_setup",
        "params": { "mode": "default" }
      }
    }
  ]
}
```

Supported component points are `ui.global-search.panel`, `ui.explorer.view`,
`ui.titlebar.control`, and `ui.dashboard.widget`. The supported control point
is `workspace.create.option`.
- `devPort` must be unique — check existing plugins first
- Omit `bridgeTools` in `sero.plugin` to bridge all tools by default
- Add `requiredHostCapabilities` only for seams the plugin actually needs:
  - `appAgent.invokeTool` for `useAppTools()` / `window.sero.appAgent.invokeTool(...)`
  - `tool.cli` for manifest-driven CLI bridging, custom tool `cli` metadata, or builtin override behavior
  - `appRuntime.background` for plugin-owned background runtimes declared through `sero.app.runtime`

### Quick do / don't guide

| Situation | Do | Don't |
|-----------|----|-------|
| UI button needs to sign in, refresh, sync, or fetch data | Register a normal plugin tool and call it with `useAppTools().run(...)` | Ask the host for a custom API like `window.sero.myPlugin.signIn()` |
| Plugin tool should also work as `sero mytool ...` | Use `sero.plugin.bridgeTools` | Add special host-side command wiring for that plugin |
| Plugin CLI needs custom subcommands/help/raw args | Put that logic on the tool's `cli` field | Build a second parallel CLI implementation in the host |
| Plugin needs a slash shortcut with the same visible name as a bridged tool | Add a prompt template in `prompts/` and declare it in `pi.prompts` | `pi.registerCommand('same-name-as-bridged-tool')` and shadow the bridged CLI/tool entry |
| Plugin ships prompt templates or skills | Declare them in `pi.prompts` / `pi.skills` | Assume `prompts/` or `skills/` folders auto-load by convention |
| Plugin CLI subcommands mirror structured tool actions | Keep names aligned or support explicit aliases, and error on unknown subcommands | Silently fall back to another action when a subcommand is misspelled or mixed-style |
| Plugin needs host support for direct UI->tool calls | Declare `requiredHostCapabilities: ["appAgent.invokeTool"]` | Assume every host supports it without declaring it |
| Plugin needs bridged CLI behavior | Declare `requiredHostCapabilities: ["tool.cli"]` | Rely on unstated host behavior |
| Extension imports a native, huge, or runtime-loaded dependency | Put the package name in `sero.plugin.extensionExternals` when using bundled release packaging | Let esbuild inline something that must remain in `node_modules` |
| Extracting a built-in plugin to external | Move plugin-specific logic into the plugin | Leave plugin-specific preload/IPC/types in the Sero host |
| External plugin needs a plugin-specific state model or validator | Keep it in the plugin's own `shared/` layer (or a plugin-owned package) | Promote it into Sero monorepo `packages/*` just because multiple plugin files use it |

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

#### Example 2b: Plugin exposes `/myapp` as a slash shortcut without shadowing `sero myapp`

Use this when you want a same-name slash shortcut for a bridged tool.
Prefer a prompt template over `pi.registerCommand('myapp')` so the bridged CLI/tool entry keeps working.

```json
{
  "pi": {
    "extensions": ["./extension/index.ts"],
    "prompts": ["./prompts/myapp.md"]
  },
  "sero": {
    "plugin": {
      "bridgeTools": ["myapp"]
    }
  }
}
```

```md
---
description: Route this request through the myapp tool
---
Use the `myapp` tool for this request: $@
```

Result: `/myapp ...` appears in the slash menu while `sero myapp ...` still resolves to the real bridged tool.

### Optional background runtime additions

Add these only when the plugin needs long-lived, workspace-scoped orchestration:

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

Notes:
- `sero.app.runtime` points at the source runtime entry in a source plugin repo
- If the runtime imports native or otherwise non-bundle-safe packages, add `sero.app.runtimeExternals` so the TS runtime loader leaves them external
- `sero.app.runtimeExternals` is for background runtime imports; use `sero.plugin.extensionExternals` for Pi extension imports
- If the plugin also uses UI->tool calls or CLI bridging, include those capabilities too
- Keep background-runtime behavior in `runtime/`, not in the host or renderer glue

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
- If a type/helper stops being app-local, move that neutral contract into `@sero-ai/common`

---

## extension/index.ts

```typescript
// extension/index.ts

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { withStateLock } from '@sero-ai/extension-runtime';
import { StringEnum } from '@earendil-works/pi-ai';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Text } from '@earendil-works/pi-tui';
import { Type } from 'typebox';

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

// Locked read-modify-write. The Sero host writes this file for the UI under
// the same `<stateFile>.lock` mutex, so a tool call cannot interleave with a
// panel edit and revert it. Never write the state file without this.
async function updateState(
  filePath: string,
  updater: (state: MyAppState) => MyAppState,
): Promise<MyAppState> {
  return withStateLock(filePath, async () => {
    const next = updater(await readState(filePath));
    await writeState(filePath, next);
    return next;
  });
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

  // Warm fallback state path from the current workspace cwd
  pi.on('session_start', async (_event, ctx) => {
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
          const title = params.title;
          let item!: MyItem;
          await updateState(statePath, (current) => {
            item = { id: current.nextId, title, createdAt: new Date().toISOString() };
            current.items.push(item);
            current.nextId++;
            return current;
          });
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
          await updateState(statePath, (current) => ({
            ...current,
            items: current.items.filter((i) => i.id !== params.id),
          }));
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
  // Keep the command name distinct from the bridged tool name (`myapp`).
  // If you want `/myapp`, use a prompt template declared in `pi.prompts`
  // instead of `pi.registerCommand('myapp')`.

  pi.registerCommand('list-myapp', {
    description: 'Ask the agent to list all items',
    handler: async (_args, _ctx) => {
      pi.sendUserMessage('List all items using the myapp tool.');
    },
  });
}
```

**Key patterns:**
- Use `StringEnum` (not `Type.Union`) for action enums — Google's API needs it
- Resolve `statePath` from `ctx.cwd` in execute handlers (reliable) with session fallback
- Atomic writes always (temp -> rename)
- `session_start` is useful for warm fallback state resolution; do not depend on `session_switch` unless your target SDK surface explicitly guarantees it
- Keep `pi.registerCommand(...)` names distinct from bridged tool names unless you intentionally want to replace/shadow that CLI entry point
- If you want a same-name slash shortcut for a bridged tool, prefer a prompt template declared in `pi.prompts`
- If a bridged tool needs current-session side effects, depend on the execution context instead of capturing a registration-scoped `pi` object inside tool logic

**Optional: custom bridged CLI metadata**

When a plugin tool should expose a richer `sero <command> ...` surface, keep that CLI behavior on the tool definition itself:

```typescript
pi.registerTool({
  name: 'myapp',
  // ...normal tool fields...
  cli: {
    summary: 'Manage My App data',
    help: 'sero myapp <subcommand> [options]',
    group: 'Apps',
    async execute(args, context, onUpdate) {
      return {
        output: `Handled args: ${args.join(' ')}`,
        exitCode: 0,
      };
    },
  },
});
```

Notes:
- Keep `sero.plugin.bridgeTools` aligned with the tool names you want Sero to bridge
- Keep CLI subcommands self-explanatory and consistent with structured tool actions; support aliases when mixed naming is unavoidable
- Unknown CLI subcommands should return an explicit error, not silently fall back to another action
- Declare `requiredHostCapabilities: ["tool.cli"]` when depending on custom tool `cli` behavior
- Use `overrideBuiltin: true` only when the plugin intentionally replaces an existing builtin command
- Custom CLI help/summary/execute behavior is refreshed from the live session tool definition on reload/reinstall

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

## runtime/index.ts

Use this only when the plugin needs long-lived, workspace-scoped Sero behavior.

```typescript
// runtime/index.ts

import type {
  AppRuntime,
  AppRuntimeContext,
  AppRuntimeModule,
} from '@sero-ai/common';
import type { MyAppState } from '../shared/types';

class MyAppRuntime implements AppRuntime {
  constructor(private readonly ctx: AppRuntimeContext) {}

  async start(): Promise<void> {
    const state = await this.ctx.host.appState.read<MyAppState>(this.ctx.stateFilePath);
    if (state) {
      await this.handleStateChange(state);
    }
  }

  async handleStateChange(state: unknown): Promise<void> {
    const current = state as MyAppState | null;
    if (!current) return;

    // Runtime-only orchestration goes here:
    // - startup recovery
    // - background reconcile passes
    // - subagent workflows
    // - managed dev server / verification / git coordination
  }

  async dispose(): Promise<void> {
    // Clean up background listeners if you create any.
  }
}

export function createAppRuntime(ctx: AppRuntimeContext): AppRuntime {
  return new MyAppRuntime(ctx);
}

export default {
  createAppRuntime,
} satisfies AppRuntimeModule;
```

**Key rules:**
- Keep `runtime/` Sero-only; Pi CLI-safe logic belongs in `extension/`
- Type against `@sero-ai/common` runtime contracts, not desktop-host internals
- Use the runtime for long-lived orchestration, not simple CRUD mutations
- If the runtime needs extra background files, use `ctx.host.appState.watch(...)` / `unwatch(...)` intentionally and clean them up in `dispose()`

---

## runtime/tsconfig.json

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
    "types": ["node"],
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
  base: process.env.NODE_ENV === 'production' ? './' : '/',
  // Keep Vite root at the package root. @module-federation/vite writes
  // physical virtual modules under node_modules; `root: 'ui'` can break
  // clean installs by generating them in ui/node_modules while Rollup looks
  // in package-root node_modules.
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
    outDir: 'dist/ui',
    emptyOutDir: true,
    rollupOptions: {
      input: 'ui/index.html',
    },
  },
});
```

**Key points:**
- `base: './'` in production is required so installed plugin remotes resolve correctly via `sero-ext://`
- Keep Vite's root at the package root; point Rollup at `ui/index.html` with `build.rollupOptions.input`
- `exposes` paths relative to **config file** (package root)
- `outDir: 'dist/ui'` relative to package root
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
          className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Button size="sm" disabled={!newTitle.trim()}>
          Add
        </Button>
      </form>

      <Card className="flex-1 gap-0 overflow-hidden py-0 shadow-none">
        {state.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-base text-muted-foreground">No items yet</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {state.items.map((item) => (
              <div
                key={item.id}
                className="group flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0 hover:bg-secondary"
              >
                <span className="flex-1 text-base text-foreground">
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
- Import `./styles.css` from every exposed Module Federation entry (app, widgets, other exposed components) so installed external remotes ship their own CSS assets
- If the UI needs to invoke extension-owned behavior, prefer `useAppTools().run(...)` over adding a plugin-specific preload/IPC bridge

**Mini example — UI button calls a plugin-owned tool**

```tsx
import { useAppTools } from '@sero-ai/app-runtime';

export function MyApp() {
  const { run } = useAppTools();

  return (
    <Button onClick={() => run('myapp_auth', { action: 'login' })}>
      Sign in
    </Button>
  );
}
```

If you do this, declare:

```json
{
  "sero": {
    "plugin": {
      "requiredHostCapabilities": ["appAgent.invokeTool"]
    }
  }
}
```

---

## ui/styles.css

```css
@import "@sero-ai/ui/styles/plugin.css";

/* REQUIRED: Scan plugin-local UI files so external remotes emit the utility
   classes they use instead of depending on host CSS by accident. */
@source "./**/*.{ts,tsx}";
```

**Why needed:**
- `@import "@sero-ai/ui/styles/plugin.css"` — imports Sero's shared Tailwind 4 theme bridge and scans shared UI components
- `@source "./**/*.{ts,tsx}"` — keeps external remotes from silently missing plugin-local utility classes at runtime

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
- Add `ui/vite-env.d.ts` (below) or an equivalent `vite/client` typing source when the UI imports CSS via side-effect imports.
- These mappings are for plugin-local source only. Desktop host code uses its own aliases (`@`, `@electron`, `@plugins`, `@packages`) and those should not be copied into plugin `ui/tsconfig.json` unless the plugin truly depends on host source files.

---

## ui/vite-env.d.ts

Add this when the UI imports CSS via side-effect imports such as `import './styles.css';`.

```ts
/// <reference types="vite/client" />
```

---

## ui/index.html

Required because `vite.config.ts` uses `build.rollupOptions.input: 'ui/index.html'`.

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>Sero MyApp (remote)</title></head>
<body><div id="root"></div></body>
</html>
```
