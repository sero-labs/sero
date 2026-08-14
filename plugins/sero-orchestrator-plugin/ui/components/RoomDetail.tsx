/**
 * The live Room (prototype screens 8, 9 and 12).
 *
 * Three regions and two views. Timeline answers "what has happened"; Watch
 * answers "what is happening right now". Both read the same Room, and neither
 * is the source of truth for any of it: every record on screen is a file the
 * runtime wrote, and every control sends a command back through the `rooms`
 * tool rather than changing anything here.
 *
 * Approvals sit above both views, because a Room waiting on the user is not
 * something to find by scrolling.
 */

import { useState } from 'react';
import { Button } from '@sero-ai/ui';
import { ArrowLeft } from 'lucide-react';
import { TERMINAL_ROOM_STATUSES, type RoomSummary } from '../../shared/room-types';
import { useRoom } from '../lib/use-room-index';
import { memberNames, useRoomMembers } from '../lib/use-room-members';
import { defaultRoomView, roomSignal, type RoomView } from '../lib/room-view';
import { useRoomLive, useRoomTimeline, type RoomFeedDispatch } from '../lib/use-room-feed';
import { RoomActivity } from './RoomActivity';
import { RoomCompletion } from './RoomCompletion';
import { RoomApprovalCard, type RoomApprovalDecision } from './RoomApprovalCard';
import { RoomMemberPanel } from './RoomMemberPanel';
import { RoomMessageDialog } from './RoomMessageDialog';
import { RoomStopBanner } from './RoomStopBanner';
import { RoomRoster } from './RoomRoster';
import { RoomSidePanel } from './RoomSidePanel';
import { RoomTopBar } from './RoomTopBar';
import { RoomWatch } from './RoomWatch';

interface RoomDetailProps {
  roomId: string;
  /** The Room's index entry, which carries the approvals the user must answer. */
  summary: RoomSummary | undefined;
  busy: boolean;
  dispatch: RoomFeedDispatch;
  onApproval: (roomId: string, approvalId: string, decision: RoomApprovalDecision) => void;
  onBack: () => void;
}

export function RoomDetail({ roomId, summary, busy, dispatch, onApproval, onBack }: RoomDetailProps) {
  const [view, setView] = useState<RoomView | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  const room = useRoom(roomId);
  // A finished Room opens on its result; a live one opens on its activity. The
  // user's own choice wins from then on.
  const finished = room ? TERMINAL_ROOM_STATUSES.includes(room.runtime.status) : false;
  const shownView = view ?? (room ? defaultRoomView(room.runtime.status) : 'timeline');
  const members = useRoomMembers(roomId, room?.memberIds ?? []);
  const names = memberNames(members);
  const signal = roomSignal(room);
  const events = useRoomTimeline(roomId, dispatch, signal);
  // Live text is retained only while a Watch view asks for it, so the demand
  // follows the view rather than the open Room.
  const live = useRoomLive(roomId, dispatch, shownView === 'watch' || selectedId !== null, signal);

  if (!room) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        Reading this Room…
        <Button size="sm" variant="ghost" onClick={onBack}>Back to Rooms</Button>
      </div>
    );
  }

  const send = (action: string, params: Record<string, unknown> = {}) =>
    void dispatch({ action, roomId, ...params });

  const selected = selectedId ? members.get(selectedId) ?? null : null;
  const approvals = summary?.attention?.approvals ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-4 pt-2">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Rooms
        </Button>
      </div>

      <RoomTopBar
        room={room}
        view={shownView}
        busy={busy}
        onView={(next) => {
          setView(next);
          setSelectedId(null);
        }}
        onMessage={() => setComposing(true)}
        onPause={() => send('pause')}
        onResume={() => send('resume')}
        onStop={() => send('cancel')}
      />

      {room.runtime.stopReason && (
        <RoomStopBanner
          stopReason={room.runtime.stopReason}
          resumable={!finished}
          busy={busy}
          onMessage={() => setComposing(true)}
          onResume={() => send('resume')}
          onStop={() => send('cancel')}
        />
      )}

      {approvals.length > 0 && summary && (
        <div className="grid gap-3 border-b border-border p-3 md:grid-cols-2">
          {approvals.map((approval) => (
            <RoomApprovalCard
              key={approval.approvalId}
              room={summary}
              approval={approval}
              busy={busy}
              onDecide={onApproval}
            />
          ))}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <RoomRoster
          memberIds={room.memberIds}
          members={members}
          selectedId={selectedId}
          onSelect={(memberId) => setSelectedId(memberId === selectedId ? null : memberId)}
        />

        {selected ? (
          <RoomMemberPanel
            roomId={roomId}
            member={selected}
            live={live.get(selected.id) ?? null}
            maxCostUsd={room.definition.envelope.maxCostUsdPerMember}
            busy={busy}
            dispatch={dispatch}
            onWake={() => send('wake', { memberId: selected.id })}
            onAnswer={(body) => send('answer', { memberId: selected.id, body })}
            onRelease={() => send('release', { memberId: selected.id })}
            onClose={() => setSelectedId(null)}
          />
        ) : shownView === 'result' ? (
          <RoomCompletion
            room={room}
            members={members}
            finalLine={events.find((event) => event.kind === 'room-status')?.summary ?? null}
            onOpenMember={setSelectedId}
          />
        ) : shownView === 'watch' ? (
          <RoomWatch
            memberIds={room.memberIds}
            members={members}
            live={live}
            onOpen={setSelectedId}
          />
        ) : (
          <>
            <RoomActivity events={events} names={names} />
            <RoomSidePanel room={room} names={names} />
          </>
        )}
      </div>

      <RoomMessageDialog
        open={composing}
        busy={busy}
        members={room.memberIds.map((id) => ({ id, name: names.get(id) ?? id }))}
        onSend={(body, memberIds, now) => {
          send('intervene', { body, memberIds: memberIds.join(','), deliver: now ? 'now' : 'next-turn' });
          setComposing(false);
        }}
        onClose={() => setComposing(false)}
      />
    </div>
  );
}
