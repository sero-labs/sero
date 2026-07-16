// WebApp.tsx, Main Sero UI for the web access plugin.
// Two tabs: History (search/fetch results) and Bookmarks.

import { useState, useMemo } from 'react';
import { useAppState } from '@sero-ai/app-runtime';
import { cn } from '@sero-ai/ui/lib/utils';
import { Globe, Search as SearchIcon, FileText, Bookmark, Download } from 'lucide-react';
import type { WebAccessState } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';
import { SearchHistory } from './components/SearchHistory';
import { BookmarkList } from './components/BookmarkList';
import { DownloadsList } from './components/DownloadsList';
import { isVisibleDownload } from './lib/downloads';
import './styles.css';

type Tab = 'history' | 'bookmarks' | 'downloads';

export function WebApp() {
  const [state] = useAppState<WebAccessState>(DEFAULT_STATE);
  const [activeTab, setActiveTab] = useState<Tab>('history');

  const stats = useMemo(() => {
    const searches = state.entries.filter((e) => e.type === 'search').length;
    const fetches = state.entries.filter((e) => e.type === 'fetch').length;
    return {
      searches,
      fetches,
      bookmarks: state.bookmarks?.length ?? 0,
      downloads: (state.downloads ?? []).filter(isVisibleDownload).length,
    };
  }, [state.entries, state.bookmarks, state.downloads]);

  return (
    <div className="flex size-full flex-col bg-background">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Globe className="size-4 text-muted-foreground" />
          <h1 className="text-base font-semibold text-foreground">Web Access</h1>
        </div>

        {/* Stats row */}
        <div className="mt-2 flex items-center gap-4">
          <StatBadge icon={<SearchIcon className="size-3" />} label="searches" count={stats.searches} color="text-blue-400" />
          <StatBadge icon={<FileText className="size-3" />} label="fetches" count={stats.fetches} color="text-amber-400" />
          <StatBadge icon={<Bookmark className="size-3" />} label="bookmarks" count={stats.bookmarks} color="text-emerald-400" />
          <StatBadge icon={<Download className="size-3" />} label="downloads" count={stats.downloads} color="text-violet-400" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 border-b border-border">
        <TabButton
          label="History"
          icon={<SearchIcon className="size-3.5" />}
          active={activeTab === 'history'}
          count={state.entries.length}
          onClick={() => setActiveTab('history')}
        />
        <TabButton
          label="Bookmarks"
          icon={<Bookmark className="size-3.5" />}
          active={activeTab === 'bookmarks'}
          count={stats.bookmarks}
          onClick={() => setActiveTab('bookmarks')}
        />
        <TabButton
          label="Downloads"
          icon={<Download className="size-3.5" />}
          active={activeTab === 'downloads'}
          count={stats.downloads}
          onClick={() => setActiveTab('downloads')}
        />
      </div>

      {/* Tab content */}
      <div className="flex min-h-0 flex-1 flex-col">
        {activeTab === 'history' && <SearchHistory entries={state.entries} />}
        {activeTab === 'bookmarks' && <BookmarkList bookmarks={state.bookmarks ?? []} />}
        {activeTab === 'downloads' && <DownloadsList downloads={state.downloads ?? []} />}
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────

interface TabButtonProps {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  count: number;
  onClick: () => void;
}

function TabButton({ label, icon, active, count, onClick }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-1 items-center justify-center gap-2 px-3 py-2 text-xs font-medium transition-colors',
        active
          ? 'border-b-2 border-primary text-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      {label}
      {count > 0 && (
        <span className={cn(
          'rounded-full px-1.5 py-0 text-sm leading-4 tabular-nums',
          active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
        )}>
          {count}
        </span>
      )}
    </button>
  );
}

interface StatBadgeProps {
  icon: React.ReactNode;
  label: string;
  count: number;
  color?: string;
}

function StatBadge({ icon, label, count, color }: StatBadgeProps) {
  return (
    <div className={cn('flex items-center gap-1.5', color ?? 'text-muted-foreground')}>
      {icon}
      <span className="text-xs tabular-nums text-muted-foreground">
        <span className={cn('font-semibold', color ?? 'text-foreground')}>{count}</span> {label}
      </span>
    </div>
  );
}

export default WebApp;
