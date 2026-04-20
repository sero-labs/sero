// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SeroAdminBridge } from '@sero-ai/common';
import type { PluginChangeEventIPC, PluginDevSessionIPC } from './host';
import { usePluginDevSessions } from './usePluginDevSessions';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createSession(
  sessionId: string,
  updatedAt: string,
  overrides: Partial<PluginDevSessionIPC> = {},
): PluginDevSessionIPC {
  return {
    sessionId,
    appId: sessionId,
    name: sessionId,
    sourcePath: `/tmp/${sessionId}`,
    status: 'active',
    uiMode: 'dev-server',
    remoteEntryOverride: `http://127.0.0.1:5193/${sessionId}/mf-manifest.json`,
    lastError: null,
    updatedAt,
    ...overrides,
  };
}

describe('usePluginDevSessions', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let latestState: ReturnType<typeof usePluginDevSessions> | null = null;
  let changeHandler: ((event: PluginChangeEventIPC) => void) | null = null;
  let listDevSessions: ReturnType<typeof vi.fn<() => Promise<PluginDevSessionIPC[]>>>;
  let unsubscribe: ReturnType<typeof vi.fn>;

  function HookProbe() {
    latestState = usePluginDevSessions();
    return <div>{latestState.loading ? 'loading' : latestState.sessions.map((session) => session.sessionId).join(',')}</div>;
  }

  beforeEach(() => {
    latestState = null;
    changeHandler = null;
    listDevSessions = vi.fn<() => Promise<PluginDevSessionIPC[]>>();
    unsubscribe = vi.fn();

    const seroWindow = window as typeof window & { sero?: SeroAdminBridge };
    seroWindow.sero = {
      plugins: {
        listDevSessions,
        startDevSession: vi.fn(),
        refreshDevSession: vi.fn(),
        stopDevSession: vi.fn(),
        onChanged: vi.fn((callback: (event: PluginChangeEventIPC) => void) => {
          changeHandler = callback;
          return unsubscribe;
        }),
      },
      shell: {
        showItemInFolder: vi.fn(),
      },
    } as unknown as SeroAdminBridge;

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = null;
    container.remove();
    delete (window as typeof window & { sero?: SeroAdminBridge }).sero;
  });

  it('sorts sessions and reloads only for dev-session lifecycle events', async () => {
    listDevSessions.mockResolvedValue([
      createSession('older-session', '2026-04-19T20:00:00.000Z'),
      createSession('newer-session', '2026-04-19T21:00:00.000Z'),
    ]);

    await act(async () => {
      root?.render(<HookProbe />);
    });

    await vi.waitFor(() => {
      expect(listDevSessions).toHaveBeenCalledTimes(1);
      expect(latestState?.loading).toBe(false);
    });

    expect(latestState?.sessions.map((session) => session.sessionId)).toEqual([
      'newer-session',
      'older-session',
    ]);
    expect(changeHandler).not.toBeNull();

    await act(async () => {
      changeHandler?.({ type: 'installed', reason: 'plugin-installed' });
    });

    expect(listDevSessions).toHaveBeenCalledTimes(1);

    for (const reason of ['dev-session-started', 'dev-session-refreshed', 'dev-session-stopped'] as const) {
      await act(async () => {
        changeHandler?.({ type: 'changed', pluginId: 'newer-session', reason });
      });

      await vi.waitFor(() => {
        expect(listDevSessions).toHaveBeenCalledTimes(
          reason === 'dev-session-started'
            ? 2
            : reason === 'dev-session-refreshed'
              ? 3
              : 4,
        );
      });
    }
  });

  it('cleans up the plugin-change subscription on unmount', async () => {
    listDevSessions.mockResolvedValue([]);

    await act(async () => {
      root?.render(<HookProbe />);
    });

    await vi.waitFor(() => {
      expect(listDevSessions).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      root?.unmount();
    });
    root = null;

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
