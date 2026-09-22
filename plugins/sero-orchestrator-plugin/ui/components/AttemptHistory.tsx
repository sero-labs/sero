import { useState } from 'react';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Card } from '@sero-ai/ui/components/ui/card';
import { Send, Zap } from 'lucide-react';
import type { LoopRunStatus, LoopRunSummary } from '../../shared/types';
import { formatCost, formatDayTime, formatDuration, formatTokens } from '../lib/format';
import { receiptDisplay } from '../lib/delivery-summary';
import { summarizeRun } from '../lib/run-summary';
import { firedByLabel } from '../lib/trigger-summary';

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
  skipped: 'border-border bg-muted/30 text-muted-foreground',
  snoozed: 'border-blue-500/40 bg-blue-500/10 text-blue-400',
};

const RUN_STATUS_LABEL: Record<LoopRunStatus, string> = {
  running: 'Running',
  waiting: 'Waiting',
  completed: 'Completed',
  blocked: 'Blocked',
  failed: 'Failed',
  cancelled: 'Cancelled',
  orphaned: 'Orphaned',
  skipped: 'Skipped',
  snoozed: 'Snoozed',
};

// Shared stat column widths so the header labels line up with each row's values.
const COL = { time: 'w-12', tokens: 'w-16', cost: 'w-16' } as const;

/** A run stopped with a recorded reason is a fault, so its chip is red. Amber stays for what asks. */
const STOP_CLASS = 'border-rose-500/40 bg-rose-500/10 text-rose-400';

function StatsHeader() {
  return (
    <div className="flex items-center gap-4 px-3.5 py-1.5 font-mono text-[9.5px] uppercase tracking-[0.07em] text-muted-foreground/60">
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
  const firedBy = firedByLabel(run);
  // The visited steps in the order they ran, named by the title the plan held
  // when the run visited them. A summary written earlier holds no title, so
  // that step is named by its id rather than by the plan's title today.
  const steps = run.steps.map((step) => step.title ?? step.stepId).join(' → ');
  // One line: the steps, or why there are none. A run-level reason outranks the
  // step list, because it says why the run ended as it did.
  const detail = steps.length > 0 && !run.statusReason ? steps : summarizeRun(run);
  // A stopped run prints its own saved reason in place of the status word the
  // reason already states.
  const stopped = run.block?.reason !== undefined;

  return (
    <div className="flex items-center gap-4 px-3.5 py-3 text-xs">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">Run {run.runNumber}</span>
          <Badge variant="outline" className={stopped ? STOP_CLASS : RUN_STATUS_CLASS[run.status]}>
            {run.block?.reason ?? RUN_STATUS_LABEL[run.status]}
          </Badge>
          <span className="text-muted-foreground/70">{formatDayTime(run.startedAt)}</span>
          {firedBy && (
            <Badge
              variant="outline"
              className="border-sky-500/40 bg-sky-500/10 text-sky-400"
              title={run.firedBy?.summary}
            >
              <Zap className="mr-1 h-3 w-3" />{firedBy}
            </Badge>
          )}
          {run.delivery && <ReceiptBadge receipt={run.delivery} />}
        </div>
        <span className="text-muted-foreground">{detail}</span>
      </div>
      <span className={`${COL.time} text-right tabular-nums text-foreground/90`}>{wallMs !== undefined ? formatDuration(wallMs) : Dash}</span>
      <span className={`${COL.tokens} text-right tabular-nums text-foreground/90`}>{usage?.totalTokens !== undefined ? formatTokens(usage.totalTokens) : Dash}</span>
      <span className={`${COL.cost} text-right tabular-nums text-foreground/90`}>{usage?.costUsd !== undefined ? formatCost(usage.costUsd) : Dash}</span>
    </div>
  );
}

/** The run's proof of delivery: a link when the ref is a URL, plain text otherwise. */
function ReceiptBadge({ receipt }: { receipt: NonNullable<LoopRunSummary['delivery']> }) {
  const display = receiptDisplay(receipt);
  const badge = (
    <Badge variant="outline" className="border-violet-500/40 bg-violet-500/10 text-violet-400" title={display.title}>
      <Send className="mr-1 h-3 w-3" />{display.label}
    </Badge>
  );
  // target=_blank routes through the shell's window-open handler, which opens
  // allowed URLs in the external browser and denies the popup.
  return display.href ? (
    <a href={display.href} target="_blank" rel="noreferrer">{badge}</a>
  ) : (
    badge
  );
}

/** Compact run history: one summarised row per run (newest first), last 5 + Show more. */
export function AttemptHistory({ runs }: AttemptHistoryProps) {
  const [shown, setShown] = useState(PAGE);
  if (runs.length === 0) {
    return <Card className="p-3 text-base text-muted-foreground">No runs yet.</Card>;
  }
  const ordered = [...runs].reverse();
  const visible = ordered.slice(0, shown);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col divide-y divide-border/60">
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
