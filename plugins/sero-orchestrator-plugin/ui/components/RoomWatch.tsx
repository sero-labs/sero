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

import { use, useContext } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { cn } from '@sero-ai/ui/lib/utils';
import { AppContext } from '@sero-ai/app-runtime';
import type { SubagentLiveEntry } from '@sero-ai/app-runtime';
import type { MemberLiveSnapshot } from '../../shared/room-live-types';
import type { RoomMember } from '../../shared/room-types';
import { formatCost, formatElapsed, formatTimer } from '../lib/format';
import { useMemberLastReplies, type RoomFeedDispatch } from '../lib/use-room-feed';
import { useRoomChildren } from '../lib/use-room-children';
import { memberGlyph } from '../lib/member-glyph';
import { memberPaneText } from '../lib/room-view';
import { quietNow } from '../lib/live-facts';
import { useNow } from '../lib/use-now';
import { WorkViewContext } from '../lib/use-work-activity';
import type { WorkFeedback } from '@sero-ai/common';
import { Face, LivePill } from './room-kit';

interface RoomWatchProps {
  roomId: string;
  memberIds: string[];
  members: Map<string, RoomMember>;
  live: Map<string, MemberLiveSnapshot>;
  dispatch: RoomFeedDispatch;
  onOpen: (memberId: string) => void;
}

export function RoomWatch({ roomId, memberIds, members, live, dispatch, onOpen }: RoomWatchProps) {
  // Child agents belong to this workspace. Read from the context rather than a
  // prop, so a caller that has no workspace id does not have to invent one.
  const workspaceId = use(AppContext)?.workspaceId ?? null;
  // A tile that is not streaming shows the end of its own last reply, read from
  // the session file once per status change.
  const resting = memberIds
    .filter((memberId) => live.get(memberId)?.turnId == null)
    .map((memberId) => ({ id: memberId, status: members.get(memberId)?.status ?? '' }));
  const lastReplies = useMemberLastReplies(roomId, resting, dispatch);

  // A member that delegates shows what its child agents are doing. Children are
  // matched on the member's own session id.
  const sessionIds: string[] = [];
  for (const memberId of memberIds) {
    const sessionId = members.get(memberId)?.session.sessionId;
    if (sessionId) sessionIds.push(sessionId);
  }
  const children = useRoomChildren(workspaceId, sessionIds);
  // What each member waits on, from the same feedback the Rooms list reads.
  const { byMember, epoch } = useContext(WorkViewContext);
  // A timer on screen needs a tick; with no turn in flight, nothing runs.
  const now = useNow(memberIds.some((memberId) => live.get(memberId)?.turnId != null));
  return (
    <div
      aria-label="What every member is doing"
      className="grid min-w-0 flex-1 auto-rows-min gap-3 overflow-y-auto p-3.5 @min-[1000px]/panel:grid-cols-2"
    >
      {memberIds.map((memberId) => {
        const member = members.get(memberId);
        if (!member) return null;
        return (
          <WatchPane
            key={memberId}
            member={member}
            snapshot={live.get(memberId) ?? null}
            feedback={byMember.get(memberId)}
            epoch={epoch}
            now={now}
            lastReply={lastReplies.get(memberId) ?? null}
            children={children.get(member.session.sessionId ?? '') ?? []}
            onOpen={() => onOpen(memberId)}
          />
        );
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
function paneNow(
  member: RoomMember,
  snapshot: MemberLiveSnapshot | null,
  feedback: WorkFeedback | undefined,
  epoch: string | null,
  now: number,
): { icon: string; what: string; elapsed: string } {
  const tool = snapshot?.toolInFlight;
  if (tool) {
    return {
      icon: '⌨',
      what: `${tool.toolName} ${tool.summary}`.trim(),
      elapsed: formatTimer(now - new Date(tool.startedAt).getTime()),
    };
  }
  if (snapshot?.turnId) {
    // No tool is open. A quiet model request is named with its measured wait;
    // with nothing known the tile says only that a turn is in progress.
    const quiet = quietNow(feedback, epoch, !!snapshot.text, now);
    if (quiet) return { icon: '◷', what: quiet.what, elapsed: quiet.ms === null ? '—' : formatTimer(quiet.ms) };
    return { icon: '✎', what: 'In a turn', elapsed: '—' };
  }
  if (member.status === 'completed' || member.status === 'retired') return { icon: '✓', what: member.statusDetail, elapsed: '—' };
  return { icon: '◷', what: member.statusDetail, elapsed: '—' };
}

function WatchPane({
  member,
  snapshot,
  feedback,
  epoch,
  now: clock,
  lastReply,
  children,
  onOpen,
}: {
  member: RoomMember;
  snapshot: MemberLiveSnapshot | null;
  feedback: WorkFeedback | undefined;
  epoch: string | null;
  now: number;
  lastReply: string | null;
  children: SubagentLiveEntry[];
  onOpen: () => void;
}) {
  const midTurn = snapshot?.turnId != null;
  const now = paneNow(member, snapshot, feedback, epoch, clock);
  const body = memberPaneText(snapshot, lastReply);

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

      {/* The stream clips at the tile, faded at the bottom — never grows it.
          A member that delegated lists its child agents here instead. */}
      {children.length > 0 ? (
        <div className="grid min-h-0 flex-1 content-start gap-1.5 overflow-hidden px-3 py-2.5">
          <span className="room-mono-micro text-room-text4">
            {children.length} agent{children.length === 1 ? '' : 's'}
          </span>
          {children.map((child) => (
            <ChildRow key={child.id} child={child} now={clock} />
          ))}
        </div>
      ) : (
        <div className="relative min-h-0 flex-1 overflow-hidden px-3 py-2.5 after:absolute after:inset-x-0 after:bottom-0 after:h-[26px] after:bg-linear-to-b after:from-transparent after:to-room-surface">
          {body && (
            <p className={cn('text-[11px] leading-[1.6] whitespace-pre-wrap', midTurn ? 'text-room-text3' : 'text-room-text4')}>
              {body}
            </p>
          )}
        </div>
      )}

      <div className="room-mono-micro flex shrink-0 items-center gap-2 border-t border-room-line px-3 py-2 text-room-text4">
        {formatCost(member.usage.costUsd)} · {member.usage.turns} {member.usage.turns === 1 ? 'turn' : 'turns'}
        <Button variant="outline" className="ml-auto h-6 px-2 text-[10px]" onClick={onOpen}>
          Open session
        </Button>
      </div>
    </section>
  );
}

/**
 * One child agent of a member: its name, what it does now, and how long it has
 * been running.
 */
function ChildRow({ child, now }: { child: SubagentLiveEntry; now: number }) {
  const tool = child.toolActivity.filter((item) => item.running).at(-1);
  // A child with no tool open is not described: nothing here knows what it waits on.
  const what = tool ? `${tool.toolName} ${tool.argsSummary}`.trim() : '';
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-[11px] font-medium text-room-text2">{child.agentName}</span>
      <span className="room-tabular min-w-0 flex-1 truncate text-[10px] text-room-text3">{what}</span>
      <span className="room-mono-micro shrink-0 text-room-text4">{formatTimer(now - child.startedAt)}</span>
    </div>
  );
}
