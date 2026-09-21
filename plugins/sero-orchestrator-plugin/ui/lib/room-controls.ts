/**
 * Which of Message the team, Resume and Stop a Room can take right now.
 *
 * The header and the hold card both read this, so a control the header hides
 * while the card is on screen is always one the card shows. Each answer
 * matches what the runtime accepts, so no control is offered only to fail.
 */

import type { RoomRuntimeState } from '../../shared/room-types';

export interface RoomControls {
  message: boolean;
  resume: boolean;
  stop: boolean;
}

export function roomControls(
  runtime: Pick<RoomRuntimeState, 'status' | 'stopReason'>,
  /** Approvals waiting on their own cards. */
  approvalCount = 0,
): RoomControls {
  const { status, stopReason } = runtime;
  const live = status === 'running' || status === 'paused' || status === 'pausing' || status === 'completing';
  // `resumeRoom` accepts only `paused`. An approval still open is answered on
  // its own card, and resuming around it would skip the question.
  const approvalOpen = stopReason?.kind === 'awaiting-approval' && approvalCount > 0;
  // `cancelRoom` refuses a completion that is still delivering. A completion a
  // restart interrupted waits on the user, and Stop is how they end it.
  const delivering = status === 'completing' && stopReason?.kind !== 'awaiting-approval';
  return {
    message: live,
    resume: status === 'paused' && !approvalOpen,
    stop: live && !delivering,
  };
}
