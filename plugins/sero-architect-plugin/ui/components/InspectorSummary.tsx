import type { TracePage } from '../lib/trace';
import { ms, usd } from '../lib/inspector-format';

export function InspectorSummary({ page, shared }: { page: TracePage | null; shared: number }) {
  const summary = page?.summary;
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
