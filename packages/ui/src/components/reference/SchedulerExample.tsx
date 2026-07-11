// SchedulerExample — layout, metric cards, a gauge and an activity group.
//
// Pure static presentation (fixed sample data, no state or controls); a real
// scheduler widget would read jobs and run stats from its plugin.

import { ExternalLink } from "lucide-react";

import {
  ActivityList,
  ActivityListItem,
  DataBoundary,
  Divider,
  Inline,
  Metric,
  MetricCard,
  ProgressRing,
  Section,
  Stack,
  StaleIndicator,
  Status,
  WidgetContent,
} from "../dashboard";
import { Button } from "../ui/button";

const UPCOMING = [
  { id: "a", label: "Daily backup", timestamp: "08:00", tone: "success" as const },
  { id: "b", label: "Publish report", timestamp: "in 2h", tone: "info" as const },
  { id: "c", label: "Rotate API keys", timestamp: "tomorrow", tone: "warning" as const },
];

export function SchedulerExample() {
  return (
    <WidgetContent>
      <Stack gap="sm">
        <Inline justify="between" align="center">
          <Status tone="success" pulse>
            Scheduler active
          </Status>
          <ProgressRing value={92} label="Success rate" tone="success" size={40} />
        </Inline>

        <Section heading="Summary">
          <Inline gap="sm" wrap>
            <MetricCard className="flex-1">
              <Metric label="Jobs" value={6} />
            </MetricCard>
            <MetricCard className="flex-1">
              <Metric
                label="Runs today"
                value={18}
                trend={{ direction: "up", value: "+4", tone: "success" }}
              />
            </MetricCard>
          </Inline>
        </Section>

        <Divider />

        <Section
          heading="Next up"
          action={
            <Button size="xs" variant="ghost">
              <ExternalLink className="size-3" />
              All
            </Button>
          }
        >
          <DataBoundary state="ready">
            <ActivityList>
              {UPCOMING.map((e) => (
                <ActivityListItem
                  key={e.id}
                  tone={e.tone}
                  label={e.label}
                  timestamp={e.timestamp}
                />
              ))}
            </ActivityList>
          </DataBoundary>
        </Section>

        <StaleIndicator lastUpdated="Updated 2m ago" />
      </Stack>
    </WidgetContent>
  );
}

export default SchedulerExample;
