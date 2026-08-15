/**
 * Home (prototype screen 1): page head, the cross-mode "Needs you" band,
 * the two mode cards, then Rooms and Workflows as row lists. Selecting a row
 * opens the working surface for that mode.
 */

import { useMemo, useState } from 'react';
import { Input } from '@sero-ai/ui';
import { Search } from 'lucide-react';
import { WORKFLOW_LABEL, WORKFLOWS_LABEL } from '../../shared/labels';
import type { LoopSummary, OrchestratorAction } from '../../shared/types';
import type { RoomSummary } from '../../shared/room-types';
import { formatCost } from '../lib/format';
import { AttentionQueue, type RoomApprovalDecision } from './AttentionQueue';
import { LoopsOverview } from './LoopsOverview';
import { RoomsOverview } from './RoomsOverview';
import { ModeCard, Pill } from './room-kit';

interface HomeViewProps {
  loops: LoopSummary[];
  busy: boolean;
  onAction: (action: OrchestratorAction) => void;
  onOpenLoop: (loopId: string) => void;
  /** Starts the Workflow create wizard. */
  onNew: () => void;
  /** Starts the Room create flow (the Room mode card). */
  onNewRoom: () => void;
  /** Rooms from the watched Room index — their pending approvals join the same queue. */
  rooms: RoomSummary[];
  onRoomApproval?: (roomId: string, approvalId: string, decision: RoomApprovalDecision) => void;
  onRoomAnswer?: (roomId: string, memberId: string, body: string) => void;
  onRoomResume?: (roomId: string) => void;
  onOpenRoom?: (roomId: string) => void;
}

// Show the search field once the overview is large enough that scanning it by
// eye gets tedious; a small workspace stays uncluttered.
const SEARCH_THRESHOLD = 10;

export function HomeView({
  loops,
  busy,
  onAction,
  onOpenLoop,
  onNew,
  onNewRoom,
  rooms,
  onRoomApproval,
  onRoomAnswer,
  onRoomResume,
  onOpenRoom,
}: HomeViewProps) {
  const [query, setQuery] = useState('');

  const runningLoops = loops.filter((l) => l.progress?.running).length;
  const runningRooms = rooms.filter((r) => r.status === 'running').length;
  const active = runningLoops + runningRooms;
  const spent =
    rooms.reduce((n, r) => n + r.costUsd, 0)
    + loops.reduce((n, l) => n + (l.usage?.costUsd ?? 0), 0);
  const hasAttention =
    loops.some((l) => l.attention?.input || l.attention?.suggestions?.length)
    || rooms.some((r) => r.attention);

  // Search filters only the Workflows overview by title/summary/prompt; the
  // "Needs you" queue always reflects every loop (it must never be hidden).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return loops;
    return loops.filter((l) => `${l.title} ${l.summary} ${l.prompt}`.toLowerCase().includes(q));
  }, [loops, query]);

  return (
    <div className="flex h-full flex-1 flex-col overflow-auto px-6 py-5">
      <div className="mb-[18px]">
        <h3 className="text-[22px] leading-tight font-semibold tracking-[-0.035em] text-room-text">Orchestrator</h3>
        <p className="mt-1.5 text-xs text-room-text3">
          {active} active · {formatCost(spent)} spent
        </p>
      </div>

      {hasAttention ? (
        <div className="mb-[18px]">
          <AttentionQueue
            loops={loops}
            busy={busy}
            onAction={onAction}
            onOpenLoop={onOpenLoop}
            rooms={rooms}
            onRoomApproval={onRoomApproval}
            onRoomAnswer={onRoomAnswer}
            onRoomResume={onRoomResume}
            onOpenRoom={onOpenRoom}
          />
        </div>
      ) : (
        <p className="mb-[18px] text-xs text-room-text4">Nothing needs you right now.</p>
      )}

      <div className="mb-5 grid gap-3.5 @min-[1000px]/panel:grid-cols-2">
        <ModeCard
          glyph="⟳"
          title={WORKFLOW_LABEL}
          onClick={onNew}
          meta={
            <>
              <Pill>{loops.length} {loops.length === 1 ? 'workflow' : 'workflows'}</Pill>
              {runningLoops > 0 && <Pill>{runningLoops} running</Pill>}
              <Pill>Step graph</Pill>
            </>
          }
        >
          Describe a repeatable job. Sero plans the steps, their order and their completion checks,
          then runs it — once, on a schedule, or on an event.
        </ModeCard>
        <ModeCard
          on
          glyph="◎"
          title="Room"
          onClick={onNewRoom}
          badge={<Pill tone="brand" className="h-[19px] text-[9px]">New</Pill>}
          meta={
            <>
              <Pill>{rooms.length} {rooms.length === 1 ? 'room' : 'rooms'}</Pill>
              {runningRooms > 0 && <Pill tone="brand">{runningRooms} running</Pill>}
              <Pill>Persistent team</Pill>
            </>
          }
        >
          Describe a problem. Sero builds a team for it — a Conductor plus the specialists the
          problem needs — and they work, talk and adapt until it is done.
        </ModeCard>
      </div>

      {rooms.length > 0 && (
        <div className="mb-4">
          <RoomsOverview rooms={rooms} onOpenRoom={onOpenRoom ?? (() => {})} onNew={onNewRoom} />
        </div>
      )}

      <div className="relative">
        {loops.length > SEARCH_THRESHOLD && (
          <div className="absolute top-0 right-0 z-10 w-56">
            <Search className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-room-text3" />
            <Input
              className="h-7 border-room-line-strong bg-room-sunken pl-7 text-xs"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${WORKFLOWS_LABEL.toLowerCase()}…`}
            />
          </div>
        )}
        {query.trim() && filtered.length === 0 ? (
          <p className="text-sm text-room-text3">No workflows match your search.</p>
        ) : (
          <LoopsOverview loops={filtered} onOpenLoop={onOpenLoop} />
        )}
      </div>
    </div>
  );
}
