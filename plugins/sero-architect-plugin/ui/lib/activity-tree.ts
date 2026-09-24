/**
 * The inspector's rows (spec architect-run-observability).
 *
 * The runtime folds the run into named nodes with inclusive costs; detail pages
 * add the charges under them. This turns both into the rows the timeline shows,
 * applies the filters, and says what a filter matched. Pure, so the rendering
 * stays a rendering.
 *
 * A filter keeps the ancestors of what it matched, dimmed, so a match is never
 * shown without the thing it belongs to, and opens them, so a match is never
 * hidden inside a collapsed row.
 */

import type { ActivityGroup, ActivityNodeView, ActivityView, TraceRecord } from './trace';

export interface TraceFilters {
  /** One activity group, or null for all activity. */
  group: ActivityGroup | null;
  /** One model, or null for all models. */
  model: string | null;
  failuresOnly: boolean;
}

export const NO_FILTERS: TraceFilters = { group: null, model: null, failuresOnly: false };

export function filtersActive(filters: TraceFilters): boolean {
  return filters.group !== null || filters.model !== null || filters.failuresOnly;
}

export interface TreeRow {
  /** Node id, or `charge:<seq>` for a charge. */
  key: string;
  depth: number;
  node?: ActivityNodeView;
  charge?: TraceRecord;
  /** Running-total charges from one source, merged into one row. */
  updates?: ChargeUpdates;
  hasChildren: boolean;
  open: boolean;
  /** Shown only as the ancestor or child of a match. */
  dim: boolean;
}

export const chargeKey = (record: TraceRecord): string => `charge:${record.seq}`;

/**
 * Charges without per-call detail from one kind of source under one activity. Each one
 * is only the rise in a running total Sero read, such as a Room's spend, so
 * listing them one by one shows when Sero checked, not what the work did.
 */
export interface ChargeUpdates {
  nodeId: string;
  /** The kind of source, such as `room` or `dispatch:workflow`. */
  source: string;
  /** The distinct sources merged, such as two owner sessions. */
  sources: string[];
  records: TraceRecord[];
  costUsd: number;
  from: string;
  to: string;
}

const SPEND_WORD: [prefix: string, word: string][] = [
  ['owner', 'Owner spend'], ['room', 'Room spend'], ['dispatch:room', 'Room spend'],
  ['dispatch:workflow', 'Workflow spend'], ['capture', 'Capture spend'],
];
export const updatesLabel = (updates: ChargeUpdates): string =>
  SPEND_WORD.find(([kind]) => updates.source === kind)?.[1] ?? 'Spend';

/** `room:room_1` → `room`, `dispatch:workflow:loop_1` → `dispatch:workflow`. */
const sourceKind = (source: string): string => source.split(':').slice(0, source.startsWith('dispatch:') ? 2 : 1).join(':');

/**
 * A node's charges as rows: a per-call charge alone, and the running-total
 * charges of each kind of source merged into one row where there are several.
 */
function chargeRows(nodeId: string, own: readonly TraceRecord[]): { key: string; charge?: TraceRecord; updates?: ChargeUpdates }[] {
  const bySource = new Map<string, TraceRecord[]>();
  for (const record of own) {
    if (record.coverage === 'call') continue;
    const kind = sourceKind(record.source ?? '');
    bySource.set(kind, [...(bySource.get(kind) ?? []), record]);
  }
  const rows: { key: string; charge?: TraceRecord; updates?: ChargeUpdates }[] = [];
  for (const record of own) {
    const source = sourceKind(record.source ?? '');
    const group = record.coverage === 'call' ? undefined : bySource.get(source);
    if (!group || group.length === 1) { rows.push({ key: chargeKey(record), charge: record }); continue; }
    if (group[0] !== record) continue;
    rows.push({
      key: `updates:${nodeId}:${source}`,
      updates: { nodeId, source, sources: [...new Set(group.map((entry) => entry.source ?? ''))], records: group, costUsd: group.reduce((sum, entry) => sum + (entry.costUsd ?? 0), 0), from: group[0]!.at, to: group.at(-1)!.at },
    });
  }
  return rows;
}

const byStart = (a: ActivityNodeView, b: ActivityNodeView): number => {
  if (a.startAt === b.startAt) return a.label.localeCompare(b.label);
  if (a.startAt === null) return 1;
  if (b.startAt === null) return -1;
  return a.startAt < b.startAt ? -1 : 1;
};

export interface Tree {
  rows: TreeRow[];
  /** Node ids the filters matched. Every node when no filter is on. */
  matched: Set<string>;
  byId: Map<string, ActivityNodeView>;
}

export function buildTree(activity: ActivityView, records: readonly TraceRecord[], expanded: ReadonlySet<string>, filters: TraceFilters): Tree {
  const byId = new Map(activity.nodes.map((node) => [node.id, node]));
  const children = new Map<string | null, ActivityNodeView[]>();
  for (const node of activity.nodes) {
    // A parent the fold never reached is treated as absent, so its child still shows.
    const parent = node.parentId && byId.has(node.parentId) ? node.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), node]);
  }
  for (const list of children.values()) list.sort(byStart);
  const charges = new Map<string, TraceRecord[]>();
  for (const record of records) {
    if (record.kind !== 'usage' || !record.nodeId || !byId.has(record.nodeId)) continue;
    charges.set(record.nodeId, [...(charges.get(record.nodeId) ?? []), record]);
  }

  const active = filtersActive(filters);
  const matches = (node: ActivityNodeView): boolean =>
    (filters.group === null || node.group === filters.group)
    && (filters.model === null || node.model === filters.model)
    && (!filters.failuresOnly || node.state === 'failed');
  const matched = new Set(activity.nodes.filter((node) => !active || matches(node)).map((node) => node.id));
  // The ancestors of every match: kept and opened, so the match can be seen.
  const lineage = new Set<string>();
  if (active) {
    for (const id of matched) {
      for (let parent = byId.get(id)?.parentId ?? null; parent && byId.has(parent) && !lineage.has(parent); parent = byId.get(parent)?.parentId ?? null) {
        lineage.add(parent);
      }
    }
  }

  const rows: TreeRow[] = [];
  const walk = (parent: string | null, depth: number, insideMatch: boolean): void => {
    for (const node of children.get(parent) ?? []) {
      const isMatch = matched.has(node.id);
      if (active && !isMatch && !lineage.has(node.id) && !insideMatch) continue;
      const kids = children.get(node.id) ?? [];
      const own = charges.get(node.id) ?? [];
      const hasChildren = kids.length > 0 || own.length > 0;
      const open = hasChildren && (expanded.has(node.id) || (active && lineage.has(node.id)));
      rows.push({ key: node.id, depth, node, hasChildren, open, dim: active && !isMatch });
      if (!open) continue;
      walk(node.id, depth + 1, insideMatch || isMatch);
      // Charges follow the node's own operations, in the order they were charged.
      if (!active || isMatch || insideMatch) {
        for (const entry of chargeRows(node.id, own)) {
          rows.push({ ...entry, depth: depth + 1, hasChildren: false, open: false, dim: active && filters.model !== null && entry.charge?.model !== filters.model });
        }
      }
    }
  };
  walk(null, 0, false);
  return { rows, matched, byId };
}

/**
 * What the matched activity cost. A match inside another match is already in
 * that ancestor's inclusive cost, so only the outermost matches are added.
 */
export function matchedCost(tree: Tree): number {
  let total = 0;
  for (const id of tree.matched) {
    let covered = false;
    for (let parent = tree.byId.get(id)?.parentId ?? null; parent; parent = tree.byId.get(parent)?.parentId ?? null) {
      if (tree.matched.has(parent)) { covered = true; break; }
    }
    if (!covered) total += tree.byId.get(id)?.costUsd ?? 0;
  }
  return total;
}

/** The models the run's activity names, for the model filter. */
export function modelsOf(activity: ActivityView): string[] {
  return [...new Set(activity.nodes.map((node) => node.model).filter((model): model is string => typeof model === 'string'))].sort();
}

/** The row to select when nothing is: the costliest top-level activity. */
export function defaultSelection(activity: ActivityView): string | null {
  const roots = activity.nodes.filter((node) => node.parentId === null || !activity.nodes.some((other) => other.id === node.parentId));
  const best = [...roots].sort((a, b) => (b.costUsd ?? 0) - (a.costUsd ?? 0))[0];
  return best?.id ?? null;
}
