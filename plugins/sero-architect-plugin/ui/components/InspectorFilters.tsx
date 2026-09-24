import { TriangleAlert } from 'lucide-react';
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sero-ai/ui';
import { filtersActive, NO_FILTERS, type TraceFilters } from '../lib/activity-tree';
import { usd } from '../lib/inspector-format';
import { ACTIVITY_GROUPS } from '../lib/trace';
import { GROUP_LABEL } from './InspectorStatus';

const ALL_MODELS = '__all__';

/**
 * Activity chips, the model filter and Failures only. The filtered subtotal and
 * Clear filters appear only while a filter is on: unfiltered, the cost tile
 * already says what the run cost.
 */
export function InspectorFilters({ filters, setFilters, models, filteredUsd, fullUsd }: {
  filters: TraceFilters;
  setFilters(filters: TraceFilters): void;
  models: readonly string[];
  filteredUsd: number;
  fullUsd: number;
}) {
  return (
    <div className="ar-tools">
      <div className="ar-chips" role="group" aria-label="Activity filter">
        <button type="button" aria-pressed={filters.group === null} onClick={() => setFilters({ ...filters, group: null })}>All activity</button>
        {ACTIVITY_GROUPS.map((group) => (
          <button key={group} type="button" aria-pressed={filters.group === group} onClick={() => setFilters({ ...filters, group })}>{GROUP_LABEL[group]}</button>
        ))}
      </div>
      <Select value={filters.model ?? ALL_MODELS} onValueChange={(value) => setFilters({ ...filters, model: value === ALL_MODELS ? null : value })}>
        <SelectTrigger size="sm" aria-label="Model filter" className="text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_MODELS}>All models</SelectItem>
          {models.map((model) => <SelectItem key={model} value={model}>{model}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button variant="outline" size="sm" className="ar-btn" aria-pressed={filters.failuresOnly}
        onClick={() => setFilters({ ...filters, failuresOnly: !filters.failuresOnly })}>
        <TriangleAlert aria-hidden="true" />Failures only
      </Button>
      {filtersActive(filters) && (
        <span className="ar-scope-note" role="status">
          <span><b>{usd(filteredUsd)}</b> of <b>{usd(fullUsd)}</b></span>
          <Button variant="ghost" size="sm" className="ar-btn" onClick={() => setFilters(NO_FILTERS)}>Clear filters</Button>
        </span>
      )}
    </div>
  );
}
