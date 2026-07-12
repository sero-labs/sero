/**
 * Aggregation: parsed sessions → period stats, daily and hourly buckets.
 *
 * Token accounting rules (docs/specs/sero-usage-plugin-spec.md §2.4):
 * headline tokens = input + output + cacheWrite. cacheRead is excluded
 * from totals (repeated cache hits would dominate) but tracked in the
 * breakdown for the Cache column.
 */

import { dateKey, periodBoundaries, periodsForTimestamp } from '../shared/period';
import type {
  DailyBucket,
  HourlyBucket,
  PeriodKey,
  PeriodStats,
  ProviderSlice,
  SessionStats,
  TokenBreakdown,
} from '../shared/types';
import { PERIOD_KEYS, emptyTokens } from '../shared/types';
import type { ParsedSession, UsageMessage } from './scan';

const TOP_SESSIONS_LIMIT = 50;
const DAILY_WINDOW_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface AggregateResult {
  periods: Record<PeriodKey, PeriodStats>;
  daily: DailyBucket[];
  hourly: HourlyBucket[];
}

interface StatsAccumulator {
  sessions: Set<string>;
  messages: number;
  cost: number;
  tokens: TokenBreakdown;
}

interface ProviderAccumulator extends StatsAccumulator {
  models: Map<string, StatsAccumulator>;
}

interface SessionAccumulator {
  session: ParsedSession;
  messages: number;
  cost: number;
  tokens: TokenBreakdown;
  firstActivity: number;
  lastActivity: number;
}

interface PeriodAccumulator {
  totals: StatsAccumulator;
  providers: Map<string, ProviderAccumulator>;
  sessions: Map<string, SessionAccumulator>;
}

function emptyStatsAccumulator(): StatsAccumulator {
  return { sessions: new Set(), messages: 0, cost: 0, tokens: emptyTokens() };
}

function accumulate(target: StatsAccumulator, msg: UsageMessage): void {
  target.messages++;
  target.cost += msg.cost;
  target.tokens.total += msg.input + msg.output + msg.cacheWrite;
  target.tokens.input += msg.input;
  target.tokens.output += msg.output;
  target.tokens.cacheRead += msg.cacheRead;
  target.tokens.cacheWrite += msg.cacheWrite;
}

function accumulateSlice(slices: Record<string, ProviderSlice>, msg: UsageMessage): void {
  const slice = (slices[msg.provider] ??= { cost: 0, tokens: 0, messages: 0 });
  slice.cost += msg.cost;
  slice.tokens += msg.input + msg.output + msg.cacheWrite;
  slice.messages++;
}

/** Cross-file dedup fingerprint for copied history in branched sessions (spec §2.3). */
export function messageFingerprint(msg: UsageMessage): string {
  return `${msg.timestamp}:${msg.input + msg.output + msg.cacheRead + msg.cacheWrite}`;
}

function sessionLabel(session: ParsedSession): string {
  return session.name || session.firstMessage || session.sessionId;
}

export function aggregate(sessions: ParsedSession[], now = new Date()): AggregateResult {
  const bounds = periodBoundaries(now);
  const dailyWindowStartMs = bounds.todayMs - (DAILY_WINDOW_DAYS - 1) * DAY_MS;

  const accumulators = {} as Record<PeriodKey, PeriodAccumulator>;
  for (const key of PERIOD_KEYS) {
    accumulators[key] = { totals: emptyStatsAccumulator(), providers: new Map(), sessions: new Map() };
  }
  const dailyBuckets = new Map<string, DailyBucket>();
  const hourlyBuckets = new Map<number, HourlyBucket>();
  const seenFingerprints = new Set<string>();

  for (const session of sessions) {
    for (const msg of session.messages) {
      const fingerprint = messageFingerprint(msg);
      if (seenFingerprints.has(fingerprint)) continue;
      seenFingerprints.add(fingerprint);

      for (const period of periodsForTimestamp(msg.timestamp, bounds)) {
        const acc = accumulators[period];
        accumulate(acc.totals, msg);
        acc.totals.sessions.add(session.sessionId);

        let provider = acc.providers.get(msg.provider);
        if (!provider) {
          provider = { ...emptyStatsAccumulator(), models: new Map() };
          acc.providers.set(msg.provider, provider);
        }
        accumulate(provider, msg);
        provider.sessions.add(session.sessionId);

        let model = provider.models.get(msg.model);
        if (!model) {
          model = emptyStatsAccumulator();
          provider.models.set(msg.model, model);
        }
        accumulate(model, msg);
        model.sessions.add(session.sessionId);

        let sessionAcc = acc.sessions.get(session.sessionId);
        if (!sessionAcc) {
          sessionAcc = {
            session,
            messages: 0,
            cost: 0,
            tokens: emptyTokens(),
            firstActivity: 0,
            lastActivity: 0,
          };
          acc.sessions.set(session.sessionId, sessionAcc);
        }
        sessionAcc.messages++;
        sessionAcc.cost += msg.cost;
        sessionAcc.tokens.total += msg.input + msg.output + msg.cacheWrite;
        sessionAcc.tokens.input += msg.input;
        sessionAcc.tokens.output += msg.output;
        sessionAcc.tokens.cacheRead += msg.cacheRead;
        sessionAcc.tokens.cacheWrite += msg.cacheWrite;
        if (msg.timestamp > 0) {
          if (!sessionAcc.firstActivity || msg.timestamp < sessionAcc.firstActivity) {
            sessionAcc.firstActivity = msg.timestamp;
          }
          if (msg.timestamp > sessionAcc.lastActivity) sessionAcc.lastActivity = msg.timestamp;
        }
      }

      if (msg.timestamp >= dailyWindowStartMs) {
        const key = dateKey(msg.timestamp);
        let bucket = dailyBuckets.get(key);
        if (!bucket) {
          bucket = { date: key, cost: 0, tokens: 0, input: 0, output: 0, messages: 0, byProvider: {} };
          dailyBuckets.set(key, bucket);
        }
        bucket.cost += msg.cost;
        bucket.tokens += msg.input + msg.output + msg.cacheWrite;
        bucket.input += msg.input + msg.cacheWrite;
        bucket.output += msg.output;
        bucket.messages++;
        accumulateSlice(bucket.byProvider, msg);
      }

      if (msg.timestamp >= bounds.todayMs) {
        const hour = new Date(msg.timestamp).getHours();
        let bucket = hourlyBuckets.get(hour);
        if (!bucket) {
          bucket = { hour, cost: 0, tokens: 0, messages: 0, byProvider: {} };
          hourlyBuckets.set(hour, bucket);
        }
        bucket.cost += msg.cost;
        bucket.tokens += msg.input + msg.output + msg.cacheWrite;
        bucket.messages++;
        accumulateSlice(bucket.byProvider, msg);
      }
    }
  }

  const periods = {} as Record<PeriodKey, PeriodStats>;
  for (const key of PERIOD_KEYS) {
    periods[key] = finalizePeriod(accumulators[key]);
  }

  return {
    periods,
    daily: Array.from(dailyBuckets.values()).sort((a, b) => a.date.localeCompare(b.date)),
    hourly: Array.from(hourlyBuckets.values()).sort((a, b) => a.hour - b.hour),
  };
}

function finalizePeriod(acc: PeriodAccumulator): PeriodStats {
  const providers = Array.from(acc.providers.entries())
    .map(([providerName, provider]) => ({
      provider: providerName,
      sessions: provider.sessions.size,
      messages: provider.messages,
      cost: provider.cost,
      tokens: provider.tokens,
      models: Array.from(provider.models.entries())
        .map(([modelName, model]) => ({
          model: modelName,
          sessions: model.sessions.size,
          messages: model.messages,
          cost: model.cost,
          tokens: model.tokens,
        }))
        .sort((a, b) => b.cost - a.cost || b.tokens.total - a.tokens.total),
    }))
    .sort((a, b) => b.cost - a.cost || b.tokens.total - a.tokens.total);

  const topSessions: SessionStats[] = Array.from(acc.sessions.values())
    .sort((a, b) => b.cost - a.cost || b.tokens.total - a.tokens.total)
    .slice(0, TOP_SESSIONS_LIMIT)
    .map((s) => ({
      id: s.session.sessionId,
      label: sessionLabel(s.session),
      cwd: s.session.cwd,
      path: s.session.path,
      messages: s.messages,
      cost: s.cost,
      tokens: s.tokens,
      firstActivity: s.firstActivity,
      lastActivity: s.lastActivity,
    }));

  return {
    totals: {
      sessions: acc.totals.sessions.size,
      messages: acc.totals.messages,
      cost: acc.totals.cost,
      tokens: acc.totals.tokens,
    },
    providers,
    topSessions,
  };
}
