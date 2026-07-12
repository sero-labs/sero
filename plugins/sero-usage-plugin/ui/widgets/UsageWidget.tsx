/**
 * Dashboard widget — at-a-glance usage summary. Content scales with tile
 * width via container queries (WidgetContent provides the boundary):
 * base 1×1 shows today's cost; wider tiles add this week + a 14-day
 * sparkline; 3×2+ adds this week's top providers.
 */

import { useMemo } from 'react';
import { useAppState } from '@sero-ai/app-runtime';
import {
  EmptyState,
  Inline,
  ItemList,
  ItemListItem,
  Metric,
  Stack,
  Text,
  WidgetContent,
} from '@sero-ai/ui';
import { ChartColumn } from 'lucide-react';

import { formatCost, formatTokens } from '../../shared/format';
import type { UsageState } from '../../shared/types';
import { DEFAULT_STATE, normalizeUsageState } from '../../shared/types';
import { useAutoRefresh } from '../lib/useAutoRefresh';
// Every directly-exposed MF entry must import its own stylesheet so external
// remotes ship their own CSS assets.
import '../styles.css';

const SPARKLINE_DAYS = 14;

function Sparkline({ state }: { state: UsageState }) {
  const bars = useMemo(() => {
    const recent = state.daily.slice(-SPARKLINE_DAYS);
    const max = Math.max(1, ...recent.map((bucket) => bucket.tokens));
    return recent.map((bucket) => ({
      date: bucket.date,
      label: `${bucket.date} · ${formatTokens(bucket.tokens)} tokens`,
      heightPct: Math.max(6, Math.round((bucket.tokens / max) * 100)),
      empty: bucket.tokens === 0,
    }));
  }, [state.daily]);

  if (bars.length === 0) return null;
  return (
    <div className="flex h-10 items-end gap-[3px]" role="img" aria-label="Tokens per day, last 14 days">
      {bars.map((bar) => (
        <div
          key={bar.date}
          title={bar.label}
          className="min-w-1 flex-1 rounded-[2px]"
          style={{
            height: `${bar.heightPct}%`,
            backgroundColor: bar.empty ? 'var(--surface-flat, var(--secondary))' : 'var(--chart-2)',
          }}
        />
      ))}
    </div>
  );
}

export function UsageWidget() {
  const [rawState] = useAppState<UsageState>(DEFAULT_STATE);
  const state = useMemo(() => normalizeUsageState(rawState), [rawState]);
  useAutoRefresh(state);

  const today = state.periods.today.totals;
  const week = state.periods.thisWeek.totals;
  const topProviders = state.periods.thisWeek.providers.slice(0, 3);
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
        <Inline gap="lg" align="start">
          <Metric label="Cost today" value={formatCost(today.cost)} supporting={`${formatTokens(today.tokens.total)} tokens`} />
          <div className="hidden @[280px]:block">
            <Metric label="This week" value={formatCost(week.cost)} supporting={`${formatTokens(week.tokens.total)} tokens`} />
          </div>
        </Inline>

        <div className="hidden @[280px]:block">
          <Sparkline state={state} />
        </div>

        {topProviders.length > 0 && (
          <div className="hidden min-h-0 @[440px]:block">
            <Stack gap="none" scroll>
              <Text variant="label">Top providers this week</Text>
              <ItemList>
                {topProviders.map((provider) => (
                  <ItemListItem
                    key={provider.provider}
                    primary={provider.provider}
                    trailing={formatCost(provider.cost)}
                  />
                ))}
              </ItemList>
            </Stack>
          </div>
        )}
      </Stack>
    </WidgetContent>
  );
}

export default UsageWidget;
