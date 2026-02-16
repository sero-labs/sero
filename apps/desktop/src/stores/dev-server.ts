/**
 * Dev Server store — tracks registered dev servers across all workspaces.
 *
 * Hydrates from the main process on startup and stays in sync via
 * push events (registered, unregistered, status_changed, sync).
 */

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { DevServer, DevServerEvent } from '@/types/ipc';

interface DevServerStoreState {
  /** All registered dev servers keyed by server ID. */
  servers: Record<string, DevServer>;

  /** Total count of running servers (across all workspaces). */
  runningCount: number;

  // ── Actions ────────────────────────────────────────────────

  /** Handle a push event from the main process. */
  handleEvent: (event: DevServerEvent) => void;

  /** Full sync — replace all servers (e.g. on reconnect). */
  sync: (servers: DevServer[]) => void;

  /** Load servers from main process. Call once on startup. */
  load: (workspaceId?: string) => Promise<void>;
}

function countRunning(servers: Record<string, DevServer>): number {
  return Object.values(servers).filter((s) => s.status === 'running').length;
}

export const useDevServerStore = create<DevServerStoreState>((set, get) => ({
  servers: {},
  runningCount: 0,

  handleEvent: (event) => {
    switch (event.type) {
      case 'registered':
        set((s) => {
          const next = { ...s.servers, [event.server.id]: event.server };
          return { servers: next, runningCount: countRunning(next) };
        });
        break;

      case 'unregistered':
        set((s) => {
          const next = { ...s.servers };
          delete next[event.serverId];
          return { servers: next, runningCount: countRunning(next) };
        });
        break;

      case 'status_changed':
        set((s) => {
          const existing = s.servers[event.serverId];
          if (!existing) return s;
          const next = {
            ...s.servers,
            [event.serverId]: { ...existing, status: event.status },
          };
          return { servers: next, runningCount: countRunning(next) };
        });
        break;

      case 'sync':
        set(() => {
          const next: Record<string, DevServer> = {};
          for (const server of event.servers) {
            next[server.id] = server;
          }
          return { servers: next, runningCount: countRunning(next) };
        });
        break;
    }
  },

  sync: (servers) => {
    const next: Record<string, DevServer> = {};
    for (const server of servers) {
      next[server.id] = server;
    }
    set({ servers: next, runningCount: countRunning(next) });
  },

  load: async (workspaceId?: string) => {
    try {
      const servers = await window.sero.devServer.list(workspaceId);
      get().sync(servers);
    } catch {
      // IPC not available yet — will sync via events
    }
  },
}));

// ── Selectors ──────────────────────────────────────────────────

/** Get all dev servers as an array (shallow-compared to avoid infinite loops). */
export function useDevServers(): DevServer[] {
  return useDevServerStore(
    useShallow((s) => Object.values(s.servers)),
  );
}

/** Get dev servers for a specific workspace. */
export function useWorkspaceDevServers(workspaceId: string): DevServer[] {
  return useDevServerStore(
    useShallow((s) =>
      Object.values(s.servers).filter((srv) => srv.workspaceId === workspaceId),
    ),
  );
}

/** Get the count of running dev servers. */
export function useRunningDevServerCount(): number {
  return useDevServerStore((s) => s.runningCount);
}

// ── Subscription (call once on app mount) ──────────────────────

/**
 * Subscribe to dev server push events from the main process.
 * Returns an unsubscribe function. Call in a top-level useEffect.
 */
export function subscribeDevServerEvents(): () => void {
  const store = useDevServerStore.getState();

  // Initial load
  store.load();

  // Listen for real-time events
  return window.sero.devServer.onEvent((event) => {
    useDevServerStore.getState().handleEvent(event);
  });
}
