import type { ProjectRecord } from '../../shared/record';
import { limitRows } from '../lib/wait-status';

/** Every limit that applies to the project, its value, and who set it. */
export function InspectorLimits({ record }: { record: ProjectRecord }) {
  const rows = limitRows(record);
  return (
    <section aria-label="Limits">
      <div className="ar-lim-title"><span>Limits</span><span>{rows.length}</span></div>
      <table className="ar-lim-card" aria-label="Limits">
        <thead>
          <tr className="ar-lim ar-lim-head">
            <th scope="col">Limit</th><th scope="col">Value</th><th scope="col">Set by</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="ar-lim" key={row.id}>
              <td>{row.label}</td>
              <td className="ar-lim-v">{row.value}</td>
              <td className="ar-lim-by">{row.setBy}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
