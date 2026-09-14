/* Aggregation rules from the change design:
   - one charging path; a span is charged only when charge === true
   - active run time is the union of observed active intervals, never a sum of parallel work
   - unknown values stay unknown; they are never zero */

export const GROUPS = ['Owner', 'Research', 'Planning', 'Rooms', 'Workflows', 'Evaluation', 'Repair', 'Waits', 'Unassigned'];

const GROUP_OF_KIND = {
  owner: 'Owner', research: 'Research', planning: 'Planning', room: 'Rooms', member: 'Rooms',
  workflow: 'Workflows', step: 'Workflows', review: 'Evaluation', repair: 'Repair', wait: 'Waits',
  run: null, request: null, tool: null, compaction: null, delivery: null,
};

/** Leaf kinds carry no activity of their own: they resolve from their ancestors. */
const LEAF_KINDS = new Set(['request', 'tool', 'compaction']);

export function endOf(span, run) {
  if (span.end !== null && span.end !== undefined) return span.end;
  return run.now;
}

export function isActive(span, end) {
  if (span.span !== 'active') return false;
  return end !== null && end !== undefined;
}

const flatCache = new WeakMap();

/** Flatten with depth and parent links. Children keep source order. Cached per run revision. */
export function flatten(run) {
  const hit = flatCache.get(run);
  if (hit && hit.n === run.spans.length) return hit.rows;
  const byParent = new Map();
  for (const s of run.spans) {
    if (s.parent === null) continue;
    if (!byParent.has(s.parent)) byParent.set(s.parent, []);
    byParent.get(s.parent).push(s);
  }
  const out = [];
  const walk = (span, depth) => {
    out.push({ span, depth });
    for (const child of byParent.get(span.id) || []) walk(child, depth + 1);
  };
  for (const root of run.spans.filter((s) => s.parent === null)) walk(root, 0);
  flatCache.set(run, { n: run.spans.length, rows: out });
  return out;
}

export function indexOf(run) {
  return new Map(run.spans.map((s) => [s.id, s]));
}

function ancestorKinds(span, byId) {
  const kinds = [];
  let cur = span.parent ? byId.get(span.parent) : null;
  let guard = 0;
  while (cur && guard < 32) { kinds.push(cur.kind); cur = cur.parent ? byId.get(cur.parent) : null; guard += 1; }
  return kinds;
}

export function groupOf(span, byId) {
  if (span.kind === 'wait') return 'Waits';
  if (span.kind === 'run') return 'Unassigned';
  const chain = ancestorKinds(span, byId);
  if (!LEAF_KINDS.has(span.kind)) chain.unshift(span.kind);
  for (const kind of chain) {
    const group = GROUP_OF_KIND[kind];
    if (group) return group;
  }
  return 'Unassigned';
}

function merge(intervals) {
  const sorted = intervals.slice().sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [start, end] of sorted) {
    const last = out[out.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else out.push([start, end]);
  }
  return out;
}

/** Union of observed active intervals. Two workers over ten minutes give ten. */
export function activeIntervals(run) {
  const intervals = [];
  for (const s of run.spans) {
    if (s.span !== 'active') continue;
    const end = endOf(s, run);
    if (end === null || end === undefined) continue;
    if (end <= s.start) continue;
    intervals.push([s.start, end]);
  }
  return merge(intervals);
}

export function activeMinutes(run) {
  return activeIntervals(run).reduce((total, [a, b]) => total + (b - a), 0);
}

/** Summed worker-unit durations. Parallel work is counted more than once by design. */
export function workerMinutes(run) {
  const units = new Set(['step', 'review', 'repair', 'member', 'research']);
  return run.spans.reduce((total, s) => {
    if (!units.has(s.kind)) return total;
    const end = endOf(s, run);
    return total + (end === null ? 0 : Math.max(0, end - s.start));
  }, 0);
}

export function elapsedMinutes(run) {
  if (run.now === null || run.now === undefined) return null;
  return run.now;
}

export function waitMinutes(run) {
  const causes = new Map();
  let total = 0;
  let known = false;
  for (const s of run.spans) {
    if (s.span !== 'wait') continue;
    const end = endOf(s, run);
    if (end === null) continue;
    known = true;
    const minutes = end - s.start;
    total += minutes;
    const key = s.waitFor || 'unobserved';
    causes.set(key, (causes.get(key) || 0) + minutes);
  }
  return { total: known ? total : null, causes };
}

export function tokenTotals(spans) {
  const total = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 };
  const seen = { input: false, output: false, cacheRead: false, cacheWrite: false, reasoning: false };
  for (const s of spans) {
    if (!s.tokens) continue;
    for (const key of Object.keys(total)) {
      if (s.tokens[key] === null || s.tokens[key] === undefined) continue;
      total[key] += s.tokens[key];
      seen[key] = true;
    }
  }
  return { total, seen, cacheSplitAvailable: seen.cacheRead || seen.cacheWrite };
}

export function counters(run) {
  const count = (kind) => run.spans.filter((s) => s.kind === kind).length;
  return {
    agents: count('owner') + count('research') + count('workflow') + count('member') + count('room'),
    turns: count('owner') + count('research') + count('review') + count('repair'),
    requests: count('request'),
    tools: count('tool'),
    retries: run.spans.filter((s) => s.retryOf).length,
    compactions: count('compaction'),
    failures: run.spans.filter((s) => s.state === 'failed').length,
  };
}

export function costTotals(run) {
  const charged = run.spans.filter((s) => s.charge && s.cost !== null);
  if (run.spans.length === 0 && run.summary) {
    return { attributable: run.summary.cost, calls: null, aggregate: run.summary.cost, unknown: null, coverage: run.summary.coverage, charged: [] };
  }
  const attributable = charged.reduce((total, s) => total + s.cost, 0);
  const aggregate = charged.filter((s) => s.coverage === 'aggregate').reduce((total, s) => total + s.cost, 0);
  const unknown = run.spans.filter((s) => s.charge && s.cost === null).length
    + run.spans.filter((s) => s.span === 'active' && s.kind === 'request' && !s.charge).length;
  const coverage = aggregate > 0 ? (aggregate >= attributable - 1e-9 ? 'aggregate' : 'partial') : 'call';
  return { attributable, aggregate, unknown, coverage, charged };
}

/** Inclusive cost for one span, for inspection only. Never added again to its children. */
export function inclusiveCost(id, run) {
  const byId = indexOf(run);
  const children = new Map();
  for (const s of run.spans) {
    if (!children.has(s.parent)) children.set(s.parent, []);
    children.get(s.parent).push(s);
  }
  const walk = (spanId) => {
    const span = byId.get(spanId);
    if (!span) return 0;
    let total = span.charge && span.cost !== null ? span.cost : 0;
    for (const child of children.get(spanId) || []) total += walk(child.id);
    return total;
  };
  return walk(id);
}

export function subtreeMinutes(id, run) {
  const children = new Map();
  for (const s of run.spans) {
    if (!children.has(s.parent)) children.set(s.parent, []);
    children.get(s.parent).push(s);
  }
  const byId = indexOf(run);
  const walk = (spanId) => {
    const span = byId.get(spanId);
    if (!span) return 0;
    let total = 0;
    for (const child of children.get(spanId) || []) total += walk(child.id);
    const end = endOf(span, run);
    if (end !== null && span.span === 'active') total += Math.max(0, end - span.start);
    return total;
  };
  return walk(id);
}

export function breakdown(run, by) {
  const byId = indexOf(run);
  const rows = new Map();
  for (const s of run.spans) {
    if (!s.charge || s.cost === null) continue;
    const key = by === 'model' ? (s.model || 'unattributed') : groupOf(s, byId);
    if (!rows.has(key)) rows.set(key, { key, cost: 0, count: 0, aggregate: false });
    const row = rows.get(key);
    row.cost += s.cost;
    row.count += 1;
    if (s.coverage === 'aggregate') row.aggregate = true;
  }
  return [...rows.values()].sort((a, b) => b.cost - a.cost);
}

export function cumulative(run, step = 4) {
  const total = elapsedMinutes(run);
  if (total === null) return null;
  const charged = run.spans.filter((s) => s.charge && s.cost !== null);
  const points = [];
  for (let t = 0; t <= total; t += step) {
    const value = charged.reduce((sum, s) => sum + (endOf(s, run) <= t ? s.cost : 0), 0);
    points.push([t, value]);
  }
  return points;
}

export function cumulativeLifetime(runs) {
  const points = [];
  const bounds = [];
  let offset = 0;
  let carried = 0;
  for (const run of runs) {
    const total = elapsedMinutes(run) || 0;
    bounds.push({ id: run.id, label: run.label, from: offset, to: offset + total });
    const charged = run.spans.filter((s) => s.charge && s.cost !== null);
    for (let t = 0; t <= total; t += 4) {
      const inside = charged.reduce((acc, s) => acc + (endOf(s, run) <= t ? s.cost : 0), 0);
      points.push([offset + t, carried + inside]);
    }
    carried += costTotals(run).attributable;
    offset += total;
  }
  return { points, bounds, total: offset };
}

/** Filters: a row stays visible when it matches or has a matching descendant. */
export function computeVisibility(run, filters) {
  const key = `${run.id}:${run.spans.length}:${filters.group}:${filters.model}:${filters.failures}`;
  const hit = visCache.get(key);
  if (hit) return hit;
  const result = computeVisibilityUncached(run, filters);
  if (visCache.size > 24) visCache.clear();
  visCache.set(key, result);
  return result;
}

const visCache = new Map();

function computeVisibilityUncached(run, filters) {
  const byId = indexOf(run);
  const flat = flatten(run);
  const match = new Set();
  for (const { span } of flat) {
    if (filters.group !== 'all' && groupOf(span, byId) !== filters.group) continue;
    if (filters.failures && span.state !== 'failed') continue;
    if (filters.model !== 'all' && span.model !== filters.model) continue;
    match.add(span.id);
  }
  const visible = new Set(match);
  for (const id of match) {
    let cur = byId.get(id);
    let guard = 0;
    while (cur && cur.parent && guard < 32) { visible.add(cur.parent); cur = byId.get(cur.parent); guard += 1; }
  }
  const returning = new Set(visible);
  for (const { span } of flat) if (returning.has(span.id)) for (const child of run.spans.filter((s) => s.parent === span.id)) returning.add(child.id);
  return { visible, match };
}

/** Charged cost whose own row or an ancestor row is inside the given id set. */
export function scopeCost(run, ids) {
  const byId = indexOf(run);
  return run.spans.reduce((total, s) => {
    if (!s.charge || s.cost === null) return total;
    if (ids === null) return total + s.cost;
    let cur = s;
    let guard = 0;
    while (cur && guard < 32) {
      if (ids.has(cur.id)) return total + s.cost;
      cur = cur.parent ? byId.get(cur.parent) : null;
      guard += 1;
    }
    return total;
  }, 0);
}
