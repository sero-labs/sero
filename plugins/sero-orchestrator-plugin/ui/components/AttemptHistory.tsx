import { useState } from 'react';
import { Badge, Button, Card } from '@sero-ai/ui';
import type { LoopRunStatus, LoopRunSummary } from '../../shared/types';
import { formatCost, formatDuration, formatTime } from '../lib/format';

const PAGE = 5;

interface AttemptHistoryProps {
  /** Compact run summaries from the loop's runs/index.json (oldest first). */
  runs: LoopRunSummary[];
}

const RUN_STATUS_CLASS: Record<LoopRunStatus, string> = {
  running: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
  completed: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
  waiting: 'border-border text-muted-foreground',
  blocked: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
  failed: 'border-rose-500/40 bg-rose-500/10 text-rose-400',
  cancelled: 'border-border text-muted-foreground',
  orphaned: 'border-border text-muted-foreground',
};

const OUTCOME_LABEL: Record<string, string> = { succeeded: 'done', 'needs-revision': 'recovering' };

/** One-line summary of a run's step outcomes, e.g. "2 done · 1 blocked · 1 recovery". */
function summarizeRun(run: LoopRunSummary): string {
  const parts: string[] = [];
  if (run.steps.length > 0) {
    const counts = new Map<string, number>();
    for (const s of run.steps) {
      const key = s.outcomeStatus ?? s.status;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    parts.push(...[...counts].map(([key, n]) => `${n} ${OUTCOME_LABEL[key] ?? key}`));
  }
  if (run.recoveries.length > 0) parts.push(`${run.recoveries.length} recovery`);
  return parts.length ? parts.join(' · ') : 'no steps run';
}

function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
}

// Shared stat column widths so the header labels line up with each row's values.
const COL = { time: 'w-12', tokens: 'w-16', cost: 'w-16' } as const;

function StatsHeader() {
  return (
    <div className="flex items-center gap-4 bg-muted/20 px-3.5 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground/60">
      <span className="min-w-0 flex-1" />
      <span className={`${COL.time} text-right`}>Time</span>
      <span className={`${COL.tokens} text-right`}>Tokens</span>
      <span className={`${COL.cost} text-right`}>Cost</span>
    </div>
  );
}

const Dash = <span className="text-muted-foreground/40">—</span>;

function RunRow({ run }: { run: LoopRunSummary }) {
  const wallMs = run.endedAt ? new Date(run.endedAt).getTime() - new Date(run.startedAt).getTime() : undefined;
  const usage = run.usage;

  return (
    <div className="flex items-center gap-4 px-3.5 py-3 text-xs">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">Run #{run.runNumber}</span>
          <Badge variant="outline" className={RUN_STATUS_CLASS[run.status]}>{run.status}</Badge>
        </div>
        <span className="text-muted-foreground">{formatTime(run.startedAt)} · {summarizeRun(run)}</span>
      </div>
      <span className={`${COL.time} text-right tabular-nums text-foreground/90`}>{wallMs !== undefined ? formatDuration(wallMs) : Dash}</span>
      <span className={`${COL.tokens} text-right tabular-nums text-foreground/90`}>{usage?.totalTokens !== undefined ? formatTokens(usage.totalTokens) : Dash}</span>
      <span className={`${COL.cost} text-right tabular-nums text-foreground/90`}>{usage?.costUsd !== undefined ? formatCost(usage.costUsd) : Dash}</span>
    </div>
  );
}

/** Compact run history: one summarised row per run (newest first), last 5 + Show more. */
export function AttemptHistory({ runs }: AttemptHistoryProps) {
  const [shown, setShown] = useState(PAGE);
  if (runs.length === 0) {
    return <Card className="p-3 text-sm text-muted-foreground">No runs yet.</Card>;
  }
  const ordered = [...runs].reverse();
  const visible = ordered.slice(0, shown);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-md border border-border/60">
        <StatsHeader />
        {visible.map((run) => <RunRow key={run.id} run={run} />)}
      </div>
      {ordered.length > shown && (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setShown((n) => n + PAGE)}>
          Show more ({ordered.length - shown})
        </Button>
      )}
    </div>
  );
}
