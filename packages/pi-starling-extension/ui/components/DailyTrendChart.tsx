/**
 * SVG line chart — daily spending trend (30 days).
 */

import { useMemo } from 'react';
import type { StarlingFeedItem } from '../../shared/types';
import { formatMoney, formatDate } from '../lib/helpers';

export function DailyTrendChart({ transactions }: { transactions: StarlingFeedItem[] }) {
  const dailyData = useMemo(() => {
    const totals = new Map<string, { out: number; in_: number }>();
    for (const tx of transactions) {
      if (tx.status === 'DECLINED' || tx.status === 'REVERSED') continue;
      const dateKey = new Date(tx.transactionTime).toISOString().split('T')[0];
      const day = totals.get(dateKey) || { out: 0, in_: 0 };
      if (tx.direction === 'OUT') day.out += tx.amount.minorUnits;
      else day.in_ += tx.amount.minorUnits;
      totals.set(dateKey, day);
    }
    return Array.from(totals.entries())
      .map(([date, t]) => ({ date, ...t }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [transactions]);

  if (dailyData.length < 2) return null;

  const W = 580, H = 160;
  const PAD = { top: 20, right: 12, bottom: 28, left: 52 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const maxOut = Math.max(...dailyData.map((d) => d.out), 1);

  const points = dailyData.map((d, i) => ({
    x: PAD.left + (i / Math.max(dailyData.length - 1, 1)) * innerW,
    y: PAD.top + (1 - d.out / maxOut) * innerH,
    ...d,
  }));

  const linePath = points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${PAD.top + innerH} L ${points[0].x} ${PAD.top + innerH} Z`;

  const yTicks = Array.from({ length: 4 }, (_, i) => ({
    val: (maxOut * (i + 1)) / 4,
    y: PAD.top + (1 - (i + 1) / 4) * innerH,
  }));

  const xLabels = [
    { x: points[0].x, label: formatDate(dailyData[0].date) },
    ...(dailyData.length > 4 ? [{
      x: points[Math.floor(points.length / 2)].x,
      label: formatDate(dailyData[Math.floor(dailyData.length / 2)].date),
    }] : []),
    { x: points[points.length - 1].x, label: formatDate(dailyData[dailyData.length - 1].date) },
  ];

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 180 }}>
        <defs>
          <linearGradient id="sb-trend-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--sb-accent)" stopOpacity="0.15" />
            <stop offset="100%" stopColor="var(--sb-accent)" stopOpacity="0.02" />
          </linearGradient>
          <filter id="sb-glow">
            <feGaussianBlur stdDeviation="2" result="glow" />
            <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={t.y} x2={W - PAD.right} y2={t.y}
              stroke="var(--sb-border)" strokeWidth="0.5" strokeDasharray="4 4" />
            <text x={PAD.left - 8} y={t.y + 3} textAnchor="end" fontSize="9"
              fill="var(--sb-dim)" fontFamily="'DM Mono', monospace">
              {formatMoney(t.val, 'GBP')}
            </text>
          </g>
        ))}

        {xLabels.map((l, i) => (
          <text key={i} x={l.x} y={H - 4} textAnchor="middle" fontSize="9"
            fill="var(--sb-dim)" fontFamily="'DM Sans', sans-serif">{l.label}</text>
        ))}

        <path d={areaPath} fill="url(#sb-trend-grad)" />
        <path d={linePath} fill="none" stroke="var(--sb-accent)" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" filter="url(#sb-glow)" />

        {points.map((p, i) => (
          <g key={i}>
            {i === points.length - 1 && <circle cx={p.x} cy={p.y} r="5" fill="var(--sb-accent)" opacity="0.2" />}
            <circle cx={p.x} cy={p.y}
              r={i === points.length - 1 ? 3.5 : 2}
              fill={i === points.length - 1 ? 'var(--sb-accent)' : 'var(--sb-surface)'}
              stroke="var(--sb-accent)" strokeWidth={i === points.length - 1 ? 0 : 1.5} />
          </g>
        ))}
      </svg>
    </div>
  );
}
