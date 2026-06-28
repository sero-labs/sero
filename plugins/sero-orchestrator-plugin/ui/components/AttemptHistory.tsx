import { useState } from 'react';
import { Badge, Button, Card } from '@sero-ai/ui';
import { BarChart3 } from 'lucide-react';
import type { LoopRunSummary, UsageSummary } from '../../shared/types';
import { formatCost, formatDuration, formatTime } from '../lib/format';

interface AttemptHistoryProps {
  /** Compact run summaries from the loop's runs/index.json (newest rendered first). */
  runs: LoopRunSummary[];
}

/** True when there's at least one stat worth showing (token/time/cost). */
function hasStats(usage?: UsageSummary): usage is UsageSummary {
  return (
    !!usage &&
    (usage.totalTokens !== undefined || usage.durationMs !== undefined || usage.costUsd !== undefined)
  );
}

function StatRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">
        {value}
        {hint ? <span className="ml-1.5 text-muted-foreground">{hint}</span> : null}
      </span>
    </div>
  );
}

/** The collapsible stats panel: rolled-up tokens, model time, cost, and step counts. */
function RunStats({ usage, stepCount, attemptCount }: { usage: UsageSummary; stepCount: number; attemptCount: number }) {
  const tokenHint =
    usage.inputTokens !== undefined && usage.outputTokens !== undefined
      ? `${usage.inputTokens.toLocaleString()} in · ${usage.outputTokens.toLocaleString()} out`
      : undefined;
  return (
    <div className="my-1 flex flex-col gap-0.5 rounded-md border border-border bg-muted/30 p-2">
      {usage.totalTokens !== undefined && (
        <StatRow label="Tokens" value={usage.totalTokens.toLocaleString()} hint={tokenHint} />
      )}
      {usage.durationMs !== undefined && <StatRow label="Model time" value={formatDuration(usage.durationMs)} />}
      {usage.costUsd !== undefined && <StatRow label="Cost" value={formatCost(usage.costUsd)} />}
      <StatRow
        label="Steps"
        value={`${stepCount} step${stepCount === 1 ? '' : 's'} · ${attemptCount} attempt${attemptCount === 1 ? '' : 's'}`}
      />
    </div>
  );
}

function RunCard({ run }: { run: LoopRunSummary }) {
  const [showStats, setShowStats] = useState(false);
  const usage = run.usage;
  const stats = hasStats(usage);
  const stepCount = new Set(run.steps.map((s) => s.stepId)).size;

  return (
    <Card className="flex flex-col gap-1 p-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">Run #{run.runNumber}</span>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline">{run.status}</Badge>
          {stats && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setShowStats((v) => !v)}
              aria-expanded={showStats}
              title={showStats ? 'Hide run stats' : 'Show run stats'}
            >
              <BarChart3 />
            </Button>
          )}
        </div>
      </div>
      <span className="text-muted-foreground">
        {formatTime(run.startedAt)}
        {run.endedAt ? ` → ${formatTime(run.endedAt)}` : ''}
      </span>
      {showStats && stats && <RunStats usage={usage} stepCount={stepCount} attemptCount={run.steps.length} />}
      {run.steps.map((step, i) => (
        <div key={`${step.stepId}-${step.attemptNumber}-${i}`} className="flex items-center justify-between border-t border-border pt-1">
          <span className="truncate">
            {step.stepId} · attempt {step.attemptNumber} · {step.executionType}
          </span>
          <span className="text-muted-foreground">{step.outcomeStatus ?? step.status}</span>
        </div>
      ))}
      {run.recoveries.map((recovery, i) => (
        <div key={i} className="text-muted-foreground">
          recovery: {recovery.decision} — {recovery.reason}
        </div>
      ))}
    </Card>
  );
}

/** Shows recent runs with their step attempts, outcomes, recovery decisions, and stats. */
export function AttemptHistory({ runs }: AttemptHistoryProps) {
  const recent = [...runs].reverse().slice(0, 10);
  if (recent.length === 0) {
    return <Card className="p-3 text-sm text-muted-foreground">No runs yet.</Card>;
  }
  return (
    <div className="flex flex-col gap-2">
      {recent.map((run) => (
        <RunCard key={run.id} run={run} />
      ))}
    </div>
  );
}
