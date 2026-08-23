// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAppStore, type AppEntry } from '@/stores/app';
import { useNavigationStore } from '@/stores/navigation';
import { useUserFeedbackStore } from '@/stores/user-feedback-store';
import { useWorkspaceStore } from '@/stores/workspace';
import { listenForAppNavigationWorkspace } from '@/stores/app/listeners';
import { navigateBack, openApp } from './open-app';

function createApp(id: string, label: string, builtin = false): AppEntry {
  return {
    id,
    label,
    icon: 'box',
    builtin,
    manifest: null,
  };
}

describe('openApp', () => {
  const initialAppState = useAppStore.getState();
  const initialFeedbackState = useUserFeedbackStore.getState();
  const initialNavigationState = useNavigationStore.getState();
  const initialWorkspaceState = useWorkspaceStore.getState();

  beforeEach(() => {
    useAppStore.setState({
      ...initialAppState,
      activeApp: 'kanban',
      pendingApp: null,
      apps: [
        createApp('explorer', 'Explorer', true),
        createApp('kanban', 'Kanban'),
        createApp('todo', 'Todo'),
        createApp('userfeedback', 'User Feedback'),
      ],
    }, true);

    useUserFeedbackStore.setState({
      ...initialFeedbackState,
      pending: new Map(),
      returnApp: null,
    }, true);

    useNavigationStore.setState(initialNavigationState, true);
    useWorkspaceStore.setState({ ...initialWorkspaceState, activeWorkspaceId: null }, true);
  });

  afterEach(() => {
    useAppStore.setState(initialAppState, true);
    useUserFeedbackStore.setState(initialFeedbackState, true);
    useNavigationStore.setState(initialNavigationState, true);
    useWorkspaceStore.setState(initialWorkspaceState, true);
  });

  it('preserves return navigation when opening User Feedback through generic app navigation', () => {
    openApp('userfeedback');

    expect(useAppStore.getState().activeApp).toBe('userfeedback');
    expect(useUserFeedbackStore.getState().returnApp).toBe('kanban');
  });

  it('prefers the in-flight app switch as the return target', () => {
    useAppStore.setState({ pendingApp: 'todo' });

    openApp('userfeedback');

    expect(useAppStore.getState().activeApp).toBe('userfeedback');
    expect(useAppStore.getState().pendingApp).toBeNull();
    expect(useUserFeedbackStore.getState().returnApp).toBe('todo');
  });

  it('opens non-feedback apps without changing return navigation', () => {
    openApp('explorer');

    expect(useAppStore.getState().activeApp).toBe('explorer');
    expect(useUserFeedbackStore.getState().returnApp).toBeNull();
  });

  it('skips stale history entries when navigating back', () => {
    useAppStore.setState({
      ...useAppStore.getState(),
      activeApp: 'todo',
      apps: [
        createApp('dashboard', 'Dashboard', true),
        createApp('todo', 'Todo'),
      ],
    });
    useNavigationStore.setState({
      entries: [{ appId: 'dashboard' }, { appId: 'missing' }, { appId: 'todo' }],
      index: 2,
    });

    navigateBack();

    expect(useAppStore.getState().activeApp).toBe('dashboard');
    expect(useNavigationStore.getState().index).toBe(0);
  });

  it('leaves the history cursor in place when no valid back target exists', () => {
    useAppStore.setState({
      ...useAppStore.getState(),
      activeApp: 'todo',
      apps: [createApp('todo', 'Todo')],
    });
    useNavigationStore.setState({
      entries: [{ appId: 'missing' }, { appId: 'todo' }],
      index: 1,
    });

    navigateBack();

    expect(useAppStore.getState().activeApp).toBe('todo');
    expect(useNavigationStore.getState().index).toBe(1);
  });

  it('uses the first published app view to complete its history entry', () => {
    useNavigationStore.setState({ entries: [{ appId: 'kanban' }], index: 0 });

    useAppStore.getState().setAppView('kanban', 'global', 'board/card-1');

    expect(useNavigationStore.getState()).toMatchObject({
      entries: [{ appId: 'kanban', viewId: 'board/card-1' }],
      index: 0,
    });
  });

  it('moves back between views inside the active app', () => {
    useAppStore.setState({
      appViewIds: { kanban: { global: 'board/card-2' } },
    });
    useNavigationStore.setState({
      entries: [
        { appId: 'kanban', viewId: 'board/card-1' },
        { appId: 'kanban', viewId: 'board/card-2' },
      ],
      index: 1,
    });

    navigateBack();

    expect(useAppStore.getState().activeApp).toBe('kanban');
    expect(useAppStore.getState().appViewIds.kanban?.global).toBe('board/card-1');
    expect(useNavigationStore.getState().index).toBe(0);
  });

  it('does not attach built-in app history to the active workspace', () => {
    useWorkspaceStore.setState({ activeWorkspaceId: 'workspace-1' });

    openApp('explorer');

    expect(useNavigationStore.getState().entries.at(-1)).toMatchObject({
      appId: 'explorer',
      workspaceId: undefined,
    });
  });

  it('replaces history for secondary app selections', () => {
    useNavigationStore.setState({
      entries: [{ appId: 'kanban', viewId: 'rooms/room-1' }],
      index: 0,
    });

    useAppStore.getState().setAppView('kanban', 'global', 'rooms/room-1?member=member-2', {
      replaceHistory: true,
    });

    expect(useNavigationStore.getState()).toMatchObject({
      entries: [{ appId: 'kanban', viewId: 'rooms/room-1?member=member-2' }],
      index: 0,
    });
  });

  it('moves the current workspace app entry when the sidebar workspace changes', () => {
    useWorkspaceStore.setState({ activeWorkspaceId: 'workspace-1' });
    useAppStore.setState({
      appViewIds: { kanban: { 'workspace-2': 'rooms/room-2' } },
    });
    useNavigationStore.setState({
      entries: [{ appId: 'kanban', viewId: 'rooms/room-1', workspaceId: 'workspace-1' }],
      index: 0,
    });
    const unsubscribe = listenForAppNavigationWorkspace();

    useWorkspaceStore.setState({ activeWorkspaceId: 'workspace-2' });

    expect(useNavigationStore.getState()).toMatchObject({
      entries: [{ appId: 'kanban', viewId: 'rooms/room-2', workspaceId: 'workspace-2' }],
      index: 0,
    });
    unsubscribe();
  });
});
