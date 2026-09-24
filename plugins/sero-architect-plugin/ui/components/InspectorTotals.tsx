import { counterWords, totalTiles, type TileView } from '../lib/inspector-view';
import type { TracePage } from '../lib/trace';

function Tile({ label, value, note, unknown }: TileView) {
  return (
    <div className="ar-tile" data-unknown={unknown ? 'true' : undefined}>
      <span className="k">{label}</span>
      <span className="v">{value}</span>
      <span className="n">{note ?? ''}</span>
    </div>
  );
}

/** The run's six figures and its counters. */
export function InspectorTotals({ page }: { page: TracePage }) {
  return (
    <>
      <div className="ar-tiles">{totalTiles(page).map((tile) => <Tile key={tile.label} {...tile} />)}</div>
      <div className="ar-counters">{counterWords(page).map((entry) => <span key={entry}>{entry}</span>)}</div>
    </>
  );
}
