import { useMemo, useState } from 'react';
import { Button, Input } from '@sero-ai/ui';
import { ArrowUpCircle, Plus, Search } from 'lucide-react';
import { DEFAULT_LIBRARY_INDEX } from '../../shared/defaults';
import type { LibraryIndex, LoopSummary } from '../../shared/types';
import { LoopStatusBadge, NeedsYouBadge } from './StatusBadge';

const PAGE = 10;

interface LoopListProps {
  loops: LoopSummary[];
  /** The watched library index, to flag loops with a newer version available. */
  libraryIndex?: LibraryIndex;
  selectedId: string | null;
  onSelect: (loopId: string) => void;
  onNew: () => void;
}

/** True when a linked loop's entry has a version newer than the one it is on. */
function hasUpdate(loop: LoopSummary, index: LibraryIndex): boolean {
  const link = loop.libraryLink;
  if (!link) return false;
  const entry = index.entries.find((e) => e.id === link.entryId);
  return !!entry && entry.latestVersion > link.version;
}

export function LoopList({ loops, libraryIndex = DEFAULT_LIBRARY_INDEX, selectedId, onSelect, onNew }: LoopListProps) {
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? loops.filter((l) => `${l.title} ${l.summary} ${l.prompt}`.toLowerCase().includes(q))
      : loops;
    // Most recent first.
    return [...matched].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [loops, query]);

  const visible = filtered.slice(0, shown);

  return (
    <div className="flex h-full w-72 shrink-0 flex-col gap-2 border-r border-border p-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-7"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search loops…"
          />
        </div>
        <Button size="icon" variant="outline" onClick={onNew} title="New loop">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-1 flex-col gap-1 overflow-auto">
        {visible.length === 0 && (
          <p className="px-1 py-4 text-xs text-muted-foreground">No loops yet. Create one to get started.</p>
        )}
        {visible.map((loop) => (
          <button
            key={loop.id}
            type="button"
            onClick={() => onSelect(loop.id)}
            className={`flex flex-col gap-1 rounded-md border p-2 text-left text-base transition-colors ${
              selectedId === loop.id ? 'border-primary bg-accent' : 'border-transparent hover:bg-accent/50'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-medium">{loop.title}</span>
              <div className="flex shrink-0 items-center gap-1.5">
                {hasUpdate(loop, libraryIndex) ? (
                  <ArrowUpCircle className="h-3.5 w-3.5 text-primary" aria-label="A newer library version is available" />
                ) : null}
                <NeedsYouBadge kind="input" count={loop.pendingInput ?? 0} />
                <NeedsYouBadge kind="suggestions" count={loop.pendingSuggestions ?? 0} />
                <LoopStatusBadge status={loop.status} />
              </div>
            </div>
            <span className="truncate text-xs text-muted-foreground">{loop.summary || loop.prompt}</span>
          </button>
        ))}
        {filtered.length > shown && (
          <Button size="sm" variant="ghost" onClick={() => setShown((n) => n + PAGE)}>
            Load more ({filtered.length - shown})
          </Button>
        )}
      </div>
    </div>
  );
}
