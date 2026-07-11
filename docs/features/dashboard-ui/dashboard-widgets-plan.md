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

#### `CollapsibleWidget` (deferred)

Deferred until the host provides a collapse contract. Collapse is host chrome,
so shipping a plugin-controlled collapse now would create a second model the
host later contradicts. When added, it must not duplicate the dashboard's title
bar, open action, remove action or drag handle.

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

### Actions

#### `Button`

Use the existing button primitive as the standard text-action component.

#### `IconButton`

A small icon-only button built on `Button`, with a required accessible label and
widget-appropriate sizing.

A date-range filter is intentionally out of scope for the dashboard set. A
calendar-and-popover control is a full-view interactive component rather than
compact dashboard presentation, so it belongs in general `@sero-ai/ui` if
needed, not here.

### API rules

- Export all supported components from the `@sero-ai/ui` package root.
- Add any new subpath export (such as the catalogue) to both the dev `exports`
  map and the `publishConfig.exports` map in `packages/ui/package.json`, or it
  breaks when the package is published.
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

For the initial release, keep the typed `catalog.ts` and the skill and docs-site
catalogue views hand-maintained and reviewed in PR. While the component APIs are
still settling, drift validation against a moving surface is churn, so the
readable views are written by hand and kept in step through normal review.

The two readable views to keep in step are:

- `packages/templates/skills/sero-dashboard-ui/references/component-catalog.md`
- the dashboard component catalogue page in `apps/docs-site`

Each should group components by category and show the name, purpose, when to use
it, stability and a concise example. Detailed props remain canonical in the
exported TypeScript types and component source rather than being copied into the
catalogue.

#### Follow-up: generation and validation (deferred)

Once the component set stabilises, generate the readable views from the typed
catalogue and add validation that fails when:

- a catalogue entry does not correspond to a public package export;
- a public dashboard component is missing from the catalogue;
- a related component name cannot be resolved; or
- generated Markdown is out of date.

This keeps discovery fast for authors and the agent without maintaining a
separate hand-written inventory once the surface has stopped moving.

## Responsive behaviour

Widgets must remain useful at their declared minimum and default sizes.

Use normal CSS and container queries rather than introducing a JavaScript
viewport contract. Shared components should provide sensible compact defaults,
while plugins remain responsible for choosing which data to show at each size.

Review widgets at these representative grid sizes. These are review targets for
checking legibility and layout, not a hard limit on how large a widget may be:

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
9. Demonstrate any new shared component in at least one showcase widget.

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

Keep the docs-site catalogue and skill reference in step with the typed package
catalogue so all discovery surfaces describe the same release. Generating them
from the typed catalogue is a deferred follow-up (see the catalogue section).

## Implementation plan

Work proceeds in five phases. Each phase lists its goal, a task checklist and
acceptance criteria. A phase is done only when every acceptance box under it is
ticked; do not start the next phase until the current one passes its gate.
Update the checkboxes and the progress tracker as work lands so the current
state is visible at a glance.

Phases are ordered to prove the biggest risks first: external styling in Phase
1, then breadth in Phase 2, then real-widget validation in Phase 3.

### Progress tracker

| Phase | Title | Status |
|---|---|:--:|
| 1 | Audit, showcase design, style spike | ☐ |
| 2 | Build shared components | ☐ |
| 3 | Prove the set with showcase widgets | ☐ |
| 4 | Verify external consumption | ☐ |
| 5 | Guidance, skill and docs | ☐ |

Status key: ☐ not started · ◐ in progress · ☑ done. Mark a phase ☑ only after
its acceptance criteria all pass.

### Phase 1: audit, showcase design, style spike

**Goal:** record what to avoid, decide the showcase widgets that will prove the
set, and de-risk external styling before building any breadth. The existing
widgets are the problem this work fixes, not the design source; the component
set is design-led.

**Tasks**

- [ ] Review the Cron, Web and template Notes widgets and record what to avoid
      (inconsistent spacing, ad-hoc colours, hand-rolled layout) in this doc or
      a linked note — as an anti-pattern list, not patterns to copy.
- [ ] Decide the 3 showcase widgets that will demonstrate the set, and map
      each planned component to at least one showcase that uses it, so every
      component group is exercised.
- [ ] Build one throwaway composite (for example `Metric`) and consume it from
      a packed external plugin (packed `@sero-ai/ui`, not a desktop-internal
      source path).

**Acceptance criteria**

- [ ] The anti-pattern list exists and is referenced from this plan.
- [ ] Every component in the initial set maps to a showcase widget that will use
      it; any component with no consumer is cut or justified.
- [ ] The spike composite renders in the packed external plugin with correct
      styles via `@sero-ai/ui/styles/plugin.css` and the Tailwind `@source`
      path — confirmed visually, not just built.
- [ ] If the spike reveals the styling mechanism does not deliver cleanly, the
      blocker is written up and resolved before Phase 2 begins.

### Phase 2: build shared components

**Goal:** add the design-led component set to `@sero-ai/ui`, built from existing
primitives and tokens, exported and tested.

**Tasks**

- [ ] Add the `packages/ui/src/components/dashboard/` directory.
- [ ] Build each component in the matrix below from existing primitives and
      design tokens (no dashboard-prefixed copies of primitives).
- [ ] Export every stable component from the package root.
- [ ] Add the typed `catalog.ts` and its metadata subpath, registering the
      subpath in both `exports` and `publishConfig.exports`.
- [ ] Write the hand-maintained skill and docs-site catalogue views (generation
      is a deferred follow-up).
- [ ] Add focused tests for variants, accessibility contracts and state
      selection.

**Component build matrix** — tick each column as it lands:

| Component | Built | Exported | Tested | In catalogue |
|---|:--:|:--:|:--:|:--:|
| `WidgetContent` | ☐ | ☐ | ☐ | ☐ |
| `Stack` | ☐ | ☐ | ☐ | ☐ |
| `Inline` | ☐ | ☐ | ☐ | ☐ |
| `Grid` | ☐ | ☐ | ☐ | ☐ |
| `Section` | ☐ | ☐ | ☐ | ☐ |
| `Divider` | ☐ | ☐ | ☐ | ☐ |
| `Text` | ☐ | ☐ | ☐ | ☐ |
| `Heading` | ☐ | ☐ | ☐ | ☐ |
| `Icon` | ☐ | ☐ | ☐ | ☐ |
| `Metric` / `MetricGroup` / `MetricCard` | ☐ | ☐ | ☐ | ☐ |
| `Status` | ☐ | ☐ | ☐ | ☐ |
| `KeyValue` / `KeyValueList` | ☐ | ☐ | ☐ | ☐ |
| `ItemList` / `ItemListItem` | ☐ | ☐ | ☐ | ☐ |
| `ActivityList` / `ActivityListItem` | ☐ | ☐ | ☐ | ☐ |
| `ProgressRing` | ☐ | ☐ | ☐ | ☐ |
| `StaleIndicator` | ☐ | ☐ | ☐ | ☐ |
| `DataBoundary` | ☐ | ☐ | ☐ | ☐ |
| `EmptyState` | ☐ | ☐ | ☐ | ☐ |
| Skeleton patterns | ☐ | ☐ | ☐ | ☐ |
| `IconButton` | ☐ | ☐ | ☐ | ☐ |

`Badge`, `Alert` and `Button` are reused primitives, listed in the catalogue but
not rebuilt here.

**Acceptance criteria**

- [ ] Every matrix row is fully ticked, or explicitly deferred with a reason.
- [ ] Each stable component is importable from the `@sero-ai/ui` root.
- [ ] The catalogue subpath resolves in both dev and published resolution
      (present in `exports` and `publishConfig.exports`).
- [ ] No shared component imports plugin state, plugin actions or domain types.
- [ ] Every touched source file is under 500 lines.
- [ ] `pnpm typecheck` and the UI package build both pass.

### Phase 3: prove the set with showcase widgets

**Goal:** validate the component set and its APIs by building the showcase
widgets, then adopt the components in the existing widgets as a secondary win.

**Tasks**

- [ ] Build the showcase widgets decided in Phase 1, using only shared
      components for presentation.
- [ ] Refactor `CronWidget` and `WebWidget` onto the shared components,
      removing their hand-rolled styling.
- [ ] Update the template Notes widget as the canonical minimal example.
- [ ] Feed any API friction found here back into the Phase 2 components.

**Acceptance criteria**

- [ ] Each showcase widget renders correctly at 1×1, 2×2 and 3×2 and in light
      and dark themes, with long labels, empty data and keyboard focus checked.
- [ ] Cron, Web and Notes widgets contain no ad-hoc presentation styling that a
      shared component already covers.
- [ ] Any component whose API had to change during adoption is re-exported and
      its catalogue entry updated.
- [ ] No unrelated plugin was mechanically rewritten.

### Phase 4: verify external consumption

**Goal:** confirm the components work for a real external plugin from a packaged
build, then release.

**Tasks**

- [ ] Consume the full set from an external plugin using a packed or published
      `@sero-ai/ui` build, not a desktop-internal source path.
- [ ] Verify production Module Federation bundles render the components.
- [ ] Publish the additions through a normal semantic version bump.

**Acceptance criteria**

- [ ] The external plugin renders every component group with correct styles via
      `@sero-ai/ui/styles/plugin.css`.
- [ ] Production MF bundles render correctly (no missing-style or dual-React
      regressions).
- [ ] The `@sero-ai/ui` version bump is published and the changelog notes the
      new components.

### Phase 5: guidance, skill and docs

**Goal:** make the components discoverable and give the agent a repeatable way
to build consistent widgets.

**Tasks**

- [ ] Create and validate the `sero-dashboard-ui` skill template with the
      `skill-creator` template.
- [ ] Link the new skill from the existing `sero-plugin` skill.
- [ ] Update `sero-plugin/references/api-and-widgets.md`, the Notes example and
      the relevant `apps/docs-site` pages.
- [ ] Keep the hand-maintained catalogue views in step with the shipped set.

**Acceptance criteria**

- [ ] The skill triggers on dashboard-widget requests and guides the agent to a
      consistent widget without copying a large raw styling recipe.
- [ ] The docs-site catalogue and skill reference list exactly the shipped
      component set.
- [ ] Documentation covers imports, plugin stylesheet setup, the shared vs
      plugin-local boundary, size and overflow conventions, and loading / empty
      / error presentations.

## Release acceptance

The work is complete when all phase gates pass and:

- [ ] Dashboard persistence and mounting are unchanged.
- [ ] Cron, Web and template Notes widgets share common presentation components.
- [ ] An external plugin consumes the components from a packaged `@sero-ai/ui`
      release.
- [ ] Components work in both dashboard widgets and full plugin views, at
      minimum, standard and wide sizes.
- [ ] Shared components contain no plugin-specific state or domain types.
- [ ] The layout, typography, data-display, runtime-state and action component
      groups are exported and documented.
- [ ] Plugin authors and the agent can discover every supported component
      through the hand-maintained catalogue.
- [ ] `pnpm typecheck` passes from the monorepo root.

### Deferred follow-ups

Tracked here so they are not lost, but explicitly out of scope for this release:

- [ ] Generate the catalogue views from the typed catalogue and add drift
      validation (missing exports, missing entries, broken related links, stale
      Markdown).
- [ ] `CollapsibleWidget`, once the host provides a collapse contract.
