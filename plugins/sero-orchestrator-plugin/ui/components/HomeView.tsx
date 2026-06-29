/**
 * Home / mission-control landing (specs/09-ui-redesign.md, A2 hybrid). Leads with
 * the cross-loop "Needs you" queue (questions + suggestions, resolved inline),
 * then the loops overview. Selecting a loop opens the list+detail working surface.
 */

import { useMemo, useState } from 'react';
import { Button, Input } from '@sero-ai/ui';
import { Plus, Search } from 'lucide-react';
import type { LoopSummary, OrchestratorAction } from '../../shared/types';
import { AttentionQueue } from './AttentionQueue';
import { LoopsOverview } from './LoopsOverview';

interface HomeViewProps {
  loops: LoopSummary[];
  busy: boolean;
  onAction: (action: OrchestratorAction) => void;
  onOpenLoop: (loopId: string) => void;
  onNew: () => void;
}

// Show the search field once the overview is large enough that scanning it by
// eye gets tedious; a small workspace stays uncluttered.
const SEARCH_THRESHOLD = 10;

export function HomeView({ loops, busy, onAction, onOpenLoop, onNew }: HomeViewProps) {
  const [query, setQuery] = useState('');
  const questions = loops.reduce((n, l) => n + (l.attention?.input?.questions.length ?? 0), 0);
  const suggestions = loops.reduce((n, l) => n + (l.attention?.suggestions?.length ?? 0), 0);
  const needing = loops.filter((l) => l.attention?.input || l.attention?.suggestions?.length).length;
  const caughtUp = questions === 0 && suggestions === 0;

  // Search filters only the loops overview by title/summary/prompt; the
  // "Needs you" queue always reflects every loop (it must never be hidden).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return loops;
    return loops.filter((l) => `${l.title} ${l.summary} ${l.prompt}`.toLowerCase().includes(q));
  }, [loops, query]);

  const showSearch = loops.length > SEARCH_THRESHOLD;

  return (
    <div className="flex h-full flex-1 flex-col gap-6 overflow-auto p-4">
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Needs you</h2>
            <p className="text-xs text-muted-foreground">
              {caughtUp
                ? "You're all caught up."
                : `${questions} question${questions === 1 ? '' : 's'} · ${suggestions} suggestion${suggestions === 1 ? '' : 's'} across ${needing} loop${needing === 1 ? '' : 's'}`}
            </p>
          </div>
          <Button size="sm" onClick={onNew}><Plus className="mr-1 h-4 w-4" /> New loop</Button>
        </div>
        <AttentionQueue loops={loops} busy={busy} onAction={onAction} onOpenLoop={onOpenLoop} />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Loops</h2>
          {showSearch && (
            <div className="relative w-56">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-7"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search loops…"
              />
            </div>
          )}
        </div>
        {query.trim() && filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No loops match your search.</p>
        ) : (
          <LoopsOverview loops={filtered} onOpenLoop={onOpenLoop} />
        )}
      </section>
    </div>
  );
}
