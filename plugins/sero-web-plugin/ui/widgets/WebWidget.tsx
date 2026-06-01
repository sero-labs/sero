// widgets/WebWidget.tsx, Dashboard widget for recent web activity.

import { useMemo } from 'react';
import { useAppState } from '@sero-ai/app-runtime';
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
    <div className="flex h-full flex-col gap-2 p-3">
      {/* Stats header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Search className="size-3 text-muted-foreground" />
          <span className="text-sm font-bold tabular-nums text-foreground">
            {searches}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <FileText className="size-3 text-muted-foreground" />
          <span className="text-sm font-bold tabular-nums text-foreground">
            {fetches}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Bookmark className="size-3 text-muted-foreground" />
          <span className="text-sm font-bold tabular-nums text-foreground">
            {state.bookmarks?.length ?? 0}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Download className="size-3 text-muted-foreground" />
          <span className="text-sm font-bold tabular-nums text-foreground">
            {(state.downloads ?? []).filter(isVisibleDownload).length}
          </span>
        </div>
        {/* Provider dots */}
        <div className="ml-auto flex items-center gap-1.5">
          {(['exa', 'perplexity', 'gemini'] as const).map((p) => (
            <div
              key={p}
              className={`size-1.5 rounded-full ${
                state.providers[p]
                  ? 'bg-emerald-400'
                  : 'bg-muted-foreground/20'
              }`}
              title={`${p}: ${state.providers[p] ? 'available' : 'unavailable'}`}
            />
          ))}
        </div>
      </div>

      {/* Recent entries */}
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-auto">
        {recent.length === 0 && (
          <div className="flex flex-1 items-center justify-center">
            <span className="text-[11px] text-muted-foreground/60">
              No activity yet
            </span>
          </div>
        )}
        {recent.map((entry) => {
          const Icon = entry.type === 'search' ? Globe : FileText;
          return (
            <div
              key={entry.id}
              className="flex items-center gap-2 rounded-md bg-secondary/40 px-2 py-1"
            >
              <Icon className="size-2.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">
                {truncate(entryLabel(entry), 40)}
              </span>
              {entry.type === 'search' && entry.queries?.[0]?.provider && (
                <ProviderBadge provider={entry.queries[0].provider} />
              )}
              <span className="shrink-0 text-[10px] text-muted-foreground/60">
                {relativeTime(entry.timestamp)}
              </span>
            </div>
          );
        })}
        {state.entries.length > 4 && (
          <span className="text-center text-[10px] text-muted-foreground/50">
            +{state.entries.length - 4} more
          </span>
        )}
      </div>
    </div>
  );
}

export default WebWidget;
