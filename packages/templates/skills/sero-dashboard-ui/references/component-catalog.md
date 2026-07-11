# Dashboard component catalogue

Hand-maintained view of the shared `@sero-ai/ui` dashboard components. Kept in
step with the typed source of truth, `packages/ui/src/components/dashboard/catalog.ts`,
and the docs-site catalogue page. Detailed props are canonical in the exported
TypeScript types — read those before using a component.

All components import from the package root: `import { … } from '@sero-ai/ui'`.

Status: **stable** unless noted. `kind`: _primitive_ = existing `@sero-ai/ui`
primitive recommended for widgets; _composite_ = new dashboard component.

## Layout

| Component | Kind | Purpose | Use when | Example |
|---|---|---|---|---|
| `WidgetContent` | composite | Full-height widget frame with padding + a container-query boundary | Outermost element of every widget | `<WidgetContent><Stack>…</Stack></WidgetContent>` |
| `Stack` | composite | Vertical layout: semantic gap, alignment, optional scroll | Primary top-to-bottom flow | `<Stack gap="sm" scroll>…</Stack>` |
| `Inline` | composite | Horizontal layout: gap, align, wrap, justify | A row, e.g. header + action | `<Inline justify="between" align="center">…</Inline>` |
| `Grid` | composite | Responsive grid with bounded columns | Metric / summary layouts | `<Grid columns="auto" minColumnWidth={120}>…</Grid>` |
| `Section` | composite | Compact section: heading, description, trailing action | Group content under a label | `<Section heading="Summary" action={…}>…</Section>` |
| `Divider` | composite | Compact divider on `Separator` | Separate sections | `<Divider spacing="sm" />` |

## Typography

| Component | Kind | Purpose | Use when | Example |
|---|---|---|---|---|
| `Text` | composite | Semantic text variants (body/label/supporting/muted/numeric) + truncation | Any text, instead of ad-hoc sizes | `<Text variant="label">Jobs</Text>` |
| `Heading` | composite | Compact heading levels/sizes, correct HTML semantics | Section / view titles | `<Heading level={2} size="md">Overview</Heading>` |
| `Icon` | composite | Icon wrapper for size, tone, accessibility | Render an icon component consistently | `<Icon icon={Clock} size="sm" tone="warning" />` |

## Data display

| Component | Kind | Purpose | Use when | Example |
|---|---|---|---|---|
| `Metric` | composite | Label + value with optional icon, supporting text, trend | Show a number inline | `<Metric label="Jobs" value={6} />` |
| `MetricCard` | composite | Contained surface for a Metric | Give a metric its own card | `<MetricCard><Metric … /></MetricCard>` |
| `MetricGroup` | composite | Arrange metrics responsively | Several metrics that reflow | `<MetricGroup><Metric … /></MetricGroup>` |
| `Status` | composite | Semantic dot / label / pill (neutral·success·warning·error·info) | Health / state indicator | `<Status tone="success">Active</Status>` |
| `Badge` | primitive | Compact counts, tags, category labels (gained success/warning/info) | A count or tag | `<Badge variant="success">Passed</Badge>` |
| `KeyValue` | composite | Aligned label/value row | Metadata, totals, config | `<KeyValue label="Region" value="eu-west-1" mono />` |
| `KeyValueList` | composite | Vertical list of KeyValue rows | A block of metadata | `<KeyValueList><KeyValue … /></KeyValueList>` |
| `ItemList` | composite | Compact rows with media/text/metadata/actions + overflow | Entity lists (files, notes) | `<ItemList overflowCount={3}>…</ItemList>` |
| `ItemListItem` | composite | A single ItemList row | Row inside an ItemList | `<ItemListItem primary="Report.pdf" trailing="2h" />` |
| `ActivityList` | composite | Chronological event list + overflow | Time-ordered activity | `<ActivityList>…</ActivityList>` |
| `ActivityListItem` | composite | Event row: marker/icon, label, timestamp, detail | Row inside an ActivityList | `<ActivityListItem label="Backup" timestamp="08:00" tone="success" />` |
| `ProgressRing` | composite | Accessible circular gauge, no charting dep | A bounded value / rate | `<ProgressRing value={75} label="Success rate" tone="success" />` |
| `StaleIndicator` | composite | "Data may be stale" hint + optional refresh | Data can lag its source | `<StaleIndicator lastUpdated="Updated 5m ago" onRefresh={…} />` |

## Runtime states & feedback

| Component | Kind | Purpose | Use when | Example |
|---|---|---|---|---|
| `DataBoundary` | composite | Selects presentation for loading/ready/empty/stale/error | Switch by data state without fetching | `<DataBoundary state={state} loading={…} empty={…} error={…}>…</DataBoundary>` |
| `EmptyState` | composite | Compact empty state on the Empty primitives | Nothing to show yet | `<EmptyState icon={Inbox} title="No activity yet" />` |
| `Alert` | primitive | Inline warning / error message | Persistent inline message | `<Alert variant="destructive">Failed to load</Alert>` |
| `MetricSkeleton` | composite | Loading placeholder for metrics | `loading` fallback for metrics | `<MetricSkeleton count={3} />` |
| `ListSkeleton` | composite | Loading placeholder for lists | `loading` fallback for item lists | `<ListSkeleton count={4} />` |
| `ActivitySkeleton` | composite | Loading placeholder for activity | `loading` fallback for feeds | `<ActivitySkeleton count={4} />` |
| `Skeleton` | primitive | Bespoke loading shapes | Prebuilt patterns don't fit | `<Skeleton className="h-4 w-24" />` |

## Actions

| Component | Kind | Purpose | Use when | Example |
|---|---|---|---|---|
| `Button` | primitive | Standard text action | A labelled action | `<Button size="sm">Open</Button>` |
| `IconButton` | composite | Icon-only button, required accessible label | Compact action (refresh, dismiss) | `<IconButton icon={RotateCw} label="Refresh" size="xs" />` |
