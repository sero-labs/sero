// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAppStore, type AppEntry } from '@/stores/app';
import { useUserFeedbackStore } from '@/stores/user-feedback-store';
import { openApp } from './open-app';

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
  });

  afterEach(() => {
    useAppStore.setState(initialAppState, true);
    useUserFeedbackStore.setState(initialFeedbackState, true);
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
});
