import { describe, expect, it } from 'vitest';
import { codeMatchEventTrigger, matchesEventFilter } from '../event-match';
import type { LoopTrigger, OrchestratorEvent } from '../../shared/types';

const T0 = Date.parse('2026-06-22T10:00:00.000Z');

function trigger(overrides: Partial<LoopTrigger> = {}): LoopTrigger {
  return { id: 'e', loopId: 'loop-1', workspaceId: 'ws-1', type: 'event', eventSource: 'github:ci-failed', fireCount: 0, ...overrides };
}

function event(overrides: Partial<OrchestratorEvent> = {}): OrchestratorEvent {
  return { id: 'evt-1', source: 'github:ci-failed', payload: {}, occurredAt: new Date(T0).toISOString(), ...overrides };
}

describe('matchesEventFilter', () => {
  it('matches on strict equality of top-level payload fields', () => {
    expect(matchesEventFilter({ repo: 'sero' }, { repo: 'sero', extra: 1 })).toBe(true);
    expect(matchesEventFilter({ repo: 'sero' }, { repo: 'other' })).toBe(false);
    expect(matchesEventFilter({ count: 3 }, { count: 3 })).toBe(true);
    expect(matchesEventFilter({ count: 3 }, { count: '3' })).toBe(false); // no coercion
    expect(matchesEventFilter({ missing: 'x' }, {})).toBe(false);
  });

  it('treats an array value as "one of"', () => {
    expect(matchesEventFilter({ branch: ['main', 'dev'] }, { branch: 'dev' })).toBe(true);
    expect(matchesEventFilter({ branch: ['main', 'dev'] }, { branch: 'feature' })).toBe(false);
  });

  it('an absent filter matches everything', () => {
    expect(matchesEventFilter(undefined, { anything: true })).toBe(true);
  });
});

describe('codeMatchEventTrigger', () => {
  it('matches only enabled event/hybrid triggers with the exact source', () => {
    expect(codeMatchEventTrigger(trigger(), event(), T0)).toBe('match');
    expect(codeMatchEventTrigger(trigger({ type: 'hybrid' }), event(), T0)).toBe('match');
    expect(codeMatchEventTrigger(trigger({ type: 'cron' }), event(), T0)).toBe('no-match');
    expect(codeMatchEventTrigger(trigger({ disabled: true }), event(), T0)).toBe('no-match');
    expect(codeMatchEventTrigger(trigger(), event({ source: 'github:ci-passed' }), T0)).toBe('no-match');
  });

  it('applies the structured filter before the debounce window', () => {
    const t = trigger({ eventFilter: { repo: 'sero' }, debounceMs: 60_000, lastFireAt: new Date(T0 - 1000).toISOString() });
    expect(codeMatchEventTrigger(t, event({ payload: { repo: 'other' } }), T0)).toBe('no-match'); // filter first
    expect(codeMatchEventTrigger(t, event({ payload: { repo: 'sero' } }), T0)).toBe('debounced');
    expect(codeMatchEventTrigger({ ...t, lastFireAt: new Date(T0 - 120_000).toISOString() }, event({ payload: { repo: 'sero' } }), T0)).toBe('match');
  });

  it('a trigger without an eventSource matches any source', () => {
    expect(codeMatchEventTrigger(trigger({ eventSource: undefined }), event({ source: 'fs:changed' }), T0)).toBe('match');
  });
});
