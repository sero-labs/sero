# Generative Dashboard Widgets

## Status

Agreed architecture and implementation strategy.

## Summary

Sero should own a versioned declarative UI language for dashboard widgets and reusable curated components.

Assistant UI should provide:

- The Pi runtime integration for conversation, streaming, tools and approvals
- The constrained generative UI renderer

Plugins should primarily contribute typed data sources, actions and optional templates rather than arbitrary widget React components.

The Sero agent should also be able to author reusable declarative components ad hoc. These components can be composed from trusted shadcn-backed Sero primitives, installed into a component registry and then referenced by widgets through `$type`.

```text
Pi agent
   │
   ├─ authors widget definitions
   └─ authors reusable component definitions
          │
          ▼
Sero authoring and validation layer
   │
   ├─ Widget Definition Registry
   ├─ Component Definition Registry
   ├─ Data Source Registry
   └─ Action Registry
          │
          ▼
Dynamic assistant-ui component library
          │
          ▼
DashboardDefinitionRenderer
```

## Problem with the current widget model

The current dashboard mounts plugin-owned React components through module federation. Each widget therefore controls its own layout, spacing, typography, colours, responsiveness, empty states, accessibility, actions and data formatting.

This makes consistency dependent on every internal and external plugin author following the same conventions. It also makes safe agent-generated widgets difficult because the current unit of extension is executable React code.

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

The `with-pi` example demonstrates the runtime and transport integration. It should not define Sero's durable dashboard storage format.

### Curated generative UI

`@assistant-ui/react-generative-ui` should provide the constrained renderer and schema mechanism.

Sero defines an allowlisted component library. Each component has:

- A stable type name
- A model-facing description
- A Zod property schema
- A React render function

The model emits a recursive JSON tree using `$type`.

```json
{
  "$type": "Metric",
  "label": "Active jobs",
  "value": {
    "$bind": "cron.enabledJobCount"
  }
}
```

Assistant UI renders that tree, but Sero owns and versions the persisted definition.

## Architectural boundary

The model must not generate the following as part of routine widget or component authoring:

- JSX
- Arbitrary React components
- Tailwind classes
- CSS values
- Arbitrary HTML
- Executable JavaScript
- Plugin action implementations

The normal authoring path should generate only:

1. Curated view trees
2. Property references
3. Data bindings
4. References to allowlisted actions

## Dashboard widget definition

```ts
interface DashboardWidgetDefinition {
  schemaVersion: 1;

  id: string;
  pluginId?: string;
  name: string;
  description?: string;

  size: {
    default: { w: number; h: number };
    min?: { w: number; h: number };
    max?: { w: number; h: number };
  };

  dataSources: WidgetDataBinding[];
  actions?: WidgetActionBinding[];
  componentDependencies?: ComponentDependency[];

  view: GenerativeUINode;
}
```

```ts
interface GenerativeUINode {
  $type: string;
  children?: GenerativeUINode[] | string;
  [property: string]:
    | JsonValue
    | BindingExpression
    | PropertyExpression
    | ActionReference
    | GenerativeUINode
    | GenerativeUINode[];
}
```

## Separate view, data and behaviour

### View

The model should choose from semantic Sero components rather than unrestricted raw markup.

Initial examples:

- `Stack`
- `Inline`
- `Grid`
- `Section`
- `Text`
- `Heading`
- `Metric`
- `Status`
- `Badge`
- `ItemList`
- `ActivityList`
- `EmptyState`
- `Alert`
- `Button`

These components may internally use shadcn primitives and Sero design tokens.

Basic layout primitives must expose constrained properties only.

```ts
Stack: {
  properties: z.object({
    gap: z.enum(["none", "xs", "sm", "md"]),
    align: z.enum(["start", "center", "end", "stretch"]).optional(),
  }),
}
```

Do not expose unrestricted `className`, `style`, `html` or arbitrary component names.

### Data

Widgets bind to live plugin data.

```json
{
  "$type": "Metric",
  "label": "Active jobs",
  "value": {
    "$bind": "cron.summary.enabledJobCount"
  }
}
```

Plugins expose typed data sources.

```ts
interface PluginWidgetDataSource<T> {
  id: string;
  schema: ZodType<T>;
  subscribe(context: WidgetContext): WidgetSubscription<T>;
}
```

The binding language should remain deliberately small.

```ts
type BindingExpression =
  | { $bind: string }
  | { $format: "relativeTime"; value: BindingExpression | PropertyExpression }
  | { $format: "number"; value: BindingExpression | PropertyExpression }
  | { $format: "dateTime"; value: BindingExpression | PropertyExpression }
  | { $format: "currency"; value: BindingExpression | PropertyExpression }
  | { $format: "percentage"; value: BindingExpression | PropertyExpression; showSign?: boolean };
```

Avoid a general-purpose expression language until there is a demonstrated need.

### Behaviour

Actions reference allowlisted plugin or host commands.

```json
{
  "$type": "Button",
  "label": "Pause scheduler",
  "action": {
    "$action": "cron.pauseScheduler"
  }
}
```

```ts
interface PluginWidgetAction<TInput> {
  id: string;
  title: string;
  inputSchema: ZodType<TInput>;
  risk: "safe" | "confirm";
  execute(input: TInput, context: WidgetContext): Promise<void>;
}
```

## Reusable component authoring

The Sero agent should be able to create reusable curated components without creating a plugin.

For example, a user can ask:

> Create a reusable `StockTicker` component.

The agent should inspect the available primitives, propose a declarative component definition, preview it with sample data and install it after approval.

Once installed, the component becomes available through `$type`:

```json
{
  "$type": "StockTicker",
  "symbol": "AAPL",
  "price": {
    "$bind": "market.apple.price"
  },
  "changePercent": {
    "$bind": "market.apple.changePercent"
  }
}
```

### Declarative component definition

```ts
interface GenerativeComponentDefinition {
  schemaVersion: 1;

  id: string;
  typeName: string;
  name: string;
  description: string;

  origin: "builtin" | "agent" | "user" | "plugin" | "component-pack";
  revision: number;

  properties: ComponentPropertyDefinition[];
  dependencies: ComponentDependency[];
  view: GenerativeUINode;

  createdAt: string;
  updatedAt: string;
}
```

A `StockTicker` definition could be composed from existing trusted components:

```json
{
  "schemaVersion": 1,
  "id": "local-stock-ticker",
  "typeName": "StockTicker",
  "name": "Stock ticker",
  "description": "Displays a stock symbol, price and price movement",
  "properties": [
    { "name": "symbol", "type": "string", "required": true },
    { "name": "price", "type": "number", "required": true },
    { "name": "changePercent", "type": "number", "required": true }
  ],
  "dependencies": ["sero:Inline", "sero:Stack", "sero:Text", "sero:Status"],
  "view": {
    "$type": "Inline",
    "justify": "between",
    "children": [
      {
        "$type": "Stack",
        "gap": "none",
        "children": [
          {
            "$type": "Text",
            "variant": "label",
            "children": { "$prop": "symbol" }
          },
          {
            "$type": "Text",
            "variant": "strong",
            "children": {
              "$format": "currency",
              "value": { "$prop": "price" }
            }
          }
        ]
      },
      {
        "$type": "Status",
        "label": {
          "$format": "percentage",
          "value": { "$prop": "changePercent" },
          "showSign": true
        }
      }
    ]
  }
}
```

### `$prop` and `$bind`

`$bind` resolves plugin or host data inside a widget definition.

```json
{ "$bind": "market.apple.price" }
```

`$prop` resolves a property passed into a reusable component.

```json
{ "$prop": "price" }
```

The data flow is:

```text
Plugin data
   ↓ $bind
Widget definition
   ↓ component props
Reusable component
   ↓ $prop
Trusted primitive
```

```ts
type PropertyExpression = {
  $prop: string;
};
```

## Component definition registry

Sero should persist reusable components independently of widgets.

```ts
interface GenerativeComponentRecord {
  definition: GenerativeComponentDefinition;
  enabled: boolean;
  trust: "system" | "trusted" | "local";
}
```

At runtime, the available assistant-ui component library is assembled from:

```text
Built-in Sero primitives
        +
Installed declarative components
        +
Approved component packs
        =
Available $type vocabulary
```

Internal widgets, plugin widgets and agent-generated widgets all consume the same resulting vocabulary.

## Component authoring workflow

The agent should receive a component-authoring toolkit.

```ts
const componentToolkit = {
  inspect_component_primitives,
  inspect_component_definition,
  propose_component_definition,
  update_component_proposal,
  install_component_definition,
  uninstall_component_definition,
};
```

The workflow is:

1. The user asks Sero to create a reusable component.
2. The agent calls `inspect_component_primitives`.
3. Sero returns available component schemas and authoring constraints.
4. The agent calls `propose_component_definition`.
5. Sero validates the property schema and component tree.
6. Sero renders the component with generated sample data.
7. The user accepts, edits or rejects the proposal.
8. `install_component_definition` persists it.
9. The new type becomes available to future widget generation.

Component previews and installed components must use the same renderer.

## Two-tier component model

### Tier 1: declarative composites

This is the default and preferred mechanism.

- JSON-based
- Composed from existing trusted `$type` components
- Immediately installable
- Serializable and versionable
- Safe for ad-hoc agent authoring
- Automatically inherits Sero styling

Most dashboard components should use this tier.

### Tier 2: code-backed components

Some advanced components may require custom React code, canvas rendering, virtualisation or specialised interactions.

```ts
type GenerativeComponentSource =
  | {
      kind: "composite";
      definition: GenerativeComponentDefinition;
    }
  | {
      kind: "code";
      packageId: string;
      exportName: string;
    };
```

Code-backed components must be treated as trusted component packs. They require a stronger review and installation process because they are executable code.

Routine ad-hoc component authoring must not silently fall back to generated React code.

## Namespacing

Canonical type identifiers should be namespaced to prevent collisions.

Examples:

```text
sero:Metric
local:StockTicker
plugin.market-data:OrderBookSummary
```

The authoring UI may allow concise names where resolution is unambiguous:

```json
{ "$type": "StockTicker" }
```

Internally, this resolves to a canonical identifier and revision such as:

```text
local:StockTicker@3
```

Plugin-provided components should generally use explicit namespaces.

## Versioning and dependencies

Widgets should not change unpredictably when a reusable component is edited.

```ts
interface ComponentDependency {
  type: string;
  revision: number;
}
```

Definitions should support:

- Pinned revisions
- Explicit upgrades
- Optional follow-latest behaviour for compatible revisions
- Revision history
- Rollback

Pinned revisions should be the default for agent-generated widgets.

Composite dependencies must be validated for:

- Missing types
- Circular references
- Excessive nesting
- Incompatible revisions
- Disabled or untrusted dependencies

## Plugin contribution model

```ts
interface PluginDashboardContribution {
  dataSources: PluginWidgetDataSource[];
  actions: PluginWidgetAction[];
  templates?: DashboardWidgetTemplate[];
  components?: GenerativeComponentDefinition[];
}
```

Plugin-provided declarative components use the same contract as local agent-authored components.

External plugins should not add arbitrary executable renderers to the global vocabulary by default. Code-backed component packs require explicit host-level approval.

## Pi and assistant-ui integration

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

Recommended transport strategy:

- Begin with local HTTP/SSE because it follows the official example closely
- Consider Electron IPC later if it provides a concrete benefit

The agent receives both dashboard and component authoring tools.

```ts
const dashboardToolkit = {
  inspect_dashboard_capabilities,
  propose_dashboard_widget,
  update_dashboard_widget_proposal,
  install_dashboard_widget,
  remove_dashboard_widget,
};
```

## Preview before persistence

Widget workflow:

1. Inspect available plugin data, actions and components.
2. Propose a widget definition.
3. Validate it.
4. Preview it through assistant-ui.
5. Accept, revise or reject it.
6. Persist the approved definition and add an instance to the grid.

Component workflow follows the same proposal, validation, preview and approval pattern.

The preview and installed result must use the same rendering path.

```tsx
<DashboardDefinitionRenderer definition={definition} context={context} />
```

## Persistence model

```ts
interface DashboardWidgetInstance {
  instanceId: string;
  definitionId: string;
  config?: Record<string, JsonValue>;
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

Definitions, instances, component definitions and layouts should be stored separately.

This supports:

- Multiple instances of one widget definition
- Component and widget revision history
- Rollback
- Provenance
- Explicit upgrades
- Stable dashboard layout during edits

## Compatibility and migration

Federated component widgets should remain supported during migration.

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

`WidgetMount` should dispatch to either the legacy federated renderer or the new definition renderer.

The Cron widget should be the first proof of concept.

## Validation pipeline

Every widget or component definition should pass through:

```text
JSON parsing
  ↓
top-level definition schema
  ↓
component property schema validation
  ↓
assistant-ui component tree validation
  ↓
$prop validation against component properties
  ↓
$bind validation against data-source schemas
  ↓
$action validation against action registries
  ↓
dependency and cycle validation
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
maxComponentDependencies: 25
```

Unknown properties should be rejected rather than silently ignored.

## Implementation strategy

### Phase 1: prove the widget contract

- Add assistant-ui Pi runtime to Sero's assistant surface
- Add `@assistant-ui/react-generative-ui`
- Define a small Sero-owned primitive vocabulary
- Define `DashboardWidgetDefinition`
- Implement static JSON definition rendering
- Recreate the Cron widget manually as a definition

### Phase 2: introduce plugin data and actions

- Add plugin data-source registration
- Add validated `$bind` resolution
- Add action registration and confirmation policies
- Convert Cron to live plugin data
- Compare the definition-driven widget against the current React widget

### Phase 3: add reusable declarative components

- Define `GenerativeComponentDefinition`
- Add the Component Definition Registry
- Implement `$prop` resolution
- Assemble the runtime assistant-ui vocabulary dynamically
- Add dependency, cycle and revision validation
- Manually define and install a `StockTicker` proof of concept

### Phase 4: agent widget and component authoring

- Expose widget, component, data and action capabilities to Pi
- Add widget and component proposal tools
- Render previews through assistant-ui
- Require explicit acceptance before installation
- Persist provenance and revision history

### Phase 5: broader plugin ecosystem

- Publish author SDKs and schemas
- Add widget and component validation tooling
- Generate vocabulary documentation from Zod schemas
- Support plugin-provided declarative components
- Add trusted code-backed component packs only where declarative composition is insufficient

## Agreed direction

Sero owns a versioned declarative dashboard and reusable component language. Assistant UI supplies the allowlisted generative renderer and Pi interaction layer. Plugins supply typed data, actions, templates and optional declarative components.

The Sero agent may create new reusable `$type` components ad hoc, but by default those components must be declarative composites of already trusted Sero primitives.

This provides:

- Consistent visual design
- Safe agent-generated widgets
- Ad-hoc reusable component authoring
- A common contract for internal, external and local components
- Typed data and action boundaries
- Preview and approval before persistence
- Component namespacing and versioning
- A gradual migration from federated React widgets
