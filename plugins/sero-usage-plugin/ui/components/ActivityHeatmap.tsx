/**
 * GitHub-style calendar heatmap of the trailing year, one cell per local
 * day, weeks as columns (Mon-Sun rows), today in the rightmost column.
 */

import { memo, useMemo, type CSSProperties } from 'react';
import { Inline, Text } from '@sero-ai/ui';

import { dateKey } from '../../shared/period';
import type { DailyBucket } from '../../shared/types';
import { formatMetricValue, metricOfBucket, type TrendMetric } from '../lib/trend';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKS = 53;
const LEVEL_MIX = [0, 30, 55, 78, 100] as const;

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface DayCell {
  key: string;
  label: string;
  value: number;
  level: number;
  inRange: boolean;
}

interface HeatmapModel {
  weeks: DayCell[][];
  monthLabels: Array<string | null>;
  max: number;
}

function buildModel(daily: DailyBucket[], metric: TrendMetric): HeatmapModel {
  const values = new Map<string, number>();
  let max = 0;
  for (const bucket of daily) {
    const value = metricOfBucket(bucket, metric);
    values.set(bucket.date, value);
    if (value > max) max = value;
  }

  const today = new Date();
  today.setHours(12, 0, 0, 0); // noon avoids DST edge cases when stepping by days
  const todayKey = dateKey(today.getTime());
  // Align the grid start to the Monday WEEKS-1 weeks before this week's Monday.
  const daysSinceMonday = (today.getDay() + 6) % 7;
  const gridStartMs = today.getTime() - daysSinceMonday * DAY_MS - (WEEKS - 1) * 7 * DAY_MS;

  const weeks: DayCell[][] = [];
  const monthLabels: Array<string | null> = [];
  let lastMonth = -1;

  for (let week = 0; week < WEEKS; week++) {
    const column: DayCell[] = [];
    const weekStart = new Date(gridStartMs + week * 7 * DAY_MS);
    const month = weekStart.getMonth();
    // Label a column when the month changes at its start (skip a cramped first label).
    monthLabels.push(month !== lastMonth && (week > 0 || weekStart.getDate() <= 7) ? MONTH_LABELS[month] : null);
    lastMonth = month;

    for (let day = 0; day < 7; day++) {
      const cellDate = new Date(gridStartMs + (week * 7 + day) * DAY_MS);
      const key = dateKey(cellDate.getTime());
      const inRange = key <= todayKey;
      const value = values.get(key) ?? 0;
      const level = value <= 0 || max <= 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((value / max) * 4)));
      column.push({
        key,
        label: `${key} · ${formatMetricValue(value, metric)}`,
        value,
        level,
        inRange,
      });
    }
    weeks.push(column);
  }

  return { weeks, monthLabels, max };
}

function cellStyle(level: number): CSSProperties | undefined {
  if (level === 0) return undefined;
  return { backgroundColor: `color-mix(in oklab, var(--chart-2) ${LEVEL_MIX[level]}%, transparent)` };
}

export const ActivityHeatmap = memo(function ActivityHeatmap({ daily, metric }: { daily: DailyBucket[]; metric: TrendMetric }) {
  const model = useMemo(() => buildModel(daily, metric), [daily, metric]);

  return (
    <div className="flex flex-col gap-2 overflow-x-auto">
      <div className="flex w-max gap-[3px] pl-8">
        {model.monthLabels.map((label, i) => (
          <div key={i} className="w-[10px] text-xs leading-3 text-muted-foreground">
            {label && <span className="absolute">{label}</span>}
          </div>
        ))}
      </div>
      <div className="flex w-max gap-1.5">
        <div className="grid w-6 grid-rows-7 gap-[3px] text-xs leading-[10px] text-muted-foreground">
          {['Mon', '', 'Wed', '', 'Fri', '', ''].map((label, i) => (
            <span key={i} className="h-[10px]">
              {label}
            </span>
          ))}
        </div>
        <div className="flex gap-[3px]">
          {model.weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="grid grid-rows-7 gap-[3px]">
              {week.map((cell) =>
                cell.inRange ? (
                  <div
                    key={cell.key}
                    title={cell.label}
                    className="size-[10px] rounded-[2px] bg-secondary/60"
                    style={cellStyle(cell.level)}
                  />
                ) : (
                  <div key={cell.key} className="size-[10px]" />
                ),
              )}
            </div>
          ))}
        </div>
      </div>
      <Inline gap="sm" align="center" className="pl-8">
        <Inline gap="xs" align="center">
          <Text variant="muted" className="text-sm">
            less
          </Text>
          {LEVEL_MIX.map((_, level) => (
            <div key={level} className="size-[10px] rounded-[2px] bg-secondary/60" style={cellStyle(level)} />
          ))}
          <Text variant="muted" className="text-sm">
            more
          </Text>
        </Inline>
        <Text variant="muted" className="text-sm">
          max {formatMetricValue(model.max, metric)}/day · today is the rightmost column
        </Text>
      </Inline>
    </div>
  );
});
