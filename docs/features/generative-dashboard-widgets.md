# Generative Dashboard Widgets

## Status

Agreed architecture and implementation strategy.

## Summary

Sero should own a versioned declarative UI language for dashboard widgets and reusable curated components.

Assistant UI should provide:

- The Pi runtime integration for conversation, streaming, tools and approvals
- The constrained generative UI renderer

The declarative widget system is an additional authoring model, not a replacement for the existing module federation model. Plugin authors must remain free to provide fully self-contained React widgets when they need complete ownership of rendering, state, styling and behaviour.

Sero therefore supports two first-class widget models:

1. Declarative widgets rendered by the Sero host from curated `$type` components
2. Federated component widgets implemented and owned entirely by the plugin

A plugin may use either model or expose widgets using both models. The dashboard should present them consistently to users while preserving the distinct ownership and trust boundaries of each approach.

The Sero agent should also be able to author reusable declarative components ad hoc. These components are composed from trusted shadcn-backed Sero primitives, installed into a component registry and then referenced by declarative widgets through `$type`.

The complete target architecture is:

```text
Pi agent
   │
   ├─ authors declarative widget definitions
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
                  ▼
             Dashboard Grid
                  ▲
                  │
       Federated Widget Renderer
                  ▲
                  │
       Plugin-owned React widgets

Component & Widget Studio manages declarative definitions and can also
surface metadata and diagnostics for federated widgets where available.
```

## Goals

The feature should provide:

- Consistent dashboard design for authors who choose the declarative model
- Safe agent generation without arbitrary markup or executable code
- Reusable ad-hoc components that become new `$type` values
- Typed data and action contracts
- Per-instance widget configuration
- Predictable loading, empty, stale and error behaviour
- Responsive widgets that remain useful at different grid sizes
- Revision history, migrations and repair workflows
- A practical non-chat interface for browsing, testing and managing definitions
- Efficient shared subscriptions for high-frequency and real-time data
- Continued support for fully self-contained, plugin-owned federated widgets
- Freedom for each plugin author to select the appropriate ownership model
- The ability for one plugin to offer both declarative and federated widgets

## Two first-class widget authoring models

The dashboard must treat declarative and federated widgets as complementary approaches rather than stages in a forced migration.

### Declarative widgets

Declarative widgets are best suited when the author wants:

- Consistent Sero styling and responsive behaviour
- Agent-assisted creation and editing
- A constrained and inspectable definition format
- Host-managed loading, error, stale and permission states
- Automatically generated settings forms
- Reusable curated components
- Typed host-managed data bindings and actions
- Easy versioning, previewing, validation and repair

The Sero host owns rendering and runtime orchestration. The plugin or user supplies data sources, actions, templates and definitions.

### Federated component widgets

Federated widgets are best suited when the author wants:

- Full ownership of React rendering and component structure
- Custom styling or visual behaviour outside the curated vocabulary
- Complex interactions, local state or specialist rendering
- Canvas, WebGL, advanced charts, virtualisation or unusual layout systems
- Direct use of plugin-specific libraries
- An independently developed and released UI surface
- Complete control over loading, empty, error and action experiences

The plugin owns the widget implementation. Sero owns only the dashboard shell, placement, sizing, lifecycle boundary and shared application context that it explicitly exposes.

### Selection principles

Neither model should be described as universally preferred or more legitimate.

The declarative model should be recommended for widgets that fit its capabilities because it offers stronger consistency and agent authoring. The federated model should remain fully supported for widgets where self-contained ownership is valuable or the declarative vocabulary is restrictive.

A plugin may start with either model. Moving between models is optional and should be treated as an author decision rather than a platform migration requirement.

The Add Widget interface should clearly identify the widget model, for example:

```text
Scheduler Summary       Declarative
Advanced Order Book     Plugin Component
```

Users should not need to understand the technical implementation to use either widget, but developers and administrators should be able to inspect its source, trust level and ownership model.

## Trade-offs of the current widget model

The current dashboard mounts plugin-owned React components through module federation. Each federated widget controls its own layout, spacing, typography, colours, responsiveness, empty states, accessibility, actions and data formatting.

This is valuable when the plugin author wants a fully self-contained ownership model. It also means that visual consistency, safe agent authoring and host-level validation cannot be guaranteed by Sero.

The declarative approach addresses those trade-offs without removing the flexibility of federated widgets.

The existing module federation widget mechanism is not deprecated by this feature and must not be removed as part of its implementation.

## Role of assistant-ui

Assistant UI should be used for two separate responsibilities within the declarative widget model.

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

assistant-ui is not required to render federated component widgets. Those continue to use the existing module federation and `AppProvider` mounting path.

## Architectural boundary

The restrictions in this section apply to the declarative and agent-authoring path. They do not prohibit a trusted federated plugin from implementing its own React widget.

The model must not generate the following as part of routine declarative widget or component authoring:

- JSX
- Arbitrary React components
- Tailwind classes
- CSS values
- Arbitrary HTML
- Executable JavaScript
- Plugin action implementations
- Arbitrary callbacks or expressions

The normal declarative authoring path should generate only:

1. Curated view trees
2. Property references
3. Data bindings
4. Configuration references
5. Bounded value and collection expressions
6. References to allowlisted actions

A plugin author who intentionally chooses the federated model may implement arbitrary React code within the existing plugin security and trust model. Agent-generated code-backed widgets or component packs remain a separate higher-trust workflow and must not be silently installed through declarative authoring.

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

## Declarative dashboard widget definition

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

This section defines the host-managed declarative widget model. Federated widgets may manage these responsibilities internally.

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

Declarative widgets bind to live plugin or host data.

```json
{
  "$type": "Metric",
  "label": "Active jobs",
  "value": {
    "$bind": "cron.summary.enabledJobCount"
  }
}
```

Plugins may expose typed data sources for declarative widgets even when the same plugin also contains federated widgets.

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

A federated widget may use these shared data-source APIs, its existing `AppProvider` context or its own internal data integration, subject to plugin permissions.

### Configuration

A declarative widget definition should be reusable across multiple instances. Per-instance values belong in widget configuration, not separate definitions.

```json
{
  "$type": "StockTicker",
  "symbol": {
    "$config": "symbol"
  }
}
```

```ts
interface DeclarativeDashboardWidgetInstance {
  instanceId: string;
  definitionId: string;
  definitionRevision: number;
  config: Record<string, JsonValue>;
}
```

Sero should automatically generate the declarative widget settings interface from `configSchema`.

Configuration can cover values such as:

- Instrument or symbol
- Currency
- Data-source choice
- Refresh frequency
- Display variants
- List limits
- User-selected filters

Secrets must never be stored directly in declarative widget definitions or instance configuration. They should be referenced through the host credential store.

```json
{
  "$secretRef": "market-data-api-key"
}
```

The secret value must not be shown to the model or persisted with the widget.

Federated widgets may expose their own settings UI. Sero may later define an optional common settings contract, but the declarative settings schema must not become mandatory for federated widgets.

### Behaviour

Declarative widget actions reference allowlisted plugin or host commands.

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

Federated widgets may use the host action registry or implement their own behaviour within the existing plugin permission model.

## Standard declarative widget data lifecycle

Every data-driven declarative widget should use a standard status envelope.

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

Federated widgets retain ownership of their own internal data lifecycle UI unless they voluntarily adopt shared Sero primitives or contracts.

## Bounded value and collection expressions

Simple `$bind` and `$format` operations are insufficient for real declarative widgets, but arbitrary JavaScript expressions would undermine safety and portability.

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

Once installed, the component becomes available to declarative widgets through `$type`:

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

These generated `$type` components do not restrict federated widgets. A federated widget can continue to use its own React components and may optionally consume curated Sero components where technically appropriate.

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

`$bind` resolves plugin or host data inside a declarative widget definition.

```json
{ "$bind": "market.apple.price" }
```

`$config` resolves per-instance declarative widget configuration.

```json
{ "$config": "symbol" }
```

`$prop` resolves a property passed into a reusable declarative component.

```json
{ "$prop": "price" }
```

The data flow is:

```text
Plugin data ── $bind ──┐
                       ▼
Instance config ─ $config ─ Declarative widget definition
                              │ component props
                              ▼
                       Reusable component
                              │ $prop
                              ▼
                       Trusted primitive
```

## Component definition registry

Sero should persist reusable declarative components independently of widgets.

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

Built-in declarative widgets, plugin declarative widgets and agent-generated widgets all consume the same resulting vocabulary.

Federated widgets are registered and loaded separately. They do not need to appear in the `$type` vocabulary.

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

This dynamic lifecycle affects only the declarative renderer. It must not reload, rebuild or otherwise disrupt mounted federated widgets.

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
10. The new type becomes available to future declarative widget generation.

Component previews and installed components must use the same renderer.

## Two-tier declarative component model

This component-tier distinction concerns components exposed through the declarative `$type` vocabulary. It is separate from the choice between declarative and federated widgets.

### Tier 1: declarative composites

This is the default and preferred mechanism for extending the curated vocabulary.

- JSON-based
- Composed from existing trusted `$type` components
- Immediately installable
- Serializable and versionable
- Safe for ad-hoc agent authoring
- Automatically inherits Sero styling

Most curated dashboard components should use this tier.

### Tier 2: code-backed curated components

Some curated components may require custom React code, canvas rendering, virtualisation or specialised interactions while still being exposed to declarative widgets as an approved `$type`.

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

Code-backed curated components must be treated as trusted component packs. They require a stronger review and installation process because they are executable code.

Routine ad-hoc component authoring must not silently fall back to generated React code.

A fully self-contained federated widget is not the same as a Tier 2 curated component. A federated widget is a complete dashboard widget owned by a plugin, while a Tier 2 component extends the `$type` vocabulary for declarative definitions.

## Namespacing

Canonical declarative component type identifiers should be namespaced to prevent collisions.

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

Plugin-provided declarative components should generally use explicit namespaces.

Federated widget identifiers continue to use the existing app and widget manifest identity model and do not need to share the `$type` namespace.

## Versioning, dependencies and migrations

Declarative widgets should not change unpredictably when a reusable component is edited.

```ts
interface ComponentDependency {
  type: string;
  revision: number;
}
```

Declarative definitions should support:

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

Sero must run migrations before loading declarative definitions created by older releases and retain the original value until migration succeeds.

Federated widget compatibility continues to follow the plugin manifest, module federation and app-runtime compatibility contracts. It should not be coupled to declarative definition schema versions.

## Missing dependency and repair behaviour

Declarative definitions should not be deleted automatically when a dependency becomes unavailable.

A declarative widget should enter a degraded state when:

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

Federated widgets should continue to use the existing missing-plugin and mount-failure states. Sero may offer shared diagnostics, but it cannot automatically rewrite or repair plugin-owned React code.

## Responsive and size-aware rendering

Grid constraints alone do not make a declarative widget responsive. The renderer should expose a semantic viewport context.

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

Declarative authoring previews should include:

- Minimum size
- Default size
- Maximum size
- Narrow edge case
- Short edge case

A declarative definition that is unusable at its declared minimum size should fail validation or emit a warning requiring acknowledgement.

Federated widgets receive the available container dimensions and remain responsible for their own responsive implementation. Sero should not impose the declarative responsive grammar on them.

## Shared widget data runtime

A separate subscription per declarative widget instance would waste resources and perform poorly for real-time data.

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

A declarative widget should declare its preferred update policy, but the host enforces limits.

```ts
interface WidgetUpdatePolicy {
  mode: "live" | "throttled" | "interval" | "manual";
  intervalMs?: number;
  maxUpdatesPerSecond?: number;
  pauseWhenHidden?: boolean;
}
```

This is particularly important for market-data widgets.

Federated widgets may opt into the shared runtime but are not required to use it. Plugin authors may manage their own subscriptions where full ownership is intentional, subject to platform resource and permission limits.

## Locale and formatting context

Declarative formatting should not rely on implicit machine defaults.

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

Federated widgets should receive locale and time-zone context through the app runtime where possible, but may implement their own formatting.

## Capability discovery

The full declarative component, data-source and action vocabulary should not be included in every model turn.

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

Federated widget manifests should also expose searchable metadata for the Add Widget interface, but they are not part of the assistant's declarative `$type` capability snapshot unless the plugin separately contributes declarative components or templates.

## Plugin contribution model

A plugin may contribute any combination of declarative capabilities and federated widgets.

```ts
interface PluginDashboardContribution {
  federatedWidgets?: WidgetManifest[];
  dataSources?: PluginWidgetDataSource[];
  actions?: PluginWidgetAction[];
  templates?: DashboardWidgetTemplate[];
  components?: GenerativeComponentDefinition[];
}
```

Examples of valid plugin strategies:

```text
Plugin A
  └─ Federated widgets only

Plugin B
  ├─ Typed data sources
  ├─ Typed actions
  └─ Declarative widget templates

Plugin C
  ├─ Federated advanced widget
  ├─ Declarative summary widgets
  ├─ Typed data sources shared by both
  └─ Declarative component definitions
```

Plugin-provided declarative components use the same contract as local agent-authored components.

External plugins should not add arbitrary executable renderers to the global `$type` vocabulary by default. Code-backed curated component packs require explicit host-level approval.

This restriction does not prevent an external plugin from exposing a complete federated widget through the existing module federation path.

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

The agent receives declarative dashboard, component, discovery and repair tools.

```ts
const dashboardToolkit = {
  inspect_dashboard_capabilities,
  propose_dashboard_widget,
  update_dashboard_widget_proposal,
  install_dashboard_widget,
  remove_dashboard_widget,
};
```

These tools author and manage declarative definitions. They do not rewrite or replace federated plugin widgets.

A future trusted development workflow may allow the Sero coding agent to create or modify a federated widget's source files, but that is ordinary plugin development and is outside the declarative authoring contract described here.

## Preview before persistence

Declarative widget workflow:

1. Search and inspect relevant plugin data, actions and components.
2. Propose a widget definition against a capability snapshot.
3. Validate the schema, bindings, expressions and dependencies.
4. Preview it through assistant-ui.
5. Exercise its fixtures and runtime states.
6. Accept, revise or reject it.
7. Revalidate against current registries.
8. Persist the approved definition and add an instance to the grid.

Declarative component workflow follows the same proposal, validation, preview and approval pattern.

The preview and installed result must use the same rendering path.

```tsx
<DashboardDefinitionRenderer
  definition={definition}
  context={context}
  viewport={viewport}
/>
```

Federated widget previews, when offered, should mount the real federated component in a controlled preview container. They should not be converted into declarative definitions merely for previewing.

## Component and Widget Studio

Chat should not be the only way to manage generated artefacts.

Sero should provide a Component and Widget Studio that allows users and plugin authors to:

- Browse and search available `$type` components
- Browse declarative widget definitions and instances
- Browse federated widget metadata
- Clearly distinguish declarative and federated ownership models
- Inspect declarative properties, bindings, actions and dependencies
- Preview all declarative revisions
- Preview normal, loading, refreshing, empty, stale, error and unavailable states
- Resize previews interactively
- Test light and dark appearance
- Edit per-instance declarative configuration
- Duplicate and modify a declarative definition
- Ask Sero to modify the selected declarative definition
- Compare declarative revisions
- View declarative dependency graphs
- See which widgets depend on a curated component
- Enable, disable or uninstall local components
- Roll back declarative revisions
- Repair broken declarative bindings and dependencies
- Export and import declarative definitions
- Open the owning plugin or source location for a federated widget where available

A minimal Studio should exist before broad agent authoring is enabled. Otherwise, generated artefacts will be difficult to inspect, organise and repair outside their original conversation.

The Studio must not imply that federated widgets are legacy or second-class. It should present the ownership model as an implementation characteristic and expose the management actions appropriate to each type.

## Fixtures, testing and diagnostics

Declarative components and widgets should carry preview fixtures.

```ts
interface ComponentFixture {
  name: string;
  props: Record<string, JsonValue>;
  viewport?: Partial<WidgetViewport>;
  dataState?: WidgetDataSnapshot<JsonValue>;
  expectedState?: "normal" | "empty" | "loading" | "stale" | "error";
}
```

Declarative validation and CI tooling should cover:

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

Federated widgets should continue to use normal component, integration and plugin testing. Sero may provide an optional federated widget test harness for sizing, context, theme and lifecycle testing, but it should not require federated widgets to adopt declarative fixtures.

## Persistence model

The dashboard should persist a discriminated union that supports both widget models.

```ts
type DashboardWidgetInstance =
  | DeclarativeDashboardWidgetInstance
  | FederatedDashboardWidgetInstance;

interface DeclarativeDashboardWidgetInstance {
  kind: "definition";
  instanceId: string;
  definitionId: string;
  definitionRevision: number;
  config: Record<string, JsonValue>;
  createdAt: string;
  updatedAt: string;
}

interface FederatedDashboardWidgetInstance {
  kind: "component";
  instanceId: string;
  appId: string;
  widgetId: string;
  component: string;
  config?: Record<string, JsonValue>;
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

Declarative definitions, component definitions, widget instances and layouts should be stored separately.

This supports:

- Declarative and federated widgets in the same dashboard
- Multiple instances of one declarative widget definition
- Per-instance configuration
- Declarative component and widget revision history
- Rollback
- Provenance
- Explicit declarative upgrades
- Stable dashboard layout during edits

Federated widget identity should remain compatible with the existing app manifest and module federation model.

## Coexistence and renderer selection

The implementation should preserve both renderer paths as permanent supported capabilities.

```ts
type DashboardWidgetKind =
  | {
      kind: "component";
      appId: string;
      widgetId: string;
      component: string;
    }
  | {
      kind: "definition";
      definitionId: string;
      definitionRevision: number;
    };
```

`WidgetMount` should dispatch to either the federated renderer or the declarative definition renderer.

```tsx
switch (widget.kind) {
  case "component":
    return <FederatedWidgetMount widget={widget} />;

  case "definition":
    return <DefinitionWidgetMount widget={widget} />;
}
```

Both renderers should share the dashboard shell capabilities that make sense at the host level:

- Grid placement
- Dragging and resizing
- Persistence
- Widget chrome
- Remove and open-app actions
- Theme and app context
- Error isolation
- Visibility and lifecycle notifications

They should not be forced to share internal rendering, state or data contracts.

The Cron widget can be recreated declaratively as a proof of concept and comparison exercise. The existing federated Cron widget does not need to be deleted or treated as deprecated. Keeping both temporarily may be useful for validating trade-offs.

No phase of this feature should make module federation widgets unavailable or require existing plugin authors to rewrite them.

## Validation pipeline

Every declarative widget or component definition should pass through:

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

Federated widgets are validated through the existing plugin manifest, module federation, permissions and runtime loading contracts. They are not subject to the declarative tree validation pipeline.

## Implementation strategy

### Phase 0: validate the foundations

- Confirm declarative and federated widgets as permanent first-class models
- Choose and document the serialisable Sero schema format
- Implement `compileToZod`
- Prove dynamic assistant-ui library and toolkit reconstruction
- Decide whether composites use per-type renderers or one generic registry-backed renderer
- Define `$bind`, `$config`, `$prop`, formatting, condition and collection grammars
- Define standard declarative data and action lifecycle envelopes
- Define semantic viewport sizes and responsive behaviour
- Define capability snapshots and progressive discovery
- Define schema migration infrastructure
- Confirm that declarative registry updates do not disrupt federated widgets

### Phase 1: prove the declarative widget contract

- Add assistant-ui Pi runtime to Sero's assistant surface
- Add `@assistant-ui/react-generative-ui`
- Define a small Sero-owned primitive vocabulary
- Define `DashboardWidgetDefinition`
- Implement static JSON definition rendering
- Add per-instance configuration and automatic settings forms
- Add standard data-state components and `DataBoundary`
- Add size-aware rendering and multi-size previews
- Recreate the Cron widget declaratively as a proof of concept
- Keep the existing federated renderer and widgets operational

### Phase 2: introduce plugin data and actions

- Add plugin data-source registration
- Build the shared widget data runtime
- Add validated `$bind` resolution
- Add update policies, throttling and shared subscriptions
- Add action registration, confirmation, idempotency and feedback
- Add locale and formatting context
- Add unavailable, permission and missing-plugin states
- Convert the declarative Cron proof of concept to live plugin data
- Compare the declarative and federated Cron implementations without requiring either to replace the other

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
- Show declarative and federated widget types clearly
- Add responsive and runtime-state previews for declarative widgets
- Add revision comparison and rollback for declarative definitions
- Add dependency graphs
- Add import and export
- Add broken declarative widget repair workflows
- Add federated widget metadata, source ownership and mount diagnostics

### Phase 5: agent widget and component authoring

- Expose declarative widget, component, data and action discovery to Pi
- Add declarative widget and component proposal tools
- Add capability-snapshot tracking
- Render previews through assistant-ui
- Require explicit acceptance before installation
- Persist provenance and revision history
- Add agent-assisted repairs and upgrades
- Do not allow these tools to silently replace federated widget instances

### Phase 6: broader plugin ecosystem

- Publish author SDKs and schemas for both widget models
- Document how authors choose between declarative and federated widgets
- Add declarative widget and component validation tooling
- Generate vocabulary documentation from serialisable schemas
- Support plugin-provided declarative components
- Add visual regression and accessibility tooling
- Add an optional federated widget test harness
- Add trusted code-backed curated component packs only where declarative composition is insufficient
- Continue supporting existing module federation widgets without a forced migration deadline

## Agreed direction

Sero supports two permanent, first-class widget ownership models.

Declarative widgets use a versioned Sero language, curated components, assistant-ui rendering and host-managed data, action and lifecycle contracts. They are optimised for consistency, safety, inspectability and agent authoring.

Federated widgets remain fully self-contained plugin-owned React components delivered through module federation. They are optimised for flexibility, specialist UI requirements and independent ownership.

Plugins may supply typed data, actions, templates and declarative components, federated widgets, or any combination of these.

The Sero agent may create new reusable `$type` components ad hoc, but by default those components must be declarative composites of already trusted Sero primitives.

The declarative feature is not complete when a definition can merely render. A production-ready declarative widget must also support configuration, responsive sizing, standard runtime states, safe actions, shared subscriptions, migration, repair and practical management outside chat.

The feature must not remove, deprecate or implicitly demote the existing module federation widget model. Choice of widget model belongs to the plugin or widget author.
