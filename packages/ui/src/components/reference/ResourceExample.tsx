// ResourceExample — a grid, gauges, key/value metadata and headings.
//
// Pure static presentation; a real resource monitor would read live host
// metrics from its plugin.

import {
  Divider,
  Grid,
  Heading,
  KeyValue,
  KeyValueList,
  Metric,
  MetricGroup,
  ProgressRing,
  Section,
  Stack,
  Status,
  Text,
  WidgetContent,
} from "../dashboard";

function Ring({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "success" | "info" | "warning";
}) {
  return (
    <Stack gap="xs" align="center">
      <ProgressRing value={value} label={label} tone={tone} />
      <Text variant="muted">{label}</Text>
    </Stack>
  );
}

export function ResourceExample() {
  return (
    <WidgetContent scroll>
      <Stack gap="sm">
        <Heading level={2} size="md">
          Resources
        </Heading>

        <MetricGroup>
          <Metric label="CPU" value="42%" tone="success" />
          <Metric label="Memory" value="6.1 GB" />
          <Metric label="Disk" value="71%" tone="warning" />
        </MetricGroup>

        <Divider />

        <Section heading="Usage">
          <Grid columns={3} gap="sm">
            <Ring value={42} label="CPU" tone="success" />
            <Ring value={61} label="Memory" tone="info" />
            <Ring value={71} label="Disk" tone="warning" />
          </Grid>
        </Section>

        <Divider />

        <Section heading="Host">
          <KeyValueList>
            <KeyValue label="Region" value="eu-west-1" mono />
            <KeyValue label="Instance" value="c7g.xlarge" mono />
            <KeyValue label="Uptime" value="14d 6h" mono />
            <KeyValue label="Status" value={<Status tone="success">Healthy</Status>} />
          </KeyValueList>
        </Section>
      </Stack>
    </WidgetContent>
  );
}

export default ResourceExample;
