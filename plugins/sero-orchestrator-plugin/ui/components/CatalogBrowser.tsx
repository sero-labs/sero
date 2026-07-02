/**
 * The Catalog tab (spec 14): curated loops from the official Sero repo plus any
 * repos the user added. Opening the tab is the on-demand fetch (cache first,
 * then one refresh — never a timer); install lands a library version and an
 * adapted draft, and navigation jumps straight to it.
 */

import { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Search, X } from 'lucide-react';
import {
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from '@sero-ai/ui';
import type { CatalogRepoContents, CatalogRepoRef } from '../../shared/catalog-types';
import type { LibraryIndex } from '../../shared/types';
import { installState } from '../lib/catalog-summary';
import { CatalogEntryCard } from './CatalogEntryCard';

const PAGE = 10;

/** Result details of a catalog_* dispatch (the tool result's `details`). */
interface CatalogDetails {
  ok?: boolean;
  catalogRepos?: CatalogRepoRef[];
  catalogContents?: CatalogRepoContents[];
  catalogRefresh?: { key: string; stale: boolean; reason?: string }[];
  catalogUpdates?: { slug: string; libraryVersion?: number; skipped?: string }[];
  loop?: { id?: string };
}

interface CatalogBrowserProps {
  busy: boolean;
  libraryIndex: LibraryIndex;
  /** Runs one orchestrator tool call and returns its result details (stable identity). */
  dispatch: (params: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  onOpenLoop: (loopId: string) => void;
  onShowInLibrary: (entryName: string) => void;
}

export function CatalogBrowser({ busy, libraryIndex, dispatch, onOpenLoop, onShowInLibrary }: CatalogBrowserProps) {
  const [repos, setRepos] = useState<CatalogRepoRef[]>([]);
  const [contents, setContents] = useState<CatalogRepoContents[]>([]);
  const [fetchIssues, setFetchIssues] = useState<{ key: string; stale: boolean; reason?: string }[]>([]);
  const [updatesNote, setUpdatesNote] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [addOpen, setAddOpen] = useState(false);
  const [addUrl, setAddUrl] = useState('');

  const apply = (details: CatalogDetails | null) => {
    if (!details || details.ok === false) return;
    if (details.catalogRepos) setRepos(details.catalogRepos);
    if (details.catalogContents) setContents(details.catalogContents);
    if (details.catalogRefresh) setFetchIssues(details.catalogRefresh.filter((r) => r.reason));
    const applied = (details.catalogUpdates ?? []).filter((u) => u.libraryVersion !== undefined);
    if (applied.length > 0) setUpdatesNote(`${applied.length} installed loop(s) got a new version — see their "v available" badge.`);
  };

  // Opening the tab IS the on-demand pull: show the cache instantly, then one
  // refresh over the network. External side effect, so useEffect is correct here.
  useEffect(() => {
    let active = true;
    const load = async () => {
      const cached = (await dispatch({ action: 'catalog_list' })) as CatalogDetails | null;
      if (!active) return;
      apply(cached);
      const refreshed = (await dispatch({ action: 'catalog_refresh' })) as CatalogDetails | null;
      if (!active) return;
      apply(refreshed);
      setFetching(false);
    };
    void load();
    return () => {
      active = false;
    };
  }, [dispatch]);

  const refreshRepo = async (repoKey?: string) => {
    setFetching(true);
    apply((await dispatch({ action: 'catalog_refresh', repoKey })) as CatalogDetails | null);
    setFetching(false);
  };

  const addRepo = async () => {
    const details = (await dispatch({ action: 'catalog_add_repo', url: addUrl.trim() })) as CatalogDetails | null;
    if (!details || details.ok === false) return; // the app-level error banner explains
    setAddOpen(false);
    setAddUrl('');
    await refreshRepo();
  };

  const removeRepo = async (repoKey: string) => {
    apply((await dispatch({ action: 'catalog_remove_repo', repoKey })) as CatalogDetails | null);
    setContents((c) => c.filter((r) => r.repo.key !== repoKey));
  };

  const installEntry = async (repoKey: string, slug: string) => {
    const details = (await dispatch({ action: 'catalog_install', repoKey, slug })) as CatalogDetails | null;
    if (details && details.ok !== false && details.loop?.id) onOpenLoop(details.loop.id);
  };

  const rows = useMemo(() => {
    const all = contents.flatMap((repo) => repo.entries.map((entry) => ({ entry, official: repo.repo.official })));
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(({ entry }) =>
      `${entry.meta.name} ${entry.meta.description} ${(entry.meta.connectors ?? []).join(' ')}`.toLowerCase().includes(q),
    );
  }, [contents, query]);
  const hiddenCount = contents.reduce((n, c) => n + c.problems.length, 0);
  const visible = rows.slice(0, shown);

  return (
    <div className="flex flex-col gap-3">
      {/* Repo management: official baked in, add/refresh/remove for the rest. */}
      <Card className="flex flex-wrap items-center gap-1.5 p-2 text-xs">
        {repos.map((repo) => {
          const issue = fetchIssues.find((i) => i.key === repo.key);
          return (
            <span
              key={repo.key}
              className="flex items-center gap-1 rounded bg-accent/60 px-1.5 py-0.5"
              title={[repo.url, repo.lastFetchedAt ? `fetched ${repo.lastFetchedAt}` : 'never fetched', issue?.reason].filter(Boolean).join('\n')}
            >
              {repo.official ? 'Official' : repo.key}
              {issue && <span className="text-amber-400">{issue.stale ? '(stale copy)' : '(unreachable)'}</span>}
              {!repo.official && (
                <button type="button" title="Remove this catalog (installed loops are kept)" onClick={() => void removeRepo(repo.key)}>
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          );
        })}
        <Button size="xs" variant="ghost" disabled={busy} onClick={() => setAddOpen(true)}>
          <Plus className="mr-0.5 h-3 w-3" /> Add repo
        </Button>
        <Button size="xs" variant="ghost" disabled={busy || fetching} onClick={() => void refreshRepo()} title="Pull all catalog repos now">
          <RefreshCw className={`mr-0.5 h-3 w-3 ${fetching ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </Card>

      {updatesNote && (
        <div className="flex items-center justify-between rounded bg-accent/40 px-2 py-1 text-xs">
          <span>{updatesNote}</span>
          <button type="button" className="underline" onClick={() => setUpdatesNote(null)}>dismiss</button>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-7" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the catalog…" />
      </div>

      {visible.length === 0 ? (
        <p className="px-1 py-6 text-center text-xs text-muted-foreground">
          {fetching ? 'Fetching catalogs…' : query ? 'No matching catalog loops.' : 'No catalog entries yet. Refresh, or add a catalog repo.'}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map(({ entry, official }) => (
            <CatalogEntryCard
              key={`${entry.repoKey}/${entry.meta.slug}`}
              entry={entry}
              official={official}
              state={installState(entry.repoKey, entry.meta, libraryIndex)}
              busy={busy}
              onInstall={() => void installEntry(entry.repoKey, entry.meta.slug)}
              onShowInLibrary={onShowInLibrary}
            />
          ))}
          {rows.length > shown && (
            <Button size="sm" variant="ghost" onClick={() => setShown((n) => n + PAGE)}>
              Load more ({rows.length - shown})
            </Button>
          )}
        </div>
      )}
      {hiddenCount > 0 && (
        <p
          className="px-1 text-[11px] text-muted-foreground"
          title={contents.flatMap((c) => c.problems.map((p) => `${c.repo.key}/${p.slug}: ${p.reason}`)).join('\n')}
        >
          {hiddenCount} entr(ies) hidden — malformed in their catalog repo (hover for reasons).
        </p>
      )}

      {/* FR-C6: adding a third-party repo takes one explicit confirmation. */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add a catalog repo</DialogTitle>
            <DialogDescription>
              Any git repo with the catalog layout works — a private repo becomes your team catalog. Entries from it
              are not reviewed by Sero: every install still lands as a draft you review before it can run, and
              external sends stay approval-gated.
            </DialogDescription>
          </DialogHeader>
          <Input value={addUrl} placeholder="https://github.com/your-org/your-catalog.git" onChange={(e) => setAddUrl(e.target.value)} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button disabled={busy || !addUrl.trim()} onClick={() => void addRepo()}>Add this catalog</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
