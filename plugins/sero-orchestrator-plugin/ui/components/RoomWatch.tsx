/**
 * Watching the whole team work (prototype screen 9).
 *
 * The activity timeline records what HAS happened. This answers the other
 * question: what is each member doing right now. Each pane shows its member's
 * current turn — the text as it arrived and the tool in flight — and a member
 * that is waiting or idle says so plainly instead of showing a stale last line
 * as though it were live.
 *
 * Watching changes nothing. It holds no turn, and a member nobody watches
 * behaves identically (NFR-017).
 */

import { Button } from '@sero-ai/ui';
import type { MemberLiveSnapshot } from '../../shared/room-live-types';
import type { RoomMember } from '../../shared/room-types';
import { formatCost, formatRelative } from '../lib/format';
import { MEMBER_DOT } from './RoomRoster';

interface RoomWatchProps {
  memberIds: string[];
  members: Map<string, RoomMember>;
  live: Map<string, MemberLiveSnapshot>;
  onOpen: (memberId: string) => void;
}

export function RoomWatch({ memberIds, members, live, onOpen }: RoomWatchProps) {
  return (
    <div className="grid min-w-0 flex-1 auto-rows-min gap-3 overflow-auto p-3 md:grid-cols-2 xl:grid-cols-3">
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

  return (
    <div className={`flex flex-col gap-2 rounded-md border p-3 ${midTurn ? 'border-emerald-500/30' : 'border-border'}`}>
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${MEMBER_DOT[member.status]}`} />
        <b className="truncate text-sm">{member.displayName}</b>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          {midTurn ? `Live · turn ${member.usage.turns}` : member.statusDetail}
        </span>
      </div>

      {snapshot?.toolInFlight && (
        <p className="truncate font-mono text-xs text-muted-foreground">
          {snapshot.toolInFlight.toolName} · {snapshot.toolInFlight.summary}
          <span className="ml-1">{formatRelative(snapshot.toolInFlight.startedAt)}</span>
        </p>
      )}

      <p className="max-h-32 overflow-hidden whitespace-pre-wrap text-xs text-muted-foreground">
        {paneText(member, snapshot)}
      </p>

      <div className="mt-auto flex items-center gap-2 text-xs text-muted-foreground">
        {formatCost(member.usage.costUsd)} · {member.usage.turns} turn(s)
        <Button size="sm" variant="ghost" className="ml-auto" onClick={onOpen}>Open session</Button>
      </div>
    </div>
  );
}

/**
 * What a pane says when there is no live text — which is most of the time for
 * most members, and each reason is a different thing for the user to know.
 */
function paneText(member: RoomMember, snapshot: MemberLiveSnapshot | null): string {
  if (snapshot?.text) return snapshot.text;
  if (member.status === 'waiting') {
    return 'Its turn ended when it asked its question, so nothing is streaming and no turn is held. It picks up in the same session the moment a reply lands.';
  }
  if (member.status === 'retired' || member.status === 'completed') {
    return 'Its session is closed but kept. Open it to read everything it did.';
  }
  if (snapshot?.turnId) return 'Working. The turn has produced no text yet.';
  return 'Nothing is streaming from this member right now.';
}
