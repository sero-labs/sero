import type { ReactNode } from 'react';
import { Layers } from 'lucide-react';
import { Button } from '@sero-ai/ui';
import { dur, tokens as short, usd } from '../lib/inspector-format';
import type { ActivityView, TokenSet } from '../lib/trace';
import { GROUP_LABEL, TOKEN_COLOURS } from '../lib/inspector-view';
import { StateLegend } from './InspectorStatus';
import type { Highlight } from './InspectorTimeline';

const BANDS = 8;

/**
 * Cumulative spend. The plot stretches to its panel; the axis labels are text
 * at a fixed size, so a wide panel never scales them. `bounds` marks where one
 * run ends and the next begins on the lifetime chart.
 */
export function SpendPlot({ points, bounds = [], onBand, band, label, axis }: {
  /** `x` in milliseconds from the start of the axis, `usd` cumulative. */
  points: readonly { x: number; usd: number }[];
  bounds?: readonly number[];
  onBand?: (from: number, to: number) => void;
  band?: { from: number; to: number } | null;
  label: string;
  /** A word for the x axis, when it is not wall-clock time. */
  axis?: string;
}) {
  const maxX = Math.max(1, points.at(-1)?.x ?? 1);
  const maxY = Math.max(0.01, points.at(-1)?.usd ?? 0);
  const x = (value: number) => (value / maxX) * 1000;
  const y = (value: number) => 100 - (value / maxY) * 94;
  const line = points.map((point, index) => `${index ? 'L' : 'M'}${x(point.x).toFixed(1)} ${y(point.usd).toFixed(1)}`).join(' ');
  return (
    <div className="ar-plot">
      <div className="y" aria-hidden="true">
        {[maxY, maxY / 2, 0].map((value) => <span key={value} style={{ top: `${y(value)}%` }}>{usd(value)}</span>)}
      </div>
      <svg viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label={label}>
        {[maxY, maxY / 2].map((value) => <line key={value} className="gl" x1="0" x2="1000" y1={y(value)} y2={y(value)} />)}
        {points.length > 0 && <path className="area" d={`${line} L${x(maxX).toFixed(1)} 100 L0 100 Z`} />}
        {points.length > 0 && <path className="line" d={line} />}
        {bounds.map((bound) => <line key={bound} className="bound" x1={x(bound)} x2={x(bound)} y1="0" y2="100" />)}
        {onBand && Array.from({ length: BANDS }, (_, index) => {
          const from = (maxX / BANDS) * index;
          const to = (maxX / BANDS) * (index + 1);
          return (
            <rect key={index} className="band" x={x(from)} y="0" width={1000 / BANDS} height="100"
              data-on={band && band.from === from && band.to === to ? 'true' : undefined}
              onClick={() => onBand(from, to)}><title>{`${dur(from)} to ${dur(to)}`}</title></rect>
          );
        })}
      </svg>
      <div className="x" aria-hidden="true"><span>0s</span>{axis && <span>{axis}</span>}<span>{dur(maxX)}</span></div>
    </div>
  );
}

function Shell({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="ar-panel ar-chart">
      <div className="ar-chart-title">{title}{note && <span className="n">{note}</span>}</div>
      {children}
    </section>
  );
}

const TOKEN_KEYS = Object.keys(TOKEN_COLOURS) as (keyof TokenSet)[];
const tokenSum = (tokens: TokenSet): number => TOKEN_KEYS.reduce((sum, key) => sum + tokens[key], 0);

/** The three charts and the legend row. Every bar and band highlights its rows. */
export function InspectorCharts({ activity, totalUsd, by, setBy, highlight, setHighlight }: {
  activity: ActivityView;
  totalUsd: number;
  by: 'activity' | 'model';
  setBy(by: 'activity' | 'model'): void;
  highlight: Highlight | null;
  setHighlight(highlight: Highlight | null): void;
}) {
  const origin = Date.parse(activity.elapsed?.from ?? activity.spend[0]?.at ?? '');
  const points = Number.isFinite(origin) ? activity.spend.map((point) => ({ x: Date.parse(point.at) - origin, usd: point.usd })) : [];
  const timeBand = highlight?.kind === 'time' ? { from: highlight.from - origin, to: highlight.to - origin } : null;
  const rows = by === 'activity'
    ? activity.byGroup.map((row) => ({ key: row.group, label: GROUP_LABEL[row.group], usd: row.usd, pick: { kind: 'group', value: row.group } as Highlight }))
    : activity.byModel.map((row) => ({ key: row.model ?? 'none', label: row.model?.split('/').pop() ?? 'unavailable', usd: row.usd, pick: { kind: 'model', value: row.model } as Highlight }));
  const max = Math.max(0.0001, ...rows.map((row) => row.usd));
  const tokenRows = activity.byGroup.filter((row): row is typeof row & { tokens: TokenSet } => row.tokens !== null && tokenSum(row.tokens) > 0);
  const tokenMax = Math.max(1, ...tokenRows.map((row) => tokenSum(row.tokens)));
  const same = (a: Highlight | null, b: Highlight) => a !== null && a.kind === b.kind && 'value' in a && 'value' in b && a.value === b.value;
  return (
    <>
      <div className="ar-chart-row">
        <Shell title="Cumulative spend" note={usd(totalUsd)}>
          {points.length > 0
            ? <SpendPlot points={points} label="Cumulative spend over run time" band={timeBand}
                onBand={(from, to) => setHighlight(timeBand && timeBand.from === from && timeBand.to === to ? null : { kind: 'time', from: origin + from, to: origin + to })} />
            : <p className="ar-chart-none">unavailable</p>}
        </Shell>
        <Shell title={`Cost by ${by}`}>
          <div className="ar-hbars">
            {rows.map((row) => (
              <button key={row.key} type="button" className="ar-hbar" aria-pressed={same(highlight, row.pick)}
                onClick={() => setHighlight(same(highlight, row.pick) ? null : row.pick)}>
                <span className="l" title={row.label}>{row.label}</span>
                <span className="t"><i style={{ width: `${(row.usd / max) * 100}%` }} /></span>
                <span className="r">{usd(row.usd)}</span>
              </button>
            ))}
          </div>
        </Shell>
        <Shell title="Token composition">
          {tokenRows.length === 0 ? <p className="ar-chart-none">unavailable</p> : (
            <>
              <div className="ar-hbars">
                {tokenRows.map((row) => {
                  const pick: Highlight = { kind: 'group', value: row.group };
                  return (
                    <button key={row.group} type="button" className="ar-hbar" aria-pressed={same(highlight, pick)} onClick={() => setHighlight(same(highlight, pick) ? null : pick)}>
                      <span className="l">{GROUP_LABEL[row.group]}</span>
                      <span className="t">{TOKEN_KEYS.map((key) => (row.tokens[key]
                        ? <i key={key} className="seg" title={`${key} ${row.tokens[key]}`} style={{ width: `${(row.tokens[key] / tokenMax) * 100}%`, background: TOKEN_COLOURS[key] }} />
                        : null))}</span>
                      <span className="r">{short(tokenSum(row.tokens))}</span>
                    </button>
                  );
                })}
              </div>
              <div className="ar-chart-foot">
                {TOKEN_KEYS.map((key) => <span key={key}><i className="sq" style={{ background: TOKEN_COLOURS[key] }} />{key === 'cacheRead' ? 'cache read' : key === 'cacheWrite' ? 'cache write' : key}</span>)}
              </div>
            </>
          )}
        </Shell>
      </div>
      <div className="ar-legend">
        <Button variant="outline" size="sm" className="ar-btn" onClick={() => setBy(by === 'activity' ? 'model' : 'activity')}>
          <Layers aria-hidden="true" />Breakdown by {by}
        </Button>
        <StateLegend />
      </div>
    </>
  );
}
