/**
 * Usage store — token and cost totals for the sessions this token reaches.
 *
 * The gateway counts usage in memory, from desktop start, and the daily
 * total resets at UTC midnight. Nothing polls: the totals only change when
 * a turn ends, so a finished turn is what asks for them again.
 */

import { create } from 'zustand';
import { useConnectionStore } from './connection';
import type { GatewayMessage } from '@/lib/gateway-client';

/** Usage for one session. */
export interface SessionUsage {
  sessionId: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
}

/** Usage for every session the token reaches, dearest first. */
export interface UsageReport {
  sessions: SessionUsage[];
  totals: Omit<SessionUsage, 'sessionId'>;
  /** Cost across all sessions today, including sessions this token cannot see. */
  dailyCostUsd: number;
  /** UTC date the daily total covers, as YYYY-MM-DD. */
  dailyDate: string;
}

interface UsageStore {
  report: UsageReport | null;
  refresh: () => void;
  handleMessage: (msg: GatewayMessage) => void;
}

function isReport(value: unknown): value is UsageReport {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return Array.isArray(record.sessions) && !!record.totals && typeof record.totals === 'object';
}

export const useUsageStore = create<UsageStore>((set, get) => ({
  report: null,

  refresh: () => {
    const client = useConnectionStore.getState().client;
    if (!client) return;
    client.requestUsage();
  },

  handleMessage: (msg: GatewayMessage) => {
    // A finished turn is the only thing that changes the totals.
    if (msg.type === 'turn_complete') {
      get().refresh();
      return;
    }

    if (!('requestType' in msg)) return;

    // The workspace listing is the first response after a connect, so it
    // is the earliest point the totals can be asked for.
    if (msg.type === 'ok' && msg.requestType === 'list_workspaces') {
      get().refresh();
      return;
    }

    if (msg.requestType !== 'get_usage') return;
    if (msg.type === 'error') {
      set({ report: null });
      return;
    }
    if (msg.type !== 'ok') return;

    const data = (msg as { data?: unknown }).data;
    set({ report: isReport(data) ? data : null });
  },
}));

/** Usage for one session, or null when the gateway tracked none. */
export function selectSessionUsage(
  report: UsageReport | null,
  sessionId: string | null,
): SessionUsage | null {
  if (!report || !sessionId) return null;
  return report.sessions.find((session) => session.sessionId === sessionId) ?? null;
}
