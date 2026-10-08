import type { ProjectRecord } from '../../shared/record';
import { limitRows } from '../lib/wait-status';

/** Every limit that applies to the project, its value, and who set it. */
export function InspectorLimits({ record }: { record: ProjectRecord }) {
  const rows = limitRows(record);
  return (
    <section aria-label="Limits">
      <div className="ar-lim-title"><span>Limits</span><span>{rows.length}</span></div>
      <div className="ar-lim-card" role="table" aria-label="Limits">
        <div className="ar-lim ar-lim-head" role="row">
          <span role="columnheader">Limit</span><span role="columnheader">Value</span><span role="columnheader">Set by</span>
        </div>
        {rows.map((row) => (
          <div className="ar-lim" role="row" key={row.id}>
            <span role="cell">{row.label}</span>
            <span role="cell" className="ar-lim-v">{row.value}</span>
            <span role="cell" className="ar-lim-by">{row.setBy}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
