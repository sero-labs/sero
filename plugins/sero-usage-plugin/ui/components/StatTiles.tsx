import { Metric, MetricGroup } from '@sero-ai/ui';

import { formatCost, formatCount, formatTokens } from '../../shared/format';
import type { PeriodStats } from '../../shared/types';

export function StatTiles({ totals }: { totals: PeriodStats['totals'] }) {
  const tokens = totals.tokens;
  return (
    <MetricGroup minColumnWidth={110}>
      <Metric label="Total cost" value={formatCost(totals.cost)} />
      <Metric label="Tokens" value={formatTokens(tokens.total)} />
      <Metric label="Input" value={formatTokens(tokens.input + tokens.cacheWrite)} />
      <Metric label="Output" value={formatTokens(tokens.output)} />
      <Metric label="Sessions" value={formatCount(totals.sessions)} />
      <Metric label="Messages" value={formatCount(totals.messages)} />
    </MetricGroup>
  );
}
