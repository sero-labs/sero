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
- **Dashboard component catalogue** metadata, shipped as plain data at a new
  stable subpath `@sero-ai/ui/dashboard-catalog.json` for discovery tooling and
  agent workflows (read the file directly). The entry type
  `DashboardComponentCatalogEntry` is re-exported from the package root.
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
  `sero-showcase-plugin`.) Bundled into a single self-contained module so the
  entrypoint resolves under Node ESM as well as bundlers.
- `Status` bare dots now carry a visually-hidden tone label (overridable via
  `aria-label`) so assistive tech announces their state instead of an empty
  region.

### Packaging

- The `reference` entry is bundled and `dashboard-catalog` ships as JSON, so both
  new public entrypoints resolve under raw Node ESM (the rest of the package
  stays bundler-resolved). `pnpm smoke` checks the built artifact.

See `docs/features/dashboard-ui/dashboard-widgets-plan.md` and
`glass-restyle-spec.md` for the design and authoring guidance.
