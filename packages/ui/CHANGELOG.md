# @sero-ai/ui changelog

## 0.5.0

### Breaking

- AI elements and model controls are no longer exported from the package root.
  Migrate them to `@sero-ai/ui/ai-elements/*` and
  `@sero-ai/ui/model-selection/*`. Plugins using those component families must
  also import the matching specialized stylesheet after `styles/plugin.css`.

### Fixed

- Root imports now expose primitives, dashboard components, hooks and theme
  utilities without traversing specialized dependency graphs, so a plugin
  importing `Button` and `cn` no longer emits Mermaid, Shiki or graph-rendering
  assets or loads their transitive types. Specialized plugin styles opt in through
  `styles/ai-elements.css`, `styles/model-selection.css`, and
  `styles/context-editor.css`.

## 0.4.1

### Fixed

- **Publishes built `dist/` again.** 0.4.0 was accidentally published with its
  raw TypeScript source (a bare `npm publish`, which ignores the `publishConfig`
  dist overrides). 0.4.1 ships the compiled JS and `.d.ts` — and a
  `prepublishOnly` guard now fails fast if the package is published with
  anything other than `pnpm`.
- **Public entrypoints resolve under Node ESM, not just bundlers.** The
  catalogue is plain data at `@sero-ai/ui/dashboard-catalog.json` (was a `.ts`
  re-export that failed to resolve under Node); `DashboardComponentCatalogEntry`
  is re-exported from the package root. The `reference` entry is bundled into a
  single self-contained module (was a directory import that failed under Node).
  `pnpm smoke` checks the built artifact so this can't silently regress.
- **`Status` bare dots** carry a visually-hidden tone label (overridable via
  `aria-label`) so assistive tech announces their state instead of an empty
  live region.

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
- **Dashboard component catalogue** metadata on a stable subpath for discovery
  tooling and agent workflows. (Moved to a `dashboard-catalog.json` file in
  0.4.1.)
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
