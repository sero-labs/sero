import { Badge, Card } from '@sero-ai/ui';
import type { Loop } from '../../shared/types';
import { formatTime } from '../lib/format';

interface AttemptHistoryProps {
  loop: Loop;
}

/** Shows recent runs with their step attempts, outcomes, and recovery decisions. */
export function AttemptHistory({ loop }: AttemptHistoryProps) {
  const runs = [...loop.runs].reverse().slice(0, 10);
  if (runs.length === 0) {
    return <Card className="p-3 text-sm text-muted-foreground">No runs yet.</Card>;
  }
  return (
    <div className="flex flex-col gap-2">
      {runs.map((run) => (
        <Card key={run.id} className="flex flex-col gap-1 p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium">Run #{run.runNumber}</span>
            <Badge variant="outline">{run.status}</Badge>
          </div>
          <span className="text-muted-foreground">
            {formatTime(run.startedAt)}
            {run.endedAt ? ` → ${formatTime(run.endedAt)}` : ''}
          </span>
          {run.stepAttempts.map((attempt) => (
            <div key={attempt.id} className="flex items-center justify-between border-t border-border pt-1">
              <span className="truncate">
                {attempt.stepId} · attempt {attempt.attemptNumber} · {attempt.executionType}
              </span>
              <span className="text-muted-foreground">
                {attempt.outcome?.status ?? attempt.status}
              </span>
            </div>
          ))}
          {run.recoveryDecisions.map((decision) => (
            <div key={decision.id} className="text-muted-foreground">
              recovery: {decision.decision} — {decision.reason}
            </div>
          ))}
        </Card>
      ))}
    </div>
  );
}
