// ActivityExample — a scrollable item list with a header count and a
// footer status row.
//
// Pure static presentation; a real feed would wire its rows through a
// DataBoundary (loading / empty / error) driven by plugin state. See the
// runtime-state components in the catalogue for those slots.

import { FileText } from "lucide-react";

import {
  Inline,
  ItemList,
  ItemListItem,
  Stack,
  StaleIndicator,
  Status,
  Text,
  WidgetContent,
} from "../dashboard";
import { Badge } from "../ui/badge";

const ITEMS = [
  { id: "1", title: "quarterly-report.pdf", meta: "2h", badge: "PDF" },
  { id: "2", title: "design-tokens.json", meta: "5h", badge: "JSON" },
  { id: "3", title: "release-notes.md", meta: "1d", badge: "MD" },
];

export function ActivityExample() {
  return (
    <WidgetContent>
      <Stack gap="sm" fill>
        <Inline justify="between" align="center">
          <Inline gap="xs" align="center">
            <Text variant="label">Recent files</Text>
            <Badge variant="info">{ITEMS.length}</Badge>
          </Inline>
        </Inline>

        <Stack gap="none" scroll>
          <ItemList>
            {ITEMS.map((f) => (
              <ItemListItem
                key={f.id}
                leading={<FileText className="size-4 text-[var(--text-muted)]" />}
                primary={f.title}
                trailing={
                  <Inline gap="xs" align="center">
                    <Badge variant="secondary">{f.badge}</Badge>
                    <span>{f.meta}</span>
                  </Inline>
                }
              />
            ))}
          </ItemList>
        </Stack>

        <Inline justify="between" align="center">
          <Status tone="info" variant="pill">
            Synced
          </Status>
          <StaleIndicator lastUpdated="Synced 30s ago" />
        </Inline>
      </Stack>
    </WidgetContent>
  );
}

export default ActivityExample;
