import { useMemo, useState } from 'react';
import { Badge, Button, Card, Input } from '@sero-ai/ui';
import { Plus, Search } from 'lucide-react';
import type { Loop } from '../../shared/types';
import { LOOP_STATUS_LABEL, loopStatusVariant } from '../lib/format';

const PAGE = 10;

interface LoopListProps {
  loops: Loop[];
  selectedId: string | null;
  onSelect: (loopId: string) => void;
  onNew: () => void;
}

export function LoopList({ loops, selectedId, onSelect, onNew }: LoopListProps) {
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
            className={`flex flex-col gap-1 rounded-md border p-2 text-left text-sm transition-colors ${
              selectedId === loop.id ? 'border-primary bg-accent' : 'border-transparent hover:bg-accent/50'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-medium">{loop.title}</span>
              <Badge variant={loopStatusVariant(loop.status)}>{LOOP_STATUS_LABEL[loop.status]}</Badge>
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
