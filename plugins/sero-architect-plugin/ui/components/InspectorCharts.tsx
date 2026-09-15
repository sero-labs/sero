import type { TraceRecord } from '../lib/trace';
import { activityBreakdown, cumulativeSpend, modelBreakdown } from '../lib/charts';
import type { TraceFilters } from '../lib/timeline';

const usd = (value: number): string => `$${value.toFixed(4)}`;

/**
 * The inspector's charts (spec architect-run-observability).
 *
 * Every figure here is computed from the records the runtime returned, so a
 * chart and the totals above it cannot disagree: they read one set of records.
 *
 * A chart with nothing priced says so. It does not draw a line at zero, because
 * a flat line is a measurement and "nothing was priced" is the absence of one.
 */
export function InspectorCharts({ records, filters, onPickActivity }: {
  records: readonly TraceRecord[];
  filters: TraceFilters;
  onPickActivity(activity: string): void;
}) {
  const points = cumulativeSpend(records);
  const activities = activityBreakdown(records);
  const models = modelBreakdown(records);
  const peak = activities.reduce((max, entry) => Math.max(max, entry.costUsd), 0);

  if (points.length === 0 && models.length === 0) {
    return (
      <div className="ar-charts">
        <p className="ar-why">No priced usage was reported for this view, so there is nothing to chart. That is not the same as spending nothing.</p>
      </div>
    );
  }

  const width = 560;
  const height = 120;
  const span = points.length > 1 ? Date.parse(points.at(-1)!.at) - Date.parse(points[0]!.at) : 0;
  const total = points.at(-1)?.cumulativeUsd ?? 0;
  const line = points.map((point, index) => {
    const x = span > 0 ? ((Date.parse(point.at) - Date.parse(points[0]!.at)) / span) * width : 0;
    const y = total > 0 ? height - (point.cumulativeUsd / total) * height : height;
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <div className="ar-charts">
      <section aria-label="Cumulative spend">
        <h3>Cumulative spend</h3>
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img"
          aria-label={`Spend rises to ${usd(total)} over ${points.length} priced records.`}>
          <path d={line} fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        <p className="ar-why">{points.length} priced record{points.length === 1 ? '' : 's'} · ends at {usd(total)}</p>
      </section>

      <section aria-label="Spend by activity">
        <h3>By activity</h3>
        <ul className="ar-bars">
          {activities.map((entry) => (
            <li key={entry.activity}>
              <button
                type="button"
                className="ar-bar-row"
                data-on={filters.activities.includes(entry.activity) ? 'true' : undefined}
                onClick={() => onPickActivity(entry.activity)}
                aria-pressed={filters.activities.includes(entry.activity)}
              >
                <span className="ar-bar-label">{entry.activity}</span>
                <span className="ar-bar-track"><i style={{ width: peak > 0 ? `${(entry.costUsd / peak) * 100}%` : '0%' }} /></span>
                <span className="ar-bar-value">{usd(entry.costUsd)}</span>
                <span className="ar-bar-count">{entry.records} rec</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Spend by model">
        <h3>By model</h3>
        <table className="ar-model-table">
          <thead><tr><th>Model</th><th>Thinking</th><th>Calls</th><th>Cost</th></tr></thead>
          <tbody>
            {models.map((entry) => (
              <tr key={`${entry.model}@${entry.thinking}`}>
                <td className="ar-mono">{entry.model}</td>
                <td>{entry.thinking}</td>
                <td>{entry.calls}</td>
                <td>{usd(entry.costUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
