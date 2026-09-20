/**
 * A Room on hold: the question once, the actions once.
 *
 * The page used to say the same hold three times. Message the team, Resume and
 * Stop sat in the header and again in the stop banner; a third strip named the
 * members who had stopped and offered Read it, which opened a panel showing
 * what this card now shows. The user read four long agent messages in the feed
 * to find out what was being asked.
 *
 * The headline names who stopped. It does not summarise what they asked,
 * because only the members wrote that, and their own words are one click away
 * under it rather than rewritten here.
 */

import { Button } from '@sero-ai/ui/components/ui/button';
import { relativeTime } from '@sero-ai/common';
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

/** Who the Room is waiting on, above the headline. */
const EYEBROW: Record<RoomStopReason['kind'], string> = {
  'limit-reached': 'Stopped at your limit',
  'no-progress': 'Stopped',
  deadlock: 'Stopped',
  'conductor-failed': 'Stopped',
  'awaiting-approval': 'Waiting on you',
  'awaiting-user': 'Waiting on you',
  'user-paused': 'Paused by you',
  'user-cancelled': 'Stopped by you',
  'storage-failure': 'Stopped',
};

/** A member that stopped to ask the user, and what it wrote. */
export interface HoldMember {
  id: string;
  displayName: string;
  /** The member's own words. Never rewritten here. */
  statusDetail: string;
  statusAt: string;
}

/** "Morgan", "Morgan and Riley", "Morgan, Riley and Sam". */
export function namesSentence(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

interface RoomHoldCardProps {
  /** Why the runtime stopped starting turns, when it did. */
  stopReason: RoomStopReason | null;
  /** Members that stopped to ask the user. Can be non-empty while the Room runs. */
  members: HoldMember[];
  /** False once the Room has ended — a finished Room has nothing to resume. */
  resumable: boolean;
  busy: boolean;
  onMessage: () => void;
  onResume: () => void;
  onStop: () => void;
}

export function RoomHoldCard({ stopReason, members, resumable, busy, onMessage, onResume, onStop }: RoomHoldCardProps) {
  if (!stopReason && members.length === 0) return null;

  // Whoever stopped names the hold. The runtime's own kind names it otherwise.
  const asked = members.length > 0;
  const headline = asked
    ? `${namesSentence(members.map((member) => member.displayName))} stopped to ask you something`
    : EXPLANATION[stopReason!.kind].title;
  const eyebrow = stopReason ? EYEBROW[stopReason.kind] : 'Waiting on you';
  const since = stopReason?.at ?? members.map((member) => member.statusAt).sort()[0];
  // What the stop means, for a stop nobody asked about. When members did ask,
  // the runtime's detail and their own words below already say it, and the
  // note would be the same thing a third time.
  const note = asked || !stopReason ? undefined : EXPLANATION[stopReason.kind].note;
  // An approval is answered on its own card, right below this one.
  const actionable = resumable && stopReason?.kind !== 'awaiting-approval';

  return (
    <section
      aria-label="What this Room is waiting for"
      className="m-[18px] flex flex-col gap-2 rounded-[10px] border border-status-warning-border bg-status-warning-muted px-4 py-3.5"
    >
      <span className="room-mono-micro uppercase tracking-[0.08em] text-room-ink-warn">
        {eyebrow}
        {since ? ` · ${relativeTime(since)}` : ''}
      </span>
      <h3 className="text-sm font-semibold text-room-text">{headline}</h3>
      {stopReason && <p className="text-sm text-room-text2">{stopReason.detail}</p>}
      {note && <p className="text-xs text-room-text3">{note}</p>}

      {members.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-room-text3">What they wrote</summary>
          <dl className="mt-2 flex flex-col gap-2">
            {members.map((member) => (
              <div key={member.id} className="flex flex-col gap-0.5">
                <dt className="font-medium text-room-text2">{member.displayName}</dt>
                <dd className="whitespace-pre-wrap text-room-text3">{member.statusDetail}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}

      {actionable && (
        <div className="mt-1 flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={onMessage}>Message the team</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={onResume}>Resume</Button>
          <Button size="sm" variant="ghost" disabled={busy} className="text-destructive" onClick={onStop}>
            Stop the Room
          </Button>
        </div>
      )}
    </section>
  );
}
