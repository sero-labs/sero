import { describe, expect, it } from 'vitest';
import { createFakeHost } from './fake-host';
import {
  extractSchedule,
  mergeScheduleIntoTriggers,
  type ScheduleExtraction,
} from '../schedule-extractor';
import type { LoopTriggerSuggestion } from '../../shared/types';

describe('extractSchedule', () => {
  it('returns a derived cron when the goal recurs', async () => {
    const host = createFakeHost();
    host.modelResponses.push({ response: JSON.stringify({ recurring: true, schedule: '*/10 * * * *' }) });
    const result = await extractSchedule(host, { prompt: 'every 10 minutes, check issues', parentSessionId: 's' });
    expect(result).toEqual({ recurring: true, schedule: '*/10 * * * *' });
  });

  it('returns not-recurring for a one-off goal (schedule null)', async () => {
    const host = createFakeHost();
    host.modelResponses.push({ response: JSON.stringify({ recurring: false, schedule: null }) });
    const result = await extractSchedule(host, { prompt: 'fix this bug', parentSessionId: 's' });
    expect(result).toEqual({ recurring: false });
  });

  it('persists raw replies to an artifact when it cannot derive a schedule', async () => {
    const host = createFakeHost();
    // recurring:true but no schedule, three times — exhausts attempts.
    for (let i = 0; i < 3; i += 1) host.modelResponses.push({ response: JSON.stringify({ recurring: true }) });
    const result = await extractSchedule(host, { prompt: 'every 10 minutes', parentSessionId: 's', loopId: 'loop-1' });
    expect(result).toEqual({ recurring: false });
    expect(host.artifacts.get('artifact://loops/loop-1/artifacts/schedule.txt')).toContain('recurring');
  });

  it('carries a fire cap when the goal limits runs', async () => {
    const host = createFakeHost();
    host.modelResponses.push({ response: JSON.stringify({ recurring: true, schedule: '0 * * * *', maxFires: 5 }) });
    const result = await extractSchedule(host, { prompt: 'hourly, 5 times', parentSessionId: 's' });
    expect(result).toEqual({ recurring: true, schedule: '0 * * * *', maxFires: 5 });
  });

  it('repairs a malformed cron once, then succeeds', async () => {
    const host = createFakeHost();
    host.modelResponses.push({ response: JSON.stringify({ recurring: true, schedule: 'every 10 minutes' }) });
    host.modelResponses.push({ response: JSON.stringify({ recurring: true, schedule: '*/10 * * * *' }) });
    const result = await extractSchedule(host, { prompt: 'every 10 minutes', parentSessionId: 's' });
    expect(result).toEqual({ recurring: true, schedule: '*/10 * * * *' });
  });

  it('falls back to not-recurring when the model gives no usable answer', async () => {
    const host = createFakeHost();
    host.modelResponses.push({ response: '{ garbage' });
    host.modelResponses.push({ response: '{ still garbage' });
    const result = await extractSchedule(host, { prompt: 'every 10 minutes', parentSessionId: 's' });
    expect(result).toEqual({ recurring: false });
  });
});

describe('mergeScheduleIntoTriggers', () => {
  const cron: ScheduleExtraction = { recurring: true, schedule: '*/10 * * * *' };

  it('appends a cron trigger when none is suggested', () => {
    expect(mergeScheduleIntoTriggers(undefined, cron)).toEqual([{ type: 'cron', schedule: '*/10 * * * *' }]);
  });

  it('overwrites the schedule on an existing cron suggestion without duplicating', () => {
    const suggested: LoopTriggerSuggestion[] = [{ type: 'cron', schedule: '0 0 * * *', maxFires: 3 }];
    expect(mergeScheduleIntoTriggers(suggested, cron)).toEqual([
      { type: 'cron', schedule: '*/10 * * * *', maxFires: 3 },
    ]);
  });

  it('preserves non-cron triggers (e.g. event) and adds the cron', () => {
    const suggested: LoopTriggerSuggestion[] = [{ type: 'event', eventSource: 'github' }];
    expect(mergeScheduleIntoTriggers(suggested, cron)).toEqual([
      { type: 'event', eventSource: 'github' },
      { type: 'cron', schedule: '*/10 * * * *' },
    ]);
  });

  it('leaves triggers untouched when not recurring', () => {
    const suggested: LoopTriggerSuggestion[] = [{ type: 'manual' }];
    expect(mergeScheduleIntoTriggers(suggested, { recurring: false })).toEqual([{ type: 'manual' }]);
  });
});
