/**
 * The Workflows list on Home — prototype-style rows (screen 1): dot, title,
 * a live "Step 3 of 6 · <step>" line while running, and schedule + cost as
 * mono meta. Active first; bounded with a "Show more" (paginate, don't
 * scroll).
 */

import { useMemo, useState } from 'react';
import { Button } from '@sero-ai/ui';
import type { OrchestratorScheduleSummary } from '@sero-ai/common';
import type { LoopStatus, LoopSummary } from '../../shared/types';
import { formatCost, formatRelative } from '../lib/format';
import { loopCardStatus } from '../lib/loop-card';
import { LOOP_DOT } from '../lib/list-row-status';
import { WORKFLOWS_LABEL } from '../../shared/labels';
import { ListRow } from './ListRow';
import { SectionHead } from './room-kit';

const STATUS_ORDER: LoopStatus[] = ['active', 'blocked', 'draft', 'complete', 'disabled'];
const PAGE = 8;

/** `daily 02:00` for a plain daily cron; the raw expression otherwise. */
function scheduleLabel(schedule: OrchestratorScheduleSummary): string {
  const parts = schedule.schedule.trim().split(/\s+/);
  if (parts.length === 5 && parts[2] === '*' && parts[3] === '*' && parts[4] === '*'
    && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
    return `daily ${parts[1].padStart(2, '0')}:${parts[0].padStart(2, '0')}`;
  }
  return `cron ${schedule.schedule}`;
}

/** The row subtitle: live step progress while running, the summary otherwise. */
function loopSub(loop: LoopSummary): string {
  const status = loopCardStatus(loop);
  if (status.kind === 'progress') {
    const step = loop.activeStepTitles?.[0];
    return `Step ${status.current} of ${status.total}${step ? ` · ${step}` : ''}`;
  }
  return loop.summary || loop.prompt || status.text;
}

function loopMeta(loop: LoopSummary): string {
  const parts: string[] = [];
  const schedule = loop.schedules?.[0];
  if (schedule) parts.push(scheduleLabel(schedule));
  if (loop.usage?.costUsd != null) parts.push(formatCost(loop.usage.costUsd));
  if (parts.length === 0) parts.push(formatRelative(loop.updatedAt));
  return parts.join(' · ');
}

export function LoopsOverview({ loops, onOpenLoop }: { loops: LoopSummary[]; onOpenLoop: (loopId: string) => void }) {
  const [shown, setShown] = useState(PAGE);
  const sorted = useMemo(() => {
    const rank = new Map(STATUS_ORDER.map((status, i) => [status, i]));
    return loops.toSorted((a, b) =>
      (rank.get(a.status) ?? 99) - (rank.get(b.status) ?? 99) || b.updatedAt.localeCompare(a.updatedAt));
  }, [loops]);

  if (loops.length === 0) {
    return <p className="text-sm text-room-text3">No workflows yet. Create one to get started.</p>;
  }

  return (
    <div className="flex flex-col">
      <SectionHead count={loops.length}>{WORKFLOWS_LABEL}</SectionHead>
      {sorted.slice(0, shown).map((loop) => (
        <ListRow
          key={loop.id}
          status={LOOP_DOT[loop.status]}
          title={loop.title}
          sub={loopSub(loop)}
          needsCount={(loop.pendingInput ?? 0) + (loop.pendingSuggestions ?? 0)}
          meta={loopMeta(loop)}
          onClick={() => onOpenLoop(loop.id)}
        />
      ))}
      {sorted.length > shown && (
        <Button size="sm" variant="ghost" className="self-start text-xs text-room-text3" onClick={() => setShown((n) => n + PAGE)}>
          Show {sorted.length - shown} more
        </Button>
      )}
    </div>
  );
}
