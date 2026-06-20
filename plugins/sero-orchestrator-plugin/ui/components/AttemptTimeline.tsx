import { useState } from 'react';
import { Button } from '@sero-ai/ui';

import type { AttemptStatus, LoopAttempt } from '../../shared/types';
import '../styles.css';

const PAGE_SIZE = 10;

const ATTEMPT_LABEL: Record<AttemptStatus, string> = {
  running: 'Running',
  passed: 'Passed',
  failed: 'Failed',
  blocked: 'Blocked',
  cancelled: 'Cancelled',
};

const ATTEMPT_DOT: Record<AttemptStatus, string> = {
  running: 'bg-primary',
  passed: 'bg-primary',
  failed: 'bg-destructive',
  blocked: 'bg-destructive',
  cancelled: 'bg-muted-foreground',
};

function passedChecks(attempt: LoopAttempt): string {
  if (attempt.checkResults.length === 0) return 'no checks';
  const passed = attempt.checkResults.filter((c) => c.status === 'passed').length;
  return `${passed}/${attempt.checkResults.length} checks passed`;
}

export function AttemptTimeline({ attempts }: { attempts: LoopAttempt[] }) {
  const [limit, setLimit] = useState(PAGE_SIZE);

  if (attempts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No attempts yet. Running goals lands in a later phase.
      </p>
    );
  }

  // Newest first; paginate rather than scroll a long history.
  const ordered = [...attempts].sort((a, b) => b.attemptNumber - a.attemptNumber);
  const visible = ordered.slice(0, limit);

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {visible.map((attempt) => (
          <li
            key={attempt.id}
            className="flex items-start gap-3 rounded-md border border-border p-2.5"
          >
            <span className={`mt-1.5 size-2 shrink-0 rounded-full ${ATTEMPT_DOT[attempt.status]}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">
                  Attempt {attempt.attemptNumber}
                </span>
                <span className="text-xs text-muted-foreground">
                  {ATTEMPT_LABEL[attempt.status]}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {attempt.executionMode === 'background-worker' ? 'Background worker' : 'Active chat'}
                {' · '}
                {passedChecks(attempt)}
              </p>
              {attempt.learned && (
                <p className="mt-1 text-xs text-foreground/80">{attempt.learned}</p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {ordered.length > limit && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLimit((l) => l + PAGE_SIZE)}
        >
          Load more ({ordered.length - limit})
        </Button>
      )}
    </div>
  );
}

export default AttemptTimeline;
