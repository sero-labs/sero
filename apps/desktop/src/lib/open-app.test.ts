// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAppStore, type AppEntry } from '@/stores/app';
import { useNavigationStore } from '@/stores/navigation';
import { useUserFeedbackStore } from '@/stores/user-feedback-store';
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
  });

  afterEach(() => {
    useAppStore.setState(initialAppState, true);
    useUserFeedbackStore.setState(initialFeedbackState, true);
    useNavigationStore.setState(initialNavigationState, true);
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
});
