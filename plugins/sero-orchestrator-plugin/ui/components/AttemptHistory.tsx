import { Badge, Card } from '@sero-ai/ui';
import type { LoopRunSummary } from '../../shared/types';
import { formatTime } from '../lib/format';

interface AttemptHistoryProps {
  /** Compact run summaries from the loop's runs/index.json (newest rendered first). */
  runs: LoopRunSummary[];
}

/** Shows recent runs with their step attempts, outcomes, and recovery decisions. */
export function AttemptHistory({ runs }: AttemptHistoryProps) {
  const recent = [...runs].reverse().slice(0, 10);
  if (recent.length === 0) {
    return <Card className="p-3 text-sm text-muted-foreground">No runs yet.</Card>;
  }
  return (
    <div className="flex flex-col gap-2">
      {recent.map((run) => (
        <Card key={run.id} className="flex flex-col gap-1 p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium">Run #{run.runNumber}</span>
            <Badge variant="outline">{run.status}</Badge>
          </div>
          <span className="text-muted-foreground">
            {formatTime(run.startedAt)}
            {run.endedAt ? ` → ${formatTime(run.endedAt)}` : ''}
          </span>
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
      ))}
    </div>
  );
}
