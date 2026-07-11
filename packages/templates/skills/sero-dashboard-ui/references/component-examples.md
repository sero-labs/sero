# Dashboard component examples

Worked examples of composing the shared `@sero-ai/ui` dashboard components. The
runnable, glass-styled versions ship as the reference set (`@sero-ai/ui/reference`,
in `packages/ui/src/components/reference/`) and are previewed in `apps/styleguide`.

## A complete widget

```tsx
import {
  ActivityList, ActivityListItem, DataBoundary, Divider, Inline,
  Metric, MetricCard, ProgressRing, Section, Stack, StaleIndicator,
  Status, WidgetContent,
} from '@sero-ai/ui';

export function SchedulerWidget() {
  return (
    <WidgetContent>
      <Stack gap="sm">
        <Inline justify="between" align="center">
          <Status tone="success" pulse>Scheduler active</Status>
          <ProgressRing value={92} label="Success rate" tone="success" size={40} />
        </Inline>

        <Section heading="Summary">
          <Inline gap="sm" wrap>
            <MetricCard className="flex-1"><Metric label="Jobs" value={6} /></MetricCard>
            <MetricCard className="flex-1">
              <Metric label="Runs" value={18} trend={{ direction: 'up', value: '+4', tone: 'success' }} />
            </MetricCard>
          </Inline>
        </Section>

        <Divider />

        <Section heading="Next up">
          <ActivityList>
            <ActivityListItem tone="success" label="Daily backup" timestamp="08:00" />
            <ActivityListItem tone="info" label="Publish report" timestamp="in 2h" />
          </ActivityList>
        </Section>

        <StaleIndicator lastUpdated="Updated 2m ago" onRefresh={() => {}} />
      </Stack>
    </WidgetContent>
  );
}
```

## Runtime states with DataBoundary

`DataBoundary` selects presentation; it does not fetch. Pass the current state
and the fallbacks. Populated content is the children.

```tsx
import {
  Alert, AlertTitle, DataBoundary, EmptyState, ItemList, ItemListItem,
  ListSkeleton, Stack, WidgetContent, type DataState,
} from '@sero-ai/ui';
import { Inbox } from 'lucide-react';

export function FilesWidget({ state, files }: { state: DataState; files: File[] }) {
  return (
    <WidgetContent>
      <Stack gap="none" scroll>
        <DataBoundary
          state={state}
          loading={<ListSkeleton count={3} />}
          empty={<EmptyState icon={Inbox} title="No recent files" />}
          error={<Alert variant="destructive"><AlertTitle>Could not load files</AlertTitle></Alert>}
        >
          <ItemList>
            {files.map((f) => (
              <ItemListItem key={f.id} primary={f.name} trailing={f.age} />
            ))}
          </ItemList>
        </DataBoundary>
      </Stack>
    </WidgetContent>
  );
}
```

## Metrics and gauges

```tsx
import { Grid, Metric, MetricGroup, ProgressRing, Stack, Text } from '@sero-ai/ui';

// Reflowing metric row
<MetricGroup>
  <Metric label="CPU" value="42%" tone="success" />
  <Metric label="Memory" value="6.1 GB" />
  <Metric label="Disk" value="71%" tone="warning" />
</MetricGroup>

// Labelled gauges in a fixed grid
<Grid columns={3} gap="sm">
  {rings.map((r) => (
    <Stack key={r.label} gap="xs" align="center">
      <ProgressRing value={r.value} label={r.label} tone={r.tone} />
      <Text variant="muted">{r.label}</Text>
    </Stack>
  ))}
</Grid>
```

## Status and tones

Map a domain status onto a semantic `Tone` — never encode a plugin-specific name
in the component.

```tsx
import { Status, type Tone } from '@sero-ai/ui';

function jobTone(status: 'queued' | 'running' | 'failed' | 'done'): Tone {
  switch (status) {
    case 'done': return 'success';
    case 'failed': return 'error';
    case 'running': return 'info';
    default: return 'neutral';
  }
}

<Status tone={jobTone(job.status)}>{job.status}</Status>
<Status tone="warning" variant="pill">Degraded</Status>
```

## Key/value metadata

```tsx
import { KeyValue, KeyValueList, Status } from '@sero-ai/ui';

<KeyValueList>
  <KeyValue label="Region" value="eu-west-1" mono />
  <KeyValue label="Uptime" value="14d 6h" mono />
  <KeyValue label="Status" value={<Status tone="success">Healthy</Status>} />
</KeyValueList>
```
