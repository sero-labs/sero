import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@sero-ai/ui';

import type { ProjectRecord } from '../../shared/record';
import type { ArchitectActions } from '../lib/actions';
import { activityBreakdown, inclusiveCost, sharedCost } from '../lib/charts';
import { useInspectorPreferences } from '../lib/page-helpers';
import { describeRunState } from '../lib/run-state';
import { InspectorCharts } from './InspectorCharts';
import {
  activityOf, activityOptions, filterRecords, filtersActive, inRange, modelOptions, NO_FILTERS,
  rowWindow, timeRangeOf, zoomRange, type TimeRange, type TraceFilters,
} from '../lib/timeline';
import type { TracePage } from '../lib/trace';

const ROW_HEIGHT = 34;
const VIEWPORT = 460;
/** The project-scoped journal, for the lifetime view. */
const LIFETIME = 'shared';

const ms = (value: number): string => {
  if (value < 1000) return `${value} ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(1)} s`;
  return `${Math.floor(value / 60_000)}m ${Math.round((value % 60_000) / 1000)}s`;
};
const usd = (value: number): string => `$${value.toFixed(4)}`;
const clock = (at: string): string => {
  const parsed = Date.parse(at);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(11, 23) : '--';
};

/**
 * The run inspector (spec architect-run-observability).
 *
 * The summary is asked for without detail, so opening this view reads a total
 * rather than a trace. Records arrive only when the reader asks for them, and
 * then a page at a time.
 *
 * The timeline renders the rows on screen and nothing else, so a trace with tens
 * of thousands of spans scrolls at the same cost as a short one.
 */
export function Inspector({ record, actions, onBack }: {
  record: ProjectRecord;
  actions: ArchitectActions;
  onBack(): void;
}) {
  const runs = record.runs ?? [];
  const [selected, setSelected] = useState<string>(runs.at(-1)?.id ?? LIFETIME);
  const [page, setPage] = useState<TracePage | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [withDetail, setWithDetail] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [cursor, setCursor] = useState(0);
  const { filters, expanded, setFilters, toggleExpanded } = useInspectorPreferences();
  const [range, setRange] = useState<TimeRange | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async (journalId: string, detail: boolean, afterSeq?: number) => {
    setLoading(true);
    setNotice(null);
    try {
      const outcome = await actions.trace(record.id, {
        runId: journalId,
        detail,
        knownSpendUsd: record.budget.spentUsd,
        ...(afterSeq === undefined ? {} : { afterSeq }),
      });
      if (!outcome.ok) setNotice(outcome.text);
      setPage(outcome.page);
    } finally {
      setLoading(false);
    }
  }, [actions, record.id, record.budget.spentUsd]);

  // Reading a trace is an IPC call, so it is an external effect rather than
  // derived state: the source of truth is the runtime, not this component.
  useEffect(() => {
    void load(selected, withDetail);
  }, [load, selected, withDetail]);

  const records = page?.records ?? [];
  const full = useMemo(() => timeRangeOf(records), [records]);
  const visible = useMemo(
    () => filterRecords(records, filters).filter((entry) => inRange(entry, range)),
    [records, filters, range],
  );
  const window = rowWindow(visible.length, { scrollTop, rowHeight: ROW_HEIGHT, viewportHeight: VIEWPORT });
  const slice = visible.slice(window.start, window.end);

  const step = useCallback((delta: number) => {
    setCursor((current) => Math.min(Math.max(current + delta, 0), Math.max(0, visible.length - 1)));
  }, [visible.length]);

  // Arrow keys move the selection, so the timeline is usable without a pointer.
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') { event.preventDefault(); step(1); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); step(-1); }
      else if (event.key === 'Escape') onBack();
      else return;
      const target = Math.max(0, cursor - 2) * ROW_HEIGHT;
      node.scrollTop = target;
      setScrollTop(target);
    };
    node.addEventListener('keydown', onKey);
    return () => node.removeEventListener('keydown', onKey);
  }, [cursor, step, onBack]);

  const selectedRecord = visible[cursor] ?? null;
  const summary = page?.summary;
  // Shared activity is charged once to the project, so it is reported beside the
  // run's own figure rather than inside it.
  const shared = sharedCost(records);
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
          <select value={selected} onChange={(event) => { setSelected(event.target.value); setRange(null); setCursor(0); }}>
            <option value={LIFETIME}>Whole project</option>
            {runs.map((run) => (
              <option key={run.id} value={run.id}>{run.kind}{run.endedAt ? '' : ' (open)'} · {run.id}</option>
            ))}
          </select>
        </label>
      </div>

      {notice && <p className="ar-error" role="alert">{notice}</p>}

      <div className="ar-inspector-tiles">
        <div><span>Cost</span><b>{summary ? usd(summary.attributableUsd) : '—'}</b>
          {summary?.hasAggregate && <small>{usd(summary.aggregateUsd)} without call detail</small>}
          {shared > 0 && <small>{usd(shared)} shared activity, charged once to the project</small>}
          {summary?.reconciliationUsd !== undefined && Math.abs(summary.reconciliationUsd) > 0.0001 && (
            <small>differs from project spend by {usd(summary.reconciliationUsd)}</small>
          )}
        </div>
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

      <div className="ar-inspector-controls">
        <div className="ar-inspector-filters" role="group" aria-label="Filters">
          <span>Filter</span>
          {activityOptions(records).map((activity) => (
            <label key={activity}>
              <input
                type="checkbox"
                checked={filters.activities.includes(activity)}
                onChange={() => setFilters(toggle(filters, 'activities', activity))}
              />
              {activity}
            </label>
          ))}
          {modelOptions(records).map((model) => (
            <label key={model}>
              <input
                type="checkbox"
                checked={filters.models.includes(model)}
                onChange={() => setFilters(toggle(filters, 'models', model))}
              />
              {model}
            </label>
          ))}
          <label>
            <input
              type="checkbox"
              checked={filters.failuresOnly}
              onChange={() => setFilters({ ...filters, failuresOnly: !filters.failuresOnly })}
            />
            failures only
          </label>
          {filtersActive(filters) && (
            <Button variant="outline" size="sm" className="ar-btn" onClick={() => setFilters(NO_FILTERS)}>Clear filters</Button>
          )}
          {visible.length !== records.length && <span>{visible.length} of {records.length} rows</span>}
          {filtersActive(filters) && summary && (
            // A filtered view is part of the run, so its figure is labelled as
            // the filtered total rather than passed off as the run total.
            <span role="status">filtered view: {usd(activityBreakdown(visible).reduce((total, entry) => total + entry.costUsd, 0))} of {usd(summary.attributableUsd)}</span>
          )}
        </div>
        <div className="ar-inspector-zoom" role="group" aria-label="Time range">
          <span>Range</span>
          <Button variant="outline" size="sm" className="ar-btn" disabled={!full} onClick={() => full && setRange(zoomRange(full, range ?? full, 0.5, (range ?? full).from + ((range ?? full).to - (range ?? full).from) / 2))}>Zoom in</Button>
          <Button variant="outline" size="sm" className="ar-btn" disabled={!range} onClick={() => full && setRange(zoomRange(full, range ?? full, 2, range?.from ?? full.from))}>Zoom out</Button>
          {range && <Button variant="outline" size="sm" className="ar-btn" onClick={() => setRange(null)}>Whole run</Button>}
          {!full && <span>no timings observed</span>}
        </div>
        {!withDetail && (
          <Button variant="outline" size="sm" className="ar-btn" onClick={() => setWithDetail(true)}>Load activity</Button>
        )}
      </div>

      {state && (
        // The word carries the status; the tone only decorates it.
        <p className="ar-run-state" data-state={state.state} role="status">
          <b>{state.label}</b> <span>{state.detail}</span>
        </p>
      )}
      {!withDetail && (
        <p className="ar-why">The totals above cover the whole view. Load the activity to see the individual operations and their timings.</p>
      )}

      {withDetail && records.length > 0 && (
        <InspectorCharts
          records={visible}
          filters={filters}
          onPickActivity={(activity) => setFilters(toggle(filters, 'activities', activity))}
        />
      )}

      {withDetail && records.length > 0 && (
        <div className="ar-inspector-split">
          <div
            className="ar-inspector-timeline"
            ref={scroller}
            tabIndex={0}
            aria-label="Activity timeline"
            style={{ height: VIEWPORT }}
            onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          >
            <div style={{ height: window.total * ROW_HEIGHT, position: 'relative' }}>
              <div style={{ transform: `translateY(${window.leading * ROW_HEIGHT}px)` }}>
                {slice.map((entry, offset) => {
                  const index = window.start + offset;
                  const key = `${entry.seq}:${entry.operationId ?? entry.kind}`;
                  const open = entry.operationId !== undefined && expanded.includes(entry.operationId);
                  return (
                    <div
                      key={key}
                      className="ar-span"
                      data-selected={index === cursor ? 'true' : undefined}
                      style={{ height: ROW_HEIGHT }}
                      onClick={() => setCursor(index)}
                      onDoubleClick={() => entry.operationId && toggleExpanded(entry.operationId)}
                    >
                      <span className="ar-span-at">{clock(entry.at)}</span>
                      <span className="ar-span-kind">{activityOf(entry)}</span>
                      <span className="ar-span-op">{entry.operationId ?? entry.source ?? entry.kind}</span>
                      <span className="ar-span-cost">{entry.costUsd === undefined ? '' : usd(entry.costUsd)}</span>
                      {entry.outcome && entry.outcome !== 'ok' && <span className="ar-span-bad">{entry.outcome}</span>}
                      {open && (
                        <dl className="ar-span-detail">
                          <dt>model</dt><dd>{entry.model ?? 'not recorded'}</dd>
                          <dt>thinking</dt><dd>{entry.thinking ?? 'not recorded'}</dd>
                          <dt>coverage</dt><dd>{entry.coverage ?? 'not recorded'}</dd>
                          <dt>tokens</dt><dd>{entry.usage?.inputTokens ?? 'unavailable'} in / {entry.usage?.outputTokens ?? 'unavailable'} out</dd>
                        </dl>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <aside className="ar-inspector-detail" aria-label="Selected activity">
            {selectedRecord ? (
              <>
                <p className="ar-mono">{selectedRecord.operationId ?? selectedRecord.source ?? selectedRecord.kind}</p>
                <dl>
                  <dt>at</dt><dd>{selectedRecord.at}</dd>
                  <dt>kind</dt><dd>{activityOf(selectedRecord)}</dd>
                  <dt>model</dt><dd>{selectedRecord.model ?? 'not recorded'}</dd>
                  <dt>own cost</dt><dd>{selectedRecord.costUsd === undefined ? 'not recorded' : usd(selectedRecord.costUsd)}</dd>
                  {/* Inclusive covers this operation and everything under it, and
                      is never added into a total that already counted those. */}
                  <dt>inclusive</dt><dd>{usd(inclusiveCost(selectedRecord, visible))}</dd>
                  <dt>coverage</dt><dd>{selectedRecord.coverage ?? 'not recorded'}</dd>
                </dl>
                {selectedRecord.operationId && (
                  <Button variant="outline" size="sm" className="ar-btn" onClick={() => toggleExpanded(selectedRecord.operationId!)}>
                    {expanded.includes(selectedRecord.operationId) ? 'Collapse' : 'Expand'} this operation
                  </Button>
                )}
              </>
            ) : (
              <p className="ar-why">Select a row to inspect it.</p>
            )}
          </aside>
        </div>
      )}

      {withDetail && page?.nextAfterSeq !== undefined && page.nextAfterSeq !== null && (
        <Button variant="outline" size="sm" className="ar-btn" onClick={() => void load(selected, true, page.nextAfterSeq ?? undefined)}>
          Load more activity
        </Button>
      )}
      {withDetail && page?.incomplete && <p className="ar-why">This activity page is not the whole history.</p>}
    </div>
  );
}

/** Adds or removes one value from a filter list. */
function toggle(filters: TraceFilters, key: 'activities' | 'models', value: string): TraceFilters {
  const current = filters[key];
  return { ...filters, [key]: current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value] };
}
