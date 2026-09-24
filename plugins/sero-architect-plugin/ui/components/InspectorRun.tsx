import { useMemo, useState } from 'react';
import type { ProjectRecord } from '../../shared/record';
import { buildTree, defaultSelection, matchedCost, modelsOf, NO_FILTERS } from '../lib/activity-tree';
import { activityCount, emptyFilterMessage, milestoneDispatch, roomMembers } from '../lib/inspector-view';
import { openDispatch, useInspectorPreferences } from '../lib/page-helpers';
import { rangeOf, type TimeRange } from '../lib/timeline';
import type { TracePage } from '../lib/trace';
import { InspectorCharts } from './InspectorCharts';
import { InspectorDetail } from './InspectorDetail';
import { InspectorFilters } from './InspectorFilters';
import { InspectorTimeline, type Highlight } from './InspectorTimeline';
import { InspectorTotals } from './InspectorTotals';

/** One run: its figures, filters, timeline beside the selected activity, and charts. */
export function InspectorRun({ record, page, loading, onLoadMore, onBack }: {
  record: ProjectRecord;
  page: TracePage;
  loading: boolean;
  onLoadMore(afterSeq: number): void;
  onBack(): void;
}) {
  const [range, setRange] = useState<TimeRange | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [by, setBy] = useState<'activity' | 'model'>('activity');
  const { filters, expanded, setFilters, toggleExpanded } = useInspectorPreferences();

  const expandedIds = useMemo(() => new Set(expanded), [expanded]);
  const tree = useMemo(() => buildTree(page.activity, page.records, expandedIds, filters), [page, expandedIds, filters]);
  const full = useMemo(() => rangeOf(page.activity.elapsed), [page]);
  const current = selected ?? defaultSelection(page.activity);
  // A selection the filters hid falls back to the first row, so the detail
  // panel never leaves its column blank.
  const selectedRow = tree.rows.find((row) => row.key === current) ?? tree.rows[0] ?? null;
  const empty = emptyFilterMessage(filters, tree.rows.length);
  const next = page.nextAfterSeq;

  const dispatchFor = (nodeId: string) => {
    const link = milestoneDispatch(record, tree.byId.get(nodeId));
    return link ? () => openDispatch(link) : null;
  };

  return (
    <>
      <InspectorTotals page={page} />
      <InspectorFilters filters={filters} setFilters={setFilters} models={modelsOf(page.activity)}
        filteredUsd={matchedCost(tree)} fullUsd={page.summary.attributableUsd} />
      <div className="ar-insp-main" data-solo={selectedRow ? undefined : 'true'}>
        <InspectorTimeline
          rows={tree.rows}
          nodes={page.activity.nodes}
          byId={tree.byId}
          count={activityCount(filters, tree.matched.size, page.activity.nodes.length)}
          full={full}
          range={range}
          setRange={setRange}
          selected={selectedRow?.key ?? null}
          onSelect={setSelected}
          onToggle={toggleExpanded}
          highlight={highlight}
          empty={empty}
          onClearFilters={() => setFilters(NO_FILTERS)}
          more={next !== null && !empty ? { onLoad: () => onLoadMore(next), disabled: loading } : null}
          onBack={onBack}
        />
        <InspectorDetail row={selectedRow} onOpenDispatch={dispatchFor} membersOf={(nodeId) => roomMembers(record, tree.byId.get(nodeId))} />
      </div>
      <InspectorCharts activity={page.activity} totalUsd={page.summary.attributableUsd} by={by} setBy={setBy}
        highlight={highlight} setHighlight={setHighlight} />
    </>
  );
}
