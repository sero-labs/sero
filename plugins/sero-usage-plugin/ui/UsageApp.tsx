/**
 * Usage app — profile-wide AI usage and cost analytics.
 * Spec: docs/specs/sero-usage-plugin-spec.md §4.1
 */

import { useMemo, useState } from 'react';
import { useAppState } from '@sero-ai/app-runtime';
import {
  Alert,
  AlertDescription,
  DataBoundary,
  EmptyState,
  IconButton,
  Inline,
  ListSkeleton,
  MetricSkeleton,
  Section,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Stack,
  Tabs,
  TabsList,
  TabsTrigger,
  Text,
} from '@sero-ai/ui';
import { ChartColumn, RotateCw } from 'lucide-react';

import { formatIntervalMinutes, formatRelativeTime } from '../shared/format';
import type { PeriodKey, UsageState } from '../shared/types';
import {
  DEFAULT_STATE,
  PERIOD_KEYS,
  PERIOD_LABELS,
  REFRESH_INTERVAL_OPTIONS,
  normalizeUsageState,
} from '../shared/types';
import { ActivityHeatmap } from './components/ActivityHeatmap';
import { ProviderTable } from './components/ProviderTable';
import { SessionsTable } from './components/SessionsTable';
import { StatTiles } from './components/StatTiles';
import { TrendChart } from './components/TrendChart';
import { TREND_METRICS, TREND_METRIC_LABELS, type TrendMetric } from './lib/trend';
import { useAutoRefresh } from './lib/useAutoRefresh';
import './styles.css';

export function UsageApp() {
  const [rawState, updateState] = useAppState<UsageState>(DEFAULT_STATE);
  const state = useMemo(() => normalizeUsageState(rawState), [rawState]);
  const { refresh, refreshing, error } = useAutoRefresh(state);

  const [period, setPeriod] = useState<PeriodKey>('today');
  const [metric, setMetric] = useState<TrendMetric>('tokens');

  const stats = state.periods[period];
  const hasAnyData = state.periods.allTime.totals.messages > 0;
  const dataState = state.lastRefreshedAt === null ? 'loading' : hasAnyData ? 'ready' : 'empty';

  const updateRefreshInterval = (minutes: number) => {
    updateState((prev) => ({
      ...normalizeUsageState(prev),
      settings: { refreshIntervalMinutes: minutes },
    }));
  };

  return (
    <div className="size-full overflow-y-auto bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-5">
        <Inline justify="between" align="center" wrap>
          <Tabs value={period} onValueChange={(value) => setPeriod(value as PeriodKey)}>
            <TabsList>
              {PERIOD_KEYS.map((key) => (
                <TabsTrigger key={key} value={key}>
                  {PERIOD_LABELS[key]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Inline gap="sm" align="center">
            {state.lastRefreshedAt !== null && (
              <Text variant="muted" className="text-sm">
                updated {formatRelativeTime(state.lastRefreshedAt)}
              </Text>
            )}
            <Select
              value={String(state.settings.refreshIntervalMinutes)}
              onValueChange={(value) => updateRefreshInterval(Number(value))}
            >
              <SelectTrigger size="sm" className="w-24" aria-label="Auto-refresh interval">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REFRESH_INTERVAL_OPTIONS.map((minutes) => (
                  <SelectItem key={minutes} value={String(minutes)}>
                    {formatIntervalMinutes(minutes)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <IconButton
              icon={RotateCw}
              label="Refresh usage data"
              onClick={refresh}
              disabled={refreshing}
              className={refreshing ? 'animate-spin' : undefined}
            />
          </Inline>
        </Inline>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DataBoundary
          state={dataState}
          loading={
            <Stack gap="lg">
              <MetricSkeleton count={6} />
              <ListSkeleton count={6} />
            </Stack>
          }
          empty={
            <EmptyState
              icon={ChartColumn}
              title="No usage recorded yet"
              message="Usage appears here after your first agent session."
            />
          }
        >
          <Stack gap="lg">
            <StatTiles totals={stats.totals} />

            <Section
              heading="Daily Activity"
              action={
                <Select value={metric} onValueChange={(value) => setMetric(value as TrendMetric)}>
                  <SelectTrigger size="sm" className="w-28" aria-label="Metric">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TREND_METRICS.map((key) => (
                      <SelectItem key={key} value={key}>
                        {TREND_METRIC_LABELS[key]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              }
            >
              <ActivityHeatmap daily={state.daily} metric={metric} />
            </Section>

            <Section heading={period === 'today' ? 'Trend by hour' : 'Trend by day'}>
              {stats.totals.messages === 0 ? (
                <EmptyState icon={ChartColumn} title={`No usage for ${PERIOD_LABELS[period]}`} />
              ) : (
                <TrendChart period={period} daily={state.daily} hourly={state.hourly} metric={metric} />
              )}
            </Section>

            <Section heading="By Provider · Model">
              {stats.providers.length === 0 ? (
                <EmptyState icon={ChartColumn} title={`No usage for ${PERIOD_LABELS[period]}`} />
              ) : (
                <ProviderTable providers={stats.providers} />
              )}
            </Section>

            {stats.topSessions.length > 0 && (
              <Section heading="Sessions">
                <SessionsTable sessions={stats.topSessions} />
              </Section>
            )}

            <Text variant="muted" className="text-sm">
              Tokens = Input + Output + CacheWrite · ↑ In = Input + CacheWrite · costs are approximate,
              based on local session data.
            </Text>
          </Stack>
        </DataBoundary>
      </div>
    </div>
  );
}

// Both named and default exports are required for Module Federation lazy loading.
export default UsageApp;
