import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useConnectionStore } from '@/stores/connection';
import { selectSessionUsage, useUsageStore, type UsageReport } from '@/stores/usage';
import type { GatewayMessage } from '@/lib/gateway-client';

const requestUsage = vi.fn(() => {});

const report: UsageReport = {
  sessions: [
    {
      sessionId: 's1',
      requests: 3,
      inputTokens: 1200,
      outputTokens: 300,
      totalTokens: 1500,
      costUsd: 0.42,
    },
  ],
  totals: {
    requests: 3,
    inputTokens: 1200,
    outputTokens: 300,
    totalTokens: 1500,
    costUsd: 0.42,
  },
  dailyCostUsd: 0.42,
  dailyDate: '2026-09-04',
};

describe('usage store', () => {
  beforeEach(() => {
    requestUsage.mockClear();
    useConnectionStore.setState({ client: { requestUsage } as unknown as never });
    useUsageStore.setState({ report: null });
  });

  it('stores the report the gateway returns', () => {
    useUsageStore.getState().handleMessage({
      type: 'ok',
      requestType: 'get_usage',
      data: report,
    } as GatewayMessage);

    expect(useUsageStore.getState().report).toEqual(report);
  });

  it('asks for the totals again when a turn finishes', () => {
    useUsageStore.getState().handleMessage({
      type: 'turn_complete',
      sessionId: 's1',
      workspaceId: 'ws-1',
      ts: Date.now(),
      outcome: 'completed',
    } as unknown as GatewayMessage);

    expect(requestUsage).toHaveBeenCalledTimes(1);
  });

  it('asks for the totals once the workspaces arrive', () => {
    useUsageStore.getState().handleMessage({
      type: 'ok',
      requestType: 'list_workspaces',
      data: [],
    } as GatewayMessage);

    expect(requestUsage).toHaveBeenCalledTimes(1);
  });

  it('does not send anything while disconnected', () => {
    useConnectionStore.setState({ client: null as unknown as never });

    useUsageStore.getState().refresh();

    expect(requestUsage).not.toHaveBeenCalled();
  });

  it('drops the report when the request fails', () => {
    useUsageStore.setState({ report });

    useUsageStore.getState().handleMessage({
      type: 'error',
      requestType: 'get_usage',
      message: 'nope',
    } as GatewayMessage);

    expect(useUsageStore.getState().report).toBeNull();
  });

  it('ignores data that is not a report', () => {
    useUsageStore.getState().handleMessage({
      type: 'ok',
      requestType: 'get_usage',
      data: { nope: true },
    } as GatewayMessage);

    expect(useUsageStore.getState().report).toBeNull();
  });

  it('finds the usage of one session', () => {
    expect(selectSessionUsage(report, 's1')?.costUsd).toBe(0.42);
  });

  it('returns nothing for a session the gateway never tracked', () => {
    expect(selectSessionUsage(report, 'other')).toBeNull();
    expect(selectSessionUsage(null, 's1')).toBeNull();
    expect(selectSessionUsage(report, null)).toBeNull();
  });
});
