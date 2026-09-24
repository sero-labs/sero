import type { TracePage } from '../lib/trace';
import { dur, span, usd } from '../lib/inspector-format';

function Tile({ label, value, note, unknown }: { label: string; value: string; note?: string; unknown?: boolean }) {
  return (
    <div className="ar-tile" data-unknown={unknown ? 'true' : undefined}>
      <span className="k">{label}</span>
      <span className="v">{value}</span>
      <span className="n">{note ?? ''}</span>
    </div>
  );
}

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

/**
 * The run's six figures and its counters. A figure the sources did not measure
 * reads `unavailable`; a counter that is zero is left out, because a zero the
 * runtime never counted would read as measured.
 */
export function InspectorTotals({ page }: { page: TracePage }) {
  const { summary, timing, activity } = page;
  const elapsed = activity.elapsed;
  const elapsedMs = elapsed ? Date.parse(elapsed.to) - Date.parse(elapsed.from) : null;
  // Active time is a union of observed intervals; with none observed it is unknown, not zero.
  const measuredActive = timing.activeMs > 0 || activity.nodes.some((node) => !node.synthetic && node.startAt !== null && node.endAt !== null);
  const waits = Object.entries(timing.waitByCause).map(([cause, ms]) => `${cause} ${dur(ms)}`).join(' · ');
  // A total folded from part of the history is a lower bound, and says so.
  const cost = `${summary.incomplete ? '≥ ' : ''}${usd(summary.attributableUsd)}`;
  const coverage = summary.hasAggregate
    ? summary.aggregateUsd >= summary.attributableUsd - 1e-9 ? 'no per-call detail' : `${usd(summary.aggregateUsd)} without per-call detail`
    : summary.attributableUsd > 0 ? 'per call' : undefined;
  const counters = [
    activity.counters.ownerTurns > 0 && plural(activity.counters.ownerTurns, 'owner turn', 'owner turns'),
    summary.requests > 0 && plural(summary.requests, 'model request', 'model requests'),
    summary.toolCalls > 0 && plural(summary.toolCalls, 'tool call', 'tool calls'),
    activity.counters.retries > 0 && plural(activity.counters.retries, 'retry', 'retries'),
    summary.compactions > 0 && plural(summary.compactions, 'compaction', 'compactions'),
    activity.counters.failures > 0 && plural(activity.counters.failures, 'failure', 'failures'),
  ].filter((entry): entry is string => typeof entry === 'string');
  return (
    <>
      <div className="ar-tiles">
        <Tile label="Elapsed" value={elapsedMs === null ? 'unavailable' : dur(elapsedMs)} unknown={elapsedMs === null}
          note={elapsed ? span(elapsed.from, elapsed.to) : undefined} />
        <Tile label="Active" value={measuredActive ? dur(timing.activeMs) : 'unavailable'} unknown={!measuredActive} />
        <Tile label="Waiting" value={dur(timing.waitMs)} note={waits || undefined} />
        <Tile label="Attributable cost" value={cost} note={coverage} />
        <Tile label="Linked shared" value={usd(page.linkedSharedUsd)} />
        <Tile label="Unknown cost" value={plural(summary.unpricedCharges, 'charge', 'charges')} />
      </div>
      <div className="ar-counters">{counters.map((entry) => <span key={entry}>{entry}</span>)}</div>
    </>
  );
}
