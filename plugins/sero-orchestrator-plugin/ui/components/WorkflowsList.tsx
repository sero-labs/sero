/**
 * The Workflows tab: one full-width list, no detail pane beside it.
 *
 * Each row gives the whole title, the state in words, what it waits for, when
 * it last ran and what it has cost. Selecting a row opens that Workflow on its
 * own page, so nothing here says "Select a Workflow from the list."
 */

import { useMemo, useState } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Input } from '@sero-ai/ui/components/ui/input';
import { ArrowUpCircle, Plus, Search } from 'lucide-react';
import { sessionStartedAt } from '@sero-ai/common';
import { DEFAULT_LIBRARY_INDEX } from '../../shared/defaults';
import { WORKFLOWS_LABEL } from '../../shared/labels';
import type { LibraryIndex, LoopSummary } from '../../shared/types';
import { formatCost, formatRelative } from '../lib/format';
import { loopActivity } from '../lib/loop-activity';
import { ActivityWord } from './ActivityWord';
import { ListRow } from './ListRow';
import { NeedsPill } from './NeedsPill';

const PAGE = 10;

interface WorkflowsListProps {
  loops: LoopSummary[];
  /** The watched library index, to flag loops with a newer version available. */
  libraryIndex?: LibraryIndex;
  query: string;
  onQueryChange: (query: string) => void;
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

/** The right-hand facts: when it last ran, how many runs, how many steps, spend. */
/** The middle column: when it ran and how big it is. Money stands alone right. */
function rowMeta(loop: LoopSummary): string {
  const parts: string[] = [];
  if (loop.lastRunAt) parts.push(`Last ran ${formatRelative(loop.lastRunAt)}`);
  if (loop.progress?.total) parts.push(`${loop.progress.total} ${loop.progress.total === 1 ? 'step' : 'steps'}`);
  return parts.join(' · ');
}

/** What this row asks the user for, worded, or nothing. */
function rowAsk(loop: LoopSummary): string | null {
  const input = loop.pendingInput ?? 0;
  const suggestions = loop.pendingSuggestions ?? 0;
  if (input > 0) return `${input} ${input === 1 ? 'question' : 'questions'} to answer`;
  if (suggestions > 0) return `${suggestions} suggested ${suggestions === 1 ? 'change' : 'changes'} to review`;
  return null;
}

export function WorkflowsList({
  loops,
  libraryIndex = DEFAULT_LIBRARY_INDEX,
  query,
  onQueryChange,
  onSelect,
  onNew,
}: WorkflowsListProps) {
  const [shown, setShown] = useState(PAGE);
  const session = useMemo(() => sessionStartedAt(), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? loops.filter((l) => `${l.title} ${l.summary} ${l.prompt}`.toLowerCase().includes(q))
      : loops;
    return [...matched].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [loops, query]);

  const visible = filtered.slice(0, shown);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col gap-3 overflow-auto px-6 py-5">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-room-text3" />
          <Input
            className="h-7 border-room-line-strong bg-room-sunken pl-7 text-xs"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={`Search ${WORKFLOWS_LABEL.toLowerCase()}…`}
          />
        </div>
        <Button size="icon-sm" onClick={onNew} title={`New ${WORKFLOWS_LABEL.toLowerCase().slice(0, -1)}`} aria-label="New workflow">
          <Plus className="size-4" />
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        {visible.length === 0 && (
          <p className="py-4 text-sm text-room-text3">
            {query.trim() ? 'No workflows match your search.' : 'No workflows yet. Create one to get started.'}
          </p>
        )}
        {visible.map((loop) => {
          const activity = loopActivity(loop, session);
          const ask = rowAsk(loop);
          return (
            <ListRow
              key={loop.id}
              title={loop.title}
              attention={ask !== null}
              activity={
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <ActivityWord state={activity.state} word={activity.line} nextStep={activity.nextStep} />
                  {hasUpdate(loop, libraryIndex) ? (
                    <ArrowUpCircle className="size-3.5 text-brand-primary" aria-label="A newer library version is available" />
                  ) : null}
                </span>
              }
              middle={
                ask !== null
                  ? <span className="flex flex-col items-start gap-1.5"><NeedsPill>{ask}</NeedsPill><span>{rowMeta(loop)}</span></span>
                  : rowMeta(loop)
              }
              money={loop.usage?.costUsd != null ? formatCost(loop.usage.costUsd) : ''}
              onClick={() => onSelect(loop.id)}
            />
          );
        })}
        {filtered.length > shown && (
          <Button size="sm" variant="ghost" className="self-start text-xs text-room-text3" onClick={() => setShown((n) => n + PAGE)}>
            Load more ({filtered.length - shown})
          </Button>
        )}
      </div>
    </div>
  );
}
