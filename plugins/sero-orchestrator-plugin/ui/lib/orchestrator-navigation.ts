/** Durable Orchestrator routes and their host-navigation bridge. */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  consumeAppLaunchParams,
  onAppLaunchParams,
  useAppNavigation,
} from '@sero-ai/app-runtime';
import type { RoomView } from './room-view';
import type { OrchestratorStateRuntime } from './orchestrator-state';

export type OrchestratorView =
  | { mode: 'home' }
  | { mode: 'detail'; loopId: string | null }
  | { mode: 'create' }
  | { mode: 'rooms'; roomId: string | null; roomView?: RoomView; memberId?: string }
  | { mode: 'room-create' }
  | { mode: 'library'; tab: 'mine' | 'catalog' };

interface OrchestratorLaunchParams extends Record<string, unknown> {
  loopId?: string;
  roomId?: string;
}

export function orchestratorViewId(view: OrchestratorView): string {
  if (view.mode === 'home') return 'home';
  if (view.mode === 'create') return 'workflows/new';
  if (view.mode === 'detail') return view.loopId ? `workflows/${view.loopId}` : 'workflows';
  if (view.mode === 'room-create') return 'rooms/new';
  if (view.mode === 'library') return `library/${view.tab}`;
  if (!view.roomId) return 'rooms';

  const params = new URLSearchParams();
  if (view.roomView) params.set('view', view.roomView);
  if (view.memberId) params.set('member', view.memberId);
  const query = params.toString();
  return `rooms/${view.roomId}${query ? `?${query}` : ''}`;
}

export function parseOrchestratorView(viewId: string | undefined): OrchestratorView | null {
  if (!viewId) return null;
  const [path = '', query = ''] = viewId.split('?');
  const [section, id] = path.split('/');
  if (section === 'home' && !id) return { mode: 'home' };
  if (section === 'workflows') {
    if (id === 'new') return { mode: 'create' };
    return { mode: 'detail', loopId: id || null };
  }
  if (section === 'library' && (id === 'mine' || id === 'catalog')) {
    return { mode: 'library', tab: id };
  }
  if (section !== 'rooms') return null;
  if (id === 'new') return { mode: 'room-create' };
  if (!id) return { mode: 'rooms', roomId: null };

  const params = new URLSearchParams(query);
  const requestedRoomView = params.get('view');
  const roomView = requestedRoomView === 'timeline'
    || requestedRoomView === 'watch'
    || requestedRoomView === 'result'
    ? requestedRoomView
    : undefined;
  const memberId = params.get('member') || undefined;
  return {
    mode: 'rooms',
    roomId: id,
    ...(roomView ? { roomView } : {}),
    ...(memberId ? { memberId } : {}),
  };
}

function launchView(params: OrchestratorLaunchParams | undefined): OrchestratorView | null {
  if (typeof params?.roomId === 'string') return { mode: 'rooms', roomId: params.roomId };
  if (typeof params?.loopId === 'string') return { mode: 'detail', loopId: params.loopId };
  return null;
}

/** Keep local, plugin-file, and shell history navigation on one route. */
export function useOrchestratorNavigation({
  state: appState,
  updateState: updateAppState,
  ready: stateReady,
}: OrchestratorStateRuntime): readonly [
  OrchestratorView,
  (view: OrchestratorView, options?: { replace?: boolean }) => void,
] {
  const host = useAppNavigation();
  const [mountLaunch] = useState(() => launchView(
    consumeAppLaunchParams<OrchestratorLaunchParams>('orchestrator'),
  ));
  const initialLaunch = useRef<OrchestratorView | null>(mountLaunch);
  const initial = mountLaunch ?? parseOrchestratorView(host.viewId) ?? { mode: 'home' };
  const [view, setView] = useState<OrchestratorView>(initial);
  const viewRef = useRef(view);
  const locallyNavigated = useRef(mountLaunch !== null);
  const pendingPersistViewId = useRef<string | null>(null);

  const persist = useCallback((next: OrchestratorView) => {
    const viewId = orchestratorViewId(next);
    pendingPersistViewId.current = viewId;
    if (!stateReady) return;
    updateAppState((previous) => previous.ui?.navigationViewId === viewId
      ? previous
      : { ...previous, ui: { ...previous.ui, navigationViewId: viewId } });
    pendingPersistViewId.current = null;
  }, [stateReady, updateAppState]);

  const navigate = useCallback((next: OrchestratorView, options?: { replace?: boolean }) => {
    locallyNavigated.current = true;
    viewRef.current = next;
    setView(next);
    persist(next);
    host.navigate(orchestratorViewId(next), options);
  }, [host, persist]);

  // Host back/forward is an external navigation source. Apply it without
  // publishing another history entry, then keep the plugin state in sync.
  useEffect(() => {
    if (initialLaunch.current) return;
    const next = parseOrchestratorView(host.viewId);
    if (!next || orchestratorViewId(next) === orchestratorViewId(viewRef.current)) return;
    viewRef.current = next;
    setView(next);
    persist(next);
  }, [host.viewId, persist]);

  // Plugin state restores a view when an older host has no sub-navigation, or
  // when this app is opened for the first time in a shell layout.
  useEffect(() => {
    if (!stateReady || host.viewId || locallyNavigated.current) return;
    const next = parseOrchestratorView(appState.ui?.navigationViewId);
    if (!next) return;
    locallyNavigated.current = true;
    viewRef.current = next;
    setView(next);
    host.navigate(orchestratorViewId(next));
  }, [appState.ui?.navigationViewId, host, stateReady]);

  // Flush only an explicit route queued during the initial state read. Never
  // write DEFAULT_STATE merely because the read completed.
  useEffect(() => {
    if (!stateReady || !pendingPersistViewId.current) return;
    const pendingView = parseOrchestratorView(pendingPersistViewId.current ?? undefined);
    if (pendingView) persist(pendingView);
  }, [persist, stateReady]);

  // Give a first mount a shell location without writing plugin state.
  useEffect(() => {
    if (stateReady && !host.viewId) host.navigate(orchestratorViewId(viewRef.current));
  }, [host, stateReady]);

  // A deep link can arrive while Orchestrator is already mounted.
  useEffect(() => onAppLaunchParams<OrchestratorLaunchParams>('orchestrator', (params) => {
    const next = launchView(params);
    if (next) navigate(next);
  }), [navigate]);

  // Mount-time launch params must become the shell's current history entry.
  useEffect(() => {
    if (!initialLaunch.current) return;
    persist(initialLaunch.current);
    host.navigate(orchestratorViewId(initialLaunch.current));
    initialLaunch.current = null;
  }, [host, persist]);

  return [view, navigate] as const;
}
