/**
 * WeightChart — SVG line chart with gradient fill showing weight trend.
 */

import { useMemo } from 'react';
import type { WeightEntry, WeightUnit, WeightGoal } from '../shared/types';
import { sortedEntries, formatWeight, formatDate } from './utils';

interface WeightChartProps {
  entries: WeightEntry[];
  unit: WeightUnit;
  goal: WeightGoal | null;
}

const CHART_HEIGHT = 200;
const CHART_WIDTH = 640;
const PADDING = { top: 24, right: 16, bottom: 32, left: 48 };

export function WeightChart({ entries, unit, goal }: WeightChartProps) {
  const sorted = useMemo(() => sortedEntries(entries), [entries]);

  const chartData = useMemo(() => {
    if (sorted.length < 2) return null;

    const weights = sorted.map((e) => e.weight);
    const minW = Math.min(...weights) - 1;
    const maxW = Math.max(...weights) + 1;
    const rangeW = maxW - minW || 1;

    const innerW = CHART_WIDTH - PADDING.left - PADDING.right;
    const innerH = CHART_HEIGHT - PADDING.top - PADDING.bottom;

    const points = sorted.map((entry, i) => ({
      x: PADDING.left + (i / (sorted.length - 1)) * innerW,
      y: PADDING.top + (1 - (entry.weight - minW) / rangeW) * innerH,
      entry,
    }));

    // Smooth SVG path (cardinal spline approximation)
    const linePath = points
      .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
      .join(' ');

    // Area fill path
    const areaPath =
      linePath +
      ` L ${points[points.length - 1].x} ${PADDING.top + innerH}` +
      ` L ${points[0].x} ${PADDING.top + innerH} Z`;

    // Goal line Y position
    let goalY: number | null = null;
    if (goal && goal.target >= minW && goal.target <= maxW) {
      goalY = PADDING.top + (1 - (goal.target - minW) / rangeW) * innerH;
    }

    // Y-axis ticks (4–5 ticks)
    const tickCount = 4;
    const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => {
      const weight = minW + (rangeW * i) / tickCount;
      const y = PADDING.top + (1 - i / tickCount) * innerH;
      return { weight, y };
    });

    // X-axis labels (first, middle, last)
    const xLabels = [
      { x: points[0].x, label: formatDate(sorted[0].date) },
      ...(sorted.length > 2
        ? [{
            x: points[Math.floor(points.length / 2)].x,
            label: formatDate(sorted[Math.floor(sorted.length / 2)].date),
          }]
        : []),
      { x: points[points.length - 1].x, label: formatDate(sorted[sorted.length - 1].date) },
    ];

    return { points, linePath, areaPath, goalY, yTicks, xLabels, minW, maxW };
  }, [sorted, goal]);

  if (!chartData || sorted.length < 2) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm" style={{ color: 'var(--wt-muted)' }}>
          Log at least 2 entries to see your trend chart
        </p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden px-2">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="w-full"
        style={{ maxHeight: '220px' }}
      >
        <defs>
          {/* Gradient fill under the line */}
          <linearGradient id="wt-area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--wt-accent)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--wt-accent)" stopOpacity="0.02" />
          </linearGradient>
          {/* Glow effect for the line */}
          <filter id="wt-glow">
            <feGaussianBlur stdDeviation="2" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Grid lines */}
        {chartData.yTicks.map((tick, i) => (
          <g key={i}>
            <line
              x1={PADDING.left}
              y1={tick.y}
              x2={CHART_WIDTH - PADDING.right}
              y2={tick.y}
              stroke="var(--wt-grid)"
              strokeWidth="0.5"
              strokeDasharray="4 4"
            />
            <text
              x={PADDING.left - 8}
              y={tick.y + 3}
              textAnchor="end"
              fontSize="9"
              fill="var(--wt-muted)"
              fontFamily="'DM Sans', sans-serif"
            >
              {formatWeight(tick.weight, unit)}
            </text>
          </g>
        ))}

        {/* X-axis labels */}
        {chartData.xLabels.map((label, i) => (
          <text
            key={i}
            x={label.x}
            y={CHART_HEIGHT - 6}
            textAnchor="middle"
            fontSize="9"
            fill="var(--wt-muted)"
            fontFamily="'DM Sans', sans-serif"
          >
            {label.label}
          </text>
        ))}

        {/* Goal line */}
        {chartData.goalY !== null && (
          <g>
            <line
              x1={PADDING.left}
              y1={chartData.goalY}
              x2={CHART_WIDTH - PADDING.right}
              y2={chartData.goalY}
              stroke="var(--wt-goal)"
              strokeWidth="1"
              strokeDasharray="6 3"
              opacity="0.7"
            />
            <text
              x={CHART_WIDTH - PADDING.right + 4}
              y={chartData.goalY + 3}
              fontSize="8"
              fill="var(--wt-goal)"
              fontFamily="'DM Sans', sans-serif"
            >
              Goal
            </text>
          </g>
        )}

        {/* Area fill */}
        <path d={chartData.areaPath} fill="url(#wt-area-grad)" />

        {/* Line */}
        <path
          d={chartData.linePath}
          fill="none"
          stroke="var(--wt-accent)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#wt-glow)"
        />

        {/* Data points */}
        {chartData.points.map((p, i) => (
          <g key={p.entry.id}>
            {/* Outer glow */}
            <circle
              cx={p.x}
              cy={p.y}
              r="6"
              fill="var(--wt-accent)"
              opacity={i === chartData.points.length - 1 ? 0.2 : 0}
            />
            {/* Point */}
            <circle
              cx={p.x}
              cy={p.y}
              r={i === chartData.points.length - 1 ? 4 : 2.5}
              fill={i === chartData.points.length - 1 ? 'var(--wt-accent)' : 'var(--wt-bg-surface)'}
              stroke="var(--wt-accent)"
              strokeWidth={i === chartData.points.length - 1 ? 0 : 1.5}
            />
          </g>
        ))}
      </svg>
    </div>
  );
}
