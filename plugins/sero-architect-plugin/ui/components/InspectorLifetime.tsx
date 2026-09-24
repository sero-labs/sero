import { Button } from '@sero-ai/ui';
import { dur, usd } from '../lib/inspector-format';
import type { LifetimeView } from '../lib/trace';
import { SpendPlot } from './InspectorCharts';

const OUTCOME_WORD: Record<string, string> = {
  'in-progress': 'In progress',
  delivered: 'Delivered',
  'no-work-needed': 'No work needed',
  stopped: 'Stopped',
  blocked: 'Blocked',
};

/**
 * Each run laid end to end in run order. Runs have separate time origins, so
 * the axis is run order, not one wall clock, and a dashed line marks where
 * each run begins.
 */
function acrossRuns(lifetime: LifetimeView): { points: { x: number; usd: number }[]; bounds: number[] } {
  const points: { x: number; usd: number }[] = [];
  const bounds: number[] = [];
  let offset = 0;
  let spent = 0;
  for (const run of lifetime.runs) {
    const start = Date.parse(run.spend[0]?.at ?? '');
    if (!Number.isFinite(start)) continue;
    if (points.length > 0) bounds.push(offset);
    points.push({ x: offset, usd: spent });
    let last = start;
    for (const point of run.spend) {
      last = Date.parse(point.at);
      points.push({ x: offset + (last - start), usd: spent + point.usd });
    }
    spent += run.spend.at(-1)?.usd ?? 0;
    offset += last - start;
  }
  return { points, bounds };
}

export function InspectorLifetime({ lifetime, onOpen }: { lifetime: LifetimeView; onOpen(runId: string): void }) {
  const attributable = lifetime.runs.reduce((sum, run) => sum + run.attributableUsd, 0);
  const incomplete = lifetime.runs.filter((run) => run.incomplete || !run.recorded).length;
  const chart = acrossRuns(lifetime);
  return (
    <>
      <div className="ar-tiles">
        <div className="ar-tile"><span className="k">Lifetime attributable</span><span className="v">{usd(attributable)}</span><span className="n" /></div>
        <div className="ar-tile"><span className="k">Linked shared</span><span className="v">{usd(lifetime.sharedUsd)}</span><span className="n" /></div>
        <div className="ar-tile" data-unknown={lifetime.unassignedUsd === null ? 'true' : undefined}>
          <span className="k">Unassigned</span><span className="v">{lifetime.unassignedUsd === null ? 'unavailable' : usd(lifetime.unassignedUsd)}</span><span className="n" />
        </div>
        <div className="ar-tile"><span className="k">Runs</span><span className="v">{lifetime.runs.length}</span><span className="n">{incomplete > 0 ? `${incomplete} with incomplete history` : ''}</span></div>
        <div className="ar-tile"><span className="k">Active</span><span className="v">{dur(lifetime.runs.reduce((sum, run) => sum + run.activeMs, 0))}</span><span className="n" /></div>
        <div className="ar-tile"><span className="k">Waiting</span><span className="v">{dur(lifetime.runs.reduce((sum, run) => sum + run.waitMs, 0))}</span><span className="n" /></div>
      </div>
      <section className="ar-panel" aria-label="Runs">
        <div className="ar-panel-head">Runs</div>
        <table className="ar-runs">
          <thead><tr><th>Run</th><th>Attributable</th><th>Linked shared</th><th>Active</th><th>Outcome</th><th /></tr></thead>
          <tbody>
            {lifetime.runs.map((run) => (
              <tr key={run.id}>
                <td>{run.label}</td>
                <td className="m">{run.recorded ? usd(run.attributableUsd) : 'unavailable'}</td>
                <td className="m">{usd(run.linkedSharedUsd)}</td>
                <td className="m">{run.recorded && run.activeMs > 0 ? dur(run.activeMs) : 'unavailable'}</td>
                <td>{OUTCOME_WORD[run.outcome] ?? run.outcome}</td>
                <td><Button variant="outline" size="sm" className="ar-btn" onClick={() => onOpen(run.id)}>Open</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="ar-panel ar-chart">
        <div className="ar-chart-title">Cumulative spend across runs<span className="n">{usd(attributable)}</span></div>
        {chart.points.length > 0
          ? <SpendPlot points={chart.points} bounds={chart.bounds} label="Cumulative spend across runs, in run order" axis="run order" />
          : <p className="ar-chart-none">unavailable</p>}
      </section>
    </>
  );
}
