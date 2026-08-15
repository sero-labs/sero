/**
 * The Rooms list — every Room as a prototype-style row (screen 1), live from
 * the watched Room index: dot, title, the problem one-liner, the face stack,
 * and mono meta. Running Rooms sort first; the list is bounded with a
 * "Show more" (paginate, don't scroll).
 */

import { useMemo, useState } from 'react';
import { Button } from '@sero-ai/ui';
import { Users } from 'lucide-react';
import type { RoomStatus, RoomSummary } from '../../shared/room-types';
import { formatCost, formatElapsed, formatRelative } from '../lib/format';
import { memberGlyph } from '../lib/member-glyph';
import { ListRow, ROOM_DOT } from './ListRow';
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

/** `5 members · 41m · $3.18 / $6.00` — the row's mono meta. */
function roomMeta(room: RoomSummary): string {
  const members = `${room.memberCount} member${room.memberCount === 1 ? '' : 's'}`;
  const end = room.status === 'running' || room.status === 'completing' ? Date.now() : Date.parse(room.updatedAt);
  const elapsed = room.startedAt ? formatElapsed(end - Date.parse(room.startedAt)) : formatRelative(room.updatedAt);
  const spend = room.maxCostUsd > 0
    ? `${formatCost(room.costUsd)} / ${formatCost(room.maxCostUsd)}`
    : formatCost(room.costUsd);
  return `${members} · ${elapsed} · ${spend}`;
}

/** The row subtitle: why the Room stopped beats what it was asked to do. */
function roomSub(room: RoomSummary): string | undefined {
  if (room.attention?.pause) return room.attention.pause.detail;
  if (room.status === 'completed') return `Completed · ${formatRelative(room.updatedAt)}`;
  return room.problemStatement;
}

export function RoomsOverview({ rooms, onOpenRoom, onNew }: RoomsOverviewProps) {
  const [shown, setShown] = useState(PAGE);
  const sorted = useMemo(() => {
    const rank = new Map(STATUS_ORDER.map((status, i) => [status, i]));
    return rooms.toSorted((a, b) =>
      (rank.get(a.status) ?? 99) - (rank.get(b.status) ?? 99) || b.updatedAt.localeCompare(a.updatedAt));
  }, [rooms]);

  if (rooms.length === 0) return <EmptyRooms onNew={onNew} />;

  return (
    <div className="flex flex-col">
      <SectionHead count={rooms.length}>Rooms</SectionHead>
      {sorted.slice(0, shown).map((room) => (
        <ListRow
          key={room.id}
          status={ROOM_DOT[room.status]}
          title={room.title}
          sub={roomSub(room)}
          faces={
            room.members?.length ? (
              <FaceStack
                className="shrink-0"
                faces={room.members.map((member) => ({
                  // The 22px list face carries the initial (C), never ◎.
                  label: memberGlyph(member.name),
                  tone: member.isConductor ? 'conductor' : member.addedAfterStart ? 'new' : 'member',
                }))}
              />
            ) : undefined
          }
          needsCount={room.attentionCount}
          meta={roomMeta(room)}
          onClick={() => onOpenRoom(room.id)}
        />
      ))}
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
