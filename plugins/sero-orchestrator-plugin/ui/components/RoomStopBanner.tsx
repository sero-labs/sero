/**
 * Why a Room stopped, and what to do about it (prototype screen 13).
 *
 * Every stopped state has to say three things: what happened, what it is
 * costing, and what happens next. Waiting is the one to get right — it must
 * read as normal and free, because it is how the Room stays inside its
 * concurrency limit, and a user who reads it as a stall will stop a Room that
 * was working perfectly.
 *
 * The line under the heading is the runtime's own detail, never a guess made
 * here.
 */

import { Button } from '@sero-ai/ui';
import type { RoomStopReason } from '../../shared/room-types';

/** What each stop means to the user, in their terms. */
const EXPLANATION: Record<RoomStopReason['kind'], { title: string; note: string }> = {
  'limit-reached': {
    title: 'The Room reached a limit you set',
    note: 'Nothing more will be spent. Everything finished so far is kept.',
  },
  'no-progress': {
    title: 'Nothing has moved for a while',
    note: 'The Room stopped rather than spend your budget going in circles. Tell the team what to do next, or stop it.',
  },
  deadlock: {
    title: 'Nobody can move',
    note: 'Members are waiting on each other. Sero told the Conductor first and it could not break the deadlock, so the Room paused instead of spending more.',
  },
  'conductor-failed': {
    title: 'The Conductor could not continue',
    note: 'Every member session is kept and readable. Nothing that was finished is lost.',
  },
  'awaiting-approval': {
    title: 'A member is waiting for your answer',
    note: 'It asked for authority it does not have. Nothing runs until you answer.',
  },
  'awaiting-user': {
    title: 'A member needs you',
    note: 'It asked you something only you can answer. Answer it here and the Room carries on where it stopped.',
  },
  'user-paused': {
    title: 'You paused this Room',
    note: 'Turns in flight finished. Nothing more starts, and nothing more is spent, until you resume it.',
  },
  'user-cancelled': {
    title: 'You stopped this Room',
    note: 'Uncommitted member work was preserved before the sessions closed.',
  },
  'storage-failure': {
    title: 'Sero could not write this Room\'s records',
    note: 'It stopped rather than carry on with a record it could not save. The last saved state is what you see.',
  },
};

interface RoomStopBannerProps {
  stopReason: RoomStopReason;
  /** False once the Room has ended — a finished Room has nothing to resume. */
  resumable: boolean;
  busy: boolean;
  onMessage: () => void;
  onResume: () => void;
  onStop: () => void;
}

export function RoomStopBanner({ stopReason, resumable, busy, onMessage, onResume, onStop }: RoomStopBannerProps) {
  const { title, note } = EXPLANATION[stopReason.kind];
  // An approval is answered on its own card, right below this one.
  const actionable = resumable && stopReason.kind !== 'awaiting-approval';

  return (
    <div className="flex flex-col gap-2 border-b border-amber-500/30 bg-amber-500/[0.06] px-4 py-3">
      <b className="text-sm text-amber-400">{title}</b>
      <p className="text-sm">{stopReason.detail}</p>
      <p className="text-xs text-muted-foreground">{note}</p>
      {actionable && (
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" disabled={busy} onClick={onMessage}>Message the team</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onResume}>Resume</Button>
          <Button size="sm" variant="ghost" disabled={busy} className="text-destructive" onClick={onStop}>Stop the Room</Button>
        </div>
      )}
    </div>
  );
}
