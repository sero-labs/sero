/**
 * The Rooms list — every Room as a compact row, live from the watched Room
 * index (prototype screen 1).
 *
 * It follows the Workflow overview's rules rather than inventing its own: rows
 * grouped by status with running first, each group bounded with a "Show more",
 * and no unbounded scroll. A Room row says what a list has to say and nothing
 * more — who is in it, what it has spent, and whether it needs you.
 */

import { useMemo, useState } from 'react';
import { Button } from '@sero-ai/ui';
import { Users } from 'lucide-react';
import type { RoomStatus, RoomSummary } from '../../shared/room-types';
import { formatCost, formatRelative } from '../lib/format';
import { ROOM_STATUS_STYLE } from '../lib/status-style';

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

const GROUP_PAGE = 8;

interface RoomsOverviewProps {
  rooms: RoomSummary[];
  onOpenRoom: (roomId: string) => void;
  onNew: () => void;
}

export function RoomsOverview({ rooms, onOpenRoom, onNew }: RoomsOverviewProps) {
  const grouped = useMemo(() => {
    const byStatus = new Map<RoomStatus, RoomSummary[]>();
    for (const room of rooms) {
      const list = byStatus.get(room.status) ?? [];
      list.push(room);
      byStatus.set(room.status, list);
    }
    for (const list of byStatus.values()) list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return STATUS_ORDER.filter((status) => byStatus.has(status)).map((status) => ({
      status,
      rooms: byStatus.get(status) ?? [],
    }));
  }, [rooms]);

  if (rooms.length === 0) return <EmptyRooms onNew={onNew} />;

  return (
    <div className="flex flex-col gap-4">
      {grouped.map(({ status, rooms: group }) => (
        <StatusGroup key={status} status={status} rooms={group} onOpenRoom={onOpenRoom} />
      ))}
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
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border p-6">
      <Users className="h-6 w-6 text-muted-foreground" />
      <div>
        <h3 className="text-base font-semibold">No Rooms yet</h3>
        <p className="max-w-prose text-sm text-muted-foreground">
          Describe a problem and Sero builds a team for it — a Conductor and the specialists the problem
          needs. They work, talk and adapt until it is done.
        </p>
      </div>
      <Button size="sm" onClick={onNew}>Start a Room</Button>
    </div>
  );
}

function StatusGroup({
  status,
  rooms,
  onOpenRoom,
}: {
  status: RoomStatus;
  rooms: RoomSummary[];
  onOpenRoom: (roomId: string) => void;
}) {
  const [shown, setShown] = useState(GROUP_PAGE);
  const style = ROOM_STATUS_STYLE[status];

  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span className={`h-2 w-2 rounded-full ${style.dot}`} /> {style.label} · {rooms.length}
      </span>
      <div className="flex flex-col gap-1.5">
        {rooms.slice(0, shown).map((room) => (
          <RoomRow key={room.id} room={room} onOpen={onOpenRoom} />
        ))}
      </div>
      {rooms.length > shown && (
        <Button size="sm" variant="ghost" className="self-start" onClick={() => setShown((n) => n + GROUP_PAGE)}>
          Show {rooms.length - shown} more
        </Button>
      )}
    </div>
  );
}

function RoomRow({ room, onOpen }: { room: RoomSummary; onOpen: (roomId: string) => void }) {
  const style = ROOM_STATUS_STYLE[room.status];
  const spend = room.maxCostUsd > 0
    ? `${formatCost(room.costUsd)} / ${formatCost(room.maxCostUsd)}`
    : formatCost(room.costUsd);

  return (
    <button
      type="button"
      onClick={() => onOpen(room.id)}
      className={`flex w-full items-center gap-3 rounded-md border border-border px-3 py-2 text-left hover:bg-accent/40 ${style.tint}`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{room.title}</span>
      {room.attentionCount > 0 && (
        <span className="shrink-0 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">
          {room.attentionCount} needs you
        </span>
      )}
      <span className="shrink-0 text-xs text-muted-foreground">
        {room.activeMemberCount > 0 ? `${room.activeMemberCount}/${room.memberCount} working` : `${room.memberCount} members`}
        {' · '}{spend}{' · '}{formatRelative(room.updatedAt)}
      </span>
    </button>
  );
}
