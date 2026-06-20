import { useMemo, useState } from 'react';
import { Button, Input } from '@sero-ai/ui';

import type { LoopGoal } from '../../shared/types';
import { StatusBadge } from './StatusBadge';
import '../styles.css';

const PAGE_SIZE = 10;

interface GoalListProps {
  loops: LoopGoal[];
  selectedId: string | null;
  onSelect: (loopId: string) => void;
}

function byUpdatedDesc(a: LoopGoal, b: LoopGoal): number {
  return b.updatedAt.localeCompare(a.updatedAt);
}

export function GoalList({ loops, selectedId, onSelect }: GoalListProps) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? loops.filter(
          (l) => l.title.toLowerCase().includes(q) || l.goal.toLowerCase().includes(q),
        )
      : loops;
    return [...matched].sort(byUpdatedDesc);
  }, [loops, query]);

  const visible = filtered.slice(0, limit);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Pinned search — list paginates rather than growing without bound. */}
      <div className="border-b border-border p-3">
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(PAGE_SIZE);
          }}
          placeholder="Search goals"
          aria-label="Search goals"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            {loops.length === 0 ? 'No goals yet.' : 'No goals match your search.'}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((loop) => (
              <li key={loop.id}>
                <button
                  type="button"
                  onClick={() => onSelect(loop.id)}
                  className={`flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-secondary/40 ${
                    loop.id === selectedId ? 'bg-secondary/60' : ''
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {loop.title}
                  </span>
                  <StatusBadge status={loop.status} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {filtered.length > limit && (
          <div className="p-3">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setLimit((l) => l + PAGE_SIZE)}
            >
              Load more ({filtered.length - limit})
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default GoalList;
