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

import { useState } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { relativeTime } from '@sero-ai/common';
import type { RoomStopReason } from '../../shared/room-types';
import type { ResumeOutcome, RoomControls } from '../lib/room-controls';
import { holdText, type HoldMember } from '../lib/room-hold';
import { RoomTimeDialog } from './RoomTimeDialog';
import { type RoomTimeLimit } from '../lib/room-time';

interface RoomHoldCardProps {
  /** Why the runtime stopped starting turns, when it did. */
  stopReason: RoomStopReason | null;
  /** Members that stopped to ask the user. Can be non-empty while the Room runs. */
  members: HoldMember[];
  /** What the Room can take now. The header hides these while the card shows. */
  controls: RoomControls;
  busy: boolean;
  onMessage: () => void;
  onResume: () => void;
  onStop: () => void;
  /**
   * The Room's time, when it is known. A Room that used all of it offers Add
   * time, which opens a dialog, in place of a plain Resume.
   */
  time?: RoomTimeLimit;
  /** Resumes the same Room with a larger total, in minutes. */
  onAddTime?: (totalMinutes: number) => Promise<ResumeOutcome>;
}

export function RoomHoldCard({ stopReason, members, controls, busy, onMessage, onResume, onStop, time, onAddTime }: RoomHoldCardProps) {
  if (!stopReason && members.length === 0) return null;

  const { eyebrow, headline, since, note } = holdText(stopReason, members);

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

      {members.length > 0 && <HoldMembersFold members={members} />}

      <HoldControls controls={controls} busy={busy} onMessage={onMessage} onResume={onResume} onStop={onStop} time={time} onAddTime={onAddTime} />
    </section>
  );
}

/** The members' own words, folded under the headline. */
function HoldMembersFold({ members }: { members: HoldMember[] }) {
  return (
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
  );
}

function HoldControls({ controls, busy, onMessage, onResume, onStop, time, onAddTime }: Pick<RoomHoldCardProps, 'controls' | 'busy' | 'onMessage' | 'onResume' | 'onStop' | 'time' | 'onAddTime'>) {
  const [adding, setAdding] = useState(false);
  if (!controls.message && !controls.resume && !controls.stop) return null;
  // A Room that used all its time cannot just carry on: it needs a larger total.
  const exhausted = !!time && !!onAddTime && time.usedMs >= time.limitMs;
  return (
    <div className="mt-1 flex flex-wrap items-end gap-2">
      {controls.message && <Button size="sm" disabled={busy} onClick={onMessage}>Message the team</Button>}
      {controls.resume && (exhausted
        ? <Button size="sm" variant="outline" disabled={busy} onClick={() => setAdding(true)}>Add time…</Button>
        : <Button size="sm" variant="outline" disabled={busy} onClick={() => onResume()}>Resume</Button>)}
      {adding && controls.resume && exhausted && (
        <RoomTimeDialog time={time} onApprove={onAddTime} onClose={() => setAdding(false)} />
      )}
      {controls.stop && (
        <Button size="sm" variant="ghost" disabled={busy} className="text-destructive" onClick={onStop}>
          Stop the Room
        </Button>
      )}
    </div>
  );
}
