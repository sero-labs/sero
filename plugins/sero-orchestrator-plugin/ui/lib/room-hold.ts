/**
 * What a Room's hold card says: the eyebrow, the headline, when it began and
 * the note, from the runtime's stop reason and the members that asked.
 */

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

export interface HoldText {
  eyebrow: string;
  headline: string;
  /** When the hold began, if the record says. */
  since: string | undefined;
  /** What the stop means, for a stop nobody asked about. */
  note: string | undefined;
}

export function holdText(stopReason: RoomStopReason | null, members: HoldMember[]): HoldText {
  // Whoever stopped names the hold. The runtime's own kind names it otherwise.
  const asked = members.length > 0;
  return {
    eyebrow: stopReason ? EYEBROW[stopReason.kind] : 'Waiting on you',
    headline: asked
      ? `${namesSentence(members.map((member) => member.displayName))} stopped to ask you something`
      : EXPLANATION[stopReason!.kind].title,
    since: stopReason?.at ?? members.map((member) => member.statusAt).sort()[0],
    // When members did ask, the runtime's detail and their own words already
    // say it, and the note would be the same thing a third time.
    note: asked || !stopReason ? undefined : EXPLANATION[stopReason.kind].note,
  };
}
