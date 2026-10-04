/**
 * Which of Message the team, Resume and Stop a Room can take right now.
 *
 * The header and the hold card both read this, so a control the header hides
 * while the card is on screen is always one the card shows. Each answer
 * matches what the runtime accepts, so no control is offered only to fail.
 */

import type { RoomRuntimeState, RoomStopReason } from '../../shared/room-types';
import type { RoomFeedDispatch } from './use-room-feed';

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

/**
 * The hold the page shows. A Room that completed, for example while it was
 * pausing, is finished: its saved stop reason is history, so no hold and no
 * resume is offered for it.
 */
export function shownStopReason(runtime: Pick<RoomRuntimeState, 'status' | 'stopReason'>): RoomStopReason | null {
  return runtime.status === 'completed' ? null : runtime.stopReason;
}

export type ResumeOutcome = { ok: true } | { ok: false; error: string };

/**
 * Resumes the same Room with a larger total active-time limit, in minutes.
 * It names the Room and the total and nothing else, so the spend cap and the
 * Room's access cannot change with it. A refusal keeps the tool's own words.
 */
export function addRoomTime(dispatch: RoomFeedDispatch, roomId: string): (maxMinutes: number) => Promise<ResumeOutcome> {
  return async (maxMinutes) => {
    const details = await dispatch({ action: 'resume', roomId, maxMinutes });
    return details?.ok ? { ok: true } : { ok: false, error: details?.error ?? 'The Room could not be resumed.' };
  };
}
