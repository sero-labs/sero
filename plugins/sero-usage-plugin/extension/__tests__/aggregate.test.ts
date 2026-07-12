import { describe, expect, it } from 'vitest';

import { aggregate, messageFingerprint } from '../aggregate';
import type { ParsedSession, UsageMessage } from '../scan';

// Fixed reference: Wednesday 2026-07-08, 15:30 local time.
const NOW = new Date(2026, 6, 8, 15, 30);

function msg(overrides: Partial<UsageMessage>): UsageMessage {
  return {
    provider: 'anthropic',
    model: 'claude-opus-4-5',
    cost: 1,
    input: 100,
    output: 50,
    cacheRead: 1000,
    cacheWrite: 200,
    timestamp: new Date(2026, 6, 8, 9, 0).getTime(),
    ...overrides,
  };
}

function session(id: string, messages: UsageMessage[], overrides: Partial<ParsedSession> = {}): ParsedSession {
  return {
    sessionId: id,
    path: `/sessions/${id}.jsonl`,
    cwd: `/workspaces/${id}`,
    messages,
    ...overrides,
  };
}

describe('token accounting formulas', () => {
  it('counts total as input + output + cacheWrite, excluding cacheRead', () => {
    const result = aggregate([session('s1', [msg({})])], NOW);
    const tokens = result.periods.allTime.totals.tokens;
    expect(tokens.total).toBe(100 + 50 + 200);
    expect(tokens.input).toBe(100);
    expect(tokens.output).toBe(50);
    expect(tokens.cacheRead).toBe(1000);
    expect(tokens.cacheWrite).toBe(200);
  });
});

describe('deduplication', () => {
  it('fingerprints by timestamp + total raw tokens', () => {
    const a = msg({});
    expect(messageFingerprint(a)).toBe(`${a.timestamp}:${100 + 50 + 1000 + 200}`);
  });

  it('drops copied history across branched session files', () => {
    const shared = msg({});
    const branchOnly = msg({ timestamp: shared.timestamp + 60_000, input: 111 });
    const result = aggregate(
      [session('original', [shared]), session('branch', [shared, branchOnly])],
      NOW,
    );
    expect(result.periods.allTime.totals.messages).toBe(2);
    expect(result.periods.allTime.totals.cost).toBe(2);
  });
});

describe('period bucketing', () => {
  it('splits messages across today / thisWeek / lastWeek / allTime', () => {
    const todayMsg = msg({});
    const mondayMsg = msg({ timestamp: new Date(2026, 6, 6, 9, 0).getTime(), input: 101 });
    const lastWeekMsg = msg({ timestamp: new Date(2026, 6, 1, 9, 0).getTime(), input: 102 });
    const oldMsg = msg({ timestamp: new Date(2026, 3, 1, 9, 0).getTime(), input: 103 });
    const result = aggregate([session('s1', [todayMsg, mondayMsg, lastWeekMsg, oldMsg])], NOW);

    expect(result.periods.today.totals.messages).toBe(1);
    expect(result.periods.thisWeek.totals.messages).toBe(2);
    expect(result.periods.lastWeek.totals.messages).toBe(1);
    expect(result.periods.allTime.totals.messages).toBe(4);
  });

  it('counts messages without timestamps toward allTime only', () => {
    const result = aggregate([session('s1', [msg({ timestamp: 0 })])], NOW);
    expect(result.periods.allTime.totals.messages).toBe(1);
    expect(result.periods.today.totals.messages).toBe(0);
    expect(result.daily).toHaveLength(0);
    expect(result.hourly).toHaveLength(0);
  });
});

describe('provider and model rollups', () => {
  it('sorts providers and models by cost descending with session counts', () => {
    const result = aggregate(
      [
        session('s1', [
          msg({ provider: 'openai', model: 'gpt-6', cost: 10 }),
          msg({ provider: 'anthropic', model: 'claude-opus-4-5', cost: 3, timestamp: msg({}).timestamp + 1 }),
          msg({ provider: 'anthropic', model: 'claude-haiku-4-5', cost: 1, timestamp: msg({}).timestamp + 2 }),
        ]),
        session('s2', [msg({ provider: 'anthropic', model: 'claude-opus-4-5', cost: 4, timestamp: msg({}).timestamp + 3 })]),
      ],
      NOW,
    );

    const providers = result.periods.allTime.providers;
    expect(providers.map((p) => p.provider)).toEqual(['openai', 'anthropic']);
    expect(providers[1]!.sessions).toBe(2);
    expect(providers[1]!.models.map((m) => m.model)).toEqual(['claude-opus-4-5', 'claude-haiku-4-5']);
    expect(providers[1]!.models[0]!.cost).toBe(7);
  });
});

describe('top sessions', () => {
  it('ranks sessions by cost and labels from name, first message, then id', () => {
    const base = msg({}).timestamp;
    const result = aggregate(
      [
        session('cheap', [msg({ cost: 1, timestamp: base + 1 })], { firstMessage: 'fix the bug' }),
        session('pricey', [msg({ cost: 9, timestamp: base + 2 })], { name: 'Named session' }),
        session('anonymous', [msg({ cost: 5, timestamp: base + 3 })]),
      ],
      NOW,
    );

    const sessions = result.periods.allTime.topSessions;
    expect(sessions.map((s) => s.id)).toEqual(['pricey', 'anonymous', 'cheap']);
    expect(sessions[0]!.label).toBe('Named session');
    expect(sessions[1]!.label).toBe('anonymous');
    expect(sessions[2]!.label).toBe('fix the bug');
    expect(sessions[2]!.path).toBe('/sessions/cheap.jsonl');
  });

  it('tracks first/last activity per period', () => {
    const first = new Date(2026, 6, 8, 8, 0).getTime();
    const last = new Date(2026, 6, 8, 14, 0).getTime();
    const result = aggregate([session('s1', [msg({ timestamp: last }), msg({ timestamp: first, input: 7 })])], NOW);
    const stats = result.periods.today.topSessions[0]!;
    expect(stats.firstActivity).toBe(first);
    expect(stats.lastActivity).toBe(last);
  });
});

describe('daily and hourly buckets', () => {
  it('builds ascending daily buckets with per-provider slices', () => {
    const result = aggregate(
      [
        session('s1', [
          msg({ timestamp: new Date(2026, 6, 7, 10, 0).getTime(), provider: 'openai', cost: 2 }),
          msg({ timestamp: new Date(2026, 6, 8, 9, 0).getTime(), cost: 3 }),
        ]),
      ],
      NOW,
    );

    expect(result.daily.map((d) => d.date)).toEqual(['2026-07-07', '2026-07-08']);
    expect(result.daily[0]!.byProvider.openai!.cost).toBe(2);
    expect(result.daily[1]!.byProvider.anthropic!.tokens).toBe(100 + 50 + 200);
    // Daily input column shows fresh input incl. cacheWrite.
    expect(result.daily[1]!.input).toBe(100 + 200);
  });

  it('builds hourly buckets for the current day only', () => {
    const result = aggregate(
      [
        session('s1', [
          msg({ timestamp: new Date(2026, 6, 8, 9, 15).getTime() }),
          msg({ timestamp: new Date(2026, 6, 8, 9, 45).getTime(), input: 7 }),
          msg({ timestamp: new Date(2026, 6, 7, 9, 0).getTime(), input: 8 }),
        ]),
      ],
      NOW,
    );

    expect(result.hourly).toHaveLength(1);
    expect(result.hourly[0]!.hour).toBe(9);
    expect(result.hourly[0]!.messages).toBe(2);
    expect(result.hourly[0]!.byProvider.anthropic!.messages).toBe(2);
  });
});
