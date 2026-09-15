import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@sero-ai/ui';

import type { ProjectRecord } from '../../shared/record';
import type { ArchitectActions } from '../lib/actions';
import { activityBreakdown, inclusiveCost, inclusivePriced, sharedCost, unattributedCost } from '../lib/charts';
import { useInspectorPreferences } from '../lib/page-helpers';
import { describeRunState } from '../lib/run-state';
import { InspectorCharts } from './InspectorCharts';
import {
  activityOf, activityOptions, filterRecords, filtersActive, inRange, modelOptions, NO_FILTERS,
  rowWindow, timeRangeOf, zoomRange, type TimeRange, type TraceFilters,
} from '../lib/timeline';
import { appendTracePage, type TracePage } from '../lib/trace';

const ROW_HEIGHT = 34;
const VIEWPORT = 460;
/** The shared journal: activity charged once to the project rather than to any single run. */
const SHARED_ACTIVITY = 'shared';

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
  const [selected, setSelected] = useState<string>(() => runs.at(-1)?.id ?? SHARED_ACTIVITY);
  const [page, setPage] = useState<TracePage | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [withDetail, setWithDetail] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  /** The selected row, by sequence number rather than array position, so it
   * survives a Load more or a filter change that reorders or shrinks the rows
   * around it. */
  const [selectedSeq, setSelectedSeq] = useState<number | null>(null);
  const { filters, expanded, setFilters, toggleExpanded } = useInspectorPreferences();
  const [range, setRange] = useState<TimeRange | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);

  // A read that has been superseded, or one that arrives after this view is
  // gone, must never commit: it would show a page nobody asked to see any
  // more. The generation counter marks each read's place in line, and the
  // mounted flag survives past unmount without needing a render.
  const generation = useRef(0);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  // A preference write recreates `actions` (it flows through the app context),
  // and `load` reading it directly would recreate itself on every such write
  // and re-fire its effect. The ref always holds the latest actions without
  // making `load` depend on them.
  const actionsRef = useRef(actions);
  useEffect(() => { actionsRef.current = actions; }, [actions]);

  const load = useCallback(async (journalId: string, detail: boolean, afterSeq?: number) => {
    const gen = ++generation.current;
    setLoading(true);
    setNotice(null);
    try {
      const outcome = await actionsRef.current.trace(record.id, {
        runId: journalId,
        detail,
        knownSpendUsd: record.budget.spentUsd,
        ...(afterSeq === undefined ? {} : { afterSeq }),
      });
      // A later load already started while this one was in flight, or the
      // view is gone: either way, this answer is not for the page shown now.
      if (gen !== generation.current || !mounted.current) return;
      if (!outcome.ok) {
        setNotice(outcome.text);
        return;
      }
      setPage((current) => {
        if (afterSeq !== undefined && current && outcome.page) return appendTracePage(current, outcome.page);
        return outcome.page;
      });
    } finally {
      if (gen === generation.current && mounted.current) setLoading(false);
    }
  }, [record.id, record.budget.spentUsd]);

  // Reading a trace is an IPC call, so it is an external effect rather than
  // derived state: the source of truth is the runtime, not this component.
  useEffect(() => {
    void load(selected, withDetail);
  }, [load, selected, withDetail]);

  const records = useMemo(() => page?.records ?? [], [page]);
  const full = useMemo(() => timeRangeOf(records), [records]);
  const visible = useMemo(
    () => filterRecords(records, filters).filter((entry) => inRange(entry, range)),
    [records, filters, range],
  );
  const window = rowWindow(visible.length, { scrollTop, rowHeight: ROW_HEIGHT, viewportHeight: VIEWPORT });
  const slice = visible.slice(window.start, window.end);
  // Whether the timeline (and so the scroller node the keyboard effect binds
  // to) is on screen at all: it mounts and unmounts with this, not with the
  // selection, so it is what the listener effect should key off.
  const hasTimeline = withDetail && records.length > 0;

  // Nothing selected yet defaults to the first row, so the panel is never
  // empty on arrival. A selection whose seq no longer appears in `visible`
  // (a filter narrowed it out) reads as unselected here, without losing the
  // stored seq: widening the filter again finds it and it is selected once more.
  const selectedIndex = visible.length === 0 ? -1 : (selectedSeq === null ? 0 : visible.findIndex((entry) => entry.seq === selectedSeq));

  const step = useCallback((delta: number) => {
    if (visible.length === 0) return;
    const base = selectedIndex === -1 ? 0 : selectedIndex;
    const next = Math.min(Math.max(base + delta, 0), visible.length - 1);
    const target = visible[next];
    if (target) setSelectedSeq(target.seq);
    const node = scroller.current;
    if (node) {
      const top = Math.max(0, next - 2) * ROW_HEIGHT;
      node.scrollTop = top;
      setScrollTop(top);
    }
  }, [selectedIndex, visible]);

  // `step` is recreated on almost every render (it tracks the selection), and
  // re-subscribing the listener that often would be wasted work. The handler
  // reads both through a ref that a separate, cheap effect keeps current, so
  // the listener itself is attached once.
  const handlers = useRef({ step, onBack });
  useEffect(() => { handlers.current = { step, onBack }; }, [step, onBack]);

  // Arrow keys move the selection, so the timeline is usable without a pointer.
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') { event.preventDefault(); handlers.current.step(1); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); handlers.current.step(-1); }
      else if (event.key === 'Escape') handlers.current.onBack();
    };
    node.addEventListener('keydown', onKey);
    return () => node.removeEventListener('keydown', onKey);
  }, [hasTimeline]);

  const selectedRecord = selectedIndex === -1 ? null : visible[selectedIndex] ?? null;
  const summary = page?.summary;
  // Shared activity is charged once to the project, so it is reported beside the
  // run's own figure rather than inside it.
  const shared = sharedCost(records);
  // Cost a model filter cannot attribute to any of the models shown: usage
  // records never carry a model, so the filter keeps them but the total has
  // to say what part of it that is.
  const unattributedUsd = filters.models.length > 0 ? unattributedCost(visible) : 0;
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
            onChange={(event) => { setSelected(event.target.value); setRange(null); setSelectedSeq(null); }}
          >
            <option value={SHARED_ACTIVITY}>Shared activity</option>
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
            <span role="status">
              filtered view: {usd(activityBreakdown(visible).reduce((total, entry) => total + entry.costUsd, 0))} of {usd(summary.attributableUsd)}
              {unattributedUsd > 0 && <> · {usd(unattributedUsd)} not attributable to a model</>}
            </span>
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

      {hasTimeline && (
        <InspectorCharts
          records={visible}
          filters={filters}
          onPickActivity={(activity) => setFilters(toggle(filters, 'activities', activity))}
        />
      )}

      {hasTimeline && (
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
                      role="option"
                      aria-selected={index === selectedIndex}
                      tabIndex={-1}
                      data-selected={index === selectedIndex ? 'true' : undefined}
                      style={{ height: ROW_HEIGHT }}
                      onClick={() => setSelectedSeq(entry.seq)}
                      onKeyDown={(event) => {
                        // The container handles arrow keys; the row handles the
                        // pair a pointer would use on it.
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        setSelectedSeq(entry.seq);
                        if (entry.operationId) toggleExpanded(entry.operationId);
                      }}
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
                  <dt>inclusive</dt><dd>{inclusivePriced(selectedRecord, visible) ? usd(inclusiveCost(selectedRecord, visible)) : 'not measured'}</dd>
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
