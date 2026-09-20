/**
 * The Rooms list — every Room as a prototype-style row (screen 1), live from
 * the watched Room index: dot, title, the problem one-liner, the face stack,
 * and mono meta. Running Rooms sort first; the list is bounded with a
 * "Show more" (paginate, don't scroll).
 */

import { useMemo, useState } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Users } from 'lucide-react';
import { sessionStartedAt } from '@sero-ai/common';
import type { RoomStatus, RoomSummary } from '../../shared/room-types';
import { formatCost, formatElapsed, formatRelative } from '../lib/format';
import { ROOM_DOT } from '../lib/list-row-status';
import { roomActivity, type RoomActivity } from '../lib/room-activity';
import { memberGlyph } from '../lib/member-glyph';
import { ActivityWord } from './ActivityWord';
import { ListRow } from './ListRow';
import { NeedsPill } from './NeedsPill';
import { FaceStack, SectionHead } from './room-kit';

/** Running Rooms first, then the ones that need a decision, then the settled ones. */
const STATUS_ORDER: RoomStatus[] = [
  'running',
  'pausing',
  'paused',
  'completing',
  'ready',
  'draft',
  'completed',
  'failed',
  'cancelled',
];

const PAGE = 8;

interface RoomsOverviewProps {
  rooms: RoomSummary[];
  onOpenRoom: (roomId: string) => void;
  onNew: () => void;
}

/** `2 members · 15 min of work` — who is in it and how long they worked. */
function roomWho(room: RoomSummary): string {
  const members = `${room.memberCount} member${room.memberCount === 1 ? '' : 's'}`;
  const end = room.status === 'running' || room.status === 'completing' ? Date.now() : Date.parse(room.updatedAt);
  // Wall-clock between its first and last report. It is not time spent working,
  // which nothing records, so the row does not claim it is.
  const elapsed = room.startedAt ? formatElapsed(end - Date.parse(room.startedAt)) : formatRelative(room.updatedAt);
  return `${members} · ${elapsed}`;
}

/** `$0.31 of $2.00` — spend alone on the right, as the drawing puts it. */
function roomMoney(room: RoomSummary): string {
  return room.maxCostUsd > 0
    ? `${formatCost(room.costUsd)} of ${formatCost(room.maxCostUsd)}`
    : formatCost(room.costUsd);
}

/** What the Room asks the user for, in words. A count alone says nothing. */
function roomAsk(room: RoomSummary, activity: RoomActivity): string | null {
  if (room.attentionCount <= 0) return null;
  return activity.action ?? `${room.attentionCount} ${room.attentionCount === 1 ? 'item needs' : 'items need'} you`;
}

/**
 * The row's second line: the state word, then how long it has waited. The brief
 * the Room was given is complete inside the Room, never on the row.
 */
function roomLine(activity: RoomActivity): string {
  return activity.waitingFor ? `${activity.word} · ${activity.waitingFor}` : activity.word;
}

export function RoomsOverview({ rooms, onOpenRoom, onNew }: RoomsOverviewProps) {
  const [shown, setShown] = useState(PAGE);
  const session = useMemo(() => sessionStartedAt(), []);
  const sorted = useMemo(() => {
    const rank = new Map(STATUS_ORDER.map((status, i) => [status, i]));
    return rooms.toSorted((a, b) =>
      (rank.get(a.status) ?? 99) - (rank.get(b.status) ?? 99) || b.updatedAt.localeCompare(a.updatedAt));
  }, [rooms]);

  if (rooms.length === 0) return <EmptyRooms onNew={onNew} />;

  return (
    <div className="flex flex-col">
      <SectionHead count={rooms.length}>Rooms</SectionHead>
      {sorted.slice(0, shown).map((room) => {
        const activity = roomActivity(room, session);
        return (
        <ListRow
          key={room.id}
          title={room.title}
          attention={roomAsk(room, activity) !== null}
          activity={<ActivityWord state={activity.state} word={roomLine(activity)} nextStep={activity.nextStep} />}
          middle={
            <span className="flex flex-col items-start gap-1.5">
              {roomAsk(room, activity) !== null && <NeedsPill>{roomAsk(room, activity)}</NeedsPill>}
              <span className="flex items-center gap-2">
                {room.members?.length ? (
                  <FaceStack
                    className="shrink-0"
                    faces={room.members.map((member) => ({
                      seed: member.id ?? member.name,
                      // The 22px list face carries the initial (C), never ◎.
                      label: memberGlyph(member.name),
                      tone: member.isConductor ? 'conductor' : member.addedAfterStart ? 'new' : 'member',
                    }))}
                  />
                ) : null}
                {roomWho(room)}
              </span>
            </span>
          }
          money={roomMoney(room)}
          onClick={() => onOpenRoom(room.id)}
        />
        );
      })}
      {sorted.length > shown && (
        <Button size="sm" variant="ghost" className="self-start text-xs text-room-text3" onClick={() => setShown((n) => n + PAGE)}>
          Show {sorted.length - shown} more
        </Button>
      )}
    </div>
  );
}

/**
 * What a Room is, shown where a list would be. A workspace with no Rooms has
 * nothing to browse, so the space explains the mode instead of apologising for
 * being empty.
 */
function EmptyRooms({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[10px] border border-dashed border-room-line-strong p-6">
      <Users className="size-6 text-room-text3" />
      <div>
        <h3 className="text-base font-semibold text-room-text">No Rooms yet</h3>
        <p className="max-w-prose text-sm text-room-text3">
          Describe a problem and Sero builds a team for it — a Conductor and the specialists the problem
          needs. They work, talk and adapt until it is done.
        </p>
      </div>
      <Button size="sm" onClick={onNew}>Start a Room</Button>
    </div>
  );
}
