/**
 * Which surface the current view shows.
 *
 * One branch per view mode, and nothing else: the app above keeps the shell,
 * the banners and the wiring, so neither side carries both the routing and the
 * state it routes with.
 */

import type { LibraryIndex, Loop, OrchestratorAction } from '../shared/types';
import type { CreateLoopSubmit } from './components/CreateLoopForm';
import type { OrchestratorView } from './lib/orchestrator-navigation';
import type { useRoomActions } from './lib/use-room-actions';
import type { useOrchestratorIndex } from './lib/use-orchestrator-index';
import type { useRoomIndex } from './lib/use-room-index';
import type { useGoalIndex } from './lib/use-goal-index';
import { CreateLoopWizard } from './components/CreateLoopWizard';
import { GoalMode } from './components/GoalMode';
import { HomeView } from './components/HomeView';
import { LibraryView } from './components/LibraryView';
import { RoomCreateFlow } from './components/RoomCreateFlow';
import { RoomDetail } from './components/RoomDetail';
import { RoomsOverview } from './components/RoomsOverview';
import { WorkflowPage } from './components/WorkflowPage';
import { WorkflowsList } from './components/WorkflowsList';

export interface OrchestratorRoutesProps {
  view: OrchestratorView;
  navigate: ReturnType<typeof import('./lib/orchestrator-navigation').useOrchestratorNavigation>[1];
  index: ReturnType<typeof useOrchestratorIndex>;
  roomIndex: ReturnType<typeof useRoomIndex>;
  goalIndex: ReturnType<typeof useGoalIndex>;
  room: ReturnType<typeof useRoomActions>;
  busy: boolean;
  stateDir: string;
  libraryDir: string | null;
  libraryIndex: LibraryIndex;
  /** The open Workflow, followed through its own file. */
  selected: Loop | null;
  selectedId: string | null;
  workflowQuery: string;
  setWorkflowQuery(next: string): void;
  onAction(action: OrchestratorAction): Promise<void>;
  detailsDispatch(params: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  openLoop(loopId: string): void;
  openCreate(): void;
  openGoal(goalId: string): void;
  deleteGoal(goalId: string): Promise<void>;
  createLoop(values: CreateLoopSubmit): Promise<string | null>;
  onLoadFromLibrary(entryId: string, version?: number): Promise<void>;
}

export function OrchestratorRoutes({
  view,
  navigate,
  index,
  roomIndex,
  goalIndex,
  room,
  busy,
  stateDir,
  libraryDir,
  libraryIndex,
  selected,
  selectedId,
  workflowQuery,
  setWorkflowQuery,
  onAction,
  detailsDispatch,
  openLoop,
  openCreate,
  openGoal,
  deleteGoal,
  createLoop,
  onLoadFromLibrary,
}: OrchestratorRoutesProps) {
  return (
    <>
      {view.mode === 'home' && (
        <HomeView
          loops={index.loops}
          busy={busy}
          onAction={onAction}
          onOpenLoop={openLoop}
          onNew={openCreate}
          onNewRoom={room.openCreate}
          rooms={roomIndex.rooms}
          onRoomApproval={room.onApproval}
          onRoomAnswer={room.onAnswer}
          onRoomResume={room.onResume}
          onOpenRoom={room.open}
          goals={goalIndex.goals}
          onOpenGoal={openGoal}
          onDeleteGoal={deleteGoal}
        />
      )}
      {view.mode === 'create' && (
        <CreateLoopWizard busy={busy} stateDir={stateDir} onCreate={createLoop} onAction={onAction} onOpenLoop={openLoop} onCancel={() => navigate({ mode: 'home' })} />
      )}
      {view.mode === 'rooms' && view.roomId && (
        <RoomDetail
          roomId={view.roomId}
          summary={roomIndex.rooms.find((room) => room.id === view.roomId)}
          busy={busy}
          dispatch={room.dispatch}
          onApproval={room.onApproval}
          initialView={view.roomView}
          initialMemberId={view.memberId}
          onLocationChange={(roomView, memberId, options) => navigate(
            {
              mode: 'rooms',
              roomId: view.roomId,
              roomView,
              memberId: memberId ?? undefined,
            },
            options,
          )}
          onBack={() => navigate({ mode: 'rooms', roomId: null })}
        />
      )}
      {view.mode === 'rooms' && !view.roomId && (
        <div className="flex h-full flex-1 flex-col overflow-auto px-6 py-5">
          <RoomsOverview rooms={roomIndex.rooms} onOpenRoom={room.open} onNew={room.openCreate} />
        </div>
      )}
      {view.mode === 'room-create' && (
        <RoomCreateFlow
          busy={busy}
          dispatch={room.dispatch}
          onStarted={room.open}
          onCancel={() => navigate({ mode: 'rooms', roomId: null })}
        />
      )}
      {view.mode === 'goals' && (
        <GoalMode
          goalId={view.goalId}
          goals={goalIndex.goals}
          onOpenGoal={openGoal}
          onBack={() => navigate({ mode: 'goals', goalId: null })}
        />
      )}
      {view.mode === 'library' && (
        <LibraryView
          key={view.tab}
          initialTab={view.tab}
          libraryDir={libraryDir}
          libraryIndex={libraryIndex}
          busy={busy}
          onLoad={onLoadFromLibrary}
          onOpenLoop={openLoop}
          dispatch={detailsDispatch}
          onClose={() => navigate({ mode: 'home' })}
        />
      )}
      {view.mode === 'detail' && !selectedId && (
        <WorkflowsList
          loops={index.loops}
          libraryIndex={libraryIndex}
          query={workflowQuery}
          onQueryChange={setWorkflowQuery}
          onSelect={openLoop}
          onNew={openCreate}
        />
      )}
      {view.mode === 'detail' && selectedId && (
        <WorkflowPage
          loop={selected}
          busy={busy}
          onAction={onAction}
          onDispatch={detailsDispatch}
          stateDir={stateDir}
          libraryDir={libraryDir}
          libraryIndex={libraryIndex}
          onBack={() => navigate({ mode: 'detail', loopId: null })}
        />
      )}
    </>
  );
}
