import { describe, expect, it } from 'vitest';
import type { Loop, LoopRunSummary, LoopTrigger } from '../../shared/types';
import { eventTriggerChips, firedByLabel, sourceHealthChips } from '../lib/trigger-summary';

const trigger = (over: Partial<LoopTrigger>): LoopTrigger =>
  ({ id: 't1', loopId: 'l1', workspaceId: 'w1', type: 'event', fireCount: 0, ...over } as LoopTrigger);

const run = (over: Partial<LoopRunSummary>): LoopRunSummary =>
  ({ id: 'r', runNumber: 1, status: 'completed', startedAt: 't', steps: [], recoveries: [], ...over } as LoopRunSummary);

const loopWith = (triggers: LoopTrigger[]): Loop => ({ triggers } as Loop);

describe('eventTriggerChips', () => {
  it('renders one chip per event/hybrid trigger with detail in the title', () => {
    const chips = eventTriggerChips([
      trigger({ eventSource: 'github:ci-failed', eventCondition: 'the deploy workflow failed' }),
      trigger({ id: 't2', type: 'hybrid', schedule: '0 9 * * *', eventSource: 'fs:changed' }),
      trigger({ id: 't3', type: 'cron', schedule: '0 * * * *' }),
    ]);
    expect(chips.map((c) => c.label)).toEqual(['github:ci-failed', 'fs:changed']);
    expect(chips[0].title).toContain('when: the deploy workflow failed');
    expect(chips[0].title).toContain('enabled');
  });

  it('shows filter, debounce, and disabled state', () => {
    const [chip] = eventTriggerChips([
      trigger({ eventSource: 'github:issue-labelled', eventFilter: { label: 'bug' }, debounceMs: 60_000, disabled: true }),
    ]);
    expect(chip.label).toBe('github:issue-labelled · off');
    expect(chip.disabled).toBe(true);
    expect(chip.title).toContain('filter {"label":"bug"}');
    expect(chip.title).toContain('debounce 60s');
    expect(chip.title).toContain('disabled');
  });
});

describe('firedByLabel', () => {
  it('is null for manual/cron runs', () => {
    expect(firedByLabel(run({}))).toBeNull();
  });

  it('names the firing source', () => {
    expect(firedByLabel(run({ firedBy: { source: 'github:ci-failed', occurredAt: 't', summary: 'CI failed on main' } })))
      .toBe('github:ci-failed');
  });

  it('appends the chain depth for loop→loop fires', () => {
    expect(firedByLabel(run({ firedBy: { source: 'loop:completed', occurredAt: 't', summary: 's', chainDepth: 2 } })))
      .toBe('loop:completed · chain 2');
  });
});

describe('sourceHealthChips', () => {
  const githubLoop = loopWith([trigger({ eventSource: 'github:ci-failed' })]);

  it('shows GitHub last-checked only when the loop uses a github source', () => {
    const health = { lastPolledAt: '2026-07-02T10:00:00Z' };
    expect(sourceHealthChips(githubLoop, health, null)).toHaveLength(1);
    expect(sourceHealthChips(githubLoop, health, null)[0].label).toContain('GitHub · checked');
    expect(sourceHealthChips(loopWith([trigger({ eventSource: 'fs:changed' })]), health, null)).toEqual([]);
  });

  it('reports backing off when throttled', () => {
    const health = { lastPolledAt: '2026-07-02T10:00:00Z', throttledUntil: '2026-07-02T10:30:00Z' };
    expect(sourceHealthChips(githubLoop, health, null)[0].label).toContain('backing off');
  });

  it('shows the webhook port for webhook loops', () => {
    const hookLoop = loopWith([trigger({ eventSource: 'webhook:deploy' })]);
    expect(sourceHealthChips(hookLoop, null, { port: 4321 })).toEqual([
      { key: 'webhook', label: 'Hooks · 127.0.0.1:4321' },
    ]);
  });

  it('ignores disabled triggers and missing facts', () => {
    const disabledLoop = loopWith([trigger({ eventSource: 'github:ci-failed', disabled: true })]);
    expect(sourceHealthChips(disabledLoop, { lastPolledAt: 't' }, null)).toEqual([]);
    expect(sourceHealthChips(githubLoop, null, null)).toEqual([]);
  });
});
