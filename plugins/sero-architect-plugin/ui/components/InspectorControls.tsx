import { Button } from '@sero-ai/ui';
import type { TracePage, TraceRecord } from '../lib/trace';
import { activityBreakdown, unattributedCost } from '../lib/charts';
import { activityOptions, filtersActive, toggle, modelOptions, NO_FILTERS, zoomRange, type TimeRange, type TraceFilters } from '../lib/timeline';
import { usd } from '../lib/inspector-format';

export function InspectorControls({ records, visible, filters, setFilters, full, range, setRange, withDetail, setWithDetail, summary }: {
  records: TraceRecord[]; visible: TraceRecord[]; filters: TraceFilters;
  setFilters(filters: TraceFilters): void; full: TimeRange | null; range: TimeRange | null;
  setRange(range: TimeRange | null): void; withDetail: boolean; setWithDetail(detail: boolean): void;
  summary: TracePage['summary'] | undefined;
}) {
  const activities = new Set(filters.activities);
  const models = new Set(filters.models);
  const unattributedUsd = filters.models.length > 0 ? unattributedCost(visible) : 0;
  return (
    <div className="ar-inspector-controls">
      <div className="ar-inspector-filters" role="group" aria-label="Filters">
        <span>Filter</span>
        {activityOptions(records).map((activity) => (
          <label key={activity}>
            <input
              type="checkbox"
              checked={activities.has(activity)}
              onChange={() => setFilters(toggle(filters, 'activities', activity))}
            />
            {activity}
          </label>
        ))}
        {modelOptions(records).map((model) => (
          <label key={model}>
            <input
              type="checkbox"
              checked={models.has(model)}
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

  );
}
