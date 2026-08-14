/**
 * The roster rail (prototype screen 8, left region).
 *
 * The rail is driven by the member ids on the Room record, not by the member
 * records themselves: an id is true before its file has been read, so a row
 * keeps its place rather than appearing late and moving the list under the
 * pointer.
 *
 * Waiting and idle members are called out plainly. A user reading the rail has
 * to be able to tell "stuck" from "not spending a turn right now", because they
 * look the same from outside and mean opposite things.
 */

import { openSeroApp } from '@sero-ai/app-runtime';
import { ArrowUpRight, Users } from 'lucide-react';
import type { MemberStatus, RoomMember } from '../../shared/room-types';
import { formatCost } from '../lib/format';

/** Room member states, in the same visual language as loop and Room status. */
const MEMBER_DOT: Record<MemberStatus, string> = {
  starting: 'bg-emerald-500/50',
  idle: 'bg-muted-foreground/40',
  working: 'bg-emerald-500',
  waiting: 'bg-amber-500',
  blocked: 'bg-amber-500',
  suspended: 'bg-muted-foreground/40',
  retiring: 'bg-muted-foreground/40',
  retired: 'bg-muted-foreground/30',
  completed: 'bg-sky-500',
  failed: 'bg-rose-500',
  offline: 'bg-muted-foreground/30',
};

/** States that hold no execution slot, which is the thing the rail must make obvious. */
const SPENDS_NO_TURN: readonly MemberStatus[] = ['idle', 'waiting', 'blocked', 'suspended', 'offline'];

interface RoomRosterProps {
  memberIds: string[];
  members: Map<string, RoomMember>;
  selectedId: string | null;
  onSelect: (memberId: string) => void;
}

export function RoomRoster({ memberIds, members, selectedId, onSelect }: RoomRosterProps) {
  return (
    <aside className="flex w-64 shrink-0 flex-col gap-1 overflow-auto border-r border-border p-3">
      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Users className="h-3.5 w-3.5" /> Team · {memberIds.length}
      </span>
      {memberIds.map((memberId) => (
        <MemberRow
          key={memberId}
          memberId={memberId}
          member={members.get(memberId) ?? null}
          selected={memberId === selectedId}
          onSelect={onSelect}
        />
      ))}
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        Waiting and idle members hold no turn. A waiting member picks up again the moment its answer lands.
      </p>
      {/* The board shows this team beside every other piece of work in flight.
          It links back here rather than repeating the Room's controls. */}
      <button
        type="button"
        onClick={() => void openSeroApp('board')}
        className="mt-1 flex items-center gap-1 text-left text-xs text-muted-foreground hover:text-foreground"
      >
        Open this team on the Agent Board <ArrowUpRight className="h-3 w-3" />
      </button>
    </aside>
  );
}

function MemberRow({
  memberId,
  member,
  selected,
  onSelect,
}: {
  memberId: string;
  member: RoomMember | null;
  selected: boolean;
  onSelect: (memberId: string) => void;
}) {
  const name = member?.displayName ?? memberId;
  const status = member?.status ?? 'offline';

  return (
    <button
      type="button"
      onClick={() => onSelect(memberId)}
      className={`flex items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent/40 ${
        selected ? 'bg-accent/60' : ''
      }`}
    >
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${MEMBER_DOT[status]}`} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <b className="truncate text-sm">{name}</b>
          {member?.isConductor && <span className="text-xs text-muted-foreground">leads</span>}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {member?.statusDetail ?? 'Loading…'}
        </span>
        {member && SPENDS_NO_TURN.includes(status) && (
          <span className="block text-xs text-muted-foreground/70">holds no turn</span>
        )}
      </span>
      {member && <span className="shrink-0 text-xs text-muted-foreground">{formatCost(member.usage.costUsd)}</span>}
    </button>
  );
}

export { MEMBER_DOT, SPENDS_NO_TURN };
