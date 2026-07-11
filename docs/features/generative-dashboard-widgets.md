# Generative Dashboard Widgets

## Status

Proposed architecture and implementation strategy.

## Summary

Sero should own a versioned, declarative dashboard widget language. Assistant UI should provide the allowlisted generative UI renderer and Pi interaction layer. Plugins should supply typed data and actions rather than arbitrary widget markup.

The target architecture is:

```text
Pi agent
   │
   │ calls propose_dashboard_widget
   ▼
Sero widget authoring tool
   │
   ├─ validates widget metadata
   ├─ validates bindings and actions
   ├─ validates assistant-ui JSON UI tree
   └─ returns preview
          │
          ▼
assistant-ui generative UI renderer
          │
     user/agent accepts
          ▼
persisted DashboardWidgetDefinition
          │
          ▼
DashboardWidgetRenderer
          │
          ├─ resolves plugin data bindings
          ├─ dispatches permitted plugin actions
          └─ renders curated Sero components
```

## Problem with the current widget model

The existing dashboard mounts plugin-owned React components through module federation. Each widget therefore controls its own:

- Layout
- Spacing
- Colours
- Typography
- Responsiveness
- Empty states
- Accessibility
- Action behaviour
- Data formatting

This makes consistency dependent on every internal and external plugin author implementing the same design conventions correctly.

The current Cron widget is representative. It owns its Tailwind classes, inline colours, status presentation, rows, relative-time formatting and empty state. This is flexible, but it makes consistent design, validation and safe agent generation difficult.

## Role of assistant-ui

Assistant UI should be used for two separate responsibilities.

### Pi runtime integration

The Pi integration should provide:

- Conversation state
- Streaming
- Tool calls
- Approvals
- Agent lifecycle
- Human-in-the-loop interactions

The `with-pi` example demonstrates the runtime and transport integration. This is separate from the durable dashboard widget format.

### Curated generative UI

`@assistant-ui/react-generative-ui` should provide the constrained renderer and schema mechanism.

It allows Sero to define a component library where every allowed component has:

- A stable component name
- A description for the model
- A Zod property schema
- A React render function

The model emits a recursive JSON tree using `$type` to select components from that allowlist.

Example:

```json
{
  "$type": "WidgetStack",
  "children": [
    {
      "$type": "StatusSummary",
      "label": "Scheduler active",
      "tone": "positive"
    },
    {
      "$type": "ItemList",
      "title": "Scheduled jobs",
      "items": {
        "$bind": "cron.enabledJobs"
      }
    }
  ]
}
```

Assistant UI should not own Sero's persisted dashboard model. Sero should define and version that contract independently.

## Architectural boundary

The model must not generate:

- JSX
- React components
- Tailwind classes
- CSS values
- Arbitrary HTML
- Executable JavaScript
- Plugin action implementations

It should only generate three constrained things:

1. A curated view tree
2. Data bindings
3. References to allowlisted actions

## Dashboard widget definition

A durable widget definition should be owned by Sero.

```ts
interface DashboardWidgetDefinition {
  schemaVersion: 1;

  id: string;
  pluginId: string;
  name: string;
  description?: string;

  size: {
    default: { w: number; h: number };
    min?: { w: number; h: number };
    max?: { w: number; h: number };
  };

  dataSources: WidgetDataBinding[];
  actions?: WidgetActionBinding[];

  view: GenerativeUINode;
}
```

The UI tree should contain only curated component nodes and serialisable values.

```ts
interface GenerativeUINode {
  $type: CuratedComponentName;
  children?: GenerativeUINode[] | string;
  [property: string]: JsonValue | BindingExpression | ActionReference;
}
```

This keeps the persisted format stable even if assistant-ui, Pi or the underlying React components change.

## Separate view, data and behaviour

### View

The model should choose from a curated vocabulary of semantic dashboard components.

Prefer semantic components such as:

- `Metric`
- `Status`
- `ItemList`
- `ActivityList`
- `EmptyState`

rather than unrestricted combinations of raw `Card`, `div`, `span` and CSS classes.

Internally, these components can use shadcn primitives and Sero design tokens.

Basic layout primitives can still be exposed, but only with tightly constrained properties.

```ts
Stack: {
  properties: z.object({
    gap: z.enum(["none", "xs", "sm", "md"]),
    align: z.enum(["start", "center", "end", "stretch"]).optional(),
  }),
}
```

Do not expose unrestricted properties such as:

```ts
className: z.string()
style: z.record(z.any())
html: z.string()
component: z.string()
```

### Data

The view definition must bind to live plugin data rather than embedding snapshots.

Example:

```json
{
  "$type": "Metric",
  "label": "Active jobs",
  "value": {
    "$bind": "cron.summary.enabledJobCount"
  }
}
```

Plugins should expose typed widget data sources.

```ts
interface PluginWidgetDataSource<T> {
  id: string;
  schema: ZodType<T>;
  subscribe(context: WidgetContext): WidgetSubscription<T>;
}
```

Example registration:

```ts
{
  id: "cron.dashboard",
  schema: CronDashboardDataSchema,
  subscribe: ...
}
```

The host resolves bindings against a validated data object. The model never writes subscription code.

Initially, binding syntax should remain deliberately small.

```ts
type BindingExpression =
  | { $bind: string }
  | { $format: "relativeTime"; value: BindingExpression }
  | { $format: "number"; value: BindingExpression }
  | { $format: "dateTime"; value: BindingExpression };
```

A general expression language should be avoided until there is a proven need for one.

### Behaviour

Actions should reference allowlisted plugin commands.

```json
{
  "$type": "Button",
  "label": "Pause scheduler",
  "action": {
    "$action": "cron.pauseScheduler"
  }
}
```

Plugins should register actions separately.

```ts
interface PluginWidgetAction<TInput> {
  id: string;
  title: string;
  inputSchema: ZodType<TInput>;
  risk: "safe" | "confirm";
  execute(input: TInput, context: WidgetContext): Promise<void>;
}
```

A generated definition may reference an action, but it must never contain the action implementation.

## Plugin contribution model

Plugins should stop contributing the complete widget view by default. Instead, a plugin should contribute typed capabilities.

```ts
interface PluginDashboardContribution {
  dataSources: PluginWidgetDataSource[];
  actions: PluginWidgetAction[];
  templates?: DashboardWidgetTemplate[];
}
```

A template is an optional pre-authored definition using exactly the same contract as an agent-generated widget.

This means the following all use one renderer and validation pipeline:

- Built-in Sero widgets
- Internal plugin widgets
- External plugin widgets
- Plugin templates
- Agent-generated widgets

External plugins should not add arbitrary React renderers to the global component library by default. Otherwise, the consistency and safety boundary is lost.

Trusted component packs may be introduced later, for example:

```ts
componentPacks: ["sero-core", "sero-charts"]
```

These should be installed and approved at the host level rather than silently supplied by individual plugins.

## Pi and assistant-ui integration

The logical runtime should be:

```text
Sero renderer process
    usePiRuntime
        │
        │ IPC or local HTTP/SSE
        ▼
Sero main process
    Pi thread supervisor
        │
        ▼
Pi agent session
```

The official Pi example uses HTTP/SSE and an in-process Node supervisor. For Electron, Sero can preserve that logical contract while adapting the transport.

Recommended approach:

- Start with local HTTP/SSE because it follows the official example closely
- Consider an Electron IPC transport later if there is a clear benefit

The agent should receive a dashboard toolkit such as:

```ts
const dashboardToolkit = {
  inspect_dashboard_capabilities,
  propose_dashboard_widget,
  update_dashboard_widget_proposal,
  install_dashboard_widget,
  remove_dashboard_widget,
};
```

`propose_dashboard_widget` should accept a complete Sero definition and return validation diagnostics and a preview reference.

```ts
{
  valid: boolean;
  definition?: DashboardWidgetDefinition;
  diagnostics: WidgetDiagnostic[];
  previewId?: string;
}
```

Assistant UI should render the proposal inside the conversation using the same curated library as the dashboard.

## Preview before persistence

The preferred workflow is:

1. The user asks Sero to create a dashboard widget.
2. The agent calls `inspect_dashboard_capabilities(pluginId)`.
3. The tool returns available data paths, actions and supported UI components.
4. The agent calls `propose_dashboard_widget`.
5. Sero validates and displays a real preview through assistant-ui.
6. The user accepts, edits through conversation or rejects it.
7. `install_dashboard_widget` persists the validated definition and adds it to the dashboard grid.

The preview and installed widget must use the same rendering component.

```tsx
<DashboardDefinitionRenderer
  definition={definition}
  context={context}
/>
```

This prevents differences between the assistant preview and the installed dashboard result.

## Persist definitions separately from instances

Dashboard placement and widget definitions should be stored separately.

```ts
interface DashboardWidgetInstance {
  instanceId: string;
  definitionId: string;
  pluginId: string;
  config?: Record<string, JsonValue>;
}

interface DashboardState {
  instances: DashboardWidgetInstance[];
  layouts: LayoutItem[];
}

interface DashboardWidgetDefinitionRecord {
  id: string;
  revision: number;
  origin: "builtin" | "plugin-template" | "agent" | "user";
  definition: DashboardWidgetDefinition;
  createdAt: string;
  updatedAt: string;
}
```

This allows:

- Multiple instances of one definition
- Revision history
- Rollback
- Template upgrades
- Agent edits without modifying layout
- Provenance and trust indicators

A widget instance should not duplicate the full generated tree unless per-instance editing is explicitly required.

## Compatibility and migration

Federated component widgets should not be removed immediately.

Support both widget renderer modes during migration.

```ts
type DashboardWidgetKind =
  | {
      kind: "component";
      component: string;
    }
  | {
      kind: "definition";
      definitionId: string;
    };
```

`WidgetMount` can then dispatch to the correct renderer.

```tsx
switch (widget.kind) {
  case "component":
    return <FederatedWidgetMount ... />;

  case "definition":
    return <DefinitionWidgetMount ... />;
}
```

This provides a safe migration path and allows the Cron widget to be used as the first proof of concept.

## Initial curated vocabulary

The first version should remain deliberately narrow.

### Layout

- `Stack`
- `Inline`
- `Grid`
- `Section`
- `Divider`

### Content

- `Text`
- `Heading`
- `Icon`
- `Badge`
- `Status`
- `Metric`
- `KeyValue`

### Collections

- `ItemList`
- `Item`
- `ActivityList`

### States

- `EmptyState`
- `Alert`
- `Skeleton`

### Actions

- `Button`
- `IconButton`

Charts, tables, tabs, forms and arbitrary conditional rendering should be deferred until the core data binding and action model is proven.

## Validation pipeline

Every definition should pass through the following validation stages:

```text
JSON parsing
  ↓
top-level widget schema
  ↓
assistant-ui component tree schema
  ↓
binding-path validation against plugin data schema
  ↓
action-reference validation against plugin action registry
  ↓
complexity and depth limits
  ↓
permission and trust checks
  ↓
render error boundary
```

Recommended hard limits:

```ts
maxTreeDepth: 8
maxNodes: 100
maxTextLength: 2_000
maxListItems: 50
```

Unknown properties should be rejected rather than silently ignored.

## Example Cron definition

The existing Cron widget could eventually be represented approximately as follows.

```json
{
  "schemaVersion": 1,
  "id": "cron-overview",
  "pluginId": "sero-cron-plugin",
  "name": "Scheduler",
  "size": {
    "default": { "w": 2, "h": 2 },
    "min": { "w": 1, "h": 1 }
  },
  "dataSources": [
    {
      "id": "cron",
      "source": "cron.dashboard"
    }
  ],
  "view": {
    "$type": "Stack",
    "gap": "sm",
    "children": [
      {
        "$type": "Inline",
        "justify": "between",
        "children": [
          {
            "$type": "Status",
            "label": {
              "$bind": "cron.schedulerLabel"
            },
            "tone": {
              "$bind": "cron.schedulerTone"
            }
          },
          {
            "$type": "Inline",
            "gap": "sm",
            "children": [
              {
                "$type": "Metric",
                "label": "jobs",
                "value": {
                  "$bind": "cron.enabledJobCount"
                },
                "appearance": "compact"
              },
              {
                "$type": "Metric",
                "label": "reminders",
                "value": {
                  "$bind": "cron.activeReminderCount"
                },
                "appearance": "compact"
              }
            ]
          }
        ]
      },
      {
        "$type": "ItemList",
        "title": "Scheduled jobs",
        "items": {
          "$bind": "cron.jobs"
        },
        "itemTemplate": "scheduled-job",
        "limit": 3
      },
      {
        "$type": "ItemList",
        "title": "Reminders",
        "items": {
          "$bind": "cron.reminders"
        },
        "itemTemplate": "reminder",
        "limit": 3
      }
    ]
  }
}
```

For the first version, repeated collections should use predefined semantic `itemTemplate` values rather than arbitrary loops and per-item expression logic.

## Implementation strategy

### Phase 1: prove the contract

- Add assistant-ui Pi runtime to Sero's assistant surface
- Add `@assistant-ui/react-generative-ui`
- Define a small Sero-owned component vocabulary
- Define `DashboardWidgetDefinition`
- Implement static JSON definition rendering
- Do not add agent generation yet
- Recreate the Cron widget manually as a definition

### Phase 2: introduce plugin data and action contracts

- Add plugin data-source registration
- Add validated binding resolution
- Add action registration and confirmation policies
- Convert Cron to live plugin data
- Compare the definition-driven widget against the current React widget

### Phase 3: agent authoring

- Expose component, data and action capabilities to Pi
- Add proposal and preview tools
- Render previews through assistant-ui
- Require explicit acceptance before installation
- Persist provenance and definition revisions

### Phase 4: broader plugin ecosystem

- Publish an author SDK and schemas
- Add a template validation CLI
- Generate component documentation from the Zod library
- Add trusted component packs only where the core vocabulary is insufficient

## Agreed direction

Sero owns a versioned declarative dashboard language. Assistant UI supplies the allowlisted generative renderer and Pi interaction layer. Plugins supply typed data and actions, not arbitrary widget markup.

This provides:

- Consistent visual design
- Safe agent-generated widgets
- A common contract for internal and external plugins
- Typed data and action boundaries
- Preview and approval before persistence
- Versioning and migration
- A gradual transition from existing federated React widgets
