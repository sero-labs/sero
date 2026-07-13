/**
 * The loops overview on the home view (specs/09-ui-redesign.md): every loop as a
 * compact card, grouped by status (active first). Active runs show a live progress
 * bar; other loops show a status line. Needs-you signals and a blocked tint draw
 * the eye. Clicking a card opens its detail. Each group is bounded (last-N by
 * recency) with a "Show more" — no unbounded scroll (the "paginate, don't scroll"
 * rule the sidebar LoopList follows).
 */

import { useMemo, useState } from 'react';
import { Button, Card } from '@sero-ai/ui';
import type { LoopStatus, LoopSummary } from '../../shared/types';
import { formatRelative } from '../lib/format';
import { LOOP_STATUS_STYLE } from '../lib/status-style';
import { loopCardStatus } from '../lib/loop-card';
import { NeedsYouBadge, StatusDot } from './StatusBadge';

const STATUS_ORDER: LoopStatus[] = ['active', 'blocked', 'draft', 'complete', 'disabled'];
const GROUP_PAGE = 9; // 3 rows on the widest grid; a "Show more" reveals the rest.

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
    return <p className="text-base text-muted-foreground">No loops yet. Create one to get started.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {grouped.map(({ status, loops: group }) => (
        <StatusGroup key={status} status={status} loops={group} onOpenLoop={onOpenLoop} />
      ))}
    </div>
  );
}

/** One status section, capped at GROUP_PAGE with an incremental "Show more". */
function StatusGroup({ status, loops, onOpenLoop }: { status: LoopStatus; loops: LoopSummary[]; onOpenLoop: (loopId: string) => void }) {
  const [shown, setShown] = useState(GROUP_PAGE);
  const visible = loops.slice(0, shown);

  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <StatusDot status={status} /> {LOOP_STATUS_STYLE[status].label} · {loops.length}
      </span>
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((loop) => <LoopCard key={loop.id} loop={loop} onOpen={onOpenLoop} />)}
      </div>
      {loops.length > shown && (
        <Button size="sm" variant="ghost" className="self-start" onClick={() => setShown((n) => n + GROUP_PAGE)}>
          Show {loops.length - shown} more
        </Button>
      )}
    </div>
  );
}

function LoopCard({ loop, onOpen }: { loop: LoopSummary; onOpen: (loopId: string) => void }) {
  const tint =
    loop.status === 'blocked' ? 'border-amber-500/30 bg-amber-500/[0.04]' : loop.status === 'disabled' ? 'opacity-60' : '';
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onOpen(loop.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(loop.id); } }}
      className={`flex min-h-[92px] cursor-pointer flex-col gap-2 p-3.5 transition-colors hover:bg-accent/40 ${tint}`}
    >
      <div className="flex items-center gap-2">
        <StatusDot status={loop.status} />
        <span className="truncate text-base font-medium">{loop.title}</span>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <NeedsYouBadge kind="input" count={loop.pendingInput ?? 0} />
          <NeedsYouBadge kind="suggestions" count={loop.pendingSuggestions ?? 0} />
        </div>
      </div>
      <p className="line-clamp-1 text-xs text-muted-foreground">{loop.summary || loop.prompt}</p>
      <CardStatusLine loop={loop} />
    </Card>
  );
}

/** A live progress bar while running, otherwise a status line in the card footer. */
function CardStatusLine({ loop }: { loop: LoopSummary }) {
  const status = loopCardStatus(loop);
  if (status.kind === 'progress') {
    return (
      <div className="mt-auto flex flex-col gap-1">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${(status.done / status.total) * 100}%` }} />
        </div>
        <span className="text-sm text-emerald-400/90">step {status.current} / {status.total}</span>
      </div>
    );
  }
  const rel = status.showRelativeTime ? formatRelative(loop.updatedAt) : '';
  const text = rel ? `${status.text} · ${rel}` : status.text;
  return <span className={`mt-auto text-sm ${status.tone === 'blocked' ? 'text-amber-400' : 'text-muted-foreground'}`}>{text}</span>;
}
