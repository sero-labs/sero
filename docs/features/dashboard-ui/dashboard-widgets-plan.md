# Dashboard UI

## Summary

Sero will keep the existing React and Module Federation dashboard widget model.
`@sero-ai/ui` will provide shared, pre-styled components for compact dashboard
views. Plugin authors and the Sero agent can compose these components in normal
React code while retaining control over data, behaviour and layout.

This approach gives widget authors a consistent foundation while preserving the
current dashboard and plugin architecture.

```text
Sero agent or plugin author
          ↓
Builds a normal React widget
          ↓
Uses @sero-ai/ui primitives and dashboard components
          ↓
Existing Module Federation widget renderer
          ↓
Existing dashboard grid
```

## Goals

- Give internal and external widgets a consistent visual foundation.
- Provide useful composite components for compact data-heavy views.
- Allow the same components to be used in full plugin views where appropriate.
- Teach the Sero agent how to build responsive, consistent widgets.
- Make it straightforward to contribute repeated patterns back to
  `@sero-ai/ui`.
- Preserve the flexibility of normal React components.

## Scope

This work adds reusable presentation components and authoring guidance. It does
not change dashboard mounting, layout persistence, plugin registration, plugin
state or the boundary between the host and plugins.

## Architecture

The existing widget architecture remains unchanged:

- Plugins register React widgets through their manifest or
  `useWidgetRegistration()`.
- The dashboard mounts widgets through the existing Module Federation and
  `AppProvider` path.
- Plugins own their data access, state and interactions.
- The host owns grid placement, resizing, persistence and widget chrome.
- `@sero-ai/ui` provides shared design tokens, primitives and composite
  presentation components.

## Component boundaries

Components fall into three groups.

### UI primitives

Existing primitives such as `Button`, `Badge`, `Item`, `Empty`, `Skeleton`,
`Alert` and `Chart` remain the basic building blocks.

### Dashboard components

Reusable compact compositions live under:

```text
packages/ui/src/components/dashboard/
```

They should provide consistent spacing, typography, semantic status colours,
overflow behaviour and responsive presentation. They may also be used in full
plugin views when the same compact presentation is useful.

### Plugin components

Domain-specific components stay in the plugin that owns them. Shared UI
components must not depend on plugin state, plugin actions or domain types.

A component should normally be added to `@sero-ai/ui` only when the pattern is
useful in more than one widget or plugin.

## Initial component set

The initial release should provide enough coverage for an agent or plugin author
to compose a complete widget without recreating common layout, typography,
data-display and runtime-state patterns. It should combine existing
`@sero-ai/ui` primitives with new dashboard-focused components rather than
reimplementing primitives under new names.

### Layout and structure

#### `WidgetContent`

A full-height widget content layout with standard padding, overflow handling and
a container-query boundary.

#### `Stack`

A vertical layout with semantic spacing options, alignment and optional
scrolling. Use it for the primary content flow inside a widget.

#### `Inline`

A horizontal layout with semantic spacing, alignment, wrapping and
`justify` options.

#### `Grid`

A responsive grid with bounded column and gap options suitable for metric and
summary layouts.

#### `Section`

A compact section with optional heading, supporting content and trailing action.
It should work inside widgets and full plugin views.

#### `Divider`

A compact horizontal or vertical divider built from the existing `Separator`
primitive.

#### `CollapsibleWidget`

An internal content wrapper that can collapse optional widget details. It must
not duplicate the dashboard's title bar, open action, remove action or drag
handle. Collapse state remains controlled by the plugin unless a later host
contract explicitly provides it.

### Typography and media

#### `Text`

Semantic text variants for body, label, supporting, muted and numeric content,
with truncation and line-clamp options.

#### `Heading`

Compact heading levels and visual sizes that retain correct HTML semantics.

#### `Icon`

A consistent icon wrapper for size, tone and accessibility. It should accept an
icon component rather than owning a separate icon catalogue.

### Data display

#### `Metric`, `MetricGroup` and `MetricCard`

Consistent labels, values, icons, supporting text, trends and tabular numerals.
`Metric` should work inline, while `MetricCard` provides a contained summary
surface. `MetricGroup` arranges multiple metrics responsively.

#### `Status`

A semantic status dot, label or pill with neutral, success, warning, error and
info tones. The component should not encode plugin-specific status names.

#### `Badge`

Use the existing badge primitive and extend its variants only where semantic
status tones are missing. Do not create a dashboard-only duplicate.

#### `KeyValue` and `KeyValueList`

Compact label-value presentation for metadata, totals and configuration
summaries, with predictable alignment and truncation.

#### `ItemList` and `ItemListItem`

Compact rows with optional leading media, primary and secondary text, trailing
metadata, actions and an overflow count. Build on the existing `Item` primitive.

#### `ActivityList` and `ActivityListItem`

A chronological list for recent events with icon or status marker, label,
timestamp and optional supporting detail.

#### `ProgressRing`

An accessible circular progress or donut gauge for bounded values. It should
support a value, label, semantic tone and optional centre content without
requiring a charting dependency in the consuming plugin.

#### `StaleIndicator`

A compact indication that displayed data may be out of date, with an optional
last-updated value and refresh action.

### Runtime states and feedback

#### `DataBoundary`

A presentation boundary for loading, ready, empty, stale and error states. It
accepts state and fallback content from the plugin but does not fetch data,
subscribe to sources or own retry behaviour.

#### `EmptyState`

A compact empty state built from the existing `Empty` primitives, with optional
icon, title, message and action.

#### `Alert`

Use the existing alert primitive. Add semantic variants only where widget use
shows a clear gap.

#### `Skeleton` and widget skeleton patterns

Use the existing skeleton primitive and provide small compositions for common
metric, list and activity loading layouts.

### Actions and filters

#### `Button`

Use the existing button primitive as the standard text-action component.

#### `IconButton`

A small icon-only button built on `Button`, with a required accessible label and
widget-appropriate sizing.

#### `DateRangePicker`

A controlled date-range input composed from the existing calendar, popover and
button primitives. It should support optional presets, minimum and maximum
dates, and a compact trigger. Plugins continue to own filtering, locale and
persistence behaviour.

### API rules

- Export all supported components from the `@sero-ai/ui` package root.
- Reuse existing primitives instead of creating dashboard-prefixed copies.
- Accept `children` and `className` where normal React composition benefits from
  them.
- Use semantic spacing, size and tone variants for common choices.
- Keep plugin state, data fetching, actions and domain types outside the UI
  package.
- Preserve correct HTML semantics and accessible labels.
- Keep components useful in full plugin views where their compact presentation
  fits.

The exact APIs should be confirmed against real widgets before they are treated
as stable.

Example usage:

```tsx
import {
  ActivityList,
  ActivityListItem,
  DataBoundary,
  Inline,
  Metric,
  MetricCard,
  ProgressRing,
  Section,
  Stack,
  Status,
  WidgetContent,
} from '@sero-ai/ui';

export function SchedulerWidget() {
  return (
    <WidgetContent>
      <Stack gap="sm">
        <Inline justify="between" align="center">
          <Status tone="success">Scheduler active</Status>
          <ProgressRing value={75} label="Success rate" />
        </Inline>

        <Section heading="Summary">
          <Inline gap="sm" wrap>
            <MetricCard>
              <Metric label="Jobs" value={6} />
            </MetricCard>
            <MetricCard>
              <Metric label="Reminders" value={2} />
            </MetricCard>
          </Inline>
        </Section>

        <DataBoundary state="ready">
          <ActivityList>
            <ActivityListItem label="Daily backup" timestamp="08:00" />
            <ActivityListItem label="Publish report" timestamp="in 2h" />
          </ActivityList>
        </DataBoundary>
      </Stack>
    </WidgetContent>
  );
}
```

## Component catalogue

Plugin authors and the agent need a fast way to discover the supported
components without reading every source file. `@sero-ai/ui` should therefore
ship a small, versioned dashboard component catalogue.

The catalogue is package metadata, not a mutable runtime service. It changes
through normal source review and is released with `@sero-ai/ui`.

Keep its source of truth at:

```text
packages/ui/src/components/dashboard/catalog.ts
```

Each public component entry should include enough information for discovery:

```ts
interface DashboardComponentCatalogEntry {
  name: string;
  category:
    | 'layout'
    | 'typography'
    | 'data-display'
    | 'state'
    | 'action'
    | 'filter';
  kind: 'primitive' | 'composite';
  summary: string;
  useWhen: string;
  related?: string[];
  status: 'stable' | 'experimental';
  example?: string;
}
```

The catalogue should include the existing primitives recommended for widgets,
such as `Button`, `Badge`, `Alert` and `Skeleton`, as well as the new dashboard
components. This gives authors one supported vocabulary even though the
implementations live in different component folders.

Export the metadata through a stable subpath for tooling:

```ts
import { dashboardComponentCatalog } from '@sero-ai/ui/dashboard-catalog';
```

Normal widget code should continue importing React components from
`@sero-ai/ui`. The metadata export exists for discovery tools, documentation and
agent workflows; it is not involved in rendering.

Generate these readable views from the typed catalogue:

- `packages/templates/skills/sero-dashboard-ui/references/component-catalog.md`
- the dashboard component catalogue page in `apps/docs-site`

The generated catalogue should group components by category and show the name,
purpose, when to use it, stability and a concise example. Detailed props remain
canonical in the exported TypeScript types and component source rather than
being copied into the catalogue.

Add validation that fails when:

- a catalogue entry does not correspond to a public package export;
- a public dashboard component is missing from the catalogue;
- a related component name cannot be resolved; or
- generated Markdown is out of date.

This keeps discovery fast for authors and the agent without maintaining a
separate hand-written component inventory.

## Responsive behaviour

Widgets must remain useful at their declared minimum and default sizes.

Use normal CSS and container queries rather than introducing a JavaScript
viewport contract. Shared components should provide sensible compact defaults,
while plugins remain responsible for choosing which data to show at each size.

Review widgets at these representative grid sizes:

| Size | Grid area | Purpose |
|---|---:|---|
| Minimum | 1×1 | Confirm the widget remains legible and does not overflow |
| Standard | 2×2 | Confirm the normal information hierarchy |
| Wide | 3×2 or larger | Confirm content uses additional space sensibly |

Also review long labels, empty data, light and dark themes, and keyboard focus
for interactive content.

## Agent skill

Add a focused skill template at:

```text
packages/templates/skills/sero-dashboard-ui/
├── SKILL.md
└── references/
    ├── component-catalog.md
    ├── component-examples.md
    └── widget-patterns.md
```

Create and validate the skill using the existing `skill-creator` template. Its
description should trigger when the agent is asked to create, redesign or
standardise a dashboard widget or compact plugin view.

The skill should instruct the agent to:

1. Inspect the widget's data and supported sizes.
2. Read the generated component catalogue before creating bespoke presentation
   code, then inspect the exported TypeScript types for selected components.
3. Use shared dashboard components where they fit.
4. Keep domain state and behaviour inside the plugin.
5. Handle populated, loading, empty and error states as applicable.
6. Review minimum, standard and wide sizes.
7. Use semantic theme tokens rather than hard-coded colours.
8. Consider contributing a pattern to `@sero-ai/ui` only when it is reusable.
9. Refactor at least two real consumers when adding a new shared component.

The skill should explicitly avoid:

- duplicating the host's widget chrome;
- wrapping every layout in a custom component;
- moving domain-specific components or types into `@sero-ai/ui`; and
- relying on host CSS that is not shipped with the external plugin.

The existing `sero-plugin` skill should link to this skill and its widget
guidance.

## Documentation

Update these sources with the new component and composition guidance:

- `packages/templates/skills/sero-plugin/references/api-and-widgets.md`
- `packages/templates/skills/sero-plugin/example/sero-notes-plugin/`
- the relevant plugin and widget pages in `apps/docs-site`

Documentation should cover:

- stable imports from `@sero-ai/ui`;
- required plugin stylesheet setup;
- available dashboard components;
- the boundary between shared and plugin-local components;
- supported size and overflow conventions;
- common loading, empty and error presentations; and
- how to contribute a reusable component to the UI package.

Generate the docs-site catalogue and skill reference from the typed package
catalogue so all discovery surfaces describe the same release.

## Implementation plan

### Phase 1: audit existing widgets

- Review the Cron, Web and template Notes widgets.
- Review representative internal and external plugin views.
- Identify repeated layout, typography, metric, status, list, filter and
  runtime-state patterns.
- Confirm the initial component APIs against at least two real consumers where
  possible.

### Phase 2: add shared components

- Add the dashboard component directory to `@sero-ai/ui`.
- Add the layout, typography, data-display, state, action and filter components
  defined in the initial component set.
- Build components from existing primitives and design tokens instead of
  duplicating them.
- Export stable components from the package root.
- Add the typed component catalogue and its stable metadata subpath.
- Generate the skill and docs-site catalogue views from the same metadata.
- Add focused component tests for variants, accessibility contracts and state
  selection.
- Add catalogue/export consistency and generated-file checks.
- Keep each source file below 500 lines.
- Typecheck and build the UI package.

### Phase 3: use the components in real widgets

- Refactor `CronWidget` to use shared statuses, sections and states.
- Refactor `WebWidget` to use shared metrics and compact lists.
- Update the template Notes widget as the canonical minimal example.
- Do not mechanically rewrite unrelated plugins.

### Phase 4: verify external consumption

- Test the components from an external plugin using a published or packed
  `@sero-ai/ui` build rather than a desktop-internal source path.
- Confirm component styles are included through
  `@sero-ai/ui/styles/plugin.css`.
- Confirm production Module Federation bundles render correctly.
- Publish the additions through a normal semantic version update.

### Phase 5: add guidance

- Create and validate the `sero-dashboard-ui` skill template.
- Link it from the existing `sero-plugin` skill.
- Update plugin documentation and examples.
- Update the docs site before release.

## Validation

The implementation is complete when:

- Dashboard persistence and mounting remain unchanged.
- Cron, Web and template Notes widgets share common presentation components.
- An external plugin can consume the components from a packaged
  `@sero-ai/ui` release.
- Widgets work at their minimum, standard and wide sizes.
- Components work in both dashboard widgets and full plugin views.
- Shared components contain no plugin-specific state or domain types.
- The initial layout, typography, data-display, runtime-state, action and filter
  component groups are exported and documented.
- Plugin authors and the agent can discover every supported component through
  the generated catalogue.
- Catalogue validation catches missing exports, missing entries, broken related
  links and stale generated documentation.
- The new skill can guide the agent to build a consistent widget without
  copying a large raw styling recipe.
- `pnpm typecheck` passes from the monorepo root.
