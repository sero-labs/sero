/**
 * Restart a dispatched Workflow that stopped with no cap to approve.
 *
 * A time limit clears `retryStepId`, so there is no step to retry from and the
 * whole Workflow restarts — the same action the milestone row used to run when
 * it had no cap. That control moved to the header, and this is it: the row no
 * longer offers one, so without this the recovery is unreachable.
 *
 * It owns its busy state and prints the refusal. A retry's outcome is not known
 * until it returns, and a silent failure here reads as a button that did
 * nothing — which is worse than no button.
 */

import { useState } from 'react';
import { Button } from '@sero-ai/ui';
import type { ActionOutcome } from '../lib/actions';

interface RetryWorkflowControlProps {
  label: string;
  retry(): Promise<ActionOutcome>;
  onError(text: string): void;
}

export function RetryWorkflowControl({ label, retry, onError }: RetryWorkflowControlProps) {
  const [pending, setPending] = useState(false);

  const run = async () => {
    if (pending) return;
    setPending(true);
    try {
      const outcome = await retry();
      if (!outcome.ok) onError(outcome.text);
    } catch (failure) {
      onError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setPending(false);
    }
  };

  return (
    <Button
      size="sm"
      className="ar-btn ar-btn-sm ar-btn-solid"
      disabled={pending}
      onClick={() => void run()}
    >
      {pending ? 'Starting…' : label}
    </Button>
  );
}
