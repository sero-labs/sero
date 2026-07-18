/**
 * Dev server store — list of dev servers per workspace and ticket
 * acquisition for the gateway proxy.
 */

import { create } from 'zustand';
import { useConnectionStore } from './connection';
import { useWorkspaceStore } from './workspace';
import type { GatewayMessage } from '@/lib/gateway-client';

export interface DevServer {
  id: string;
  workspaceId: string;
  name: string;
  port: number;
  framework?: string;
  status: 'running' | 'stopped' | 'starting';
  registeredAt: string;
}

interface PendingTicket {
  workspaceId: string;
  port: number;
  resolve: (url: string) => void;
  reject: (err: Error) => void;
}

interface DevServerStore {
  servers: DevServer[];
  isLoading: boolean;
  /** Pending ticket requests keyed by `${workspaceId}:${port}`. */
  _pendingTickets: Map<string, PendingTicket>;

  /** Fetch dev servers (filters to active workspace if any). */
  fetchServers: () => void;
  /**
   * Mint a proxy ticket and return a ready-to-load preview URL with the
   * ticket attached as a `?t=` query param. Subsequent requests use the
   * cookie set by the gateway on the first response.
   */
  openServer: (workspaceId: string, port: number) => Promise<string>;
  handleMessage: (msg: GatewayMessage) => void;
  clear: () => void;
}

function getGatewayHttpOrigin(): string {
  const envUrl = import.meta.env.VITE_GATEWAY_URL as string | undefined;
  if (envUrl) {
    const url = new URL(envUrl);
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
    return url.origin;
  }

  if (import.meta.env.DEV) {
    return `${window.location.protocol}//${window.location.hostname}:18800`;
  }

  return window.location.origin;
}

function buildPreviewUrl(
  workspaceId: string,
  port: number,
  ticket: string,
  previewPort: number | undefined,
  previewTlsPort: number | undefined,
): string {
  const base = `${getGatewayHttpOrigin()}/p/${encodeURIComponent(workspaceId)}/${port}/`;
  const url = new URL(base);
  // Previews load from the gateway's dedicated preview listener so they
  // get their own origin — the sandboxed preview iframe can then use
  // allow-same-origin without sharing this SPA's origin. Over TLS
  // (tailnet access via `tailscale serve`) the listener is reachable on
  // the mapped HTTPS port instead of the direct one.
  if (url.protocol === 'https:') {
    if (previewTlsPort) url.port = String(previewTlsPort);
  } else if (previewPort) {
    url.port = String(previewPort);
  }
  url.searchParams.set('t', ticket);
  return url.toString();
}

export const useDevServerStore = create<DevServerStore>((set, get) => ({
  servers: [],
  isLoading: false,
  _pendingTickets: new Map(),

  fetchServers: () => {
    const { activeWorkspaceId } = useWorkspaceStore.getState();
    set({ isLoading: true });
    useConnectionStore
      .getState()
      .client.listDevServers(activeWorkspaceId ?? undefined);
  },

  openServer: (workspaceId: string, port: number) => {
    return new Promise<string>((resolve, reject) => {
      const key = `${workspaceId}:${port}`;
      const next = new Map(get()._pendingTickets);
      // Replace any earlier pending request for the same target — last one wins.
      const existing = next.get(key);
      if (existing) {
        existing.reject(new Error('Superseded by newer request'));
      }
      next.set(key, { workspaceId, port, resolve, reject });
      set({ _pendingTickets: next });
      useConnectionStore.getState().client.createDevServerTicket(workspaceId, port);
    });
  },

  handleMessage: (msg: GatewayMessage) => {
    if (msg.type === 'ok' && 'requestType' in msg) {
      const response = msg as { type: 'ok'; requestType: string; data?: unknown };

      if (response.requestType === 'list_dev_servers') {
        const servers = (response.data as DevServer[]) ?? [];
        set({ servers, isLoading: false });
        return;
      }

      if (response.requestType === 'create_devserver_ticket') {
        const data = response.data as {
          ticket: string;
          workspaceId: string;
          port: number;
          previewPort?: number;
          previewTlsPort?: number;
        } | undefined;
        if (!data) return;
        const key = `${data.workspaceId}:${data.port}`;
        const pending = get()._pendingTickets.get(key);
        if (!pending) return;
        const next = new Map(get()._pendingTickets);
        next.delete(key);
        set({ _pendingTickets: next });
        pending.resolve(
          buildPreviewUrl(
            data.workspaceId,
            data.port,
            data.ticket,
            data.previewPort,
            data.previewTlsPort,
          ),
        );
        return;
      }
    }

    if (msg.type === 'error' && 'requestType' in msg) {
      const errMsg = msg as { type: 'error'; requestType: string; message: string };
      if (errMsg.requestType === 'list_dev_servers') {
        set({ isLoading: false });
        return;
      }
      if (errMsg.requestType === 'create_devserver_ticket') {
        // The protocol doesn't echo back which ticket failed, so reject all
        // outstanding requests. Practically, ticket requests are short-lived
        // and the next click will retry.
        const pendings = Array.from(get()._pendingTickets.values());
        set({ _pendingTickets: new Map() });
        for (const p of pendings) p.reject(new Error(errMsg.message));
        return;
      }
    }

    // Live updates from the gateway
    const pushMsg = msg as Record<string, unknown>;
    if (pushMsg.type === 'dev_server_changed') {
      const change = pushMsg.change as
        | { type: 'registered'; server: DevServer }
        | { type: 'unregistered'; serverId: string }
        | { type: 'status_changed'; serverId: string; status: DevServer['status'] }
        | undefined;
      if (!change) return;

      if (change.type === 'registered') {
        set((s) => {
          const without = s.servers.filter((x) => x.id !== change.server.id);
          return { servers: [...without, change.server] };
        });
        return;
      }
      if (change.type === 'unregistered') {
        set((s) => ({ servers: s.servers.filter((x) => x.id !== change.serverId) }));
        return;
      }
      if (change.type === 'status_changed') {
        set((s) => ({
          servers: s.servers.map((x) =>
            x.id === change.serverId ? { ...x, status: change.status } : x,
          ),
        }));
      }
    }
  },

  clear: () => {
    const pendings = Array.from(get()._pendingTickets.values());
    for (const p of pendings) p.reject(new Error('Store cleared'));
    set({ servers: [], isLoading: false, _pendingTickets: new Map() });
  },
}));
