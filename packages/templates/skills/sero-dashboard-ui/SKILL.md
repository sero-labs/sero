---
name: sero-dashboard-ui
description: |
  Build, redesign or standardise Sero dashboard widgets and compact plugin
  views using the shared @sero-ai/ui dashboard components. Use when the user
  asks to create, restyle, clean up or make consistent a dashboard widget or a
  data-dense plugin view. Trigger on phrases like "dashboard widget", "widget
  for the dashboard", "restyle this widget", "make the widget consistent",
  "compact plugin view", or any work under a plugin's `ui/widgets/`.
---

# Building Sero dashboard widgets

Sero widgets are normal React components loaded via Module Federation. This
skill is about their **presentation**: composing the shared `@sero-ai/ui`
dashboard components instead of hand-rolling layout, spacing and colours.

The host owns widget chrome — the title bar, open/remove actions, drag handle
and grid placement. The widget owns its data and what it shows at each size.

## Workflow

1. **Inspect the data and supported sizes.** Read the widget's state shape and
   its `minSize` / `defaultSize` / `maxSize` in the plugin manifest. Decide what
   must stay legible at 1×1 and what extra detail 2×2 / 3×2 can add.
2. **Read the catalogue before writing bespoke presentation.** See
   [references/component-catalog.md](./references/component-catalog.md), or import
   the machine-readable list from `@sero-ai/ui/dashboard-catalog`. Then read the
   exported TypeScript types of the components you pick — the props are canonical
   in the source, not copied here.
3. **Compose shared components where they fit.** Wrap in `WidgetContent`; use
   `Stack` / `Inline` / `Grid` for layout, `Text` / `Heading` for type,
   `Metric` / `Status` / `ItemList` / `ActivityList` / `ProgressRing` for data,
   and `DataBoundary` / `EmptyState` / skeletons for runtime states. See
   [references/component-examples.md](./references/component-examples.md).
4. **Keep domain state and behaviour in the plugin.** The shared components are
   presentation only. Do not push plugin state, actions or domain types into
   `@sero-ai/ui`.
5. **Handle every applicable state.** Populated, loading, empty and error. Use
   `DataBoundary` to switch, with `EmptyState`, a skeleton pattern, and an
   `Alert` as fallbacks.
6. **Review at each size.** Check 1×1, 2×2 and 3×2 — see
   [references/widget-patterns.md](./references/widget-patterns.md) for the
   responsive approach (container queries, choosing data per size).
7. **Use semantic theme tokens, never hard-coded colours.** Tones map to the
   `--status-*` design tokens; map your domain status onto a `Tone`
   (`neutral` / `success` / `warning` / `error` / `info`).
8. **Only contribute a pattern back to `@sero-ai/ui` when it is reusable** —
   useful in more than one widget or plugin. One-off domain presentation stays
   in the plugin.
9. **Demonstrate any new shared component** in a reference widget under
   `packages/ui/src/components/reference/` (exported from `@sero-ai/ui/reference`
   and previewed in `apps/styleguide`).

## Glass styling

Widgets sit on the frosted glass dashboard. `WidgetContent` applies the glass
token scope automatically, so the shared components render as translucent
surfaces (raised cards, flat rows) that read as part of the tile — you write
nothing extra. Route any custom surface through the `--surface-raised` /
`--surface-flat` / `--surface-line` / `--surface-rim` tokens so it adapts too;
don't hard-code `--bg-surface` or add your own `backdrop-filter` (the host tile
provides the single blur).

For a **full plugin view** (not a dashboard tile) that should stay solid, opt
out: `<WidgetContent glass={false}>`. Form controls and portalled menus stay
solid inside glass automatically.

## Avoid

- **Duplicating host chrome.** No custom title bar, remove button, drag handle
  or collapse control — those are the host's.
- **Wrapping every layout in a custom component.** Reach for `Stack` / `Inline`
  / `Grid` first; add a component only for a genuinely repeated pattern.
- **Moving domain-specific components or types into `@sero-ai/ui`.**
- **Relying on host CSS.** External plugins must import
  `@sero-ai/ui/styles/plugin.css` and add a local `@source` so their remote
  ships the utility classes it uses. Do not depend on classes only the desktop
  shell emits.

## Imports

Everything comes from the package root:

```tsx
import {
  WidgetContent, Stack, Inline, Section,
  Text, Metric, Status, ItemList, ItemListItem,
  ActivityList, ActivityListItem, ProgressRing,
  DataBoundary, EmptyState, IconButton,
} from '@sero-ai/ui';
```

The discovery catalogue (metadata, not components) is a separate subpath:

```ts
import { dashboardComponentCatalog } from '@sero-ai/ui/dashboard-catalog';
```

Worked, glass-styled example widgets — importable to preview, or copy-pasteable
as a starting point — are on their own subpath:

```ts
import { StarterExample, SchedulerExample } from '@sero-ai/ui/reference';
```

## Reference implementations

- `@sero-ai/ui/reference` (`packages/ui/src/components/reference/`) — a minimal
  Starter plus Scheduler / Resource / Activity widgets that exercise every
  component, glass-styled and previewed in `apps/styleguide`.
- `plugins/sero-cron-plugin/ui/widgets/CronWidget.tsx` and
  `plugins/sero-web-plugin/ui/widgets/WebWidget.tsx` — real widgets composed from
  the shared set.
- The Notes example widget in the `sero-plugin` skill — the minimal template.
