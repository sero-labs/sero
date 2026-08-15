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
import { cn } from '@sero-ai/ui/lib/utils';
import type { RoomMember } from '../../shared/room-types';
import { formatCost, formatElapsed } from '../lib/format';
import { MEMBER_DOT, MEMBER_STATUS_LABEL, memberGlyph } from '../lib/member-glyph';
import { Face } from './room-kit';

interface RoomRosterProps {
  memberIds: string[];
  members: Map<string, RoomMember>;
  selectedId: string | null;
  onSelect: (memberId: string) => void;
  className?: string;
}

export function RoomRoster({ memberIds, members, selectedId, onSelect, className }: RoomRosterProps) {
  return (
    <aside className={cn('flex w-[264px] shrink-0 flex-col overflow-y-auto border-r border-room-line px-2.5 py-[13px]', className)}>
      <div className="room-mono-micro flex h-[26px] items-center px-2 uppercase tracking-[0.1em] text-room-text4">
        Team
        <span className="ml-auto tracking-normal">{memberIds.length}</span>
      </div>
      {memberIds.map((memberId) => (
        <MemberRow
          key={memberId}
          memberId={memberId}
          member={members.get(memberId) ?? null}
          selected={memberId === selectedId}
          onSelect={onSelect}
        />
      ))}
      <p className="mt-[11px] border-t border-room-line px-[9px] pt-2.5 text-[10px] leading-[1.55] text-room-text4">
        Waiting and idle members are not using a turn. A waiting member released its slot and picks up
        again the moment its answer lands.
      </p>
      {/* The board shows this team beside every other piece of work in flight.
          It links back here rather than repeating the Room's controls. */}
      <button
        type="button"
        onClick={() => void openSeroApp('board')}
        className="mx-[9px] mt-2.5 self-start border-b border-dotted border-room-line-strong pb-px text-left text-[10px] text-room-text3 hover:text-room-text2"
      >
        Open this team on the Agent Board ↗
      </button>
    </aside>
  );
}

/** `Waiting on a reply · 3m` — the duration a waiting member has been waiting. */
function statusLine(member: RoomMember): string {
  const base = member.statusDetail || MEMBER_STATUS_LABEL[member.status];
  if (member.status !== 'waiting' && member.status !== 'blocked') return base;
  const heldMs = Date.now() - new Date(member.statusAt).getTime();
  return heldMs >= 60_000 ? `${base} · ${formatElapsed(heldMs)}` : base;
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
      aria-pressed={selected}
      onClick={() => onSelect(memberId)}
      className={cn(
        'mb-0.5 flex w-full items-center gap-[9px] rounded-[7px] border p-[9px] text-left',
        selected ? 'border-room-line bg-room-raised' : 'border-transparent hover:bg-room-raised/50',
      )}
    >
      <Face
        seed={memberId}
        size={26}
        tone={member?.isConductor ? 'conductor' : 'member'}
        label={memberGlyph(name, member?.isConductor)}
        status={MEMBER_DOT[status]}
        statusRingClass={selected ? 'border-room-raised' : 'border-room-bg'}
      />
      <span className="min-w-0 flex-1">
        <b className={cn('block truncate text-xs font-medium', selected ? 'text-room-text' : 'text-room-text2')}>
          {name}
        </b>
        <span className="sr-only">{MEMBER_STATUS_LABEL[status]}</span>
        {/* "Holds no turn" is the rail-foot's job; repeating it per row
            truncates the status detail it sits behind. */}
        <span className="mt-[3px] block truncate text-[10px] text-room-text4">
          {member ? statusLine(member) : 'Loading…'}
        </span>
      </span>
      {member && <span className="room-mono-micro shrink-0 text-room-text4">{formatCost(member.usage.costUsd)}</span>}
    </button>
  );
}
