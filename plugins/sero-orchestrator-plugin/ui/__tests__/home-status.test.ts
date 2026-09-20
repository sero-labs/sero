/**
 * Home's status line and the Workflows list must agree about what is active:
 * the "0 active" over an "Active" row was two rules, not one.
 */

import { describe, expect, it } from 'vitest';
import type { LoopSummary } from '../../shared/types';
import type { RoomSummary } from '../../shared/room-types';
import { homeStatus, workspaceName } from '../lib/home-status';
import { loopActivity } from '../lib/loop-activity';

const SESSION = '2026-09-19T10:00:00.000Z';

function loop(overrides: Partial<LoopSummary> = {}): LoopSummary {
  return {
    id: 'loop-1',
    title: 'reading-tracker-resilience-01: maintenance',
    status: 'active',
    summary: '',
    prompt: '',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-14T00:00:00.000Z',
    ...overrides,
  };
}

const ARMED = loop({
  armedEventSources: ['github:ci-failed'],
  usage: { costUsd: 18.72 },
  lastRunAt: '2026-09-14T08:00:00.000Z',
});

describe('homeStatus', () => {
  it('counts nothing active for a Workflow the list calls waiting for a trigger', () => {
    const status = homeStatus({ loops: [ARMED], rooms: [], goals: [], workspaceName: 'reading-tracker-resilience-01', sessionStartedAt: SESSION });

    expect(loopActivity(ARMED, SESSION).word).toBe('Waiting for a trigger');
    expect(status.activeCount).toBe(0);
    expect(status.headline).toBe('Nothing is running in reading-tracker-resilience-01');
    expect(status.detail).toBe('1 Workflow waiting for a trigger · $18.72 spent here');
  });

  it('names what is working when a run reports in this session', () => {
    const working = loop({ liveRun: { runId: 'r', startedAt: SESSION, reportedAt: '2026-09-19T10:01:00.000Z' } });

    const status = homeStatus({ loops: [working], rooms: [], goals: [], workspaceName: 'ws', sessionStartedAt: SESSION });

    expect(status.activeCount).toBe(1);
    expect(status.headline).toBe('1 Workflow working in ws');
  });

  it('counts a running Room beside the Workflows', () => {
    const room = { id: 'room-1', status: 'running', costUsd: 0.31, attentionCount: 0 } as unknown as RoomSummary;

    const status = homeStatus({ loops: [], rooms: [room], goals: [], workspaceName: 'ws', sessionStartedAt: SESSION });

    expect(status.activeCount).toBe(1);
    expect(status.headline).toBe('1 Room working in ws');
  });

  it('takes the workspace name from the end of its path', () => {
    expect(workspaceName('/Users/dan/Projects/csv-summary-resilience-01')).toBe('csv-summary-resilience-01');
    expect(workspaceName('')).toBe('this workspace');
  });
});
