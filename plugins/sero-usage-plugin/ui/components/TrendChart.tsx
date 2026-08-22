/**
 * Stacked bar chart of the selected metric split by provider.
 * Today shows per-hour bars; week and all-time views show per-day bars.
 */

import { memo, useMemo } from 'react';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@sero-ai/ui';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import { dateKey, periodBoundaries } from '../../shared/period';
import type { DailyBucket, HourlyBucket, PeriodKey } from '../../shared/types';
import { formatMetricValue, metricOfSlice, rankProviders, type TrendMetric } from '../lib/trend';

const TOP_PROVIDERS = 5;
const OTHER_KEY = 'other';
const DAY_MS = 24 * 60 * 60 * 1000;

interface TrendChartProps {
  period: PeriodKey;
  daily: DailyBucket[];
  hourly: HourlyBucket[];
  metric: TrendMetric;
}

type ChartRow = Record<string, number | string>;

/** Provider names become chart config keys / CSS variable suffixes. */
function providerKey(provider: string): string {
  return provider.replace(/[^a-zA-Z0-9]/g, '-');
}

function visibleDaily(period: Exclude<PeriodKey, 'today'>, daily: DailyBucket[]): DailyBucket[] {
  if (period === 'allTime') return daily;
  const bounds = periodBoundaries(new Date());
  const fromMs = period === 'thisWeek' ? bounds.weekStartMs : bounds.lastWeekStartMs;
  const toMs = period === 'thisWeek' ? Date.now() : bounds.weekStartMs - 1;
  const buckets = new Map(daily.map((bucket) => [bucket.date, bucket]));
  const result: DailyBucket[] = [];
  for (let ms = fromMs; ms <= toMs; ms += DAY_MS) {
    const key = dateKey(ms);
    result.push(buckets.get(key) ?? { date: key, cost: 0, tokens: 0, input: 0, output: 0, messages: 0, byProvider: {} });
  }
  return result;
}

function shortDateLabel(date: string): string {
  const [, month, day] = date.split('-');
  return `${Number(day)}/${Number(month)}`;
}

function buildRows(
  period: PeriodKey,
  daily: DailyBucket[],
  hourly: HourlyBucket[],
  metric: TrendMetric,
): { rows: ChartRow[]; providers: string[] } {
  const buckets: Array<{ label: string; byProvider: DailyBucket['byProvider'] }> =
    period === 'today'
      ? Array.from({ length: 24 }, (_, hour) => {
          const bucket = hourly.find((b) => b.hour === hour);
          return { label: `${hour}h`, byProvider: bucket?.byProvider ?? {} };
        })
      : visibleDaily(period, daily).map((bucket) => ({
          label: shortDateLabel(bucket.date),
          byProvider: bucket.byProvider,
        }));

  const ranked = rankProviders(
    period === 'today' ? hourly : visibleDaily(period, daily),
    metric,
  );
  const top = ranked.slice(0, TOP_PROVIDERS);
  const topProviders = new Set(top);
  const hasOther = ranked.length > TOP_PROVIDERS;

  const rows = buckets.map((bucket) => {
    const row: ChartRow = { label: bucket.label };
    for (const provider of top) row[providerKey(provider)] = 0;
    if (hasOther) row[OTHER_KEY] = 0;
    for (const [provider, slice] of Object.entries(bucket.byProvider)) {
      const key = topProviders.has(provider) ? providerKey(provider) : OTHER_KEY;
      row[key] = ((row[key] as number) ?? 0) + metricOfSlice(slice, metric);
    }
    return row;
  });

  return { rows, providers: hasOther ? [...top, OTHER_KEY] : top };
}

export const TrendChart = memo(function TrendChart({ period, daily, hourly, metric }: TrendChartProps) {
  const { rows, providers } = useMemo(
    () => buildRows(period, daily, hourly, metric),
    [period, daily, hourly, metric],
  );

  const config = useMemo(() => {
    const entries: ChartConfig = {};
    providers.forEach((provider, index) => {
      const key = provider === OTHER_KEY ? OTHER_KEY : providerKey(provider);
      entries[key] = {
        label: provider === OTHER_KEY ? 'other' : provider,
        color: provider === OTHER_KEY ? 'var(--muted-foreground)' : `var(--chart-${(index % 5) + 1})`,
      };
    });
    return entries;
  }, [providers]);

  return (
    <ChartContainer config={config} className="aspect-auto h-56 w-full">
      <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={6} minTickGap={16} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={44}
          tickFormatter={(value: number) => formatMetricValue(value, metric)}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        {providers.map((provider) => {
          const key = provider === OTHER_KEY ? OTHER_KEY : providerKey(provider);
          return <Bar key={key} dataKey={key} stackId="usage" fill={`var(--color-${key})`} radius={[2, 2, 0, 0]} />;
        })}
      </BarChart>
    </ChartContainer>
  );
});
