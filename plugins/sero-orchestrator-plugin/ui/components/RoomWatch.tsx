/**
 * Watching the whole team work (prototype screen 9).
 *
 * The activity timeline records what HAS happened. This answers the other
 * question: what is each member doing right now. Every tile is a fixed 214px —
 * head, current-tool strip, streaming body with its bottom fade, footer — so
 * the grid holds still while members stream instead of jumping with their
 * text. A member that is waiting or idle says so plainly and dims, rather than
 * showing a stale last line as though it were live.
 *
 * Watching changes nothing. It holds no turn, and a member nobody watches
 * behaves identically (NFR-017).
 */

import { Button } from '@sero-ai/ui/components/ui/button';
import { cn } from '@sero-ai/ui/lib/utils';
import type { MemberLiveSnapshot } from '../../shared/room-live-types';
import type { RoomMember } from '../../shared/room-types';
import { formatCost, formatElapsed, formatTimer } from '../lib/format';
import { memberGlyph } from '../lib/member-glyph';
import { memberPaneText } from '../lib/room-view';
import { Face, LivePill } from './room-kit';

interface RoomWatchProps {
  memberIds: string[];
  members: Map<string, RoomMember>;
  live: Map<string, MemberLiveSnapshot>;
  onOpen: (memberId: string) => void;
}

export function RoomWatch({ memberIds, members, live, onOpen }: RoomWatchProps) {
  return (
    <div
      aria-label="What every member is doing"
      className="grid min-w-0 flex-1 auto-rows-min gap-3 overflow-y-auto p-3.5 @min-[1000px]/panel:grid-cols-2"
    >
      {memberIds.map((memberId) => {
        const member = members.get(memberId);
        return member ? (
          <WatchPane
            key={memberId}
            member={member}
            snapshot={live.get(memberId) ?? null}
            onOpen={() => onOpen(memberId)}
          />
        ) : null;
      })}
    </div>
  );
}

/** The head pill: live with the turn number, or why nothing is streaming. */
function panePill(member: RoomMember, midTurn: boolean) {
  if (midTurn) return <LivePill>Live · turn {member.usage.turns}</LivePill>;
  if (member.status === 'waiting' || member.status === 'blocked') {
    return <LivePill idle>Waiting {formatElapsed(Date.now() - new Date(member.statusAt).getTime())}</LivePill>;
  }
  if (member.status === 'completed' || member.status === 'retired') return <LivePill idle>Finished</LivePill>;
  if (member.status === 'offline' || member.status === 'starting') return <LivePill idle>Not started</LivePill>;
  return <LivePill idle>{member.status}</LivePill>;
}

/** The current-tool strip's icon + line: what is happening this second. */
function paneNow(member: RoomMember, snapshot: MemberLiveSnapshot | null): { icon: string; what: string; elapsed: string } {
  const tool = snapshot?.toolInFlight;
  if (tool) {
    return {
      icon: '⌨',
      what: `${tool.toolName} ${tool.summary}`.trim(),
      elapsed: formatTimer(Date.now() - new Date(tool.startedAt).getTime()),
    };
  }
  if (snapshot?.turnId) return { icon: '✎', what: 'thinking — no tool running', elapsed: '—' };
  if (member.status === 'completed' || member.status === 'retired') return { icon: '✓', what: member.statusDetail, elapsed: '—' };
  return { icon: '◷', what: member.statusDetail, elapsed: '—' };
}

function WatchPane({
  member,
  snapshot,
  onOpen,
}: {
  member: RoomMember;
  snapshot: MemberLiveSnapshot | null;
  onOpen: () => void;
}) {
  const midTurn = snapshot?.turnId != null;
  const now = paneNow(member, snapshot);

  return (
    <section
      aria-label={member.displayName}
      className={cn(
        'flex h-[214px] flex-col overflow-hidden rounded-[10px] border bg-room-surface',
        midTurn ? 'border-brand-primary-border' : 'border-room-line',
        !midTurn && member.status !== 'working' && 'opacity-70',
      )}
    >
      <div className="flex shrink-0 items-center gap-[9px] border-b border-room-line px-3 py-2.5">
        <Face seed={member.id} size={24} tone={member.isConductor ? 'conductor' : 'member'} label={memberGlyph(member.displayName, member.isConductor)} />
        <b className="min-w-0 truncate text-xs font-medium text-room-text">{member.displayName}</b>
        <span className="ml-auto shrink-0">{panePill(member, midTurn)}</span>
      </div>

      <div className="flex shrink-0 items-center gap-[9px] border-b border-room-line bg-room-sunken px-3 py-2">
        <span aria-hidden className="grid size-[18px] shrink-0 place-items-center rounded-[5px] bg-room-muted text-[9px] text-room-text3">
          {now.icon}
        </span>
        <span className="room-tabular min-w-0 flex-1 truncate text-[10px] text-room-text2">{now.what}</span>
        <span className="room-mono-micro shrink-0 text-room-text4">{now.elapsed}</span>
      </div>

      {/* The stream clips at the tile, faded at the bottom — never grows it. */}
      <div className="relative min-h-0 flex-1 overflow-hidden px-3 py-2.5 after:absolute after:inset-x-0 after:bottom-0 after:h-[26px] after:bg-linear-to-b after:from-transparent after:to-room-surface">
        <p className={cn('text-[11px] leading-[1.6] whitespace-pre-wrap', midTurn ? 'text-room-text3' : 'text-room-text4')}>
          {memberPaneText(member.status, snapshot)}
        </p>
      </div>

      <div className="room-mono-micro flex shrink-0 items-center gap-2 border-t border-room-line px-3 py-2 text-room-text4">
        {formatCost(member.usage.costUsd)} · {member.usage.turns} {member.usage.turns === 1 ? 'turn' : 'turns'}
        <Button variant="outline" className="ml-auto h-6 px-2 text-[10px]" onClick={onOpen}>
          Open session
        </Button>
      </div>
    </section>
  );
}
