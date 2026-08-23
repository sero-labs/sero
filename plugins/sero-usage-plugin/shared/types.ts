// Single source of truth for JSON-serialisable state shared by extension and UI.

export const PERIOD_KEYS = ['today', 'thisWeek', 'lastWeek', 'allTime'] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: 'Today',
  thisWeek: 'This Week',
  lastWeek: 'Last Week',
  allTime: 'All Time',
};

/** Allowed auto-refresh intervals in minutes. 0 = manual only. */
export const REFRESH_INTERVAL_OPTIONS = [0, 5, 30, 60, 360, 720, 1440] as const;
export const DEFAULT_REFRESH_INTERVAL_MINUTES = 30;

export interface TokenBreakdown {
  /** Fresh tokens processed: input + output + cacheWrite (cacheRead excluded). */
  total: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface ModelStats {
  model: string;
  sessions: number;
  messages: number;
  cost: number;
  tokens: TokenBreakdown;
}

export interface ProviderStats {
  provider: string;
  sessions: number;
  messages: number;
  cost: number;
  tokens: TokenBreakdown;
  /** Sorted by cost desc. */
  models: ModelStats[];
}

/**
 * An Agent Rooms group. Derived from the session path and Pi session name only;
 * the Usage plugin never reads
 * the Orchestrator store.
 */
export interface RoomGroup {
  /** From the `rooms/<roomId>/` path segment; null when the path has none. */
  roomId: string | null;
  /** From the session name `Room <title> — <role>`; null when it is malformed. */
  title: string | null;
  /** Optional published deep link. Attribution never depends on it. */
  link?: string;
  /** One row per member session, cost desc. Labels are member roles. */
  members: SessionStats[];
}

export interface SessionStats {
  id: string;
  /** session_info name, else first user message (truncated), else id. */
  label: string;
  /** Workspace path, for display. */
  cwd: string;
  /** Absolute session .jsonl path — for reveal-in-folder. */
  path: string;
  messages: number;
  cost: number;
  tokens: TokenBreakdown;
  firstActivity: number;
  lastActivity: number;
  /** Set on a grouped Room row only. Ordinary chats never carry it. */
  room?: RoomGroup;
}

export interface PeriodStats {
  totals: { sessions: number; messages: number; cost: number; tokens: TokenBreakdown };
  /** Sorted by cost desc. */
  providers: ProviderStats[];
  /** Top 50 by cost. */
  topSessions: SessionStats[];
}

export interface ProviderSlice {
  cost: number;
  tokens: number;
  messages: number;
}

export interface DailyBucket {
  /** YYYY-MM-DD, local time. */
  date: string;
  cost: number;
  tokens: number;
  input: number;
  output: number;
  messages: number;
  /** For the stacked trend chart. */
  byProvider: Record<string, ProviderSlice>;
}

export interface HourlyBucket {
  /** 0-23, local time, current day only. */
  hour: number;
  cost: number;
  tokens: number;
  messages: number;
  byProvider: Record<string, ProviderSlice>;
}

export interface UsageState {
  schemaVersion: 1;
  settings: { refreshIntervalMinutes: number };
  lastRefreshedAt: number | null;
  lastScan: { files: number; reused: number; durationMs: number } | null;
  periods: Record<PeriodKey, PeriodStats>;
  /** ≤ 365 entries, ascending date. */
  daily: DailyBucket[];
  /** Current day only, ≤ 24 entries, ascending hour. */
  hourly: HourlyBucket[];
}

export function emptyTokens(): TokenBreakdown {
  return { total: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
}

export function emptyPeriodStats(): PeriodStats {
  return {
    totals: { sessions: 0, messages: 0, cost: 0, tokens: emptyTokens() },
    providers: [],
    topSessions: [],
  };
}

export function emptyPeriods(): Record<PeriodKey, PeriodStats> {
  return {
    today: emptyPeriodStats(),
    thisWeek: emptyPeriodStats(),
    lastWeek: emptyPeriodStats(),
    allTime: emptyPeriodStats(),
  };
}

export const DEFAULT_STATE: UsageState = {
  schemaVersion: 1,
  settings: { refreshIntervalMinutes: DEFAULT_REFRESH_INTERVAL_MINUTES },
  lastRefreshedAt: null,
  lastScan: null,
  periods: emptyPeriods(),
  daily: [],
  hourly: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Defensive normalisation for state read from disk. A corrupt or
 * older-schema file must never crash a surface — fall back to defaults
 * per field and let the next refresh rewrite the file.
 */
export function normalizeUsageState(value: unknown): UsageState {
  if (!isRecord(value) || value.schemaVersion !== 1) return structuredClone(DEFAULT_STATE);

  const settings = isRecord(value.settings) ? value.settings : {};
  const interval =
    typeof settings.refreshIntervalMinutes === 'number' &&
    (REFRESH_INTERVAL_OPTIONS as readonly number[]).includes(settings.refreshIntervalMinutes)
      ? settings.refreshIntervalMinutes
      : DEFAULT_REFRESH_INTERVAL_MINUTES;

  const periods = isRecord(value.periods) ? value.periods : {};
  const normalizedPeriods = emptyPeriods();
  for (const key of PERIOD_KEYS) {
    const period = periods[key];
    if (isRecord(period) && isRecord(period.totals)) {
      normalizedPeriods[key] = period as unknown as PeriodStats;
    }
  }

  const lastScan = isRecord(value.lastScan)
    ? (value.lastScan as unknown as UsageState['lastScan'])
    : null;

  return {
    schemaVersion: 1,
    settings: { refreshIntervalMinutes: interval },
    lastRefreshedAt: typeof value.lastRefreshedAt === 'number' ? value.lastRefreshedAt : null,
    lastScan,
    periods: normalizedPeriods,
    daily: Array.isArray(value.daily) ? (value.daily as DailyBucket[]) : [],
    hourly: Array.isArray(value.hourly) ? (value.hourly as HourlyBucket[]) : [],
  };
}
