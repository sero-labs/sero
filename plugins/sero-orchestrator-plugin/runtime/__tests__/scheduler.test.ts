import { describe, expect, it } from 'vitest';
import { evaluateCronTriggers, fireEventTriggers, nextFireAfter, parseCron } from '../scheduler';
import type { Loop, LoopTrigger } from '../../shared/types';
import { createFakeHost } from './fake-host';
import { oneStepPlan, seedActiveLoop } from './fixtures';

const T0 = Date.parse('2026-06-22T10:00:00.000Z');

function withTriggers(loop: Loop, triggers: LoopTrigger[]): Loop {
  return { ...loop, triggers };
}

function cronTrigger(overrides: Partial<LoopTrigger> = {}): LoopTrigger {
  return { id: 't', loopId: 'loop-1', workspaceId: 'ws-1', type: 'cron', schedule: '* * * * *', fireCount: 0, ...overrides };
}

describe('cron parsing', () => {
  it('parses every-minute and specific schedules', () => {
    expect(parseCron('* * * * *')?.minute.size).toBe(60);
    expect(parseCron('0 9 * * *')?.hour.has(9)).toBe(true);
    expect(parseCron('bad')).toBeNull();
  });

  it('computes the next fire after a time', () => {
    const next = nextFireAfter('0 * * * *', Date.parse('2026-06-22T10:15:00.000Z'));
    expect(next).toBe(Date.parse('2026-06-22T11:00:00.000Z'));
  });

  it('supports ranges, lists, and steps', () => {
    const fields = parseCron('0 9-11 * * 1,3');
    expect(fields?.hour.has(10)).toBe(true);
    expect(fields?.dow.has(3)).toBe(true);
    expect(parseCron('*/15 * * * *')?.minute.has(30)).toBe(true);
  });
});

describe('evaluateCronTriggers', () => {
  it('fires when nextFireAt has passed and advances past now (collapse)', () => {
    const loop = seedActiveLoop(createFakeHost(), oneStepPlan().plan);
    const due = cronTrigger({ schedule: '0 * * * *', nextFireAt: new Date(T0 - 3 * 3600_000).toISOString() });
    const result = evaluateCronTriggers(withTriggers(loop, [due]), T0);
    expect(result.due).toBe(true);
    expect(result.loop.triggers[0].fireCount).toBe(1); // collapsed: one fire
    expect(Date.parse(result.loop.triggers[0].nextFireAt!)).toBeGreaterThan(T0);
  });

  it('does not fire before nextFireAt', () => {
    const loop = seedActiveLoop(createFakeHost(), oneStepPlan().plan);
    const trigger = cronTrigger({ nextFireAt: new Date(T0 + 3600_000).toISOString() });
    expect(evaluateCronTriggers(withTriggers(loop, [trigger]), T0).due).toBe(false);
  });

  it('disables a trigger after maxFires', () => {
    const loop = seedActiveLoop(createFakeHost(), oneStepPlan().plan);
    const trigger = cronTrigger({ schedule: '* * * * *', nextFireAt: new Date(T0 - 60_000).toISOString(), fireCount: 2, maxFires: 3 });
    const result = evaluateCronTriggers(withTriggers(loop, [trigger]), T0);
    expect(result.loop.triggers[0].fireCount).toBe(3);
    expect(result.loop.triggers[0].disabled).toBe(true);
    expect(result.loop.triggers[0].nextFireAt).toBeUndefined();
  });
});

describe('fireEventTriggers', () => {
  it('fires a matching event trigger', () => {
    const loop = seedActiveLoop(createFakeHost(), oneStepPlan().plan);
    const trigger: LoopTrigger = { id: 'e', loopId: 'loop-1', workspaceId: 'ws-1', type: 'event', eventSource: 'workspace.change', fireCount: 0 };
    const result = fireEventTriggers(withTriggers(loop, [trigger]), 'workspace.change', T0);
    expect(result.due).toBe(true);
    expect(result.loop.triggers[0].fireCount).toBe(1);
  });

  it('respects debounce', () => {
    const loop = seedActiveLoop(createFakeHost(), oneStepPlan().plan);
    const trigger: LoopTrigger = { id: 'e', loopId: 'loop-1', workspaceId: 'ws-1', type: 'event', eventSource: 'x', debounceMs: 60_000, lastFireAt: new Date(T0 - 1000).toISOString(), fireCount: 1 };
    expect(fireEventTriggers(withTriggers(loop, [trigger]), 'x', T0).due).toBe(false);
  });

  it('ignores events for a different source', () => {
    const loop = seedActiveLoop(createFakeHost(), oneStepPlan().plan);
    const trigger: LoopTrigger = { id: 'e', loopId: 'loop-1', workspaceId: 'ws-1', type: 'event', eventSource: 'a', fireCount: 0 };
    expect(fireEventTriggers(withTriggers(loop, [trigger]), 'b', T0).due).toBe(false);
  });
});
