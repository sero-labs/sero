import type { TracePage } from '../lib/trace';
import { ms, usd } from '../lib/inspector-format';
import { NOTHING_RECORDED } from '../lib/run-state';

export function InspectorSummary({ page, shared, withDetail }: { page: TracePage | null; shared: number; withDetail: boolean }) {
  const summary = page?.summary;
  // A view with no journal shows its reason, not a row of zeros that reads as
  // a run that cost nothing and did nothing.
  if (page && !page.recorded) {
    return <p className="ar-run-state" data-state="empty" role="status"><b>Nothing recorded</b> <span>{NOTHING_RECORDED}</span></p>;
  }
  return <>
      <div className="ar-inspector-tiles">
        <CostTile summary={summary} shared={shared} />
        <div><span>Active</span><b>{page ? ms(page.timing.activeMs) : '—'}</b>
          {page && <small>{ms(page.timing.workerMs)} summed across workers</small>}
        </div>
        <div><span>Waiting</span><b>{page ? ms(page.timing.waitMs) : '—'}</b>
          {page && page.timing.waitMs === 0 && <small>none observed</small>}
        </div>
        <div><span>Counters</span><b>{summary ? String(summary.requests) : '—'}</b>
          {summary && <small>{summary.toolCalls} tool calls · {summary.retries} retries · {summary.errors} errors</small>}
        </div>
        <div><span>Tokens</span><b>{page ? String(page.tokens.input + page.tokens.output) : '—'}</b>
          {page && page.tokens.unavailable.length > 0 && <small>{page.tokens.unavailable.join(', ')} unavailable</small>}
        </div>
      </div>

      {summary?.incomplete && (
        <p className="ar-why" role="status">
          This view is incomplete. Some usage, timing or history was not reported, so a total here is a lower bound.
        </p>
      )}
      {!withDetail && (
        <p className="ar-why">The totals above cover the whole view. Load the activity to see the individual operations and their timings.</p>
      )}

  </>;
}

function CostTile({ summary, shared }: { summary: TracePage['summary'] | undefined; shared: number }) {
  return (
    <div><span>Cost</span><b>{summary ? usd(summary.attributableUsd) : '—'}</b>
      {summary?.hasAggregate && <small>{usd(summary.aggregateUsd)} without call detail</small>}
      {shared > 0 && <small>{usd(shared)} shared activity, charged once to the project</small>}
      {summary?.reconciliationUsd !== undefined && Math.abs(summary.reconciliationUsd) > 0.0001 && (
        <small>differs from project spend by {usd(summary.reconciliationUsd)}</small>
      )}
    </div>
  );
}
