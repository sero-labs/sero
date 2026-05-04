import { afterEach, describe, expect, it, vi } from 'vitest';

const startupMocks = vi.hoisted(() => ({
  loadLayout: vi.fn<() => Promise<void>>(),
  loadWorkspaces: vi.fn<() => Promise<void>>(),
  loadSessions: vi.fn<() => Promise<void>>(),
  discoverAndRegisterApps: vi.fn<() => Promise<void>>(),
}));

vi.mock('@/stores/app', () => ({
  loadLayout: startupMocks.loadLayout,
  discoverAndRegisterApps: startupMocks.discoverAndRegisterApps,
}));

vi.mock('@/stores/workspace', () => ({
  loadWorkspaces: startupMocks.loadWorkspaces,
}));

vi.mock('@/stores/sessions', () => ({
  useSessionStore: {
    getState: () => ({
      loadSessions: startupMocks.loadSessions,
    }),
  },
}));

import { hydrateShellState } from './app-startup';

describe('hydrateShellState', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('waits for layout hydration before loading workspaces and discovering apps', async () => {
    const calls: string[] = [];
    let releaseLayout!: () => void;

    startupMocks.loadLayout.mockImplementation(async () => {
      calls.push('layout:start');
      await new Promise<void>((resolve) => {
        releaseLayout = resolve;
      });
      calls.push('layout:end');
    });
    startupMocks.loadWorkspaces.mockImplementation(async () => {
      calls.push('workspaces');
    });
    startupMocks.loadSessions.mockImplementation(async () => {
      calls.push('sessions');
    });
    startupMocks.discoverAndRegisterApps.mockImplementation(async () => {
      calls.push('apps');
    });

    const pending = hydrateShellState();
    await Promise.resolve();

    expect(calls).toEqual(['layout:start']);

    releaseLayout();
    await pending;

    expect(calls[1]).toBe('layout:end');
    expect(calls.slice(2).sort()).toEqual(['apps', 'sessions', 'workspaces']);
  });
});
