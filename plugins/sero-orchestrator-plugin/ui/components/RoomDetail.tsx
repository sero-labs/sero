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
import { TERMINAL_ROOM_STATUSES, type RoomSummary } from '../../shared/room-types';
import { useRoom } from '../lib/use-room-index';
import { memberNames, useRoomMembers } from '../lib/use-room-members';
import { defaultRoomView, roomSignal, type RoomView } from '../lib/room-view';
import { useRoomLive, useRoomTimeline, type RoomFeedDispatch } from '../lib/use-room-feed';
import { MEMBER_DOT, memberGlyph } from '../lib/member-glyph';
import { Face } from './room-kit';
import { RoomActivity } from './RoomActivity';
import { RoomCompletion } from './RoomCompletion';
import { RoomApprovalCard, type RoomApprovalDecision } from './RoomApprovalCard';
import { RoomDraftReview } from './RoomDraftReview';
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
  // Null = closed; a member list = writing to those members (empty = everyone).
  const [composing, setComposing] = useState<{ memberIds: string[] } | null>(null);
  // The side-panel drawer below 1200px; its Team tab carries the roster below
  // 900px (F3 — the collapsed regions live here, toggled from the top bar).
  const [panelOpen, setPanelOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'brief' | 'team'>('brief');

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
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center text-sm text-muted-foreground">
        Reading this Room…
        {/* A Room lives in one workspace. Opened from Usage or the Agent Board,
            the id can belong to a workspace that is not the open one. */}
        <p className="max-w-sm">If nothing appears, this Room belongs to another workspace. Open that workspace to see it.</p>
        <Button size="sm" variant="ghost" onClick={onBack}>Back to Rooms</Button>
      </div>
    );
  }

  // A Room a chat prepared, or a proposal the user left, is still a draft:
  // nothing has run, so there is nothing to watch and nothing to pause. It
  // opens where it can be started, adjusted or discarded instead.
  if (room.runtime.status === 'draft') {
    return <RoomDraftReview roomId={roomId} busy={busy} dispatch={dispatch} onLeave={onBack} showBack />;
  }

  const send = (action: string, params: Record<string, unknown> = {}) =>
    void dispatch({ action, roomId, ...params });

  const selected = selectedId ? members.get(selectedId) ?? null : null;
  const approvals = summary?.attention?.approvals ?? [];
  // A member that used request-attention: it stopped, and only the user can
  // start it again.
  const needsUser = (room?.memberIds ?? [])
    .flatMap((memberId) => {
      const member = members.get(memberId);
      return member?.status === 'blocked' ? [member] : [];
    });

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <RoomTopBar
        room={room}
        view={shownView}
        busy={busy}
        panelOpen={panelOpen}
        onTogglePanel={() => setPanelOpen((open) => !open)}
        onBack={onBack}
        onView={(next) => {
          setView(next);
          setSelectedId(null);
        }}
        onMessage={() => setComposing({ memberIds: [] })}
        onPause={() => send('pause')}
        onResume={() => send('resume')}
        onStop={() => send('cancel')}
      />

      {/* Below 900px the roster rail collapses to this face strip (F3). */}
      <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-room-line px-[18px] py-2 @min-[900px]/panel:hidden">
        {room.memberIds.map((memberId) => {
          const member = members.get(memberId);
          const name = member?.displayName ?? memberId;
          return (
            <button
              key={memberId}
              type="button"
              title={name}
              aria-pressed={memberId === selectedId}
              onClick={() => setSelectedId(memberId === selectedId ? null : memberId)}
              className={`rounded-[7px] ${memberId === selectedId ? 'ring-1 ring-room-line-strong' : ''}`}
            >
              <Face
                seed={memberId}
                size={26}
                tone={member?.isConductor ? 'conductor' : 'member'}
                label={memberGlyph(name, member?.isConductor)}
                status={MEMBER_DOT[member?.status ?? 'offline']}
              />
            </button>
          );
        })}
      </div>

      {room.runtime.stopReason && (
        <RoomStopBanner
          stopReason={room.runtime.stopReason}
          resumable={!finished}
          busy={busy}
          onMessage={() => setComposing({ memberIds: [] })}
          onResume={() => send('resume')}
          onStop={() => send('cancel')}
        />
      )}

      {/* A member that stopped to ask the user is invisible from the Room view
          otherwise: the Room is still running, so there is no stop banner, and
          the request is not an approval. It has to be findable from here. */}
      {needsUser.length > 0 && !selectedId && (
        <div className="flex flex-wrap items-center gap-2 border-b border-status-warning-border bg-status-warning-muted px-[18px] py-2">
          <span className="text-xs text-room-ink-warn">
            {needsUser.map((member) => member.displayName).join(', ')} stopped to ask you something.
          </span>
          <Button className="ml-auto h-[26px] px-2.5 text-[11px]" onClick={() => setSelectedId(needsUser[0].id)}>
            Read it
          </Button>
        </div>
      )}

      {approvals.length > 0 && summary && (
        <div className="grid gap-3 border-b border-room-line p-3 @min-[900px]/panel:grid-cols-2">
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

      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <RoomRoster
          memberIds={room.memberIds}
          members={members}
          selectedId={selectedId}
          onSelect={(memberId) => setSelectedId(memberId === selectedId ? null : memberId)}
          className="hidden @min-[900px]/panel:flex"
        />

        {selected ? (
          <RoomMemberPanel
            // Each member gets its own panel state: a half-typed answer or an
            // opened fold must not follow the user to the next member.
            key={selected.id}
            roomId={roomId}
            member={selected}
            live={live.get(selected.id) ?? null}
            maxCostUsd={room.definition.envelope.maxCostUsdPerMember}
            busy={busy}
            dispatch={dispatch}
            onWake={() => send('wake', { memberId: selected.id })}
            onMessage={() => setComposing({ memberIds: [selected.id] })}
            onAnswer={(body) => send('answer', { memberId: selected.id, body })}
            onRelease={() => send('release', { memberId: selected.id })}
            onTell={(body) => send('intervene', { body, memberIds: selected.id, deliver: 'now' })}
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
            <RoomActivity events={events} members={members} />
            <RoomSidePanel room={room} names={names} className="hidden @min-[1200px]/panel:flex" />
          </>
        )}

        {/* The drawer the top-bar Brief control opens below 1200px. Its Team
            tab exists only below 900px, where the roster rail is gone too. */}
        {panelOpen && !selected && (
          <div className="absolute inset-y-0 right-0 z-10 flex w-80 max-w-full flex-col border-l border-room-line bg-room-bg shadow-xl @min-[1200px]/panel:hidden">
            <div role="tablist" aria-label="Room panel" className="flex h-9 shrink-0 border-b border-room-line @min-[900px]/panel:hidden">
              {(['brief', 'team'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={drawerTab === option}
                  onClick={() => setDrawerTab(option)}
                  className={`grid flex-1 place-items-center text-[11px] ${
                    drawerTab === option
                      ? 'text-room-text2 shadow-[inset_0_-1px_0_var(--brand-primary)]'
                      : 'text-room-text4 hover:text-room-text3'
                  }`}
                >
                  {option === 'brief' ? 'Brief' : 'Team'}
                </button>
              ))}
            </div>
            <RoomRoster
              memberIds={room.memberIds}
              members={members}
              selectedId={selectedId}
              onSelect={(memberId) => {
                setSelectedId(memberId === selectedId ? null : memberId);
                setPanelOpen(false);
              }}
              className={drawerTab === 'team' ? 'w-full flex-1 border-r-0 @min-[900px]/panel:hidden' : 'hidden'}
            />
            <RoomSidePanel
              room={room}
              names={names}
              className={drawerTab === 'team' ? 'hidden w-full flex-1 border-l-0 @min-[900px]/panel:flex' : 'w-full flex-1 border-l-0'}
            />
          </div>
        )}
      </div>

      {/* Mounted only while open, and keyed by who it addresses: a cancelled
          draft must not reappear the next time, addressed to somebody else. */}
      {composing && (
        <RoomMessageDialog
          key={composing.memberIds.join(',') || 'everyone'}
          open
          busy={busy}
          addressed={composing.memberIds}
          members={room.memberIds.map((id) => ({ id, name: names.get(id) ?? id }))}
          onSend={(body, memberIds, now) => {
            send('intervene', { body, memberIds: memberIds.join(','), deliver: now ? 'now' : 'next-turn' });
            setComposing(null);
          }}
          onClose={() => setComposing(null)}
        />
      )}
    </div>
  );
}
