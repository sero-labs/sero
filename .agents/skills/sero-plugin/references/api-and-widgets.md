# App Runtime API & Widgets Reference

## Table of Contents

- [App Runtime Hooks](#app-runtime-hooks)
- [Background App Runtimes](#background-app-runtimes)
- [Dashboard Widgets](#dashboard-widgets)
- [Manifest Reference](#manifest-reference)
- [Styling Guide](#styling-guide)

---

## App Runtime Hooks

All hooks from `@sero-ai/app-runtime` must be used inside a component mounted
by `SeroAppMount` (which wraps your component in `<AppProvider>`).

### useAppState<T>(defaultState: T)

File-backed reactive state. The core hook.

```typescript
const [state, updateState] = useAppState<MyState>(DEFAULT_STATE);

// Read
state.items.length;

// Update (updater function, like React's setState)
updateState((prev) => ({
  ...prev,
  items: [...prev.items, newItem],
}));
```

How it works:
1. On mount: IPC starts `fs.watch()` + reads current contents
2. On file change: main process reads file, pushes via IPC -> React re-renders
3. On `updateState`: optimistic local update + IPC write. Writes are serialised.
   Atomic write (temp -> rename) prevents corrupt reads.

### useAppInfo()

Read-only context about the current app and workspace.

```typescript
const { appId, workspacePath } = useAppInfo();
```

### useAppTools()

Run one of the current app's own extension tools directly from the UI.
Prefer this over adding a plugin-specific preload bridge.

```typescript
import { useAppTools } from '@sero-ai/app-runtime';

const { run } = useAppTools();
const result = await run('my_tool', { action: 'refresh' });
```

Properties:
- Resolves against the current app ID + workspace automatically
- Uses the same app-scoped extension/session loader as the app agent runtime
- Returns a shared `AppToolResult` shape (`text`, `content`, `details`, `isError`)
- Requires the host capability `appAgent.invokeTool`; declare that in `sero.plugin.requiredHostCapabilities` when you depend on this hook

### useAgentPrompt()

Send a message to the active agent session from your app UI.

```typescript
const prompt = useAgentPrompt();
prompt('Do something with the myapp tool.');
```

Requires an active chat session. If no chat, the prompt is silently dropped.

### useAI()

Make ad-hoc LLM calls — no active chat session required. Each app gets a
dedicated agent session keyed by app ID + workspace.

```typescript
const ai = useAI();
const response = await ai.prompt('Generate an inspirational quote.');
```

Properties:
- Works without an active chat session
- In-memory only session (store results via `useAppState`)
- Accumulates conversation history for follow-ups
- Independent from user's chat panel

### useWidgetRegistration(options)

Register a dashboard widget at runtime. See [Dashboard Widgets](#dashboard-widgets).

```typescript
useWidgetRegistration({
  widgetId: 'summary',
  name: 'Summary',
  component: MyWidget,
  defaultSize: { w: 2, h: 2 },
});
```

---

## Background App Runtimes

Use a background runtime only when the plugin needs long-lived,
workspace-scoped Sero behavior outside the UI lifecycle.

Typical uses:
- startup recovery / reconcile passes
- runtime-owned file watching
- subagent orchestration
- git / worktree / PR coordination
- managed dev-server or verification flows

Manifest requirements:

```json
{
  "sero": {
    "app": {
      "runtime": "./runtime/index.ts",
      "runtimeExternals": ["better-sqlite3"]
    },
    "plugin": {
      "requiredHostCapabilities": ["appRuntime.background"]
    }
  }
}
```

Use `runtimeExternals` only when the runtime imports native or otherwise non-bundle-safe packages that must stay external to the transpiled runtime bundle.

Minimal runtime entry:

```ts
import type {
  AppRuntime,
  AppRuntimeContext,
  AppRuntimeModule,
} from '@sero-ai/common';

class MyAppRuntime implements AppRuntime {
  constructor(private readonly ctx: AppRuntimeContext) {}

  async start(): Promise<void> {
    const state = await this.ctx.host.appState.read(this.ctx.stateFilePath);
    if (state) {
      await this.handleStateChange(state);
    }
  }

  async handleStateChange(state: unknown): Promise<void> {
    // long-lived orchestration goes here
  }

  async dispose(): Promise<void> {}
}

export function createAppRuntime(ctx: AppRuntimeContext): AppRuntime {
  return new MyAppRuntime(ctx);
}

export default {
  createAppRuntime,
} satisfies AppRuntimeModule;
```

Runtime context:
- `ctx.appId`
- `ctx.workspaceId`
- `ctx.workspacePath`
- `ctx.stateFilePath`
- `ctx.host.{appState, subagents, workspace, verification, git, devServers}`

Boundary rules:
- keep Pi-safe tool logic in `extension/`
- keep Sero-only orchestration in `runtime/`
- type against `@sero-ai/common`, not desktop-internal aliases
- treat monorepo `packages/*` as shared package sources consumed via published package names; external plugins should not import `../../packages/*` source files directly
- keep plugin-specific domain contracts in the plugin's own `shared/` layer (or a plugin-owned package), not in Sero's monorepo `packages/*`

---

## Dashboard Widgets

Apps can provide dashboard widgets — compact views on the Dashboard landing page.
Two registration methods: static (manifest) and dynamic (runtime hook).

### Static widgets (manifest)

Declare in `sero.app.widgets` in package.json:

```json
{
  "sero": {
    "app": {
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

Widget manifest fields:

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique within the app |
| `name` | Yes | Display name in header and picker |
| `component` | Yes | Exported component name from MF remote |
| `description` | No | Shown in Add Widget picker |
| `defaultSize` | Yes | Grid size in columns x rows |
| `minSize` | No | Minimum resize constraint |
| `maxSize` | No | Maximum resize constraint |

### Expose widget via Module Federation

Add to `exposes` in vite.config.ts:

```typescript
federation({
  name: 'sero_myapp',
  exposes: {
    './MyApp': './ui/MyApp.tsx',
    './MyAppWidget': './ui/widgets/MyAppWidget.tsx',
  },
  // ...
}),
```

### Widget component template

Compose the widget from the shared **dashboard components** in `@sero-ai/ui`
rather than re-declaring layout, spacing and colours. See the
[`sero-dashboard-ui`](../../sero-dashboard-ui/SKILL.md) skill for the full
component catalogue and patterns.

```tsx
// ui/widgets/MyAppWidget.tsx

import { useAppState } from '@sero-ai/app-runtime';
import {
  EmptyState,
  Inline,
  ItemList,
  ItemListItem,
  Stack,
  Text,
  WidgetContent,
} from '@sero-ai/ui';
import { Inbox } from 'lucide-react';
import type { MyAppState } from '../../shared/types';
import { DEFAULT_STATE } from '../../shared/types';
import '../styles.css';

export function MyAppWidget() {
  const [state] = useAppState<MyAppState>(DEFAULT_STATE);
  const count = state.items.length;

  return (
    <WidgetContent>
      {/* `fill` makes the top Stack fill height so the scroll region can bound. */}
      <Stack gap="sm" fill>
        <Inline gap="xs" align="baseline">
          <Text variant="numeric" className="text-lg">{count}</Text>
          <Text variant="muted">items</Text>
        </Inline>

        {count === 0 ? (
          <EmptyState icon={Inbox} title="No items yet" />
        ) : (
          <Stack gap="none" scroll>
            <ItemList overflowCount={Math.max(0, count - 5)}>
              {state.items.slice(0, 5).map((item) => (
                <ItemListItem key={item.id} primary={item.title} />
              ))}
            </ItemList>
          </Stack>
        )}
      </Stack>
    </WidgetContent>
  );
}

export default MyAppWidget;
```

Widget conventions:
- Both named and default exports required
- Import `../styles.css` (or a shared plugin stylesheet) when the widget is exposed directly via Module Federation
- Wrap the widget in `WidgetContent` — it fills height and adds standard padding + a container-query boundary (no manual `h-full`/`p-3`)
- Prefer shared dashboard components (`Stack`, `Inline`, `Text`, `Metric`, `Status`, `ItemList`, `ActivityList`, `EmptyState`, …) over hand-rolled layout, arbitrary font sizes and hex colours
- Use `<Stack scroll>` for scrollable areas; pass `overflowCount` for "+N more"
- Keep domain state and behaviour in the plugin; the shared components are presentation only

### Dynamic widgets (runtime)

```tsx
import { useWidgetRegistration } from '@sero-ai/app-runtime';
import { MyAppWidget } from './widgets/MyAppWidget';

export function MyApp() {
  useWidgetRegistration({
    widgetId: 'summary',
    name: 'Summary',
    component: MyAppWidget,
    defaultSize: { w: 2, h: 2 },
    description: 'Quick overview of items',
  });
  // ...
}
```

Imperative API:

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

Widget runtime API:

| Export | Description |
|--------|-------------|
| `useWidgetRegistration(opts)` | Hook — registers on mount, unregisters on unmount |
| `registerWidget(widget)` | Imperative registration — returns `unregister()` |
| `getRuntimeWidgets()` | Returns all runtime-registered widgets |
| `onWidgetRegistryChange(fn)` | Subscribe to registry changes |

### Dashboard grid sizing

6-column grid, 120px row height, 16px margins.

| Size | Columns x Rows | Approx pixels |
|------|----------------|---------------|
| Small | 1x1 | ~160x120 |
| Standard | 2x2 | ~340x256 |
| Wide | 3x2 | ~520x256 |
| Large | 4x3 | ~700x392 |

---

## Manifest Reference

### sero.app fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier. Lowercase, no spaces. Used in file paths, registry, MF remote name. |
| `name` | Yes | Display name in sidebar |
| `icon` | Yes | Lucide icon name |
| `scope` | No | `"workspace"` (default) or `"global"` |
| `stateFile` | Yes | Path relative to workspace root. Convention: `.sero/apps/<id>/state.json`. For global apps, keep it in the manifest as the Pi CLI fallback even though Sero resolves state from `SERO_HOME`. |
| `ui` | No | Path to built `remoteEntry.js`. Null if no UI. |
| `runtime` | No | Path to the plugin-owned background runtime entry. Use when the plugin needs long-lived, workspace-scoped Sero behavior. |
| `runtimeExternals` | No | Packages to keep external when transpiling/bundling the background runtime. Use for native or non-bundle-safe runtime imports. |
| `component` | No | Exported component name. Required if `ui` is set. |
| `devPort` | No | Vite dev server port. Required if `ui` is set. Must be unique. |
| `styleIsolation` | For UI plugins | Set to `"scope"`. The matching Vite helper contains plugin CSS and host mounts provide scoped portal roots. |
| `widgets` | No | Array of widget definitions |

### sero.plugin fields

| Field | Description |
|-------|-------------|
| `category` | Plugin category (e.g. `"productivity"`) |
| `tags` | Array of searchable tags |
| `minSeroVersion` | Minimum compatible Sero version |
| `runtimeAbi` | Federated-UI ABI the plugin was built against. Required; must match the host (currently `2`). A plugin that omits it, or was built against a different Module Federation version, is refused with a "reinstall to update" message instead of crashing. |
| `requiredHostCapabilities` | Explicit host seams the plugin depends on, such as `appAgent.invokeTool` or `tool.cli` |
| `preBuilt` | Whether plugin ships pre-built |
| `bundleExtensions` | Build-time hint for built-in release packaging. When `true`, Sero packages compiled JS `pi.extensions` instead of raw extension source. |
| `extensionExternals` | Packages to keep external when bundling Pi extension entrypoints. Use for native, large, or runtime-loaded extension dependencies that must remain in `node_modules`. |
| `bridgeTools` | `true` (default/omit), `false`, or `string[]` of tool names |

Common capability rules:
- Declare `appAgent.invokeTool` when UI/runtime code uses `useAppTools()` or `window.sero.appAgent.invokeTool(...)`
- Declare `tool.cli` when the plugin depends on bridged CLI behavior such as `bridgeTools`, custom tool `cli` metadata, or builtin override behavior
- Declare `appRuntime.background` when the plugin declares `sero.app.runtime` and depends on the background-runtime host capability bag

### State scope

| | Workspace (default) | Global |
|---|---------------------|--------|
| Location | `<workspace>/.sero/apps/<id>/state.json` | `~/.sero-ui/apps/<id>/state.json` |
| Instances | One per workspace | One shared across all workspaces |
| Requires workspace | Yes | No |
| Use when | Project-specific data | Personal/cross-project data |

For global apps, resolve state from `SERO_HOME`:

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

## Styling Guide

### Component imports

Prefer the barrel export from the package root:

```tsx
import { Button, Card, Badge, cn } from '@sero-ai/ui';
```

Common primitives: Button, Card, Badge, Separator, ScrollArea, Checkbox.

**Dashboard components** — for compact widget and plugin-view presentation, use
the shared dashboard set (also from `@sero-ai/ui`): `WidgetContent`, `Stack`,
`Inline`, `Grid`, `Section`, `Text`, `Heading`, `Metric`, `Status`, `ItemList`,
`ActivityList`, `ProgressRing`, `DataBoundary`, `EmptyState`, `IconButton`, and
more. Discover the full set via `@sero-ai/ui/dashboard-catalog.json` or the
[`sero-dashboard-ui`](../../sero-dashboard-ui/SKILL.md) skill. Reach for these
before hand-rolling layout or picking arbitrary font sizes and colours.

### Tailwind semantic colors

| Class | Use for |
|-------|---------|
| `bg-background` | Primary background |
| `bg-card` | Card/panel backgrounds |
| `bg-secondary` | Hover/active states |
| `text-foreground` | Main text |
| `text-muted-foreground` | Hints, metadata |
| `border-border` | Standard borders |
| `text-destructive` | Error/danger text |
| `bg-primary` | Primary action backgrounds |

### Design system variables (for non-shadcn colours)

| Variable | Usage |
|----------|-------|
| `var(--bg-base)` | Primary background |
| `var(--bg-surface)` | Cards, elevated sections |
| `var(--bg-elevated)` | Active/hover states |
| `var(--text-primary)` | Main text |
| `var(--text-secondary)` | Less prominent text |
| `var(--text-muted)` | Hints, metadata |

### Customising components

Always import the shared stylesheet from every exposed Module Federation entry
(main app, widgets, or any other direct exposes) so installed external remotes
emit their own CSS assets.

```tsx
<Card className="rounded-2xl py-0 gap-0 shadow-none">
  {/* cn() + tailwind-merge handles deduplication */}
</Card>

<Button
  variant="secondary"
  className={cn('h-12 rounded-xl', isActive && 'bg-accent')}
>
  Click me
</Button>
```
