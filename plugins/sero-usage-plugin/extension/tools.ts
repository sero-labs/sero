/**
 * The `usage` tool — the plugin's single agent/CLI/UI entry point.
 * Actions: refresh, summary, sessions, config. Bridged to `sero usage …`
 * via `sero.plugin.bridgeTools`.
 */

import { StringEnum } from '@earendil-works/pi-ai';
import type { ExtensionAPI, ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import { formatCost, formatCount, formatRelativeTime, formatTokens } from '../shared/format';
import type { PeriodKey, UsageState } from '../shared/types';
import { PERIOD_LABELS, REFRESH_INTERVAL_OPTIONS } from '../shared/types';
import { runRefresh, summarizeRefresh } from './refresh';
import { readState, resolveStatePath, updateState } from './state-io';

const ACTIONS = ['refresh', 'summary', 'sessions', 'config'] as const;
const PERIODS = ['today', 'thisWeek', 'lastWeek', 'allTime'] as const;

const Params = Type.Object({
  action: StringEnum(ACTIONS),
  period: Type.Optional(StringEnum(PERIODS)),
  force: Type.Optional(Type.Boolean({ description: 'refresh: rescan even if data is fresh' })),
  limit: Type.Optional(Type.Number({ description: 'sessions: max rows (default 20, max 50)' })),
  refreshIntervalMinutes: Type.Optional(
    Type.Number({ description: `config: one of ${REFRESH_INTERVAL_OPTIONS.join(', ')} (0 = manual)` }),
  ),
});

type CliResult = { output: string; exitCode: number };

type SeroToolCli = {
  summary: string;
  help: string;
  group: string;
  execute(args: readonly string[], context: { cwd?: string }, signal?: AbortSignal): Promise<CliResult>;
};

type SeroCliTool<T> = T & { cli: SeroToolCli };

const CLI_PERIOD_ALIASES: Record<string, PeriodKey> = {
  today: 'today',
  week: 'thisWeek',
  thisweek: 'thisWeek',
  'this-week': 'thisWeek',
  lastweek: 'lastWeek',
  'last-week': 'lastWeek',
  all: 'allTime',
  alltime: 'allTime',
  'all-time': 'allTime',
};

function text(message: string) {
  return { content: [{ type: 'text' as const, text: message }], details: {} };
}

async function actionRefresh(force: boolean): Promise<string> {
  const summary = await runRefresh(force);
  return summarizeRefresh(summary);
}

async function actionSummary(period: PeriodKey): Promise<string> {
  const state = await readState(resolveStatePath());
  const stats = state.periods[period];
  if (stats.totals.messages === 0) {
    return `No usage recorded for ${PERIOD_LABELS[period]}.${refreshedNote(state)}`;
  }
  const t = stats.totals;
  const lines = [
    `Usage (${PERIOD_LABELS[period]}): ${formatCost(t.cost)} · ${formatTokens(t.tokens.total)} tokens ` +
      `(${formatTokens(t.tokens.input + t.tokens.cacheWrite)} in / ${formatTokens(t.tokens.output)} out) · ` +
      `${formatCount(t.sessions)} sessions · ${formatCount(t.messages)} messages`,
  ];
  const topProviders = stats.providers.slice(0, 5);
  if (topProviders.length > 0) {
    lines.push(
      `Top providers: ${topProviders
        .map((p) => `${p.provider} ${formatCost(p.cost)} (${formatTokens(p.tokens.total)})`)
        .join(' · ')}`,
    );
  }
  return lines.join('\n') + refreshedNote(state);
}

async function actionSessions(period: PeriodKey, limit: number): Promise<string> {
  const state = await readState(resolveStatePath());
  const rows = state.periods[period].topSessions.slice(0, Math.max(1, Math.min(limit, 50)));
  if (rows.length === 0) {
    return `No sessions recorded for ${PERIOD_LABELS[period]}.${refreshedNote(state)}`;
  }
  const lines = rows.map(
    (s, i) =>
      `${i + 1}. ${formatCost(s.cost)} · ${formatTokens(s.tokens.total)} tokens · ` +
      `${formatCount(s.messages)} msgs · ${s.label}`,
  );
  return `Top sessions by cost (${PERIOD_LABELS[period]}):\n${lines.join('\n')}${refreshedNote(state)}`;
}

async function actionConfig(refreshIntervalMinutes?: number): Promise<string> {
  const statePath = resolveStatePath();
  const state = await readState(statePath);
  if (refreshIntervalMinutes === undefined) {
    return `Auto-refresh interval: ${describeInterval(state.settings.refreshIntervalMinutes)}.`;
  }
  if (!(REFRESH_INTERVAL_OPTIONS as readonly number[]).includes(refreshIntervalMinutes)) {
    return `Error: refreshIntervalMinutes must be one of ${REFRESH_INTERVAL_OPTIONS.join(', ')} (0 = manual).`;
  }
  await updateState(statePath, (current) => ({ ...current, settings: { refreshIntervalMinutes } }));
  return `Auto-refresh interval set to ${describeInterval(refreshIntervalMinutes)}.`;
}

function describeInterval(minutes: number): string {
  if (minutes <= 0) return 'manual only';
  return minutes < 60 ? `every ${minutes} minutes` : `every ${minutes / 60} hours`;
}

function refreshedNote(state: UsageState): string {
  if (state.lastRefreshedAt === null) return '\nNo scan has run yet — use the refresh action first.';
  return `\nLast refreshed ${formatRelativeTime(state.lastRefreshedAt)}.`;
}

async function dispatch(params: {
  action: (typeof ACTIONS)[number];
  period?: PeriodKey;
  force?: boolean;
  limit?: number;
  refreshIntervalMinutes?: number;
}): Promise<string> {
  try {
    switch (params.action) {
      case 'refresh':
        return await actionRefresh(params.force ?? true);
      case 'summary':
        return await actionSummary(params.period ?? 'today');
      case 'sessions':
        return await actionSessions(params.period ?? 'today', params.limit ?? 20);
      case 'config':
        return await actionConfig(params.refreshIntervalMinutes);
    }
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export function registerUsageTool(pi: ExtensionAPI): void {
  const usageTool: SeroCliTool<ToolDefinition<typeof Params>> = {
    name: 'usage',
    label: 'Usage',
    description:
      'AI usage and cost statistics for this profile. Actions: refresh (rescan session data), ' +
      'summary (totals + top providers for a period), sessions (top sessions by cost), ' +
      'config (get/set auto-refresh interval). Periods: today, thisWeek, lastWeek, allTime.',
    parameters: Params,

    async execute(_toolCallId, params) {
      return text(await dispatch(params));
    },

    cli: {
      summary: 'Show AI usage and cost statistics',
      help: 'sero usage <refresh|summary|sessions|config> [today|week|last-week|all] [limit|interval-minutes]',
      group: 'Apps',
      async execute(args) {
        const [subcommand, ...rest] = args;
        if (!subcommand) {
          return { output: 'Usage: sero usage <refresh|summary|sessions|config>', exitCode: 1 };
        }

        const resolvePeriod = (raw: string | undefined): PeriodKey | null => {
          if (!raw) return 'today';
          return CLI_PERIOD_ALIASES[raw.toLowerCase()] ?? null;
        };

        if (subcommand === 'refresh') {
          return { output: await dispatch({ action: 'refresh', force: true }), exitCode: 0 };
        }
        if (subcommand === 'summary' || subcommand === 'sessions') {
          const period = resolvePeriod(rest[0]);
          if (!period) {
            return { output: `Error: unknown period "${rest[0]}". Use today, week, last-week, or all.`, exitCode: 1 };
          }
          const limit = rest[1] !== undefined ? Number(rest[1]) : undefined;
          const output = await dispatch({ action: subcommand, period, limit });
          return { output, exitCode: output.startsWith('Error:') ? 1 : 0 };
        }
        if (subcommand === 'config') {
          const interval = rest[0] !== undefined ? Number(rest[0]) : undefined;
          if (rest[0] !== undefined && !Number.isFinite(interval)) {
            return { output: 'Error: interval must be a number of minutes (0 = manual).', exitCode: 1 };
          }
          const output = await dispatch({ action: 'config', refreshIntervalMinutes: interval });
          return { output, exitCode: output.startsWith('Error:') ? 1 : 0 };
        }
        return { output: `Unknown subcommand: ${subcommand}. Use refresh, summary, sessions, or config.`, exitCode: 1 };
      },
    },
  };

  pi.registerTool(usageTool);
}
