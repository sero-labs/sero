# Generative Dashboard Widgets

## Status

Agreed architecture and implementation strategy.

## Summary

Sero should own a versioned declarative UI language for dashboard widgets and reusable curated components.

Assistant UI should provide:

- The Pi runtime integration for conversation, streaming, tools and approvals
- The constrained generative UI renderer

Plugins should primarily contribute typed data sources, actions and optional templates rather than arbitrary widget React components.

The Sero agent should also be able to author reusable declarative components ad hoc. These components are composed from trusted shadcn-backed Sero primitives, installed into a component registry and then referenced by widgets through `$type`.

The complete target architecture is:

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
   ├─ Action Registry
   ├─ Capability Index
   └─ Schema and Migration Registry
          │
          ├───────────────┐
          ▼               ▼
Dynamic assistant-ui   Shared Widget Data Runtime
component library      and Action Runtime
          │               │
          └───────┬───────┘
                  ▼
       DashboardDefinitionRenderer
                  │
          ┌───────┴────────┐
          ▼                ▼
     Dashboard Grid   Component & Widget Studio
```

## Goals

The feature should provide:

- Consistent dashboard design across internal, external and locally-authored widgets
- Safe agent generation without arbitrary markup or executable code
- Reusable ad-hoc components that become new `$type` values
- Typed data and action contracts
- Per-instance widget configuration
- Predictable loading, empty, stale and error behaviour
- Responsive widgets that remain useful at different grid sizes
- Revision history, migrations and repair workflows
- A practical non-chat interface for browsing, testing and managing definitions
- Efficient shared subscriptions for high-frequency and real-time data

## Problem with the current widget model

The current dashboard mounts plugin-owned React components through module federation. Each widget therefore controls its own layout, spacing, typography, colours, responsiveness, empty states, accessibility, actions and data formatting.

This makes consistency dependent on every internal and external plugin author following the same conventions. It also makes safe agent-generated widgets difficult because the current unit of extension is executable React code.

The existing federated widget mechanism should remain available during migration, but declarative definitions should become the preferred path.

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
- Arbitrary callbacks or expressions

The normal authoring path should generate only:

1. Curated view trees
2. Property references
3. Data bindings
4. Configuration references
5. Bounded value and collection expressions
6. References to allowlisted actions

## Serializable schema format

assistant-ui consumes Zod schemas, but agent-authored widget and component schemas must be persisted as JSON. Zod objects should not be the durable storage format.

Sero should define a serialisable schema language as the source of truth and compile it to Zod when building the assistant-ui library.

A restricted Sero schema is preferable to exposing unrestricted JSON Schema initially.

```ts
type SeroValueSchema =
  | {
      type: "string";
      description?: string;
      required?: boolean;
      default?: string;
      minLength?: number;
      maxLength?: number;
      pattern?: string;
    }
  | {
      type: "number";
      description?: string;
      required?: boolean;
      default?: number;
      minimum?: number;
      maximum?: number;
    }
  | {
      type: "boolean";
      description?: string;
      required?: boolean;
      default?: boolean;
    }
  | {
      type: "enum";
      description?: string;
      required?: boolean;
      default?: JsonValue;
      values: JsonValue[];
    }
  | {
      type: "array";
      description?: string;
      required?: boolean;
      items: SeroValueSchema;
      minItems?: number;
      maxItems?: number;
    }
  | {
      type: "object";
      description?: string;
      required?: boolean;
      properties: Record<string, SeroValueSchema>;
      additionalProperties?: false;
    };
```

```text
Persisted SeroValueSchema
          ↓
      compileToZod()
          ↓
assistant-ui property schema
```

The same schema representation should drive:

- Runtime validation
- Assistant tool schemas
- Generated settings forms
- Documentation
- Preview fixtures
- Migration validation

Unknown properties should be rejected by default.

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

  configSchema?: SeroValueSchema;
  defaultConfig?: Record<string, JsonValue>;

  dataSources: WidgetDataBinding[];
  actions?: WidgetActionBinding[];
  componentDependencies?: ComponentDependency[];

  capabilitySnapshot?: string;
  view: GenerativeUINode;
}
```

```ts
interface GenerativeUINode {
  $type: string;
  children?: GenerativeChild | GenerativeChild[];
  [property: string]: GenerativeValue;
}

type GenerativeChild = GenerativeUINode | string | ValueExpression;

type GenerativeValue =
  | JsonValue
  | ValueExpression
  | ActionReference
  | GenerativeUINode
  | GenerativeUINode[];
```

## Separate view, data, configuration and behaviour

### View

The model should choose from semantic Sero components rather than unrestricted raw markup.

Initial examples:

- `Stack`
- `Inline`
- `Grid`
- `Section`
- `Divider`
- `Text`
- `Heading`
- `Icon`
- `Metric`
- `Status`
- `Badge`
- `KeyValue`
- `ItemList`
- `ActivityList`
- `EmptyState`
- `Alert`
- `Skeleton`
- `Button`
- `IconButton`
- `DataBoundary`
- `StaleIndicator`

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

Widgets bind to live plugin or host data.

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
  title: string;
  description: string;
  schema: ZodType<T>;
  tags?: string[];
  subscribe(context: WidgetContext): WidgetSubscription<T>;
}
```

Plugin-owned data sources can use Zod directly because they are code contributions. Agent-authored schemas should use the serialisable Sero schema format.

### Configuration

A widget definition should be reusable across multiple instances. Per-instance values belong in widget configuration, not separate definitions.

```json
{
  "$type": "StockTicker",
  "symbol": {
    "$config": "symbol"
  }
}
```

```ts
interface DashboardWidgetInstance {
  instanceId: string;
  definitionId: string;
  definitionRevision: number;
  config: Record<string, JsonValue>;
}
```

Sero should automatically generate the widget settings interface from `configSchema`.

Configuration can cover values such as:

- Instrument or symbol
- Currency
- Data-source choice
- Refresh frequency
- Display variants
- List limits
- User-selected filters

Secrets must never be stored directly in widget definitions or instance configuration. They should be referenced through the host credential store.

```json
{
  "$secretRef": "market-data-api-key"
}
```

The secret value must not be shown to the model or persisted with the widget.

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
  description?: string;
  inputSchema: ZodType<TInput>;
  risk: "safe" | "confirm";
  confirmationText?: string;
  concurrency?: "allow" | "single-instance" | "single-global";
  optimistic?: boolean;
  execute(input: TInput, context: WidgetContext): Promise<WidgetActionResult>;
}

interface WidgetActionResult {
  status: "success" | "error" | "cancelled";
  message?: string;
  invalidateDataSources?: string[];
}

interface WidgetActionInvocation {
  actionId: string;
  input: JsonValue;
  instanceId: string;
  idempotencyKey: string;
}
```

The host action runtime should consistently handle:

- Pending and disabled states
- Confirmation
- Idempotency
- Success and error feedback
- Optimistic updates where explicitly supported
- Data-source invalidation
- Duplicate invocation protection

## Standard widget data lifecycle

Every data-driven widget should use a standard status envelope.

```ts
interface WidgetDataSnapshot<T> {
  status:
    | "loading"
    | "ready"
    | "refreshing"
    | "stale"
    | "empty"
    | "error"
    | "unavailable"
    | "permission-denied";

  data?: T;
  error?: WidgetDataError;
  updatedAt?: string;
  staleAt?: string;
}
```

The curated vocabulary should include standard components for:

- Initial loading
- Background refresh
- Empty data
- Stale data
- Data-source disconnection
- Permission denial
- Missing plugins or dependencies
- Recoverable errors with retry
- Partial data

A `DataBoundary` primitive should provide the default presentation while still allowing definitions to override specific states declaratively.

```json
{
  "$type": "DataBoundary",
  "source": "cron",
  "emptyTitle": "No scheduled tasks",
  "children": {
    "$type": "CronSummary"
  }
}
```

assistant-ui streaming props concern incomplete model output during generation. They do not replace this ongoing live-data lifecycle.

## Bounded value and collection expressions

Simple `$bind` and `$format` operations are insufficient for real widgets, but arbitrary JavaScript expressions would undermine safety and portability.

Sero should provide a small declarative expression language.

```ts
type ValueExpression =
  | { $bind: string }
  | { $prop: string }
  | { $config: string }
  | { $literal: JsonValue }
  | {
      $format: FormatName;
      value: ValueExpression;
      options?: Record<string, JsonValue>;
    }
  | {
      $if: {
        condition: ConditionExpression;
        then: ValueExpression;
        else: ValueExpression;
      };
    }
  | CollectionExpression;
```

The initial condition grammar should support only:

- `equals`
- `notEquals`
- `greaterThan`
- `greaterThanOrEqual`
- `lessThan`
- `lessThanOrEqual`
- `isEmpty`
- `isDefined`
- `and`
- `or`
- `not`

Collections should support bounded selection rather than arbitrary callbacks.

```json
{
  "$select": {
    "from": { "$bind": "cron.jobs" },
    "where": {
      "field": "disabled",
      "equals": false
    },
    "sortBy": "nextRunAt",
    "direction": "ascending",
    "limit": 3
  }
}
```

The first version can support:

- Field equality filters
- Basic numeric and date comparisons
- Sorting by one field
- `take` or `limit`
- Count
- Simple grouping only if required by an initial proof of concept

Do not add arbitrary map functions, script blocks or user-defined operators.

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

  propertySchema: SeroValueSchema;
  dependencies: ComponentDependency[];
  fixtures?: ComponentFixture[];
  capabilitySnapshot?: string;
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
  "propertySchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "symbol": { "type": "string", "required": true },
      "price": { "type": "number", "required": true },
      "changePercent": { "type": "number", "required": true }
    }
  },
  "dependencies": [
    { "type": "sero:Inline", "revision": 1 },
    { "type": "sero:Stack", "revision": 1 },
    { "type": "sero:Text", "revision": 1 },
    { "type": "sero:Status", "revision": 1 }
  ],
  "view": {
    "$type": "sero:Inline",
    "justify": "between",
    "children": [
      {
        "$type": "sero:Stack",
        "gap": "none",
        "children": [
          {
            "$type": "sero:Text",
            "variant": "label",
            "children": { "$prop": "symbol" }
          },
          {
            "$type": "sero:Text",
            "variant": "strong",
            "children": {
              "$format": "currency",
              "value": { "$prop": "price" }
            }
          }
        ]
      },
      {
        "$type": "sero:Status",
        "tone": {
          "$if": {
            "condition": {
              "greaterThanOrEqual": [
                { "$prop": "changePercent" },
                { "$literal": 0 }
              ]
            },
            "then": { "$literal": "positive" },
            "else": { "$literal": "negative" }
          }
        },
        "label": {
          "$format": "percentage",
          "value": { "$prop": "changePercent" },
          "options": { "showSign": true }
        }
      }
    ]
  }
}
```

### `$prop`, `$bind` and `$config`

`$bind` resolves plugin or host data inside a widget definition.

```json
{ "$bind": "market.apple.price" }
```

`$config` resolves per-instance widget configuration.

```json
{ "$config": "symbol" }
```

`$prop` resolves a property passed into a reusable component.

```json
{ "$prop": "price" }
```

The data flow is:

```text
Plugin data ── $bind ──┐
                       ▼
Instance config ─ $config ─ Widget definition
                              │ component props
                              ▼
                       Reusable component
                              │ $prop
                              ▼
                       Trusted primitive
```

## Component definition registry

Sero should persist reusable components independently of widgets.

```ts
interface GenerativeComponentRecord {
  definition: GenerativeComponentDefinition;
  enabled: boolean;
  trust: "system" | "trusted" | "local";
  deprecated?: boolean;
  deprecationMessage?: string;
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

## Dynamic assistant-ui library integration

The implementation should include an early technical spike to prove how dynamic component installation interacts with assistant-ui.

The spike must verify:

1. Whether the `JSONGenerativeUI` library can be reconstructed safely when a component is installed, updated or disabled.
2. Whether the assistant tool schemas update immediately after registry changes.
3. Whether existing thread messages continue to render against their pinned component revisions.
4. Whether multiple revisions of the same component can render simultaneously.
5. Whether Sero should register each composite as an assistant-ui component or expose one generic composite renderer backed by the Sero registry.

The expected lifecycle is:

```text
Component registry changes
        ↓
compile serialisable schemas to Zod
        ↓
build a new assistant-ui component library and toolkit
        ↓
validate the replacement
        ↓
atomically swap the active library
```

Definitions generated against a previous capability snapshot must be revalidated before installation.

## Component authoring workflow

The agent should receive a component-authoring toolkit.

```ts
const componentToolkit = {
  search_component_types,
  get_component_schema,
  inspect_component_definition,
  propose_component_definition,
  update_component_proposal,
  install_component_definition,
  uninstall_component_definition,
  rollback_component_definition,
};
```

The workflow is:

1. The user asks Sero to create a reusable component.
2. The agent searches the available primitives and existing composites.
3. Sero returns only the relevant schemas, examples and constraints.
4. The agent calls `propose_component_definition`.
5. Sero validates the property schema, expressions and component tree.
6. Sero renders the component with preview fixtures and generated sample data.
7. The user accepts, edits or rejects the proposal.
8. `install_component_definition` persists it.
9. The component registry and assistant toolkit are rebuilt atomically.
10. The new type becomes available to future widget generation.

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

## Versioning, dependencies and migrations

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
- Deprecation without immediate removal

Pinned revisions should be the default for agent-generated widgets.

Composite dependencies must be validated for:

- Missing types
- Circular references
- Excessive nesting
- Incompatible revisions
- Disabled or untrusted dependencies

Schema-version migrations are separate from user-visible definition revisions.

```ts
interface DefinitionMigration {
  definitionKind: "widget" | "component";
  fromSchemaVersion: number;
  toSchemaVersion: number;
  migrate(value: unknown): unknown;
}
```

Sero must run migrations before loading definitions created by older releases and retain the original value until migration succeeds.

## Missing dependency and repair behaviour

Definitions should not be deleted automatically when a dependency becomes unavailable.

A widget should enter a degraded state when:

- Its plugin is uninstalled or disabled
- A data source is renamed or removed
- A data schema becomes incompatible
- An action is removed
- A component revision is missing
- Permissions are revoked
- A component pack loses trust

The widget surface should explain the issue and offer relevant actions:

```text
Widget unavailable

The data source `market.live-prices` is no longer installed.

[Repair widget] [Install dependency] [Remove widget]
```

The agent should have repair tools:

```ts
const repairToolkit = {
  inspect_broken_widget,
  suggest_widget_repair,
  rebind_widget_data_source,
  replace_component_dependency,
  migrate_widget_definition,
};
```

Repairs should produce a preview and require approval when they materially change behaviour.

## Responsive and size-aware rendering

Grid constraints alone do not make a widget responsive. The renderer should expose a semantic viewport context.

```ts
interface WidgetViewport {
  width: number;
  height: number;
  columns: number;
  rows: number;
  size: "compact" | "small" | "medium" | "large";
}
```

Definitions can choose a bounded responsive variant.

```json
{
  "$responsive": {
    "compact": {
      "$type": "local:StockTickerCompact"
    },
    "default": {
      "$type": "local:StockTickerDetailed"
    }
  }
}
```

Individual components may also expose semantic responsive variants.

```json
{
  "$type": "sero:Metric",
  "label": "Portfolio value",
  "value": 124500,
  "responsive": {
    "compact": "value-only",
    "default": "label-and-value"
  }
}
```

Authoring previews should include:

- Minimum size
- Default size
- Maximum size
- Narrow edge case
- Short edge case

A definition that is unusable at its declared minimum size should fail validation or emit a warning requiring acknowledgement.

## Shared widget data runtime

A separate subscription per widget instance would waste resources and perform poorly for real-time data.

Sero should own a shared data runtime:

```text
Plugin data source
       ↓ shared subscription
Widget Data Registry
       ↓ selectors and binding evaluation
Widget A   Widget B   Widget C
```

The runtime should provide:

- Subscription deduplication
- Reference counting
- Selector-level updates
- Update coalescing
- Throttling for high-frequency sources
- Configurable maximum update rates
- Pausing off-screen, hidden or minimised widgets where appropriate
- Last-known-value and stale-state handling
- Per-widget error isolation
- Render-time and update-rate measurement

A widget should declare its preferred update policy, but the host enforces limits.

```ts
interface WidgetUpdatePolicy {
  mode: "live" | "throttled" | "interval" | "manual";
  intervalMs?: number;
  maxUpdatesPerSecond?: number;
  pauseWhenHidden?: boolean;
}
```

This is particularly important for market-data widgets.

## Locale and formatting context

Formatting should not rely on implicit machine defaults.

```ts
interface WidgetFormatContext {
  locale: string;
  timeZone: string;
  defaultCurrency?: string;
  numberFormat?: string;
  dateFormat?: string;
}
```

Formatting expressions should support explicit options while falling back to the user or workspace context.

```json
{
  "$format": "currency",
  "value": { "$bind": "price" },
  "options": {
    "currency": "GBP"
  }
}
```

The formatting layer should cover:

- Currency
- Percentages and precision
- Dates and times
- Relative times
- Durations
- Large-number abbreviations
- Negative-number conventions

## Capability discovery

The full component, data-source and action vocabulary should not be included in every model turn.

The agent should use progressive discovery.

```ts
search_component_types({
  query: "market price display",
  category: "finance",
});

get_component_schema({
  type: "local:StockTicker",
  revision: 3,
});

search_data_sources({
  pluginId: "market-data",
  query: "live equity price",
});

get_data_source_schema({
  id: "market-data:equity-prices",
});
```

Registry entries should include:

- Name and description
- Searchable tags
- Category
- Example usage
- Input schema summary
- Trust level
- Revision
- Deprecation status
- Required permissions

The capability index should have a stable content hash.

```ts
interface CapabilitySnapshot {
  hash: string;
  createdAt: string;
  componentRegistryRevision: number;
  dataRegistryRevision: number;
  actionRegistryRevision: number;
}
```

Proposals should record the snapshot they targeted. Installation revalidates against the current registries.

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

The agent receives dashboard, component, discovery and repair tools.

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

1. Search and inspect relevant plugin data, actions and components.
2. Propose a widget definition against a capability snapshot.
3. Validate the schema, bindings, expressions and dependencies.
4. Preview it through assistant-ui.
5. Exercise its fixtures and runtime states.
6. Accept, revise or reject it.
7. Revalidate against current registries.
8. Persist the approved definition and add an instance to the grid.

Component workflow follows the same proposal, validation, preview and approval pattern.

The preview and installed result must use the same rendering path.

```tsx
<DashboardDefinitionRenderer
  definition={definition}
  context={context}
  viewport={viewport}
/>
```

## Component and Widget Studio

Chat should not be the only way to manage generated artefacts.

Sero should provide a Component and Widget Studio that allows users and plugin authors to:

- Browse and search available `$type` components
- Browse widget definitions and instances
- Inspect properties, bindings, actions and dependencies
- Preview all revisions
- Preview normal, loading, refreshing, empty, stale, error and unavailable states
- Resize previews interactively
- Test light and dark appearance
- Edit per-instance configuration
- Duplicate and modify a definition
- Ask Sero to modify the selected definition
- Compare revisions
- View dependency graphs
- See which widgets depend on a component
- Enable, disable or uninstall local components
- Roll back revisions
- Repair broken bindings and dependencies
- Export and import definitions

A minimal Studio should exist before broad agent authoring is enabled. Otherwise, generated artefacts will be difficult to inspect, organise and repair outside their original conversation.

## Fixtures, testing and diagnostics

Components and widgets should carry preview fixtures.

```ts
interface ComponentFixture {
  name: string;
  props: Record<string, JsonValue>;
  viewport?: Partial<WidgetViewport>;
  dataState?: WidgetDataSnapshot<JsonValue>;
  expectedState?: "normal" | "empty" | "loading" | "stale" | "error";
}
```

Validation and CI tooling should cover:

- Schema validation
- Binding validation
- Missing and partial data
- Loading, empty, stale and error states
- Action pending and error states
- Minimum and maximum widget sizes
- Light and dark appearance
- Keyboard interaction
- Accessibility checks
- Visual regression snapshots
- Render-time and update-rate warnings

The Studio should surface diagnostics with paths back to the relevant node, property, binding or dependency.

## Persistence model

```ts
interface DashboardWidgetInstance {
  instanceId: string;
  definitionId: string;
  definitionRevision: number;
  config: Record<string, JsonValue>;
  createdAt: string;
  updatedAt: string;
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
- Per-instance configuration
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
      definitionRevision: number;
    };
```

`WidgetMount` should dispatch to either the legacy federated renderer or the new definition renderer.

The Cron widget should be the first proof of concept.

## Validation pipeline

Every widget or component definition should pass through:

```text
JSON parsing
  ↓
schema-version migration
  ↓
top-level serialisable schema validation
  ↓
compile Sero schemas to Zod
  ↓
component property and config validation
  ↓
assistant-ui component tree validation
  ↓
$prop validation against component properties
  ↓
$config validation against widget configuration schema
  ↓
$bind validation against data-source schemas
  ↓
expression and collection validation
  ↓
$action validation against action registries
  ↓
dependency and cycle validation
  ↓
capability-snapshot revalidation
  ↓
responsive fixture validation
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
maxExpressionDepth: 8
maxConditionalBranches: 20
maxCollectionOperations: 10
```

Unknown properties should be rejected rather than silently ignored.

## Implementation strategy

### Phase 0: validate the foundations

- Choose and document the serialisable Sero schema format
- Implement `compileToZod`
- Prove dynamic assistant-ui library and toolkit reconstruction
- Decide whether composites use per-type renderers or one generic registry-backed renderer
- Define `$bind`, `$config`, `$prop`, formatting, condition and collection grammars
- Define standard data and action lifecycle envelopes
- Define semantic viewport sizes and responsive behaviour
- Define capability snapshots and progressive discovery
- Define schema migration infrastructure

### Phase 1: prove the widget contract

- Add assistant-ui Pi runtime to Sero's assistant surface
- Add `@assistant-ui/react-generative-ui`
- Define a small Sero-owned primitive vocabulary
- Define `DashboardWidgetDefinition`
- Implement static JSON definition rendering
- Add per-instance configuration and automatic settings forms
- Add standard data-state components and `DataBoundary`
- Add size-aware rendering and multi-size previews
- Recreate the Cron widget manually as a definition

### Phase 2: introduce plugin data and actions

- Add plugin data-source registration
- Build the shared widget data runtime
- Add validated `$bind` resolution
- Add update policies, throttling and shared subscriptions
- Add action registration, confirmation, idempotency and feedback
- Add locale and formatting context
- Add unavailable, permission and missing-plugin states
- Convert Cron to live plugin data
- Compare the definition-driven widget against the current React widget

### Phase 3: add reusable declarative components

- Define `GenerativeComponentDefinition`
- Add the Component Definition Registry
- Implement `$prop` resolution
- Assemble the runtime assistant-ui vocabulary dynamically
- Add bounded condition and collection expressions
- Add dependency, cycle, revision and migration validation
- Add fixtures and diagnostic infrastructure
- Manually define and install a `StockTicker` proof of concept

### Phase 4: build the management experience

- Build the initial Component and Widget Studio
- Add registry browsing and search
- Add responsive and runtime-state previews
- Add revision comparison and rollback
- Add dependency graphs
- Add import and export
- Add broken-widget repair workflows

### Phase 5: agent widget and component authoring

- Expose widget, component, data and action discovery to Pi
- Add widget and component proposal tools
- Add capability-snapshot tracking
- Render previews through assistant-ui
- Require explicit acceptance before installation
- Persist provenance and revision history
- Add agent-assisted repairs and upgrades

### Phase 6: broader plugin ecosystem

- Publish author SDKs and schemas
- Add widget and component validation tooling
- Generate vocabulary documentation from serialisable schemas
- Support plugin-provided declarative components
- Add visual regression and accessibility tooling
- Add trusted code-backed component packs only where declarative composition is insufficient

## Agreed direction

Sero owns a versioned declarative dashboard and reusable component language. Assistant UI supplies the allowlisted generative renderer and Pi interaction layer. Plugins supply typed data, actions, templates and optional declarative components.

The Sero agent may create new reusable `$type` components ad hoc, but by default those components must be declarative composites of already trusted Sero primitives.

The feature is not complete when a definition can merely render. A production-ready widget must also support configuration, responsive sizing, standard runtime states, safe actions, shared subscriptions, migration, repair and practical management outside chat.
