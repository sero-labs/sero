// widgets/WebWidget.tsx, Dashboard widget for recent web activity.
//
// A tabbed view over the plugin's data: recent Activity, saved Bookmarks and
// Downloads. Each tab's trigger carries its count; bookmark and download rows
// open their URL in the browser on click. Presentation is composed from
// @sero-ai/ui — the provider badge stays plugin-local (brand colours).

import { useMemo, useState } from 'react';
import { useAppState } from '@sero-ai/app-runtime';
import {
  ActivityList,
  ActivityListItem,
  DataBoundary,
  EmptyState,
  Inline,
  Stack,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  WidgetContent,
  type Tone,
} from '@sero-ai/ui';
import { Globe, FileText, Bookmark as BookmarkIcon, Download } from 'lucide-react';
import type { WebAccessState, WebEntry, WebDownload } from '../../shared/types';
import { DEFAULT_STATE } from '../../shared/types';
import { relativeTime, truncate } from '../lib/format';
import { isVisibleDownload } from '../lib/downloads';
import { ProviderBadge } from '../components/ProviderBadge';
import '../styles.css';

/** How many rows each tab peeks before "+N more". */
const SHOWN = 5;

type TabKey = 'activity' | 'bookmarks' | 'downloads';

/** Compact label for an activity entry. */
function entryLabel(entry: WebEntry): string {
  if (entry.type === 'search' && entry.queries?.length) {
    const q = entry.queries;
    return q.length === 1 ? q[0].query : `${q.length} queries`;
  }
  if (entry.urls?.length) {
    const u = entry.urls;
    return u.length === 1 ? u[0].title || u[0].url : `${u.length} URLs`;
  }
  return 'Unknown';
}

/** Row-filling external link — the whole row becomes the click target. */
function OpenLink({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={url}
      className="truncate after:absolute after:inset-0 hover:underline"
    >
      {children}
    </a>
  );
}

export function WebWidget() {
  const [state] = useAppState<WebAccessState>(DEFAULT_STATE);
  const [tab, setTab] = useState<TabKey>('activity');

  const entries = state.entries;
  const bookmarks = useMemo(
    () => (state.bookmarks ?? []).toSorted((a, b) => b.createdAt - a.createdAt),
    [state.bookmarks],
  );
  const downloads = useMemo(
    () => (state.downloads ?? [])
      .filter(isVisibleDownload)
      .toSorted((a, b) => b.updatedAt - a.updatedAt),
    [state.downloads],
  );

  return (
    <WidgetContent>
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as TabKey)}
        className="min-h-0 flex-1"
      >
        <TabsList variant="line" className="w-full">
          <TabTrigger value="activity" label="Activity" count={entries.length} />
          <TabTrigger value="bookmarks" label="Bookmarks" count={bookmarks.length} />
          <TabTrigger value="downloads" label="Downloads" count={downloads.length} />
        </TabsList>

        <TabsContent value="activity" className="flex min-h-0 flex-col">
          <Stack gap="none" scroll>
            <DataBoundary
              state={entries.length === 0 ? 'empty' : 'ready'}
              empty={<EmptyState icon={Globe} title="No activity yet" />}
            >
              <ActivityList overflowCount={Math.max(0, entries.length - SHOWN)}>
                {entries.slice(0, SHOWN).map((entry) => (
                  <ActivityListItem
                    key={entry.id}
                    icon={entry.type === 'search' ? Globe : FileText}
                    label={truncate(entryLabel(entry), 40)}
                    timestamp={
                      <Inline gap="xs" align="center">
                        {entry.type === 'search' && entry.queries?.[0]?.provider && (
                          <ProviderBadge provider={entry.queries[0].provider} />
                        )}
                        <span>{relativeTime(entry.timestamp)}</span>
                      </Inline>
                    }
                  />
                ))}
              </ActivityList>
            </DataBoundary>
          </Stack>
        </TabsContent>

        <TabsContent value="bookmarks" className="flex min-h-0 flex-col">
          <Stack gap="none" scroll>
            <DataBoundary
              state={bookmarks.length === 0 ? 'empty' : 'ready'}
              empty={<EmptyState icon={BookmarkIcon} title="No bookmarks" />}
            >
              <ActivityList overflowCount={Math.max(0, bookmarks.length - SHOWN)}>
                {bookmarks.slice(0, SHOWN).map((b) => (
                  <ActivityListItem
                    key={b.id}
                    className="relative"
                    icon={BookmarkIcon}
                    tone="success"
                    label={<OpenLink url={b.url}>{b.title || b.url}</OpenLink>}
                    timestamp={relativeTime(b.createdAt)}
                  />
                ))}
              </ActivityList>
            </DataBoundary>
          </Stack>
        </TabsContent>

        <TabsContent value="downloads" className="flex min-h-0 flex-col">
          <Stack gap="none" scroll>
            <DataBoundary
              state={downloads.length === 0 ? 'empty' : 'ready'}
              empty={<EmptyState icon={Download} title="No downloads" />}
            >
              <ActivityList overflowCount={Math.max(0, downloads.length - SHOWN)}>
                {downloads.slice(0, SHOWN).map((d) => (
                  <ActivityListItem
                    key={d.id}
                    className="relative"
                    icon={Download}
                    tone={downloadTone(d.status)}
                    label={<OpenLink url={d.sourceUrl}>{d.title || d.sourceUrl}</OpenLink>}
                    timestamp={relativeTime(d.updatedAt)}
                  />
                ))}
              </ActivityList>
            </DataBoundary>
          </Stack>
        </TabsContent>
      </Tabs>
    </WidgetContent>
  );
}

/** A tab trigger with a trailing count. */
function TabTrigger({ value, label, count }: { value: TabKey; label: string; count: number }) {
  return (
    <TabsTrigger value={value}>
      <span className="truncate">{label}</span>
      <span className="text-sm tabular-nums opacity-60">{count}</span>
    </TabsTrigger>
  );
}

/** Tone for a download's leading icon, encoding its status by colour. */
function downloadTone(status: WebDownload['status']): Tone {
  switch (status) {
    case 'completed':
      return 'success';
    case 'error':
      return 'error';
    default:
      return 'info';
  }
}

export default WebWidget;
