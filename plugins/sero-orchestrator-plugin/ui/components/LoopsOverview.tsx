/**
 * The loops overview on the home view (specs/09-ui-redesign.md): every loop as a
 * compact card, grouped by status (active first), with the needs-you signals.
 * Clicking a card opens its detail.
 */

import { useMemo } from 'react';
import { Card } from '@sero-ai/ui';
import type { LoopStatus, LoopSummary } from '../../shared/types';
import { LOOP_STATUS_STYLE } from '../lib/status-style';
import { LoopStatusBadge, NeedsYouBadge, StatusDot } from './StatusBadge';

const STATUS_ORDER: LoopStatus[] = ['active', 'blocked', 'draft', 'complete', 'disabled'];

export function LoopsOverview({ loops, onOpenLoop }: { loops: LoopSummary[]; onOpenLoop: (loopId: string) => void }) {
  const grouped = useMemo(() => {
    const byStatus = new Map<LoopStatus, LoopSummary[]>();
    for (const loop of loops) {
      (byStatus.get(loop.status) ?? byStatus.set(loop.status, []).get(loop.status)!).push(loop);
    }
    for (const list of byStatus.values()) list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return STATUS_ORDER.filter((s) => byStatus.has(s)).map((s) => ({ status: s, loops: byStatus.get(s)! }));
  }, [loops]);

  if (loops.length === 0) {
    return <p className="text-sm text-muted-foreground">No loops yet. Create one to get started.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {grouped.map(({ status, loops: group }) => (
        <div key={status} className="flex flex-col gap-2">
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <StatusDot status={status} /> {LOOP_STATUS_STYLE[status].label} · {group.length}
          </span>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {group.map((loop) => (
              <Card
                key={loop.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpenLoop(loop.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenLoop(loop.id); } }}
                className="flex cursor-pointer flex-col gap-1.5 p-3 transition-colors hover:bg-accent/50"
              >
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{loop.title}</span>
                  <div className="ml-auto flex shrink-0 items-center gap-1.5">
                    <NeedsYouBadge kind="input" count={loop.pendingInput ?? 0} />
                    <NeedsYouBadge kind="suggestions" count={loop.pendingSuggestions ?? 0} />
                    <LoopStatusBadge status={loop.status} />
                  </div>
                </div>
                <p className="line-clamp-2 text-xs text-muted-foreground">{loop.summary || loop.prompt}</p>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
