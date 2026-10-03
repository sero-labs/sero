/**
 * The Rooms list — every Room as a prototype-style row (screen 1), live from
 * the watched Room index: dot, title, the problem one-liner, the face stack,
 * and mono meta. Running Rooms sort first; the list is bounded with a
 * "Show more" (paginate, don't scroll).
 */

import { useWorkActivity } from '../lib/use-work-activity';
import { useNow } from '../lib/use-now';
import { useMemo, useState } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Users } from 'lucide-react';
import { sessionStartedAt } from '@sero-ai/common';
import type { RoomStatus, RoomSummary } from '../../shared/room-types';
import { formatCost, formatRelative } from '../lib/format';
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

/** `$0.31 of $2.00` — spend alone on the right, as the drawing puts it. */
function roomMoney(room: RoomSummary): string {
  return room.maxCostUsd > 0
    ? `${formatCost(room.costUsd)} of ${formatCost(room.maxCostUsd)}`
    : formatCost(room.costUsd);
}

/** What the Room asks the user for, in words. A count alone says nothing. */
function roomAsk(room: RoomSummary, activity: RoomActivity): string | null {
  // An exhausted time limit is said by the row's own state and answered by the
  // hold inside the Room, so no second pill repeats it.
  if (room.attentionCount <= 0 || activity.timeLimit) return null;
  return activity.action ?? `${room.attentionCount} ${room.attentionCount === 1 ? 'item needs' : 'items need'} you`;
}

export function RoomsOverview({ rooms, onOpenRoom, onNew }: RoomsOverviewProps) {
  const [shown, setShown] = useState(PAGE);
  const session = useMemo(() => sessionStartedAt(), []);
  // Re-read when a row's status moves. Everything between arrives as a push.
  const work = useWorkActivity(rooms.map((entry) => `${entry.id}:${entry.status}`).join('|'));
  // A duration on screen needs a tick; with no member working, nothing runs.
  const now = useNow([...work.values()].some((summary) => summary.activeCount > 0));
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
        // The row's second line is the shared word and the actual work or wait.
        // The brief the Room was given is complete inside the Room, never here.
        const activity = roomActivity(room, session, work.get(room.id), now);
        const ask = roomAsk(room, activity);
        return (
        <ListRow
          key={room.id}
          title={room.title}
          attention={ask !== null || activity.timeLimit}
          activity={<ActivityWord state={activity.state} word={activity.line} nextStep={activity.nextStep} />}
          middle={
            <span className="flex flex-col items-start gap-1.5">
              {ask !== null && <NeedsPill>{ask}</NeedsPill>}
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
                {activity.facts ?? formatRelative(room.updatedAt)}
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
