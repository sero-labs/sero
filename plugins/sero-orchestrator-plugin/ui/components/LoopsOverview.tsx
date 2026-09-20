/**
 * The Workflows list on Home: the full title, the state in words, what it
 * waits for, and cost as mono meta. Active first; bounded with a "Show more"
 * (paginate, don't scroll).
 *
 * The row's second line is the state's own sentence, never the agent's
 * instruction: the instruction is complete inside the Workflow.
 */

import { useMemo, useState } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { sessionStartedAt } from '@sero-ai/common';
import type { LoopStatus, LoopSummary } from '../../shared/types';
import { formatCost, formatRelative } from '../lib/format';
import { loopActivity } from '../lib/loop-activity';
import { WORKFLOWS_LABEL } from '../../shared/labels';
import { ActivityWord } from './ActivityWord';
import { NeedsPill } from './NeedsPill';
import { ListRow } from './ListRow';
import { SectionHead } from './room-kit';

const STATUS_ORDER: LoopStatus[] = ['active', 'blocked', 'draft', 'complete', 'disabled'];
const PAGE = 8;

/** When it last ran, for the middle column. Money stands alone on the right. */
function loopWhen(loop: LoopSummary): string {
  if (loop.lastRunAt) return `Last ran ${formatRelative(loop.lastRunAt)}`;
  return formatRelative(loop.updatedAt);
}

/** What the row asks the user for, worded, or nothing. */
function loopAsk(loop: LoopSummary): string | null {
  const input = loop.pendingInput ?? 0;
  const suggestions = loop.pendingSuggestions ?? 0;
  if (input > 0) return `${input} ${input === 1 ? 'question' : 'questions'} to answer`;
  if (suggestions > 0) return `${suggestions} suggested ${suggestions === 1 ? 'change' : 'changes'} to review`;
  return null;
}

export function LoopsOverview({ loops, onOpenLoop }: { loops: LoopSummary[]; onOpenLoop: (loopId: string) => void }) {
  const [shown, setShown] = useState(PAGE);
  const session = useMemo(() => sessionStartedAt(), []);
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
      {sorted.slice(0, shown).map((loop) => {
        const activity = loopActivity(loop, session);
        const ask = loopAsk(loop);
        return (
          <ListRow
            key={loop.id}
            title={loop.title}
            attention={ask !== null}
            activity={<ActivityWord state={activity.state} word={activity.line} nextStep={activity.nextStep} />}
            middle={ask !== null ? <NeedsPill>{ask}</NeedsPill> : loopWhen(loop)}
            money={loop.usage?.costUsd != null ? formatCost(loop.usage.costUsd) : ''}
            onClick={() => onOpenLoop(loop.id)}
          />
        );
      })}
      {sorted.length > shown && (
        <Button size="sm" variant="ghost" className="self-start text-xs text-room-text3" onClick={() => setShown((n) => n + PAGE)}>
          Show {sorted.length - shown} more
        </Button>
      )}
    </div>
  );
}
