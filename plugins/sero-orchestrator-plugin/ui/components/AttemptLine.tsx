/**
 * What one running attempt reports now: the call it holds open with its
 * measured wait, and how fresh that observation is. A Workflow step and each
 * fan-out item are separate attempts, so each prints its own line.
 *
 * It reads the page's shared feedback and adds nothing when no producer reported
 * this attempt. It ticks once a second only while the attempt is attached.
 */

import { useContext } from 'react';
import { attemptLine, attemptWorking } from '../lib/step-live';
import { useNow } from '../lib/use-now';
import { WorkViewContext } from '../lib/use-work-activity';

export function AttemptLine({ attemptId, className = 'mt-1.5 text-xs text-room-text3' }: { attemptId: string | undefined; className?: string }) {
  const { byAttempt, epoch } = useContext(WorkViewContext);
  const feedback = attemptId ? byAttempt.get(attemptId) : undefined;
  const now = useNow(attemptWorking(feedback, epoch));
  const line = attemptLine(feedback, epoch, now);
  return line ? <p className={className}>{line}</p> : null;
}
