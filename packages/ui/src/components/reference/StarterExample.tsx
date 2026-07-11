// StarterExample — the smallest useful widget: a headline metric and a
// short list. Copy this as the starting point for a new dashboard widget.
//
// Reference widgets are pure static presentation (fixed sample data, no
// state or controls) so they render identically anywhere. A real widget
// swaps the sample data for state read from its plugin.

import { CheckCircle2 } from "lucide-react";

import {
  ActivityList,
  ActivityListItem,
  Metric,
  Section,
  Stack,
  WidgetContent,
} from "../dashboard";

const RECENT = [
  { id: "a", label: "Nightly build", timestamp: "12m", tone: "success" as const },
  { id: "b", label: "Deploy to staging", timestamp: "1h", tone: "info" as const },
  { id: "c", label: "Dependency audit", timestamp: "3h", tone: "neutral" as const },
];

export function StarterExample() {
  return (
    <WidgetContent>
      <Stack gap="sm">
        <Metric label="Tasks done" value={12} icon={CheckCircle2} tone="success" />

        <Section heading="Recent">
          <ActivityList>
            {RECENT.map((e) => (
              <ActivityListItem
                key={e.id}
                tone={e.tone}
                label={e.label}
                timestamp={e.timestamp}
              />
            ))}
          </ActivityList>
        </Section>
      </Stack>
    </WidgetContent>
  );
}

export default StarterExample;
