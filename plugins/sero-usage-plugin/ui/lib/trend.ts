/**
 * Trend metric selection and bucket → chart-row mapping shared by the
 * heatmap, trend chart, and widget sparkline.
 */

import { formatCost, formatCount, formatTokens } from '../../shared/format';
import type { DailyBucket, HourlyBucket, ProviderSlice } from '../../shared/types';

export const TREND_METRICS = ['tokens', 'cost', 'messages'] as const;
export type TrendMetric = (typeof TREND_METRICS)[number];

export const TREND_METRIC_LABELS: Record<TrendMetric, string> = {
  tokens: 'Tokens',
  cost: 'Cost',
  messages: 'Messages',
};

export function metricOfBucket(bucket: { cost: number; tokens: number; messages: number }, metric: TrendMetric): number {
  return bucket[metric];
}

export function metricOfSlice(slice: ProviderSlice, metric: TrendMetric): number {
  return slice[metric];
}

export function formatMetricValue(value: number, metric: TrendMetric): string {
  if (metric === 'cost') return formatCost(value);
  if (metric === 'messages') return formatCount(value);
  return formatTokens(value);
}

/**
 * Providers ranked by the chosen metric across the given buckets.
 * Everything past the top N is grouped as "other" by the chart.
 */
export function rankProviders(buckets: Array<DailyBucket | HourlyBucket>, metric: TrendMetric): string[] {
  const totals = new Map<string, number>();
  for (const bucket of buckets) {
    for (const [provider, slice] of Object.entries(bucket.byProvider)) {
      totals.set(provider, (totals.get(provider) ?? 0) + metricOfSlice(slice, metric));
    }
  }
  return Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([provider]) => provider);
}
