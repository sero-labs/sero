# Phase 1 — Audit, showcase design, style spike

Companion note to [dashboard-widgets-plan.md](./dashboard-widgets-plan.md). Records
the anti-patterns the shared component set must fix, the three showcase widgets
that prove the set, the component→showcase map, and the style spike result.

## Anti-pattern audit

Reviewed the three existing widgets:

- `plugins/sero-cron-plugin/ui/widgets/CronWidget.tsx`
- `plugins/sero-web-plugin/ui/widgets/WebWidget.tsx`
- `packages/templates/skills/sero-plugin/example/sero-notes-plugin/ui/widgets/NotesWidget.tsx`

These widgets are the problem this work fixes. The list below is **what to
avoid**, not a design source to copy.

1. **Hard-coded hex colours in inline styles.** Cron sets status/marker dots with
   `#22c55e`, `#6b7280`, `#dc2626`, `#8b5cf6`, `#f59e0b` and a raw `boxShadow`
   glow. These bypass the semantic status tokens and break theming. → `Status`,
   `ActivityListItem` markers must use `--status-*` tokens.
2. **Ad-hoc arbitrary font sizes.** `text-xs`, `text-sm`, `text-sm`
   appear across all three widgets with no shared scale, so equivalent text
   renders at different sizes in different widgets. → `Text`/`Heading` provide one
   scale.
3. **Three vocabularies for "muted".** Cron uses `var(--text-muted)`, Web uses
   `text-muted-foreground/60`, Notes uses `text-muted-foreground`. Same intent,
   three implementations. → `Text` tone variants normalise this.
4. **Hand-rolled rows duplicated.** `flex items-center gap-2 rounded-md bg-… px-2
   py-1.5` is re-implemented as `JobRow`, `ReminderRow`, Web entry rows and Notes
   rows — the same compact row, four times. → `ItemList`/`ItemListItem`,
   `ActivityList`/`ActivityListItem`.
5. **Bespoke status dots.** A `size-1.5/2 rounded-full` dot with an inline colour
   is re-declared 3+ times. → `Status`.
6. **Ad-hoc overflow counts.** Each widget styles its own `+N more` line
   differently. → `ItemList`/`ActivityList` overflow prop.
7. **Bespoke empty states.** Cron hand-draws an SVG clock; Web and Notes centre
   ad-hoc muted text. No shared empty treatment. → `EmptyState`.
8. **No standard content frame.** Each widget re-declares `flex h-full flex-col
   gap-2 p-3` with slightly different padding/gap and no container-query
   boundary. → `WidgetContent` + `Stack`.
9. **`useEffect` + `setInterval` polling for relative time** (Cron ticks every
   30s). Against the repo's no-polling / avoid-`useEffect` guidance. Presentation
   components stay stateless; the plugin owns any refresh.

## Showcase widgets

Three showcase widgets prove the set. They are design-led, not ports of the
existing widgets.

1. **Scheduler overview** — status header, summary metrics, success ring, next-up
   activity feed. Mirrors the plan's example usage.
2. **Resource monitor** — a responsive metric grid, progress rings and a
   key/value config summary; exercises dense numeric layout.
3. **Activity feed** — a compact item/activity list with badges, status markers,
   and full loading / empty / error runtime states.

## Component → showcase map

Every component in the initial set is exercised by at least one showcase. Reused
primitives (`Badge`, `Alert`, `Button`) are included.

| Component | Scheduler | Monitor | Activity feed |
|---|:--:|:--:|:--:|
| `WidgetContent` | ✓ | ✓ | ✓ |
| `Stack` | ✓ | ✓ | ✓ |
| `Inline` | ✓ |  | ✓ |
| `Grid` |  | ✓ |  |
| `Section` | ✓ | ✓ |  |
| `Divider` | ✓ | ✓ |  |
| `Text` | ✓ | ✓ | ✓ |
| `Heading` | ✓ | ✓ |  |
| `Icon` | ✓ | ✓ | ✓ |
| `Metric` / `MetricGroup` / `MetricCard` | ✓ (card) | ✓ (group) |  |
| `Status` | ✓ | ✓ | ✓ |
| `KeyValue` / `KeyValueList` |  | ✓ |  |
| `ItemList` / `ItemListItem` |  |  | ✓ |
| `ActivityList` / `ActivityListItem` | ✓ |  | ✓ |
| `ProgressRing` | ✓ | ✓ |  |
| `StaleIndicator` | ✓ |  | ✓ |
| `DataBoundary` | ✓ |  | ✓ |
| `EmptyState` |  | ✓ | ✓ |
| Skeleton patterns |  | ✓ | ✓ |
| `IconButton` | ✓ |  | ✓ |
| `Badge` (reused) |  |  | ✓ |
| `Alert` (reused) |  |  | ✓ |
| `Button` (reused) | ✓ |  |  |

No component is left without a consumer, so none is cut.

## Style spike

**Question the spike answers:** does a component built under
`packages/ui/src/components/dashboard/` render with correct styles when consumed
from a **packed** `@sero-ai/ui` (dist), not a desktop-internal source path?

**Mechanism.** An external plugin's `ui/styles.css` does:

```css
@import "@sero-ai/ui/styles/plugin.css";
@source "./**/*.{ts,tsx}";
```

`plugin.css` imports `globals.css`, which already contains:

```css
@source "../components";
```

Relative to the resolved stylesheet, `../components` is:

- dev: `packages/ui/src/components` (covers `src/components/dashboard/`)
- packed: `<pkg>/dist/components` (tsup runs with `bundle: false`, so it emits
  `dist/components/dashboard/*.js` with the literal `className` strings intact)

So Tailwind scans the dashboard components' class names in **both** resolutions
with no change to the existing `@source` line. New dashboard components are
covered automatically.

**Spike result.** `Metric` was built as the first real component (not a
throwaway) and used as the spike. Verification is recorded in
[phase-4-external-consumption.md](./phase-4-external-consumption.md): the packed
`@sero-ai/ui` build emits `dist/components/dashboard/metric.js`, and a plugin
that imports `@sero-ai/ui/styles/plugin.css` generates the utility classes the
component uses. No blocker was found, so Phase 2 proceeds.
