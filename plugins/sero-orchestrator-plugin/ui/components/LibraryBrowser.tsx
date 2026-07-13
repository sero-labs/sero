import { useMemo, useState } from 'react';
import { Button, Card, Input } from '@sero-ai/ui';
import { Download, History, Search } from 'lucide-react';
import { DEFAULT_LIBRARY_INDEX } from '../../shared/defaults';
import type { LibraryEntrySummary, LibraryIndex } from '../../shared/types';
import { formatTime } from '../lib/format';
import { useWatchedJson } from '../lib/use-watched-json';

const PAGE = 10;

interface LibraryBrowserProps {
  /** Resolved profile-global library dir; null while it is still being fetched. */
  libraryDir: string | null;
  busy: boolean;
  /** Load a chosen entry version into this workspace as a new draft loop. */
  onLoad: (entryId: string, version?: number) => void;
  /** Pre-filled search (the Catalog tab's "in your library" jump). */
  initialQuery?: string;
}

/** Newest-first version numbers for an entry (versions are 1..latest). */
function versionsOf(entry: LibraryEntrySummary): number[] {
  return Array.from({ length: entry.latestVersion }, (_, i) => entry.latestVersion - i);
}

/**
 * The My Library tab: a searchable list of saved loop definitions, shared
 * across all of the profile's workspaces. Load the latest version, or expand
 * an entry to load an older one. The list follows the watched global
 * index.json, so a Save from any workspace shows up here live. Rendered
 * inside LibraryView (which owns the header and the Catalog sibling tab).
 */
export function LibraryBrowser({ libraryDir, busy, onLoad, initialQuery }: LibraryBrowserProps) {
  const index = useWatchedJson<LibraryIndex>(libraryDir ? `${libraryDir}/index.json` : null, DEFAULT_LIBRARY_INDEX);
  const [query, setQuery] = useState(initialQuery ?? '');
  const [shown, setShown] = useState(PAGE);
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? index.entries.filter((e) => `${e.name} ${e.summary}`.toLowerCase().includes(q))
      : index.entries;
    return [...matched].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [index.entries, query]);

  const visible = filtered.slice(0, shown);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-7" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the library…" />
      </div>

      {libraryDir === null ? (
        <p className="px-1 py-6 text-center text-xs text-muted-foreground">Loading the library…</p>
      ) : visible.length === 0 ? (
        <p className="px-1 py-6 text-center text-xs text-muted-foreground">
          {query ? 'No matching saved loops.' : 'No saved loops yet. Save a loop from its detail view to add it here.'}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((entry) => {
            const open = expanded === entry.id;
            return (
              <Card key={entry.id} className="flex flex-col gap-2 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-base font-medium">{entry.name}</div>
                    {entry.summary && <div className="truncate text-xs text-muted-foreground">{entry.summary}</div>}
                    <div className="mt-1 text-sm text-muted-foreground">
                      v{entry.latestVersion} · {entry.versionCount} version(s) · updated {formatTime(entry.updatedAt)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {entry.versionCount > 1 && (
                      <Button
                        size="xs"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setExpanded(open ? null : entry.id)}
                        title="Choose a version"
                      >
                        <History className="mr-1 h-3.5 w-3.5" /> Versions
                      </Button>
                    )}
                    <Button size="xs" disabled={busy} onClick={() => onLoad(entry.id)} title="Load the latest version into this workspace">
                      <Download className="mr-1 h-3.5 w-3.5" /> Load
                    </Button>
                  </div>
                </div>

                {open && entry.versionCount > 1 && (
                  <div className="flex flex-wrap gap-1.5 border-t border-border pt-2">
                    {versionsOf(entry).map((v) => (
                      <Button
                        key={v}
                        size="xs"
                        variant={v === entry.latestVersion ? 'outline' : 'ghost'}
                        disabled={busy}
                        onClick={() => onLoad(entry.id, v)}
                        title={v === entry.latestVersion ? `Load v${v} (latest)` : `Load v${v}`}
                      >
                        v{v}{v === entry.latestVersion ? ' (latest)' : ''}
                      </Button>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
          {filtered.length > shown && (
            <Button size="sm" variant="ghost" onClick={() => setShown((n) => n + PAGE)}>
              Load more ({filtered.length - shown})
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
