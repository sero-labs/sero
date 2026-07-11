// widgets/WebWidget.tsx, Dashboard widget for recent web activity.
//
// Presentation is composed from @sero-ai/ui dashboard components. The
// provider-brand badge stays plugin-local (it encodes domain-specific colours).

import { useMemo } from 'react';
import { useAppState } from '@sero-ai/app-runtime';
import {
  ActivityList,
  ActivityListItem,
  EmptyState,
  Icon,
  Inline,
  Stack,
  Status,
  Text,
  WidgetContent,
} from '@sero-ai/ui';
import { Globe, Search, FileText, Bookmark, Download } from 'lucide-react';
import type { WebAccessState, WebEntry } from '../../shared/types';
import { DEFAULT_STATE } from '../../shared/types';
import { relativeTime, truncate } from '../lib/format';
import { isVisibleDownload } from '../lib/downloads';
import { ProviderBadge } from '../components/ProviderBadge';
import '../styles.css';

/** Compact label for an entry. */
function entryLabel(entry: WebEntry): string {
  if (entry.type === 'search' && entry.queries?.length) {
    const q = entry.queries;
    if (q.length === 1) return q[0].query;
    return `${q.length} queries`;
  }
  if (entry.urls?.length) {
    const u = entry.urls;
    if (u.length === 1) return u[0].title || u[0].url;
    return `${u.length} URLs`;
  }
  return 'Unknown';
}

function Stat({ icon, value }: { icon: typeof Search; value: number }) {
  return (
    <Inline gap="xs" align="center">
      <Icon icon={icon} size="sm" />
      <Text variant="numeric">{value}</Text>
    </Inline>
  );
}

export function WebWidget() {
  const [state] = useAppState<WebAccessState>(DEFAULT_STATE);

  const searches = useMemo(
    () => state.entries.filter((e) => e.type === 'search').length,
    [state.entries],
  );
  const fetches = useMemo(
    () => state.entries.filter((e) => e.type === 'fetch').length,
    [state.entries],
  );

  const recent = state.entries.slice(0, 4);

  return (
    <WidgetContent>
      <Stack gap="sm" fill>
        <Inline gap="md" align="center" wrap>
          <Stat icon={Search} value={searches} />
          <Stat icon={FileText} value={fetches} />
          <Stat icon={Bookmark} value={state.bookmarks?.length ?? 0} />
          <Stat
            icon={Download}
            value={(state.downloads ?? []).filter(isVisibleDownload).length}
          />
          <Inline gap="xs" align="center" className="ml-auto">
            {(['exa', 'perplexity', 'gemini'] as const).map((p) => (
              <Status
                key={p}
                tone={state.providers[p] ? 'success' : 'neutral'}
                title={`${p}: ${state.providers[p] ? 'available' : 'unavailable'}`}
              />
            ))}
          </Inline>
        </Inline>

        {recent.length === 0 ? (
          <EmptyState icon={Globe} title="No activity yet" />
        ) : (
          <Stack gap="none" scroll>
            <ActivityList overflowCount={Math.max(0, state.entries.length - 4)}>
              {recent.map((entry) => (
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
          </Stack>
        )}
      </Stack>
    </WidgetContent>
  );
}

export default WebWidget;
