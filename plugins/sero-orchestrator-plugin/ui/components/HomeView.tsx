/**
 * Home: a status line, then the work that needs you, then the lists.
 *
 * What is running comes from the shared rule (`homeStatus`), so the head and
 * the Workflows list always agree. The three explainer cards that used to take
 * a third of the first screen are now three buttons in the head plus one
 * "What are these?" disclosure, and counts that a tab already carries are not
 * repeated here.
 */

import { useMemo, useState } from 'react';
import { Input } from '@sero-ai/ui/components/ui/input';
import { Search } from 'lucide-react';
import { useAppInfo } from '@sero-ai/app-runtime';
import { sessionStartedAt } from '@sero-ai/common';
import { WORKFLOW_LABEL, WORKFLOWS_LABEL } from '../../shared/labels';
import type { LoopSummary, OrchestratorAction } from '../../shared/types';
import type { RoomSummary } from '../../shared/room-types';
import type { GoalIndexEntry } from '../../shared/goal-types';
import { homeStatus, workspaceName } from '../lib/home-status';
import { ActivityGlyphChip } from './ActivityWord';
import { AttentionQueue, type RoomApprovalDecision } from './AttentionQueue';
import { LoopsOverview } from './LoopsOverview';
import { RoomsOverview } from './RoomsOverview';
import { GoalsOverview } from './GoalsOverview';

interface HomeViewProps {
  loops: LoopSummary[];
  busy: boolean;
  onAction: (action: OrchestratorAction) => void;
  onOpenLoop: (loopId: string) => void;
  /** Starts the Workflow create wizard. */
  onNew: () => void;
  /** Starts the Room create flow. */
  onNewRoom: () => void;
  /** Rooms from the watched Room index — their pending approvals join the same queue. */
  rooms: RoomSummary[];
  onRoomApproval?: (roomId: string, approvalId: string, decision: RoomApprovalDecision) => void;
  onRoomAnswer?: (roomId: string, memberId: string, body: string) => void;
  onRoomResume?: (roomId: string) => void;
  onOpenRoom?: (roomId: string) => void;
  goals: GoalIndexEntry[];
  onOpenGoal: (goalId: string) => void;
  onDeleteGoal: (goalId: string) => void;
}

// Show the search field once the overview is large enough that scanning it by
// eye gets tedious; a small workspace stays uncluttered.
const SEARCH_THRESHOLD = 10;

/** What a Workflow, a Room and a Goal are, in one disclosure instead of three cards. */
function WhatAreThese() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        className="text-xs text-room-text3 underline-offset-2 hover:underline"
        onClick={() => setOpen((was) => !was)}
      >
        What are {WORKFLOWS_LABEL}, Rooms and Goals?
      </button>
      {open && (
        <dl className="mt-2 grid gap-2 text-xs text-room-text2 @min-[1000px]/panel:grid-cols-3">
          <div>
            <dt className="font-medium text-room-text">{WORKFLOW_LABEL}</dt>
            <dd>
              A repeatable job. Sero plans the steps, their order and their completion checks, then runs
              it once, on a schedule, or on an event.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-room-text">Room</dt>
            <dd>
              A team for one problem: a Conductor and the specialists the problem needs. They work, talk
              and adapt until it is done.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-room-text">Goal</dt>
            <dd>
              One chat session working toward one objective. Start it with <code>/goal</code> when the
              outcome is clear and the route is not.
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}

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
  goals,
  onOpenGoal,
  onDeleteGoal,
}: HomeViewProps) {
  const [query, setQuery] = useState('');
  const { workspacePath } = useAppInfo();
  const session = useMemo(() => sessionStartedAt(), []);
  const status = useMemo(
    () => homeStatus({ loops, rooms, goals, workspaceName: workspaceName(workspacePath), sessionStartedAt: session }),
    [loops, rooms, goals, workspacePath, session],
  );

  const hasAttention =
    loops.some((l) => l.attention?.input || l.attention?.suggestions?.length)
    || rooms.some((r) => r.attention)
    || goals.some((goal) => !goal.closedAt && (
      goal.status === 'blocked'
      || goal.status === 'waiting'
      || (goal.status === 'paused' && goal.pauseReason === 'no-progress')
    ));

  // Search filters only the Workflows overview by title/summary/prompt; the
  // "Needs you" queue always reflects every loop (it must never be hidden).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return loops;
    return loops.filter((l) => `${l.title} ${l.summary} ${l.prompt}`.toLowerCase().includes(q));
  }, [loops, query]);

  return (
    <div className="flex h-full flex-1 flex-col overflow-auto px-6 py-5">
      {/* One quiet line, not a headline: what is running, then what waits and
          what it cost. The three create buttons live in the top bar. */}
      <div className="mb-[18px] flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="inline-flex items-center gap-[7px] text-xs text-room-text2">
          <ActivityGlyphChip state={status.state} />
          {status.headline}
        </span>
        <span className="text-[11px] text-room-text3">{status.detail}</span>
        <span className="ml-auto"><WhatAreThese /></span>
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
            goals={goals}
            onOpenGoal={onOpenGoal}
          />
        </div>
      ) : (
        <p className="mb-[18px] text-xs text-room-text4">Nothing needs you right now.</p>
      )}

      {goals.length > 0 && (
        <div className="mb-4">
          <GoalsOverview goals={goals} busy={busy} onOpenGoal={onOpenGoal} onDeleteGoal={onDeleteGoal} />
        </div>
      )}

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
