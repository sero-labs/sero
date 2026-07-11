# @sero-ai/ui changelog

## 0.4.0

### Added

- **Dashboard components** — a compact presentation set for dashboard widgets and
  full plugin views, built from the existing primitives and design tokens.
  Exported from the package root (`@sero-ai/ui`):
  - Layout: `WidgetContent`, `Stack`, `Inline`, `Grid`, `Section`, `Divider`
  - Typography: `Text`, `Heading`, `Icon`
  - Data display: `Metric`, `MetricCard`, `MetricGroup`, `Status`, `KeyValue`,
    `KeyValueList`, `ItemList`, `ItemListItem`, `ActivityList`, `ActivityListItem`,
    `ProgressRing`, `StaleIndicator`
  - Runtime states: `DataBoundary`, `EmptyState`, `MetricSkeleton`,
    `ListSkeleton`, `ActivitySkeleton`
  - Actions: `IconButton`
  - Shared `Tone` vocabulary and `Gap` spacing scale
- **Dashboard component catalogue** metadata, exported from a new stable subpath
  `@sero-ai/ui/dashboard-catalog` for discovery tooling and agent workflows.
- `Badge` gained semantic status tones: `success`, `warning`, `info`.
- **Glass styling for dashboard widgets.** A `.glass` token scope (canonical
  `--glass-*` tokens, light + dark) makes the dashboard components render as
  translucent surfaces on the frosted board. `WidgetContent` applies the scope
  automatically (`glass` prop, default `true`; `glass={false}` for solid full
  views); component surfaces route through new `--surface-*` tokens. No inner
  `backdrop-filter` — the host tile provides the single blur; form controls and
  portalled menus stay solid.
- **Shared glass-board fixture** — `@sero-ai/ui/styles/glass-board.css`
  (`.glass-canvas` + `.glass-tile`), consumed by the desktop dashboard and the
  styleguide so previews match the real board.
- **Reference widgets** on a new subpath `@sero-ai/ui/reference` — `StarterExample`,
  `SchedulerExample`, `ResourceExample`, `ActivityExample`: pure-static, glass-styled
  worked examples, importable to preview or copy-paste. (Replaces the removed
  `sero-showcase-plugin`.)

See `docs/features/dashboard-ui/dashboard-widgets-plan.md` and
`glass-restyle-spec.md` for the design and authoring guidance.
