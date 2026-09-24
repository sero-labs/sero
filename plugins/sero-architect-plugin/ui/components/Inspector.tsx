import { useMemo, useState } from 'react';
import type { ProjectRecord } from '../../shared/record';
import type { ArchitectActions } from '../lib/actions';
import { buildTree, defaultSelection, filtersActive, matchedCost, modelsOf, NO_FILTERS } from '../lib/activity-tree';
import { openDispatch, useInspectorPreferences } from '../lib/page-helpers';
import { inspectorPhase, NOTHING_RECORDED } from '../lib/run-state';
import { rangeOf, type TimeRange } from '../lib/timeline';
import { LIFETIME, useInspectorTrace, useLifetime } from '../lib/use-inspector-trace';
import { InspectorCharts } from './InspectorCharts';
import { InspectorDetail } from './InspectorDetail';
import { InspectorFilters } from './InspectorFilters';
import { InspectorHeader } from './InspectorHeader';
import { InspectorLifetime } from './InspectorLifetime';
import { InspectorTimeline, type Highlight } from './InspectorTimeline';
import { InspectorTotals } from './InspectorTotals';

/**
 * The run inspector. Opening it reads the newest run's totals, activity tree
 * and first page of charges, so the first screen answers where the run's time
 * and money went without pressing anything.
 */
export function Inspector({ record, actions, onBack }: {
  record: ProjectRecord; actions: ArchitectActions; onBack(): void;
}) {
  const runs = record.runs ?? [];
  const [scope, setScope] = useState(() => runs.at(-1)?.id ?? LIFETIME);
  // Paused holds the spend it paused at, so a pushed record does not re-read.
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [range, setRange] = useState<TimeRange | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [by, setBy] = useState<'activity' | 'model'>('activity');
  const { filters, expanded, setFilters, toggleExpanded } = useInspectorPreferences();
  const knownSpendUsd = pausedAt ?? record.budget.spentUsd;
  const { pageState, loading, notice, load, clear } = useInspectorTrace(record, actions, scope, knownSpendUsd);
  const lifetime = useLifetime(record, actions, scope, knownSpendUsd);
  // A page still held from the previous scope is never shown under the new one.
  const page = pageState && pageState.journalId === scope ? pageState.page : null;
  const selectedRun = runs.find((run) => run.id === scope);
  const phase = inspectorPhase({ loading, page });

  const expandedIds = useMemo(() => new Set(expanded), [expanded]);
  const tree = useMemo(
    () => (page ? buildTree(page.activity, page.records, expandedIds, filters) : null),
    [page, expandedIds, filters],
  );
  const full = useMemo(() => rangeOf(page?.activity.elapsed ?? null), [page]);
  const current = selected ?? (page ? defaultSelection(page.activity) : null);
  // A selection the filters hid falls back to the first row, so the detail
  // panel never leaves its column blank.
  const selectedRow = tree?.rows.find((row) => row.key === current) ?? tree?.rows[0] ?? null;

  const changeScope = (next: string) => {
    setScope(next);
    setRange(null);
    setSelected(null);
    setHighlight(null);
    setPausedAt(null);
    clear();
  };
  const dispatchFor = (nodeId: string) => {
    const node = tree?.byId.get(nodeId);
    const milestone = node?.kind === 'milestone' ? record.milestones.find((entry) => entry.id === node.rawId) : undefined;
    const dispatch = milestone?.dispatch;
    if (!dispatch?.id || !dispatch.workspaceId) return null;
    return () => openDispatch({ kind: dispatch.kind, id: dispatch.id, workspaceId: dispatch.workspaceId });
  };
  const membersOf = (nodeId: string) => {
    const node = tree?.byId.get(nodeId);
    if (node?.kind !== 'research') return null;
    const saved = record.research.find((entry) => entry.id === node.rawId) ?? record.pendingResearch?.find((entry) => entry.id === node.rawId);
    return saved?.models ?? null;
  };
  const filtered = filtersActive(filters);
  const empty = tree && filtered && tree.rows.length === 0
    ? (filters.failuresOnly && filters.group === null && filters.model === null ? 'No failures in this run.' : 'No activity matches these filters.')
    : null;
  const next = page?.nextAfterSeq ?? null;

  return (
    <div className="ar-body ar-insp">
      <InspectorHeader
        name={record.name}
        runs={runs}
        scope={scope}
        onScope={changeScope}
        live={selectedRun && selectedRun.endedAt === null ? pausedAt === null : null}
        onLive={() => setPausedAt(pausedAt === null ? record.budget.spentUsd : null)}
        onBack={onBack}
      />
      {notice && <p className="ar-error" role="alert">{notice}</p>}

      {scope === LIFETIME ? (
        lifetime ? <InspectorLifetime lifetime={lifetime} onOpen={changeScope} /> : <p className="ar-insp-empty" role="status">Loading</p>
      ) : phase === 'loading' ? (
        <p className="ar-insp-empty" role="status">Loading</p>
      ) : phase === 'empty' || !page || !tree ? (
        <p className="ar-insp-empty" role="status">{NOTHING_RECORDED}</p>
      ) : (
        <>
          <InspectorTotals page={page} />
          <InspectorFilters filters={filters} setFilters={setFilters} models={modelsOf(page.activity)}
            filteredUsd={matchedCost(tree)} fullUsd={page.summary.attributableUsd} />
          <div className="ar-insp-main" data-solo={selectedRow ? undefined : 'true'}>
            <InspectorTimeline
              rows={tree.rows}
              nodes={page.activity.nodes}
              byId={tree.byId}
              count={filtered ? `${tree.matched.size} of ${page.activity.nodes.length} activities` : `${page.activity.nodes.length} activities`}
              full={full}
              range={range}
              setRange={setRange}
              selected={selectedRow?.key ?? null}
              onSelect={setSelected}
              onToggle={toggleExpanded}
              highlight={highlight}
              empty={empty}
              onClearFilters={() => setFilters(NO_FILTERS)}
              more={next !== null && !empty ? { onLoad: () => void load(scope, true, next), disabled: loading } : null}
              onBack={onBack}
            />
            <InspectorDetail row={selectedRow} onOpenDispatch={dispatchFor} membersOf={membersOf} />
          </div>
          <InspectorCharts activity={page.activity} totalUsd={page.summary.attributableUsd} by={by} setBy={setBy}
            highlight={highlight} setHighlight={setHighlight} />
        </>
      )}
    </div>
  );
}

