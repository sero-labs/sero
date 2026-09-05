import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, unknown>();
const savePref = vi.fn(async (key: string, value: unknown) => {
  store.set(key, value);
});
const loadPref = vi.fn(async (key: string) => store.get(key) ?? null);

vi.mock('@/lib/prefs-storage', () => ({
  savePref: (key: string, value: unknown) => savePref(key, value),
  loadPref: (key: string) => loadPref(key),
}));

import { hydrateLayout, useLayoutStore } from '@/stores/layout';

describe('layout store', () => {
  beforeEach(() => {
    store.clear();
    savePref.mockClear();
    useLayoutStore.setState({
      sidebarOpen: true,
      sidebarSize: '20%',
      rightPanel: null,
      ready: false,
    });
  });

  it('persists the sidebar width', async () => {
    useLayoutStore.getState().setSidebarSize('31.50%');

    expect(savePref).toHaveBeenCalledWith(
      'layout',
      expect.objectContaining({ sidebarSize: '31.50%' }),
    );
  });

  it('restores the sidebar width on reload', async () => {
    useLayoutStore.getState().setSidebarSize('27.00%');
    useLayoutStore.setState({ sidebarSize: '20%' });

    await hydrateLayout();

    expect(useLayoutStore.getState().sidebarSize).toBe('27.00%');
    expect(useLayoutStore.getState().ready).toBe(true);
  });

  it('does not write when the width has not changed', () => {
    useLayoutStore.getState().setSidebarSize('20%');
    expect(savePref).not.toHaveBeenCalled();
  });

  it('closes a right panel when its own icon is pressed again', () => {
    const { toggleRightPanel } = useLayoutStore.getState();

    toggleRightPanel('files');
    expect(useLayoutStore.getState().rightPanel).toBe('files');

    toggleRightPanel('artifacts');
    expect(useLayoutStore.getState().rightPanel).toBe('artifacts');

    toggleRightPanel('artifacts');
    expect(useLayoutStore.getState().rightPanel).toBeNull();
  });

  it('falls back to defaults when nothing is stored', async () => {
    await hydrateLayout();

    expect(useLayoutStore.getState()).toMatchObject({
      sidebarOpen: true,
      sidebarSize: '20%',
      rightPanel: null,
    });
  });

  it('ignores a stored panel name it does not recognise', async () => {
    store.set('layout', { sidebarOpen: true, sidebarSize: '20%', rightPanel: 'nonsense' });

    await hydrateLayout();

    expect(useLayoutStore.getState().rightPanel).toBeNull();
  });
});

describe('layout store and the mobile sheets', () => {
  beforeEach(() => {
    store.clear();
    useLayoutStore.setState({
      sidebarOpen: true,
      sidebarSize: '20%',
      rightPanel: null,
      ready: false,
    });
  });

  it('restores the desktop layout untouched', async () => {
    // Layout.tsx keeps the mobile sheets in their own state, so the store
    // never has to know about the breakpoint.
    store.set('layout', { sidebarOpen: true, sidebarSize: '33.00%', rightPanel: 'files' });

    await hydrateLayout();

    expect(useLayoutStore.getState()).toMatchObject({
      sidebarOpen: true,
      sidebarSize: '33.00%',
      rightPanel: 'files',
    });
  });
});
