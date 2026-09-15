import { useMemo, useState } from 'react';
import { Button } from '@sero-ai/ui';
import type { ProjectRecord } from '../../shared/record';
import type { ArchitectActions } from '../lib/actions';
import { sharedCost } from '../lib/charts';
import { useInspectorPreferences } from '../lib/page-helpers';
import { useInspectorTrace } from '../lib/use-inspector-trace';
import { describeRunState } from '../lib/run-state';
import { filterRecords, inRange, timeRangeOf, toggle, type TimeRange } from '../lib/timeline';
import { InspectorCharts } from './InspectorCharts';
import { InspectorSummary } from './InspectorSummary';
import { InspectorControls } from './InspectorControls';
import { InspectorActivity } from './InspectorActivity';

const SHARED_ACTIVITY = 'shared';

/** Totals load first; detail is paginated and the timeline renders only its visible rows. */
export function Inspector({ record, actions, onBack }: {
  record: ProjectRecord; actions: ArchitectActions; onBack(): void;
}) {
  const runs = record.runs ?? [];
  const [selected, setSelected] = useState(() => runs.at(-1)?.id ?? SHARED_ACTIVITY);
  const [withDetail, setWithDetail] = useState(false);
  const [range, setRange] = useState<TimeRange | null>(null);
  const { filters, expanded, setFilters, toggleExpanded } = useInspectorPreferences();
  const { pageState, loading, notice, load, clear } = useInspectorTrace(record, actions, selected, withDetail);
  const page = pageState?.page ?? null;
  const records = useMemo(() => page?.records ?? [], [page]);
  const full = useMemo(() => timeRangeOf(records), [records]);
  const visible = useMemo(() => filterRecords(records, filters).filter((entry) => inRange(entry, range)), [records, filters, range]);
  const hasTimeline = withDetail && records.length > 0;
  const selectedRun = runs.find((run) => run.id === selected);
  // The state is only described once activity has been asked for: before that,
  // "no rows" only means the reader has not opened the timeline yet.
  const state = useMemo(
    () => (withDetail
      ? describeRunState({
        loading,
        answered: page !== null,
        page,
        runOpen: selectedRun !== undefined && selectedRun.endedAt === null,
        projectHalted: record.overlay !== null || record.paused,
        range,
        visibleRecords: visible.length,
      })
      : null),
    [withDetail, loading, page, selectedRun, record.overlay, record.paused, range, visible.length],
  );

  return (
    <div className="ar-body ar-inspector">
      <div className="ar-models-head">
        <Button variant="outline" size="sm" className="ar-btn" onClick={onBack}>Back to project</Button>
        <span className="ar-models-title">Run inspector · {record.name}</span>
        <label className="ar-inspector-run">
          <span>View</span>
          <select
            value={selected}
            onChange={(event) => { setSelected(event.target.value); setRange(null); clear(); }}
          >
            <option value={SHARED_ACTIVITY}>Shared activity</option>
            {runs.map((run) => (
              <option key={run.id} value={run.id}>{run.kind}{run.endedAt ? '' : ' (open)'} · {run.id}</option>
            ))}
          </select>
        </label>
      </div>

      {notice && <p className="ar-error" role="alert">{notice}</p>}

      <InspectorSummary page={page} shared={sharedCost(records)} />
      <InspectorControls records={records} visible={visible} filters={filters} setFilters={setFilters} full={full} range={range} setRange={setRange} withDetail={withDetail} setWithDetail={setWithDetail} summary={page?.summary} />

      {state && (
        // The word carries the status; the tone only decorates it.
        <p className="ar-run-state" data-state={state.state} role="status">
          <b>{state.label}</b> <span>{state.detail}</span>
        </p>
      )}
      {!withDetail && (
        <p className="ar-why">The totals above cover the whole view. Load the activity to see the individual operations and their timings.</p>
      )}

      {hasTimeline && (
        <InspectorCharts
          records={visible}
          filters={filters}
          onPickActivity={(activity) => setFilters(toggle(filters, 'activities', activity))}
        />
      )}

      {hasTimeline && (
        <InspectorActivity key={selected} visible={visible} expanded={expanded} toggleExpanded={toggleExpanded} onBack={onBack} />
      )}

      {withDetail && page?.nextAfterSeq !== undefined && page.nextAfterSeq !== null && (
        <Button
          variant="outline"
          size="sm"
          className="ar-btn"
          // A read in flight, or a held page that is no longer the selected
          // view (the moment after switching, before its own read resolves),
          // must never be asked to continue with a cursor that is not its own.
          disabled={loading || pageState?.journalId !== selected}
          onClick={() => void load(selected, true, page.nextAfterSeq ?? undefined)}
        >
          Load more activity
        </Button>
      )}
      {withDetail && page?.incomplete && <p className="ar-why">This activity page is not the whole history.</p>}
    </div>
  );
}
