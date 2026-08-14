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
import { Button, Card, Textarea } from '@sero-ai/ui';
import { MessageCircleQuestion, PauseCircle } from 'lucide-react';
import type { RoomAttentionPause, RoomAttentionRequest } from '../../shared/attention-types';
import type { RoomSummary } from '../../shared/room-types';
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
    <Card className="flex flex-col gap-2 border-amber-500/30 bg-amber-500/[0.06] p-3">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-amber-500/20 text-amber-400">
          <MessageCircleQuestion className="h-3 w-3" />
        </span>
        <span className="text-base font-semibold text-amber-400">{request.memberName} needs you</span>
        {onOpenRoom && <span className="ml-auto"><OpenLink title="Open" onClick={() => onOpenRoom(room.id)} /></span>}
      </div>
      <span className="text-base font-medium">{room.title}</span>
      <p className="text-base">{request.question}</p>
      <Textarea
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        placeholder="Type your answer…"
        className="min-h-12 text-base"
      />
      <Button
        size="sm"
        className="self-end"
        disabled={busy || !onAnswer || answer.trim().length === 0}
        onClick={() => onAnswer?.(room.id, request.memberId, answer.trim())}
      >
        Send and continue
      </Button>
    </Card>
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
    <Card className="flex flex-col gap-2 border-orange-500/30 bg-orange-500/[0.06] p-3">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-orange-500/20 text-orange-400">
          <PauseCircle className="h-3 w-3" />
        </span>
        <span className="text-base font-semibold text-orange-400">This Room stopped</span>
        {onOpenRoom && <span className="ml-auto"><OpenLink title="Open" onClick={() => onOpenRoom(room.id)} /></span>}
      </div>
      <span className="text-base font-medium">{room.title}</span>
      <p className="text-base">{pause.detail}</p>
      <div className="mt-auto flex items-center gap-2">
        {/* Resuming a Room whose members are still waiting on the user changes
            nothing, so the answer comes first on the card above this one. */}
        <Button size="sm" disabled={busy || !onResume} onClick={() => onResume?.(room.id)}>
          Resume
        </Button>
        <Button size="sm" variant="ghost" disabled={!onOpenRoom} onClick={() => onOpenRoom?.(room.id)}>
          Read the Room
        </Button>
      </div>
    </Card>
  );
}
