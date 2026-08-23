// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { useDashboardStore } from '@/stores/dashboard';
import { useNavigationStore } from '@/stores/navigation';
import { useWorkspaceStore } from '@/stores/workspace';
import { useAppStore } from './state';
import { loadLayout } from './layout-hydration';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('layout hydration', () => {
  const initialDashboardState = useDashboardStore.getState();
  const initialAppState = useAppStore.getState();
  const initialNavigationState = useNavigationStore.getState();
  const initialWorkspaceState = useWorkspaceStore.getState();

  afterEach(() => {
    useDashboardStore.setState(initialDashboardState, true);
    useAppStore.setState(initialAppState, true);
    useNavigationStore.setState(initialNavigationState, true);
    useWorkspaceStore.setState(initialWorkspaceState, true);
    Reflect.deleteProperty(window, 'sero');
  });

  it('does not overwrite a background change that arrives during hydration', async () => {
    const backgroundLoad = deferred<string | null>();
    const listener: { current: ((dataUrl: string | null) => void) | null } = { current: null };

    Reflect.set(window, 'sero', {
      layout: { load: vi.fn(async () => null) },
      dashboard: {
        getBackground: vi.fn(() => backgroundLoad.promise),
        onBackgroundChanged: vi.fn((callback: (dataUrl: string | null) => void) => {
          listener.current = callback;
          return () => undefined;
        }),
      },
    });

    const hydration = loadLayout();
    await vi.waitFor(() => expect(listener.current).not.toBeNull());
    if (!listener.current) throw new Error('Background listener was not registered');

    listener.current('sero-media://dashboard/background?v=new');
    backgroundLoad.resolve(null);
    await hydration;

    expect(useDashboardStore.getState().backgroundImage).toBe(
      'sero-media://dashboard/background?v=new',
    );
  });

  it('restores the active app sub-view for its workspace', async () => {
    Reflect.set(window, 'sero', {
      layout: {
        load: vi.fn(async () => ({
          mainSidebarOpen: true,
          chatPanelOpen: true,
          favouriteApps: [],
          activeApp: 'orchestrator',
          activeWorkspaceId: 'workspace-1',
          appViewIds: {
            orchestrator: { 'workspace-1': 'rooms/room-7?view=timeline' },
          },
        })),
      },
      dashboard: {
        getBackground: vi.fn(async () => null),
        onBackgroundChanged: vi.fn(() => () => undefined),
      },
    });

    await loadLayout();

    expect(useAppStore.getState().activeApp).toBe('orchestrator');
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('workspace-1');
    expect(useNavigationStore.getState()).toMatchObject({
      entries: [{
        appId: 'orchestrator',
        viewId: 'rooms/room-7?view=timeline',
        workspaceId: 'workspace-1',
      }],
      index: 0,
    });
  });

  it('does not apply a global fallback to a workspace-scoped app', async () => {
    Reflect.set(window, 'sero', {
      layout: {
        load: vi.fn(async () => ({
          mainSidebarOpen: true,
          chatPanelOpen: true,
          favouriteApps: [],
          activeApp: 'orchestrator',
          activeWorkspaceId: 'workspace-1',
          appViewIds: {
            orchestrator: { global: 'rooms/wrong-workspace-room' },
          },
        })),
      },
      dashboard: {
        getBackground: vi.fn(async () => null),
        onBackgroundChanged: vi.fn(() => () => undefined),
      },
    });

    await loadLayout();

    expect(useNavigationStore.getState()).toMatchObject({
      entries: [{
        appId: 'orchestrator',
        viewId: undefined,
        workspaceId: 'workspace-1',
      }],
      index: 0,
    });
  });
});
