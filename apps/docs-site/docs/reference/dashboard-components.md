# Dashboard Components

`@sero-ai/ui` provides shared dashboard components for compact widgets and
plugin views. Use them for consistent spacing, text, status colours, and
overflow behaviour.

Import everything from the package root:

```tsx
import { WidgetContent, Stack, Metric, Status, ItemList } from '@sero-ai/ui';
```

The root is for primitives, dashboard components, hooks and theme utilities.
Import AI elements from their stable subpaths so plugins only load the editor
and rendering dependencies they use:

```tsx
import { Message } from '@sero-ai/ui/ai-elements/message';
```

Federated plugins that use AI elements should also import their Tailwind source
entry after the base plugin stylesheet. The same rule applies to model-selection
and context-editor components:

```css
@import "@sero-ai/ui/styles/plugin.css";
@import "@sero-ai/ui/styles/ai-elements.css";
@import "@sero-ai/ui/styles/model-selection.css";
@import "@sero-ai/ui/styles/context-editor.css";
```

Only import the specialized stylesheets for component families the plugin uses.

Detailed props are canonical in the exported TypeScript types. The
machine-readable catalogue (the data behind the tables below) ships as plain
JSON at a stable subpath — read it directly:

```
@sero-ai/ui/dashboard-catalog.json
```

Worked, glass-styled example widgets ship on their own subpath — import them to
preview, or copy one as a starting point:

```ts
import { StarterExample, SchedulerExample } from '@sero-ai/ui/reference';
```

In the tables, _primitive_ means an existing `@sero-ai/ui` primitive that is
suitable for widgets. _Composite_ means a dashboard component.

## Layout

| Component | Kind | Purpose | Use when |
|---|---|---|---|
| `WidgetContent` | composite | Full-height widget frame with padding + container-query boundary | Outermost element of a widget |
| `Stack` | composite | Vertical layout: gap, alignment, optional scroll | Primary top-to-bottom flow |
| `Inline` | composite | Horizontal layout: gap, align, wrap, justify | A row, e.g. header + action |
| `Grid` | composite | Responsive grid with bounded columns | Metric / summary layouts |
| `Section` | composite | Compact section: heading, description, action | Group content under a label |
| `Divider` | composite | Compact divider on `Separator` | Separate sections |

## Typography

| Component | Kind | Purpose | Use when |
|---|---|---|---|
| `Text` | composite | Semantic variants (body/label/supporting/muted/numeric) + truncation | Any text |
| `Heading` | composite | Compact heading levels/sizes, correct HTML semantics | Titles |
| `Icon` | composite | Icon wrapper for size, tone, accessibility | Render an icon consistently |

## Data display

| Component | Kind | Purpose | Use when |
|---|---|---|---|
| `Metric` / `MetricCard` / `MetricGroup` | composite | Label + value, contained card, responsive group | Numbers and summaries |
| `Status` | composite | Semantic dot / label / pill | Health / state indicator |
| `Badge` | primitive | Counts, tags (gained success/warning/info tones) | A count or tag |
| `KeyValue` / `KeyValueList` | composite | Aligned label/value metadata | Config, totals, metadata |
| `ItemList` / `ItemListItem` | composite | Compact rows with media/text/metadata + overflow | Entity lists |
| `ActivityList` / `ActivityListItem` | composite | Chronological events + overflow | Time-ordered activity |
| `ProgressRing` | composite | Accessible circular gauge, no charting dep | A bounded value / rate |
| `StaleIndicator` | composite | "Data may be stale" hint + optional refresh | Data can lag its source |

## Runtime states & feedback

| Component | Kind | Purpose | Use when |
|---|---|---|---|
| `DataBoundary` | composite | Selects presentation for loading/ready/empty/stale/error | Switch by data state |
| `EmptyState` | composite | Compact empty state | Nothing to show yet |
| `Alert` | primitive | Inline warning / error | Persistent inline message |
| `MetricSkeleton` / `ListSkeleton` / `ActivitySkeleton` | composite | Loading placeholders | `loading` fallbacks |
| `Skeleton` | primitive | Bespoke loading shapes | Prebuilt patterns don't fit |

## Actions

| Component | Kind | Purpose | Use when |
|---|---|---|---|
| `Button` | primitive | Standard text action | A labelled action |
| `IconButton` | composite | Icon-only button, required accessible label | Compact action (refresh, dismiss) |

## Boundary: shared vs plugin-local

Shared dashboard components are **presentation only** — they hold no plugin
state, actions or domain types. Keep domain-specific components and types in the
plugin. Add a component to `@sero-ai/ui` only when the pattern is reused across
more than one widget or plugin.

## Sizes and overflow

Widgets stay legible at their declared minimum and default sizes using CSS and
container queries. Provide compact defaults; let the plugin choose which data to
show at each size. Use `Stack`'s `scroll` and the list components' `overflowCount`
for "+N more" rather than hand-rolling overflow.

## Loading, empty and error

Wire runtime states through `DataBoundary`, with a skeleton pattern for loading,
`EmptyState` for empty, and `Alert` for error. The boundary selects presentation;
the plugin owns fetching and retry.

## Glass styling

`WidgetContent` applies the dashboard glass token scope. Do not add glass
classes or `backdrop-filter`. The host tile provides the blur.

For a full plugin view that should stay solid rather than glass, opt out with
`<WidgetContent glass={false}>`. Form controls and portalled menus stay solid
inside glass regardless, so inputs and dropdowns remain readable.

## Styling setup

An external plugin's `ui/styles.css` must import the shared stylesheet and scan
its own files:

```css
@import "@sero-ai/ui/styles/plugin.css";
@source "./**/*.{ts,tsx}";
```

`plugin.css` already scans the dashboard components, so their utility classes are
emitted for you. Import `../styles.css` from every directly-exposed Module
Federation entry.

Sero wraps contributed components in `PluginStyleScope`. Use the shared
stylesheet and the `seroPluginCssScope` Vite helper so document-level Tailwind
selectors stay inside this scope. Sero's design tokens inherit from the host.

## Contributing a reusable component

For an in-repository contribution, add a reused pattern under
`packages/ui/src/components/dashboard/`. Build it from existing primitives and
design tokens. Export it from the package root, and add it to the catalogue.
