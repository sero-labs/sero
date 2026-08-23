import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useAppState, useAppTools } from '@sero-ai/app-runtime';
import { DEFAULT_LIBRARY_INDEX, DEFAULT_STATE } from '../shared/defaults';
import type { LibraryIndex, Loop, OrchestratorAction } from '../shared/types';
import { LoopList } from './components/LoopList';
import { RoomsOverview } from './components/RoomsOverview';
import { RoomCreateFlow } from './components/RoomCreateFlow';
import { RoomDetail } from './components/RoomDetail';
import type { RoomApprovalDecision } from './components/AttentionQueue';
import { attentionCount } from './lib/attention-count';
import { useRoomIndex } from './lib/use-room-index';
import { LoopDetail } from './components/LoopDetail';
import { LibraryView } from './components/LibraryView';
import { HomeView } from './components/HomeView';
import { ShellTopBar, type ShellTab } from './components/ShellTopBar';
import { CreateLoopWizard } from './components/CreateLoopWizard';
import type { CreateLoopSubmit } from './components/CreateLoopForm';
import { actionToParams } from './lib/action-params';
import { useOrchestratorIndex, useStateDir } from './lib/use-orchestrator-index';
import { useWatchedJson } from './lib/use-watched-json';
import { useOrchestratorNavigation, type OrchestratorView } from './lib/orchestrator-navigation';
import { OrchestratorStateContext } from './lib/orchestrator-state';
import './styles.css';

/** Which top-bar tab a view highlights. */
function tabOf(view: OrchestratorView): ShellTab {
  switch (view.mode) {
    case 'home': return 'home';
    case 'detail': case 'create': return 'workflows';
    case 'rooms': case 'room-create': return 'rooms';
    case 'library': return view.tab === 'catalog' ? 'catalog' : 'library';
  }
}

const MemoizedLoopList = memo(LoopList);

/** Directory of a file path, tolerant of either separator (renderer has no node:path). */
function dirOf(filePath: string): string {
  const i = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return i >= 0 ? filePath.slice(0, i) : '';
}

/**
 * Orchestrator panel. The home view (default) is a cross-loop "Needs you" inbox +
 * loops overview; selecting a loop opens the list+detail surface. All mutations
 * flow through the `orchestrator` tool → coordinator `requestAction`. The loop
 * list and home follow the watched `index.json` (now carrying an attention
 * payload); the open loop follows its own `loops/<id>/loop.json`.
 */
export function OrchestratorApp() {
  const stateDir = useStateDir();
  const { run } = useAppTools();
  const [appState, updateAppState, stateReady] = useAppState(DEFAULT_STATE);
  const updateReadyState = useCallback((updater: Parameters<typeof updateAppState>[0]) => {
    if (stateReady) updateAppState(updater);
  }, [stateReady, updateAppState]);
  const stateRuntime = useMemo(() => ({
    state: appState,
    updateState: updateReadyState,
    ready: stateReady,
  }), [appState, updateReadyState, stateReady]);
  const [view, navigate] = useOrchestratorNavigation(stateRuntime);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reflectSummary, setReflectSummary] = useState<string | null>(null);
  const [libraryDir, setLibraryDir] = useState<string | null>(null);

  const index = useOrchestratorIndex();
  const roomIndex = useRoomIndex();
  const selectedId = view.mode === 'detail' ? view.loopId : null;
  const loopPath = selectedId && stateDir ? `${stateDir}/loops/${selectedId}/loop.json` : null;
  const selected = useWatchedJson<Loop | null>(loopPath, null);
  const libraryIndex = useWatchedJson<LibraryIndex>(libraryDir ? `${libraryDir}/index.json` : null, DEFAULT_LIBRARY_INDEX);

  // Resolve the profile-global library dir once (the renderer can't derive it).
  useEffect(() => {
    let active = true;
    void run('orchestrator', { action: 'library_list' })
      .then((res) => {
        const dir = (res?.details as { libraryDir?: string } | null)?.libraryDir;
        if (active && dir) setLibraryDir(dir);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [run]);

  const dispatch = useCallback(
    async (params: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        const res = await run('orchestrator', params);
        const details = res.details as { ok?: boolean; error?: string } | null;
        if (details && details.ok === false) setError(details.error ?? 'Action failed.');
        return res;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [run],
  );

  /**
   * Room actions go to the `rooms` tool — the user's Room surface. It is a
   * different tool from `orchestrator` because it is a different authority: the
   * member surface (`room`) refuses a user, and this one refuses a member.
   */
  const roomDispatch = useCallback(
    async (params: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        const res = await run('rooms', params);
        const details = res?.details as { ok?: boolean; error?: string } | null;
        if (details && details.ok === false && details.error) setError(details.error);
        return details;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [run],
  );

  const onRoomApproval = useCallback(
    (roomId: string, approvalId: string, decision: RoomApprovalDecision) => {
      void roomDispatch({ action: 'resolve_approval', roomId, approvalId, decision });
    },
    [roomDispatch],
  );

  /**
   * Answering a member from the home inbox. The Room may be paused because it
   * was waiting for exactly this, so the runtime resumes it on the answer —
   * the user says one thing and the Room carries on.
   */
  const onRoomAnswer = useCallback(
    (roomId: string, memberId: string, body: string) => {
      void roomDispatch({ action: 'intervene', roomId, memberIds: memberId, body, deliver: 'now' });
    },
    [roomDispatch],
  );

  const onRoomResume = useCallback(
    (roomId: string) => {
      void roomDispatch({ action: 'resume', roomId });
    },
    [roomDispatch],
  );

  const openRoom = useCallback((roomId: string) => navigate({ mode: 'rooms', roomId }), [navigate]);
  const openRoomCreate = useCallback(() => navigate({ mode: 'room-create' }), [navigate]);

  // The Catalog tab drives itself through tool calls; it only needs the details.
  const detailsDispatch = useCallback(
    async (params: Record<string, unknown>) => {
      const res = await dispatch(params);
      return (res?.details as Record<string, unknown> | undefined) ?? null;
    },
    [dispatch],
  );

  const onAction = useCallback(async (action: OrchestratorAction) => {
    if (action.kind === 'create' || action.kind === 'list') return;
    const res = await dispatch(actionToParams(action));
    if (action.kind === 'delete') {
      const details = res?.details as { ok?: boolean } | null;
      if (details?.ok !== false) navigate({ mode: 'home' });
    }
  }, [dispatch, navigate]);

  const openLibrary = async (tab: 'mine' | 'catalog') => {
    if (libraryDir === null) {
      const res = await dispatch({ action: 'library_list' });
      const details = res?.details as { libraryDir?: string } | null;
      if (details?.libraryDir) setLibraryDir(details.libraryDir);
    }
    navigate({ mode: 'library', tab });
  };

  const onLoadFromLibrary = async (entryId: string, version?: number) => {
    const res = await dispatch({ action: 'library_load', entryId, version });
    const details = res?.details as { ok?: boolean; loop?: { id?: string } } | null;
    if (details && details.ok !== false && details.loop?.id) navigate({ mode: 'detail', loopId: details.loop.id });
  };

  const createLoop = async (values: CreateLoopSubmit): Promise<string | null> => {
    const res = await dispatch({
      action: 'create',
      prompt: values.prompt,
      title: values.title,
      useManagedWorktree: values.useManagedWorktree,
      allowDirtyWorkspaceRoot: values.allowDirtyWorkspaceRoot,
      worktreeBranchSource: values.worktreeBranchSource,
      deliveryDestination: values.delivery?.destination,
      deliveryParamsJson: values.delivery?.params ? JSON.stringify(values.delivery.params) : undefined,
      activate: false,
    });
    const details = res?.details as { ok?: boolean; loop?: { id?: string } } | null;
    if (!details || details.ok === false) return null;
    return details.loop?.id ?? null;
  };

  const reflectAll = async () => {
    setReflectSummary(null);
    const res = await dispatch({ action: 'reflect_workspace' });
    const details = res?.details as { workspaceReflection?: { reflected: number; suggestionCount: number } } | null;
    const summary = details?.workspaceReflection;
    if (summary) setReflectSummary(`Reflected ${summary.reflected} workflow(s) · ${summary.suggestionCount} suggestion(s) to review.`);
  };

  const openLoop = useCallback((loopId: string) => navigate({ mode: 'detail', loopId }), [navigate]);
  const openCreate = useCallback(() => navigate({ mode: 'create' }), [navigate]);

  const activeTab = tabOf(view);
  // The Home badge mirrors HomeView's "Needs you" count, row for row.
  const needsCount = attentionCount(index.loops, roomIndex.rooms);

  const onSelectTab = (tab: ShellTab) => {
    if (tab === 'home') navigate({ mode: 'home' });
    else if (tab === 'workflows') navigate({ mode: 'detail', loopId: null });
    else if (tab === 'rooms') navigate({ mode: 'rooms', roomId: null });
    else void openLibrary(tab === 'catalog' ? 'catalog' : 'mine');
  };

  return (
    <OrchestratorStateContext.Provider value={stateRuntime}>
      <div className="@container/panel flex h-full min-w-0 flex-col overflow-hidden bg-room-bg text-room-text">
      <ShellTopBar
        active={activeTab}
        workflowCount={index.loops.length}
        roomCount={roomIndex.rooms.length}
        needsCount={needsCount}
        onSelect={onSelectTab}
        onNew={activeTab === 'rooms' ? openRoomCreate : openCreate}
        actions={[{ label: 'Reflect all', onSelect: () => void reflectAll(), disabled: busy || index.loops.length === 0 }]}
      />

      {reflectSummary && (
        <div className="flex items-center justify-between gap-2 border-b border-border bg-accent/40 px-4 py-2 text-xs">
          <span>{reflectSummary}</span>
          <button type="button" className="shrink-0 underline" onClick={() => setReflectSummary(null)}>dismiss</button>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between gap-2 border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          <span>{error}</span>
          <button type="button" className="shrink-0 underline" onClick={() => setError(null)}>dismiss</button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {view.mode === 'home' && (
          <HomeView
            loops={index.loops}
            busy={busy}
            onAction={onAction}
            onOpenLoop={openLoop}
            onNew={openCreate}
            onNewRoom={openRoomCreate}
            rooms={roomIndex.rooms}
            onRoomApproval={onRoomApproval}
            onRoomAnswer={onRoomAnswer}
            onRoomResume={onRoomResume}
            onOpenRoom={openRoom}
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
            dispatch={roomDispatch}
            onApproval={onRoomApproval}
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
            <RoomsOverview rooms={roomIndex.rooms} onOpenRoom={openRoom} onNew={openRoomCreate} />
          </div>
        )}
        {view.mode === 'room-create' && (
          <RoomCreateFlow
            busy={busy}
            dispatch={roomDispatch}
            onStarted={openRoom}
            onCancel={() => navigate({ mode: 'rooms', roomId: null })}
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
        {view.mode === 'detail' && (
          <>
            <MemoizedLoopList loops={index.loops} libraryIndex={libraryIndex} selectedId={selectedId} onSelect={openLoop} onNew={openCreate} />
            {selected ? (
              <LoopDetail loop={selected} busy={busy} onAction={onAction} onDispatch={detailsDispatch} stateDir={stateDir} libraryDir={libraryDir} libraryIndex={libraryIndex} />
            ) : (
              <div className="flex flex-1 items-center justify-center text-base text-muted-foreground">Select a Workflow from the list.</div>
            )}
          </>
        )}
      </div>
      </div>
    </OrchestratorStateContext.Provider>
  );
}

export default OrchestratorApp;
