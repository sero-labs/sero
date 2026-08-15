/**
 * The two "needs you" cards that are not approvals (agent-rooms spec §22).
 *
 * A member can stop and ask the user a plain question, and a Room can stop
 * because nobody could move it. Neither is an authority decision, so neither
 * fits the approval card — but both need the user just as much, and a live Room
 * proved what happens when they are missing: the Room stopped, the home inbox
 * said "you're all caught up", and the question was never read.
 *
 * Each card carries the answer with it. Reading what a Room needs and having to
 * go somewhere else to answer it is the same dead end in a nicer font.
 */

import { useState } from 'react';
import { Button, Textarea } from '@sero-ai/ui';
import type { RoomAttentionPause, RoomAttentionRequest } from '../../shared/attention-types';
import type { RoomSummary } from '../../shared/room-types';
import { EventCard, Pill } from './room-kit';
import { OpenLink } from './OpenLink';

export function RoomRequestCard({
  room,
  request,
  busy,
  onAnswer,
  onOpenRoom,
}: {
  room: RoomSummary;
  request: RoomAttentionRequest;
  busy: boolean;
  onAnswer?: (roomId: string, memberId: string, body: string) => void;
  onOpenRoom?: (roomId: string) => void;
}) {
  const [answer, setAnswer] = useState('');

  return (
    <EventCard
      tone="warn"
      title={`${request.memberName} needs you`}
      pill={<Pill tone="warn">{room.title}</Pill>}
      actions={
        <>
          <Button
            size="sm"
            className="h-[26px] px-2.5 text-[11px]"
            disabled={busy || !onAnswer || answer.trim().length === 0}
            onClick={() => onAnswer?.(room.id, request.memberId, answer.trim())}
          >
            Send and continue
          </Button>
          {onOpenRoom && <span className="ml-auto self-center"><OpenLink title="Open" onClick={() => onOpenRoom(room.id)} /></span>}
        </>
      }
    >
      <p className="text-xs text-room-text2">{request.question}</p>
      <Textarea
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        placeholder="Type your answer…"
        className="mt-2 min-h-12 border-room-line-strong bg-room-sunken text-xs"
      />
    </EventCard>
  );
}

export function RoomPauseCard({
  room,
  pause,
  busy,
  onResume,
  onOpenRoom,
}: {
  room: RoomSummary;
  pause: RoomAttentionPause;
  busy: boolean;
  onResume?: (roomId: string) => void;
  onOpenRoom?: (roomId: string) => void;
}) {
  return (
    <EventCard
      tone="bad"
      title="This Room stopped"
      pill={<Pill tone="error">{room.title}</Pill>}
      actions={
        <>
          {/* Resuming a Room whose members are still waiting on the user changes
              nothing, so the answer comes first on the card above this one. */}
          <Button size="sm" className="h-[26px] px-2.5 text-[11px]" disabled={busy || !onResume} onClick={() => onResume?.(room.id)}>
            Resume
          </Button>
          <Button size="sm" variant="ghost" className="h-[26px] px-2.5 text-[11px]" disabled={!onOpenRoom} onClick={() => onOpenRoom?.(room.id)}>
            Read the Room
          </Button>
        </>
      }
    >
      <p className="text-xs text-room-text2">{pause.detail}</p>
    </EventCard>
  );
}
