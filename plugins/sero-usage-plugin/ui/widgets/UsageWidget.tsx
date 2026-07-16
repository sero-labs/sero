/**
 * Dashboard widget — at-a-glance usage summary. Content scales with tile
 * width via container queries (WidgetContent provides the boundary):
 * base shows today's cost; wider tiles add this week (with a week-over-week
 * delta) and a token trend chart that grows to fill the tile; widest tiles
 * add this week's top providers with cost-share bars.
 */

import { useMemo } from 'react';
import { useAppState } from '@sero-ai/app-runtime';
import {
  EmptyState,
  Inline,
  type MetricTrend,
  Metric,
  Stack,
  Text,
  WidgetContent,
} from '@sero-ai/ui';
import { ChartColumn } from 'lucide-react';

import { formatCost, formatTokens } from '../../shared/format';
import type { DailyBucket, ProviderStats, UsageState } from '../../shared/types';
import { DEFAULT_STATE, normalizeUsageState } from '../../shared/types';
import { useAutoRefresh } from '../lib/useAutoRefresh';
// Every directly-exposed MF entry must import its own stylesheet so external
// remotes ship their own CSS assets.
import '../styles.css';

const SPARKLINE_DAYS = 14;
const TOP_PROVIDERS = 3;
// Distinct series colours so provider bars read apart at a glance.
const PROVIDER_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)'];

/** Week-over-week change, shown as a signed % delta next to the week metric. */
function weekTrend(current: number, previous: number): MetricTrend | undefined {
  if (previous <= 0) return undefined;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { direction: 'flat', value: '0%' };
  return { direction: pct > 0 ? 'up' : 'down', value: `${pct > 0 ? '+' : ''}${pct}%` };
}

function Sparkline({ daily }: { daily: DailyBucket[] }) {
  const bars = useMemo(() => {
    const recent = daily.slice(-SPARKLINE_DAYS);
    const max = Math.max(1, ...recent.map((bucket) => bucket.tokens));
    return recent.map((bucket) => ({
      date: bucket.date,
      label: `${bucket.date} · ${formatTokens(bucket.tokens)} tokens`,
      heightPct: Math.max(6, Math.round((bucket.tokens / max) * 100)),
      empty: bucket.tokens === 0,
    }));
  }, [daily]);

  if (bars.length === 0) return null;
  return (
    <div
      className="flex min-h-10 flex-1 items-end gap-[3px]"
      role="img"
      aria-label={`Tokens per day, last ${SPARKLINE_DAYS} days`}
    >
      {bars.map((bar) => (
        <div
          key={bar.date}
          title={bar.label}
          className="min-w-1 flex-1 rounded-[2px] transition-colors"
          style={{
            height: `${bar.heightPct}%`,
            backgroundColor: bar.empty ? 'var(--surface-flat, var(--secondary))' : 'var(--chart-2)',
          }}
        />
      ))}
    </div>
  );
}

/** Top providers this week as labelled cost-share bars. */
function ProviderShare({ providers }: { providers: ProviderStats[] }) {
  // Share is by cost, falling back to tokens so local/free models still rank.
  const byCost = providers.some((provider) => provider.cost > 0);
  const total = Math.max(
    1,
    ...providers.map((provider) => (byCost ? provider.cost : provider.tokens.total)),
  );
  return (
    <Stack gap="xs">
      <Text variant="label">Top providers this week</Text>
      {providers.map((provider, index) => {
        const value = byCost ? provider.cost : provider.tokens.total;
        return (
          <div key={provider.provider} className="flex flex-col gap-1">
            <Inline justify="between" align="center" gap="sm">
              <Text variant="body" className="min-w-0 truncate">
                {provider.provider}
              </Text>
              <Text variant="numeric" className="shrink-0 text-muted-foreground">
                {byCost ? formatCost(provider.cost) : `${formatTokens(provider.tokens.total)} tok`}
              </Text>
            </Inline>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-flat,var(--secondary))]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(3, Math.round((value / total) * 100))}%`,
                  backgroundColor: PROVIDER_COLORS[index % PROVIDER_COLORS.length],
                }}
              />
            </div>
          </div>
        );
      })}
    </Stack>
  );
}

export function UsageWidget() {
  const [rawState] = useAppState<UsageState>(DEFAULT_STATE);
  const state = useMemo(() => normalizeUsageState(rawState), [rawState]);
  useAutoRefresh(state, false);

  const today = state.periods.today.totals;
  const week = state.periods.thisWeek.totals;
  const lastWeek = state.periods.lastWeek.totals;
  const topProviders = state.periods.thisWeek.providers.slice(0, TOP_PROVIDERS);
  const hasAnyData = state.periods.allTime.totals.messages > 0;

  if (!hasAnyData) {
    return (
      <WidgetContent>
        <EmptyState icon={ChartColumn} title="No usage yet" />
      </WidgetContent>
    );
  }

  return (
    <WidgetContent>
      <Stack gap="sm" fill>
        <Inline gap="lg" align="start" justify="between">
          <Metric
            label="Cost today"
            value={formatCost(today.cost)}
            supporting={`${formatTokens(today.tokens.total)} tokens`}
          />
          <div className="hidden @[240px]:block">
            <Metric
              label="This week"
              value={formatCost(week.cost)}
              supporting={`${formatTokens(week.tokens.total)} tokens`}
              trend={weekTrend(week.cost, lastWeek.cost)}
            />
          </div>
        </Inline>

        <div className="hidden min-h-10 flex-1 flex-col justify-end gap-1 @[240px]:flex">
          <Sparkline daily={state.daily} />
          <Text variant="muted" className="text-sm uppercase tracking-wide">
            Tokens · last {SPARKLINE_DAYS} days
          </Text>
        </div>

        {topProviders.length > 0 && (
          <div className="hidden @[380px]:block">
            <ProviderShare providers={topProviders} />
          </div>
        )}
      </Stack>
    </WidgetContent>
  );
}

export default UsageWidget;
