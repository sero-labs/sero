/**
 * Aggregation: parsed sessions → period stats, daily and hourly buckets.
 *
 * Headline tokens = input + output + cacheWrite. cacheRead is excluded
 * from totals (repeated cache hits would dominate) but tracked in the
 * breakdown for the Cache column.
 *
 * Room member sessions are collapsed into one Room row, so a Room's cost does
 * not appear as a set of unexplained ordinary chats.
 */

import path from 'node:path';

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

/** Optional published enrichment for one Room. Labels and links only. */
export interface RoomLabel {
  /** Current Room title — replaces the title parsed from the session name. */
  title?: string;
  /** Deep link to the Room. */
  link?: string;
}

export interface AggregateOptions {
  /**
   * Optional lookup keyed by Room id, from a published Room list. It is never
   * read from the Orchestrator store, and grouping plus attribution stay
   * correct when it is absent.
   */
  roomLabels?: ReadonlyMap<string, RoomLabel>;
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

/** Cross-file dedup fingerprint for copied history in branched sessions. */
export function messageFingerprint(msg: UsageMessage): string {
  return `${msg.timestamp}:${msg.input + msg.output + msg.cacheRead + msg.cacheWrite}`;
}

function sessionLabel(session: ParsedSession): string {
  return session.name || session.firstMessage || session.sessionId;
}

function byCost(a: SessionStats, b: SessionStats): number {
  return b.cost - a.cost || b.tokens.total - a.tokens.total;
}

export function aggregate(
  sessions: ParsedSession[],
  now = new Date(),
  options: AggregateOptions = {},
): AggregateResult {
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
    periods[key] = finalizePeriod(accumulators[key], options.roomLabels);
  }

  return {
    periods,
    daily: Array.from(dailyBuckets.values()).sort((a, b) => a.date.localeCompare(b.date)),
    hourly: Array.from(hourlyBuckets.values()).sort((a, b) => a.hour - b.hour),
  };
}

/** `<sessions>/rooms/<roomId>/<member>.jsonl` — the authoritative Room id. */
const ROOM_PATH_SEGMENT = /(?:^|\/)rooms\/([^/]+)\//;
/**
 * Session paths are matched POSIX-style. A Windows scan writes `\` separators,
 * and a separator-blind pattern would miss every Room member session there —
 * reporting each one as an unexplained ordinary chat, which is the exact failure
 * Room grouping exists to prevent.
 */
function posix(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}
/**
 * The deterministic Pi session name Room member creation writes. The first
 * group is greedy so the split falls on the LAST separator: the role is the
 * final field, and a Room title may itself contain an em dash.
 */
const ROOM_SESSION_NAME = /^Room\s+(.+)\s+—\s+(.+)$/;

interface RoomOrigin {
  /** Grouping key. Internal — never displayed. */
  key: string;
  roomId: string | null;
  title: string | null;
  role: string | null;
}

interface RoomBucket {
  origin: RoomOrigin;
  members: Array<{ acc: SessionAccumulator; role: string | null }>;
}

/**
 * Both grouping inputs come from what the scanner already reads: the session
 * path and the Pi session name. Either one alone is enough, so a Room keeps its
 * own row when the other is missing or malformed.
 */
function roomOrigin(session: ParsedSession): RoomOrigin | null {
  const sessionPath = posix(session.path);
  const roomId = ROOM_PATH_SEGMENT.exec(sessionPath)?.[1] ?? null;
  const named = session.name ? ROOM_SESSION_NAME.exec(session.name) : null;
  const title = (named?.[1] ?? '').trim();
  const role = (named?.[2] ?? '').trim();
  if (!roomId && !title) return null;
  return {
    // Without a path id the title is all we have, so the Room's own session
    // directory still keeps two same-titled Rooms apart.
    key: roomId ?? `${path.posix.dirname(sessionPath)}::${title}`,
    roomId,
    title: title || null,
    role: role || null,
  };
}

function toSessionStats(acc: SessionAccumulator, label: string): SessionStats {
  return {
    id: acc.session.sessionId,
    label,
    cwd: acc.session.cwd,
    path: acc.session.path,
    messages: acc.messages,
    cost: acc.cost,
    tokens: acc.tokens,
    firstActivity: acc.firstActivity,
    lastActivity: acc.lastActivity,
  };
}

function roomRow(bucket: RoomBucket, enrichment: RoomLabel | undefined): SessionStats {
  const members = bucket.members
    .map(({ acc, role }) => toSessionStats(acc, role ?? sessionLabel(acc.session)))
    .sort(byCost);

  const tokens = emptyTokens();
  let messages = 0;
  let cost = 0;
  let firstActivity = 0;
  let lastActivity = 0;
  for (const member of members) {
    messages += member.messages;
    cost += member.cost;
    tokens.total += member.tokens.total;
    tokens.input += member.tokens.input;
    tokens.output += member.tokens.output;
    tokens.cacheRead += member.tokens.cacheRead;
    tokens.cacheWrite += member.tokens.cacheWrite;
    if (member.firstActivity && (!firstActivity || member.firstActivity < firstActivity)) {
      firstActivity = member.firstActivity;
    }
    if (member.lastActivity > lastActivity) lastActivity = member.lastActivity;
  }

  const title = enrichment?.title ?? bucket.origin.title;
  const workspaces = new Set(members.map((member) => member.cwd));
  return {
    id: `room:${bucket.origin.key}`,
    // A malformed session name falls back to the Room id: the cost stays
    // attributed to a Room instead of reading as an ordinary chat.
    label: `Room ${title ?? bucket.origin.roomId ?? bucket.origin.key}`,
    cwd: workspaces.size === 1 ? (members[0]?.cwd ?? '') : '',
    path: path.dirname(members[0]?.path ?? ''),
    messages,
    cost,
    tokens,
    firstActivity,
    lastActivity,
    room: { roomId: bucket.origin.roomId, title, link: enrichment?.link, members },
  };
}

/** Room member sessions collapse into one Room row; other sessions pass through. */
function buildTopSessions(
  acc: PeriodAccumulator,
  roomLabels: ReadonlyMap<string, RoomLabel> | undefined,
): SessionStats[] {
  const rows: SessionStats[] = [];
  const rooms = new Map<string, RoomBucket>();

  for (const sessionAcc of acc.sessions.values()) {
    const origin = roomOrigin(sessionAcc.session);
    if (!origin) {
      rows.push(toSessionStats(sessionAcc, sessionLabel(sessionAcc.session)));
      continue;
    }
    const bucket = rooms.get(origin.key);
    if (!bucket) {
      rooms.set(origin.key, { origin, members: [{ acc: sessionAcc, role: origin.role }] });
      continue;
    }
    // One well-formed member name titles the whole Room.
    if (!bucket.origin.title) bucket.origin.title = origin.title;
    bucket.members.push({ acc: sessionAcc, role: origin.role });
  }

  for (const bucket of rooms.values()) {
    const enrichment = bucket.origin.roomId ? roomLabels?.get(bucket.origin.roomId) : undefined;
    rows.push(roomRow(bucket, enrichment));
  }

  // Ranking runs after grouping so a Room is never cut off member by member.
  return rows.sort(byCost).slice(0, TOP_SESSIONS_LIMIT);
}

function finalizePeriod(
  acc: PeriodAccumulator,
  roomLabels: ReadonlyMap<string, RoomLabel> | undefined,
): PeriodStats {
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

  return {
    totals: {
      sessions: acc.totals.sessions.size,
      messages: acc.totals.messages,
      cost: acc.totals.cost,
      tokens: acc.totals.tokens,
    },
    providers,
    topSessions: buildTopSessions(acc, roomLabels),
  };
}
