/**
 * SVG line chart for body weight trends.
 * Shows weight over time with goal line and trend.
 */

import { useMemo } from 'react';
import type { BodyMetric, LongTermGoal } from '../../shared/types';

interface WeightChartProps {
  metrics: BodyMetric[];
  activeGoal?: LongTermGoal;
  height?: number;
}

export function WeightChart({ metrics, activeGoal, height = 180 }: WeightChartProps) {
  const data = useMemo(() => {
    return [...metrics]
      .filter((m) => m.weight !== undefined)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((m) => ({ date: m.date, weight: m.weight! }));
  }, [metrics]);

  if (data.length < 2) return null;

  const width = 400;
  const padding = { top: 20, right: 20, bottom: 30, left: 45 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const weights = data.map((d) => d.weight);
  const allWeights = [...weights];
  if (activeGoal) allWeights.push(activeGoal.targetValue);

  const minW = Math.floor(Math.min(...allWeights) - 1);
  const maxW = Math.ceil(Math.max(...allWeights) + 1);
  const rangeW = maxW - minW || 1;

  const xScale = (i: number) => padding.left + (i / (data.length - 1)) * chartW;
  const yScale = (w: number) => padding.top + (1 - (w - minW) / rangeW) * chartH;

  // Build path
  const pathD = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(1)} ${yScale(d.weight).toFixed(1)}`)
    .join(' ');

  // Area fill path
  const areaD = pathD
    + ` L ${xScale(data.length - 1).toFixed(1)} ${(padding.top + chartH).toFixed(1)}`
    + ` L ${padding.left.toFixed(1)} ${(padding.top + chartH).toFixed(1)} Z`;

  // Y-axis ticks (4-5 values)
  const tickCount = 4;
  const tickStep = rangeW / tickCount;
  const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => minW + i * tickStep);

  // X-axis labels
  const xLabels = [
    { i: 0, label: formatShortDate(data[0].date) },
    { i: Math.floor(data.length / 2), label: formatShortDate(data[Math.floor(data.length / 2)].date) },
    { i: data.length - 1, label: formatShortDate(data[data.length - 1].date) },
  ];

  const goalY = activeGoal ? yScale(activeGoal.targetValue) : null;
  const latestWeight = data[data.length - 1].weight;
  const firstWeight = data[0].weight;
  const totalChange = latestWeight - firstWeight;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Weight Trend</h3>
        <span className="text-xs text-muted-foreground">
          {latestWeight} kg
          <span
            className="ml-1"
            style={{ color: totalChange <= 0 ? 'var(--health-success)' : 'var(--health-warning)' }}
          >
            ({totalChange >= 0 ? '+' : ''}{totalChange.toFixed(1)})
          </span>
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--health-protein)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--health-protein)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={padding.left} y1={yScale(tick)}
              x2={padding.left + chartW} y2={yScale(tick)}
              stroke="currentColor" strokeOpacity="0.1" strokeWidth="0.5"
            />
            <text
              x={padding.left - 8} y={yScale(tick) + 4}
              textAnchor="end" fill="currentColor" fillOpacity="0.4" fontSize="10"
            >
              {tick.toFixed(0)}
            </text>
          </g>
        ))}

        {/* Goal line */}
        {goalY !== null && goalY >= padding.top && goalY <= padding.top + chartH && (
          <>
            <line
              x1={padding.left} y1={goalY}
              x2={padding.left + chartW} y2={goalY}
              stroke="var(--health-success)" strokeWidth="1" strokeDasharray="4,4" strokeOpacity="0.7"
            />
            <text
              x={padding.left + chartW + 2} y={goalY + 4}
              fill="var(--health-success)" fontSize="9" fillOpacity="0.8"
            >
              Goal
            </text>
          </>
        )}

        {/* Area fill */}
        <path d={areaD} fill="url(#weightGrad)" />

        {/* Line */}
        <path d={pathD} fill="none" stroke="var(--health-protein)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {/* Data points */}
        {data.map((d, i) => (
          <circle
            key={i}
            cx={xScale(i)} cy={yScale(d.weight)}
            r={i === data.length - 1 ? 4 : 2}
            fill="var(--health-protein)"
            opacity={i === data.length - 1 ? 1 : 0.6}
          />
        ))}

        {/* X-axis labels */}
        {xLabels.map(({ i, label }) => (
          <text
            key={i}
            x={xScale(i)} y={height - 5}
            textAnchor="middle" fill="currentColor" fillOpacity="0.4" fontSize="10"
          >
            {label}
          </text>
        ))}
      </svg>
    </div>
  );
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
