import { describe, expect, it } from 'vitest';
import { createFakeHost } from './fake-host';
import {
  extractTriggers,
  mergeExtractedTriggers,
  NO_TRIGGERS,
  type TriggerExtraction,
} from '../trigger-extractor';
import type { LoopTriggerSuggestion } from '../../shared/types';

describe('extractTriggers', () => {
  it('returns a derived cron when the goal recurs', async () => {
    const host = createFakeHost();
    host.modelResponses.push({ response: JSON.stringify({ recurring: true, schedule: '*/10 * * * *', events: [] }) });
    const result = await extractTriggers(host, { prompt: 'every 10 minutes, check issues', parentSessionId: 's' });
    expect(result).toEqual({ recurring: true, schedule: '*/10 * * * *', events: [] });
  });

  it('returns no triggers for a one-off goal', async () => {
    const host = createFakeHost();
    host.modelResponses.push({ response: JSON.stringify({ recurring: false, schedule: null, events: [] }) });
    const result = await extractTriggers(host, { prompt: 'fix this bug', parentSessionId: 's' });
    expect(result).toEqual({ recurring: false, events: [] });
  });

  it('derives an event trigger with a condition ("when CI fails on my PRs…")', async () => {
    const host = createFakeHost();
    host.modelResponses.push({
      response: JSON.stringify({
        recurring: false,
        schedule: null,
        events: [{ source: 'github:ci-failed', condition: 'the failing run belongs to one of my open PRs' }],
      }),
    });
    const result = await extractTriggers(host, { prompt: 'when CI fails on my PRs, investigate and fix', parentSessionId: 's' });
    expect(result).toEqual({
      recurring: false,
      events: [{ eventSource: 'github:ci-failed', eventCondition: 'the failing run belongs to one of my open PRs' }],
    });
  });

  it('derives both halves for "every morning and when docs/ changes…"', async () => {
    const host = createFakeHost();
    host.modelResponses.push({
      response: JSON.stringify({
        recurring: true,
        schedule: '0 9 * * *',
        events: [{ source: 'fs:changed', condition: 'the changed paths include files under docs/' }],
      }),
    });
    const result = await extractTriggers(host, { prompt: 'every morning and when docs/ changes, rebuild the site', parentSessionId: 's' });
    expect(result.recurring).toBe(true);
    expect(result.schedule).toBe('0 9 * * *');
    expect(result.events).toEqual([
      { eventSource: 'fs:changed', eventCondition: 'the changed paths include files under docs/' },
    ]);
  });

  it('carries an exact-match filter and debounce through', async () => {
    const host = createFakeHost();
    host.modelResponses.push({
      response: JSON.stringify({
        recurring: false,
        schedule: null,
        events: [{ source: 'github:issue-labelled', filter: { label: 'bug' }, debounceMs: 60000 }],
      }),
    });
    const result = await extractTriggers(host, { prompt: 'when an issue is labelled bug, triage it', parentSessionId: 's' });
    expect(result.events).toEqual([
      { eventSource: 'github:issue-labelled', eventFilter: { label: 'bug' }, debounceMs: 60000 },
    ]);
  });

  it('repairs an invented source, then succeeds', async () => {
    const host = createFakeHost();
    host.modelResponses.push({
      response: JSON.stringify({ recurring: false, schedule: null, events: [{ source: 'gitlab:pipeline-failed' }] }),
    });
    host.modelResponses.push({
      response: JSON.stringify({ recurring: false, schedule: null, events: [{ source: 'github:ci-failed' }] }),
    });
    const result = await extractTriggers(host, { prompt: 'when the pipeline fails, fix it', parentSessionId: 's' });
    expect(result.events).toEqual([{ eventSource: 'github:ci-failed' }]);
  });

  it('repairs a malformed cron once, then succeeds', async () => {
    const host = createFakeHost();
    host.modelResponses.push({ response: JSON.stringify({ recurring: true, schedule: 'every 10 minutes', events: [] }) });
    host.modelResponses.push({ response: JSON.stringify({ recurring: true, schedule: '*/10 * * * *', events: [] }) });
    const result = await extractTriggers(host, { prompt: 'every 10 minutes', parentSessionId: 's' });
    expect(result).toEqual({ recurring: true, schedule: '*/10 * * * *', events: [] });
  });

  it('accepts suggestion-shaped event keys a repair reply echoes back', async () => {
    const host = createFakeHost();
    host.modelResponses.push({
      response: JSON.stringify({
        recurring: false,
        schedule: null,
        events: [{ eventSource: 'github:pr-opened', eventFilter: { draft: false } }],
      }),
    });
    const result = await extractTriggers(host, { prompt: 'when a PR opens, review it', parentSessionId: 's' });
    expect(result.events).toEqual([{ eventSource: 'github:pr-opened', eventFilter: { draft: false } }]);
  });

  it('persists raw replies to an artifact when nothing usable comes back', async () => {
    const host = createFakeHost();
    for (let i = 0; i < 3; i += 1) host.modelResponses.push({ response: JSON.stringify({ recurring: true }) });
    const result = await extractTriggers(host, { prompt: 'every 10 minutes', parentSessionId: 's', loopId: 'loop-1' });
    expect(result).toEqual(NO_TRIGGERS);
    expect(host.artifacts.get('artifact://loops/loop-1/artifacts/triggers.txt')).toContain('recurring');
  });

  it('carries a fire cap when the goal limits runs', async () => {
    const host = createFakeHost();
    host.modelResponses.push({ response: JSON.stringify({ recurring: true, schedule: '0 * * * *', maxFires: 5, events: [] }) });
    const result = await extractTriggers(host, { prompt: 'hourly, 5 times', parentSessionId: 's' });
    expect(result).toEqual({ recurring: true, schedule: '0 * * * *', maxFires: 5, events: [] });
  });

  it('falls back to no triggers when the model gives no usable answer', async () => {
    const host = createFakeHost();
    host.modelResponses.push({ response: '{ garbage' });
    host.modelResponses.push({ response: '{ still garbage' });
    const result = await extractTriggers(host, { prompt: 'every 10 minutes', parentSessionId: 's' });
    expect(result).toEqual(NO_TRIGGERS);
  });
});

describe('mergeExtractedTriggers', () => {
  const cron: TriggerExtraction = { recurring: true, schedule: '*/10 * * * *', events: [] };

  it('appends a cron trigger when none is suggested', () => {
    expect(mergeExtractedTriggers(undefined, cron)).toEqual([{ type: 'cron', schedule: '*/10 * * * *' }]);
  });

  it('overwrites the schedule on an existing cron suggestion without duplicating', () => {
    const suggested: LoopTriggerSuggestion[] = [{ type: 'cron', schedule: '0 0 * * *', maxFires: 3 }];
    expect(mergeExtractedTriggers(suggested, cron)).toEqual([
      { type: 'cron', schedule: '*/10 * * * *', maxFires: 3 },
    ]);
  });

  it('appends extracted events as event triggers', () => {
    const extraction: TriggerExtraction = {
      recurring: false,
      events: [{ eventSource: 'github:ci-failed', eventCondition: 'the deploy workflow failed' }],
    };
    expect(mergeExtractedTriggers(undefined, extraction)).toEqual([
      { type: 'event', eventSource: 'github:ci-failed', eventCondition: 'the deploy workflow failed' },
    ]);
  });

  it('collapses a cadence plus one new event into a single hybrid trigger', () => {
    const extraction: TriggerExtraction = {
      recurring: true,
      schedule: '0 9 * * *',
      events: [{ eventSource: 'fs:changed', eventCondition: 'paths under docs/ changed' }],
    };
    expect(mergeExtractedTriggers(undefined, extraction)).toEqual([
      { type: 'hybrid', schedule: '0 9 * * *', eventSource: 'fs:changed', eventCondition: 'paths under docs/ changed' },
    ]);
  });

  it('keeps cron and events separate when several events were extracted', () => {
    const extraction: TriggerExtraction = {
      recurring: true,
      schedule: '0 9 * * *',
      events: [{ eventSource: 'github:pr-opened' }, { eventSource: 'github:ci-failed' }],
    };
    expect(mergeExtractedTriggers(undefined, extraction)).toEqual([
      { type: 'cron', schedule: '0 9 * * *' },
      { type: 'event', eventSource: 'github:pr-opened' },
      { type: 'event', eventSource: 'github:ci-failed' },
    ]);
  });

  it('skips extracted events whose source the planner already suggested', () => {
    const suggested: LoopTriggerSuggestion[] = [
      { type: 'event', eventSource: 'github:ci-failed', eventFilter: { branch: 'main' } },
    ];
    const extraction: TriggerExtraction = { recurring: false, events: [{ eventSource: 'github:ci-failed' }] };
    expect(mergeExtractedTriggers(suggested, extraction)).toEqual(suggested);
  });

  it('leaves triggers untouched when nothing was extracted', () => {
    const suggested: LoopTriggerSuggestion[] = [{ type: 'manual' }];
    expect(mergeExtractedTriggers(suggested, NO_TRIGGERS)).toEqual([{ type: 'manual' }]);
  });
});
