// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore, type AppEntry } from './app';

describe('toggleChromeShortcut', () => {
  const initialState = useAppStore.getState();

  function entry(id: string, builtin = false): AppEntry {
    return { id, label: id, icon: 'Box', builtin, manifest: null };
  }

  beforeEach(() => {
    (window as Window & { sero: any }).sero = {
      layout: { save: vi.fn().mockResolvedValue(undefined) },
    };
  });

  afterEach(() => {
    useAppStore.setState(initialState, true);
  });

  it('preserves pins whose app is not loaded yet when toggling', () => {
    // 'notes' is pinned but not yet in `apps` (startup discovery window).
    useAppStore.setState({
      ...initialState,
      apps: [entry('dashboard', true), entry('todo')],
      chromeShortcuts: ['notes'],
    }, true);

    useAppStore.getState().toggleChromeShortcut('todo');

    expect(useAppStore.getState().chromeShortcuts).toEqual(['notes', 'todo']);
  });
});
