/* The run inspector: observed execution, conserved cost and honest unknowns. */

import { clockAt, dur, esc, icon, niceStep, num, stateChip, usd } from './format.js';
import { LIFETIME, RUNS, SHARED, longRun } from './data.js';
import * as agg from './aggregate.js';
import { COLORS, breakdownChart, cumulativeChart, lifetimeChart, tokenChart } from './charts.js';

const ROW = 28;
const VIEWPORT = 384;
let longCache = null;

export function newInspectorState() {
  return {
    scope: 'r-initial',
    selectedId: 'a-wf1-s3',
    expanded: new Set(['a-root', 'a-res', 'a-wf1', 'a-wf2', 'b-root', 'b-wf', 'x-root']),
    filters: { group: 'all', model: 'all', failures: false },
    win: null,
    scrollTop: 0,
    chartBy: 'activity',
    highlight: null,
    live: true,
    tick: 0,
  };
}

export function runsForScope() {
  return [...RUNS, longRun(300), longRun(1240)];
}

function runById(id) {
  if (id === 'r-long-small') return longRun(300);
  if (id === 'r-long') { if (!longCache) longCache = longRun(1240); return longCache; }
  return RUNS.find((r) => r.id === id) || null;
}

export function activeRun(state) {
  return state.scope === 'lifetime' ? null : runById(state.scope);
}

const sharedFor = (runId) => SHARED.filter((s) => s.runs.includes(runId));
// ── summary ────────────────────────────────────────────────────────────────
function totals(run) {
  const elapsed = agg.elapsedMinutes(run);
  const active = agg.activeMinutes(run);
  const waits = agg.waitMinutes(run);
  const cost = agg.costTotals(run);
  const shared = sharedFor(run.id).reduce((t, s) => t + s.cost, 0);
  const coverageText = { call: 'call detail', partial: 'partial', aggregate: 'aggregate only', unknown: 'unknown' }[cost.coverage];
  const cards = [
    ['Elapsed', elapsed === null ? 'unavailable' : dur(elapsed), elapsed === null ? 'not retained' : `${clockAt(run, 0)} → ${clockAt(run, elapsed)}`],
    ['Active (union)', dur(active), 'overlapping work counts once'],
    ['Waiting', waits.total === null ? 'unavailable' : dur(waits.total), [...waits.causes].map(([k, v]) => `${k} ${dur(v)}`).join(' · ') || 'no wait observed'],
    ['Attributable cost', usd(cost.attributable), `${coverageText}`],
    ['Linked shared', usd(shared), 'charged once in lifetime'],
    ['Unknown cost', cost.unknown === null ? 'unavailable' : `${cost.unknown} call(s)`, cost.unknown === null ? 'not retained' : 'unpriced or unobserved'],
  ];
  return cards.map(([k, v, n]) => `<div class="tot${v === 'unavailable' ? ' unknown' : ''}"><span class="k">${k}</span><span class="v">${v}</span><span class="n">${esc(n)}</span></div>`).join('');
}

function counterLine(run) {
  const c = agg.counters(run);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const items = [
    plural(c.agents, 'agent', 'agents'),
    plural(c.turns, 'turn', 'turns'),
    plural(c.requests, 'model request', 'model requests'),
    plural(c.tools, 'tool call', 'tool calls'),
    plural(c.retries, 'retry', 'retries'),
    plural(c.compactions, 'compaction', 'compactions'),
    plural(c.failures, 'failure', 'failures'),
  ];
  return `<div class="legend">${items.map((label) => `<span>${esc(label)}</span>`).join('')}</div>`;
}

// ── timeline ───────────────────────────────────────────────────────────────
function windowOf(run, state) {
  const total = agg.elapsedMinutes(run) || 1;
  const win = state.win || { from: 0, to: total };
  return { from: Math.max(0, win.from), to: Math.min(total, Math.max(win.to, win.from + 0.5)), total };
}

export function buildRows(run, state) {
  const vis = agg.computeVisibility(run, state.filters);
  const hidden = new Set();
  const rows = [];
  for (const entry of agg.flatten(run)) {
    const { span } = entry;
    if (span.parent !== null && hidden.has(span.parent)) { hidden.add(span.id); continue; }
    if (!vis.visible.has(span.id)) continue;
    rows.push(entry);
    const hasChildren = run.spans.some((s) => s.parent === span.id);
    if (hasChildren && !state.expanded.has(span.id)) hidden.add(span.id);
  }
  return { rows, match: vis.match };
}

function barGeom(span, run, win) {
  const end = agg.endOf(span, run);
  const span0 = win.to - win.from;
  const from = Math.max(span.start, win.from);
  const to = Math.min(end === null ? win.to : end, win.to);
  if (to <= win.from || from >= win.to) return null;
  return { left: ((from - win.from) / span0) * 100, width: Math.max(0.4, ((to - from) / span0) * 100) };
}

function ruler(win) {
  const span = win.to - win.from;
  const step = niceStep(span);
  const marks = [];
  for (let t = Math.ceil(win.from / step) * step; t <= win.to; t += step) {
    marks.push(`<i style="left:${(((t - win.from) / span) * 100).toFixed(2)}%"></i><span style="left:${(((t - win.from) / span) * 100).toFixed(2)}%">${dur(Math.round(t))}</span>`);
  }
  return `<div class="tl-ruler">${marks.join('')}</div>`;
}

function overview(run, win) {
  const root = run.spans.find((s) => s.parent === null);
  const direct = root ? run.spans.filter((s) => s.parent === root.id) : [];
  const bars = [];
  const waits = [];
  for (const span of direct) {
    const geom = barGeom(span, run, { from: 0, to: win.total });
    if (!geom) continue;
    if (span.span === 'wait') waits.push(`<span class="ov-bar" data-tab="1" data-state="waiting" style="left:${geom.left}%;width:${geom.width}%"></span>`);
    else bars.push(`<span class="ov-bar" data-state="${span.state}" style="left:${geom.left}%;width:${geom.width}%"></span>`);
  }
  const left = (win.from / win.total) * 100;
  const width = ((win.to - win.from) / win.total) * 100;
  return `<div class="overview">
    <div class="ov-strip" data-ov tabindex="0" role="slider" aria-label="Time range" aria-valuemin="0" aria-valuemax="${Math.round(win.total)}" aria-valuenow="${Math.round(win.from)}" aria-valuetext="Showing ${dur(win.from)} to ${dur(win.to)} of ${dur(win.total)}">
      ${bars.join('')}${waits.join('')}
      <span class="ov-win" data-ovwin style="left:${left}%;width:${width}%"><span class="h l" data-ovh="l"></span><span class="h r" data-ovh="r"></span></span>
    </div>
    <div class="ov-legend">
      <span>${icon('clock')}whole run ${dur(win.total)}</span>
      <span>drag the window · <kbd>←</kbd><kbd>→</kbd> pan · <kbd>Shift</kbd>+<kbd>←</kbd><kbd>→</kbd> zoom · <kbd>Home</kbd> reset</span>
      <button type="button" class="btn small" data-act="zoom-in" style="margin-left:auto">Zoom in</button>
      <button type="button" class="btn small" data-act="zoom-out">Zoom out</button>
      <button type="button" class="btn small" data-act="zoom-sel">Zoom to selection</button>
    </div>
  </div>`;
}

function rowHtml(entry, index, run, state, win, match) {
  const { span, depth } = entry;
  const end = agg.endOf(span, run);
  const children = run.spans.filter((s) => s.parent === span.id).length;
  const geom = barGeom(span, run, win);
  const hit = state.highlight && (
    (state.highlight.type === 'time' && geom && end !== null && span.start <= state.highlight.to && end >= state.highlight.from)
    || (state.highlight.type === 'group' && agg.groupOf(span, agg.indexOf(run)) === state.highlight.value)
  );
  const dim = state.filters.group !== 'all' || state.filters.model !== 'all' || state.filters.failures;
  const inclusive = agg.inclusiveCost(span.id, run);
  let costText = '';
  if (span.span !== 'structural') {
    if (span.charge) costText = usd(span.cost);
    else costText = inclusive > 0 ? usd(inclusive) : '—';
  }
  const unknownCost = costText === 'unavailable' || costText === '—';
  // A wait row needs no kind label: its own text already says it is waiting.
  const metaParts = [];
  if (span.span !== 'wait') {
    metaParts.push(span.kind);
    if (span.model) metaParts.push(span.model.split('/')[1]);
    if (span.thinking) metaParts.push(span.thinking);
  }
  const meta = metaParts.join(' · ');
  let barState = span.state;
  if (barState !== 'failed') {
    if (span.span === 'wait') barState = 'waiting';
    else if (span.kind === 'compaction') barState = 'compaction';
  }
  const open = state.expanded.has(span.id);
  const toggle = children
    ? `aria-expanded="${open}" aria-label="${open ? 'Collapse' : 'Expand'} ${esc(span.label)}"`
    : 'aria-hidden="true"';
  return `<div class="tl-row" role="treeitem" id="row-${esc(span.id)}" data-row="${esc(span.id)}" data-index="${index}"
      aria-level="${depth + 1}" aria-selected="${state.selectedId === span.id}"${children ? ` aria-expanded="${open}"` : ''}
      data-sel="${state.selectedId === span.id ? 1 : 0}" data-hit="${hit ? 1 : 0}" data-dim="${dim && !match.has(span.id) ? 1 : 0}"
      data-cat="${span.span === 'wait' ? 'waiting' : ''}" style="top:${index * ROW}px">
    <div class="tl-label" style="padding-left:${depth * 12}px">
      <button type="button" class="tl-tw" tabindex="-1" data-tw="${esc(span.id)}" data-leaf="${children ? 0 : 1}" ${toggle}>${icon('chevron-right')}</button>
      <span class="tl-st" data-state="${span.state}">${icon(stateIconName(span))}</span>
      <span class="lbl"><b>${esc(span.label)}</b>${meta ? `<em>${esc(meta)}</em>` : ''}</span>
    </div>
    <span class="tl-cost" data-unknown="${unknownCost ? 1 : 0}">${costText}</span>
    <div class="track">${geom && span.span !== 'structural' ? `<span class="bar" data-state="${barState}" data-open="${end === null ? 1 : 0}" style="left:${geom.left}%;width:${geom.width}%"></span>` : ''}</div>
  </div>`;
}

const stateIconName = (span) => (span.kind === 'compaction' ? 'compress' : span.retryOf ? 'refresh' : {
  ok: 'check', running: 'half', waiting: 'pause', failed: 'x', interrupted: 'square', stopped: 'square', unknown: 'question',
}[span.state] || 'question');

function timeline(run, state) {
  const win = windowOf(run, state);
  const { rows, match } = buildRows(run, state);
  const first = Math.max(0, Math.floor(state.scrollTop / ROW) - 4);
  const last = Math.min(rows.length, Math.ceil((state.scrollTop + VIEWPORT) / ROW) + 4);
  const slice = rows.slice(first, last).map((entry, i) => rowHtml(entry, first + i, run, state, win, match)).join('');
  const selectedRendered = state.selectedId && rows.slice(first, last).some((r) => r.span.id === state.selectedId);
  const empty = rows.length === 0 ? '<div class="tl-empty">No activity matches these filters.</div>' : '';
  return `<section class="panel">
    <div class="panel-head">Timeline<span class="n">${rows.length} of ${run.spans.length} activities</span></div>
    ${overview(run, win)}
    <div class="tl-head"><span>Activity</span><span style="text-align:right">Cost</span>${ruler(win)}</div>
    <div class="tl-scroll" data-tl data-focus="tl"${empty ? '' : ' tabindex="0"'} role="tree" aria-label="Execution timeline"${selectedRendered ? ` aria-activedescendant="row-${esc(state.selectedId)}"` : ''} style="height:${Math.min(VIEWPORT, Math.max(120, rows.length * ROW))}px">
      ${empty}
      <div class="tl-inner" style="height:${Math.max(rows.length * ROW, empty ? 0 : 40)}px">${slice}</div>
    </div>
    ${sharedRows(run)}
  </section>`;
}

function sharedRows(run) {
  const shared = sharedFor(run.id);
  if (!shared.length) return '';
  return `<div class="linked">${shared.map((s) => `<div class="linked-row"><span class="bar" data-shared="1"></span>
    ${icon('link')}<b>${esc(s.label)}</b><span>${esc(s.clock)} · ${usd(s.cost)} · linked, not attributed</span>
    <span style="margin-left:auto">${s.runs.map((id) => `<span class="kind">${esc(id)}</span>`).join(' ')}</span></div>`).join('')}
    <p style="font-size:11px;color:var(--text-2)">Charged once in lifetime totals. Neither run claims a guessed share.</p></div>`;
}

// ── detail panel ───────────────────────────────────────────────────────────
function detail(run, state) {
  const span = run.spans.find((s) => s.id === state.selectedId);
  if (!span) return `<aside class="panel detail"><div class="panel-head">Activity detail</div><div class="d-sec"><p class="note">Select an activity.</p></div></aside>`;
  const end = agg.endOf(span, run);
  const tokens_ = span.tokens ? agg.tokenTotals([span]) : null;
  const totalTokens = tokens_ ? Object.values(tokens_.total).reduce((a, b) => a + b, 0) : 0;
  const seg = (key, value) => (value ? `<i style="width:${(value / totalTokens) * 100}%;background:${COLORS[key]}" title="${key} ${num(value)}"></i>` : '');
  const shared = SHARED.find((s) => s.id === span.id);
  return `<aside class="panel detail">
    <div class="panel-head">${esc(span.label)} ${stateChip(span.state)}</div>
    <div class="d-sec">
      <div class="facts">
        <div class="fact"><span>Kind</span><b>${esc(span.kind)}</b></div>
        <div class="fact"><span>Time</span><b>${run.clockStart ? `${clockAt(run, span.start)} → ${end === null ? 'open' : clockAt(run, end)}` : 'unavailable'}</b></div>
        <div class="fact"><span>Duration</span><b>${end === null ? 'unknown, still open' : dur(end - span.start)}</b></div>
        <div class="fact"><span>Attributable</span><b>${span.charge ? usd(span.cost) : 'inclusive only'}</b></div>
        <div class="fact"><span>Inclusive</span><b>${usd(agg.inclusiveCost(span.id, run))}</b></div>
        <div class="fact"><span>Subtree active</span><b>${dur(agg.subtreeMinutes(span.id, run))}</b></div>
        <div class="fact"><span>Coverage</span><b>${esc(span.coverage)}</b></div>
        ${span.retryOf ? `<div class="fact"><span>Retry of</span><b>${esc(span.retryOf)}</b></div>` : ''}
      </div>
    </div>
    <div class="d-sec">
      <p class="d-label">Model</p>
      <div class="facts">
        <div class="fact"><span>Model</span><b>${span.model ? esc(span.model) : 'not a model call'}</b></div>
        <div class="fact"><span>Thinking</span><b>${span.thinking ? esc(span.thinking) : 'unavailable'}</b></div>
        <div class="fact"><span>Source</span><b>${span.source ? esc(span.source) : 'unavailable'}</b></div>
      </div>
    </div>
    <div class="d-sec">
      <p class="d-label">Tokens</p>
      ${span.tokens ? `<div class="tokbar">${seg('input', tokens_.total.input)}${seg('output', tokens_.total.output)}${seg('cacheRead', tokens_.total.cacheRead)}${seg('cacheWrite', tokens_.total.cacheWrite)}</div>
        <div class="facts" style="margin-top:8px">
          <div class="fact"><span><i class="sq" style="background:${COLORS.input}"></i> Input</span><b>${num(tokens_.total.input)}</b></div>
          <div class="fact"><span><i class="sq" style="background:${COLORS.output}"></i> Output</span><b>${num(tokens_.total.output)}</b></div>
          <div class="fact"><span><i class="sq" style="background:${COLORS.cacheRead}"></i> Cache read</span><b>${tokens_.seen.cacheRead ? num(tokens_.total.cacheRead) : 'unavailable'}</b></div>
          <div class="fact"><span><i class="sq" style="background:${COLORS.cacheWrite}"></i> Cache write</span><b>${tokens_.seen.cacheWrite ? num(tokens_.total.cacheWrite) : 'unavailable'}</b></div>
          <div class="fact"><span>Reasoning (optional)</span><b>${tokens_.seen.reasoning ? num(tokens_.total.reasoning) : 'unavailable'}</b></div>
        </div>`
      : `<p class="note">No token measurements were retained for this activity. The value is unknown, not zero.</p>`}
    </div>
    ${span.note ? `<div class="d-sec"><p class="d-label">Note</p><p class="note">${esc(span.note)}</p></div>` : ''}
    <div class="d-sec">
      <p class="d-label">References</p>
      ${(span.refs.length ? span.refs : [{ label: 'session · ' + (run.id) + '-' + span.id.slice(-6), stale: false }])
        .map((r) => `<span class="ref${r.stale ? ' stale' : ''}">${icon('external')}${esc(r.label)}${r.stale ? ` <small>${esc(r.note || 'reference was pruned')}</small>` : ''}</span>`).join('')}
      <p style="font-size:11px;color:var(--text-2)">Opening a reference obeys the existing project and profile access checks.</p>
    </div>
    ${shared ? `<div class="d-sec"><p class="d-label">Shared</p><p class="note">${esc(shared.note)}</p></div>` : ''}
  </aside>`;
}

// ── lifetime ───────────────────────────────────────────────────────────────
function lifetimeTable() {
  const rows = RUNS.concat([]).map((run) => {
    const cost = agg.costTotals(run);
    const shared = sharedFor(run.id).reduce((t, s) => t + s.cost, 0);
    const incomplete = run.spans.length === 0;
    return `<tr>
      <td>${esc(run.label)}${incomplete ? ' <span class="pill warn">incomplete history</span>' : ''}</td>
      <td><b class="mono">${usd(cost.attributable)}</b></td>
      <td><b class="mono">${usd(shared)}</b></td>
      <td><b class="mono">${incomplete ? 'unavailable' : dur(agg.activeMinutes(run))}</b></td>
      <td>${esc(run.outcome)}</td>
      <td><button type="button" class="btn small" data-act="open-run" data-run="${run.id}">Open</button></td>
    </tr>`;
  }).join('');
  const unassigned = LIFETIME.unassigned;
  return `<section class="panel">
    <div class="panel-head">Runs</div>
    <div style="padding:4px 12px 12px">
      <table class="tiers"><thead><tr><th>Run</th><th>Attributable</th><th>Linked shared</th><th>Active</th><th>Outcome</th><th></th></tr></thead>
        <tbody>${rows}
          <tr><td>Unassigned project overhead <span class="pill plain">aggregate only</span></td><td><b class="mono">${usd(unassigned.cost)}</b></td><td><b class="mono">—</b></td><td><b class="mono">unavailable</b></td><td colspan="2">${esc(unassigned.note)}</td></tr>
        </tbody>
      </table>
    </div>
  </section>`;
}

// ── view ───────────────────────────────────────────────────────────────────
export function renderInspector(state) {
  const run = activeRun(state);
  const scopeOptions = `<option value="lifetime"${state.scope === 'lifetime' ? ' selected' : ''}>Project lifetime</option>`
    + RUNS.map((r) => `<option value="${r.id}"${state.scope === r.id ? ' selected' : ''}>${esc(r.label)}</option>`).join('')
    + `<option value="r-long-small"${state.scope === 'r-long-small' ? ' selected' : ''}>Long run · 300 activities (synthetic)</option>`
    + `<option value="r-long"${state.scope === 'r-long' ? ' selected' : ''}>Long run · 1,240 activities (synthetic)</option>`;
  const head = `<div class="insp-top">
    <button type="button" class="btn small" data-act="project">${icon('chevrons-left')}Project</button>
    <div class="crumb">${icon('chevron-right')}<span class="leaf">Run metrics · Hollow Depths</span></div>
    <div class="top-actions">
      <div class="scope"><label class="kind" for="scope">Scope</label><select id="scope" data-act="scope">${scopeOptions}</select></div>
      ${run && run.live ? `<button type="button" class="btn small" data-act="live" aria-pressed="${state.live}">${icon('half')}${state.live ? 'Live' : 'Paused'}</button>` : ''}
    </div>
  </div>`;

  if (!run) {
    const shared = SHARED.reduce((t, s) => t + s.cost, 0);
    return `${head}
    <div class="insp-body">
      <div class="totals">
        <div class="tot"><span class="k">Lifetime attributable</span><span class="v">${usd(RUNS.reduce((t, r) => t + agg.costTotals(r).attributable, 0))}</span><span class="n">priced, retained activity</span></div>
        <div class="tot"><span class="k">Linked shared</span><span class="v">${usd(shared)}</span><span class="n">counted once</span></div>
        <div class="tot"><span class="k">Unassigned</span><span class="v">${usd(LIFETIME.unassigned.cost)}</span><span class="n">aggregate only</span></div>
        <div class="tot"><span class="k">Runs</span><span class="v">${RUNS.length}</span><span class="n">1 with incomplete history</span></div>
        <div class="tot"><span class="k">Requests</span><span class="v">${RUNS.reduce((t, r) => t + agg.counters(r).requests, 0)}</span><span class="n">retained call detail</span></div>
        <div class="tot"><span class="k">Waits</span><span class="v">${dur(RUNS.reduce((t, r) => t + (agg.waitMinutes(r).total || 0), 0))}</span><span class="n">observed causes only</span></div>
      </div>
      ${lifetimeTable()}
      ${lifetimeChart()}
    </div>`;
  }

  const cost = agg.costTotals(run);
  const { match } = buildRows(run, state);
  const filtersOn = state.filters.group !== 'all' || state.filters.model !== 'all' || state.filters.failures;
  const scopeNote = filtersOn
    ? `Showing <b>${match.size}</b> of ${run.spans.length} activities · filtered <b>${usd(agg.scopeCost(run, match))}</b> · full run <b>${usd(cost.attributable)}</b>`
    : `Full run · <b>${usd(cost.attributable)}</b> attributable`;
  const chips = ['all', ...agg.GROUPS].map((g) => `<button type="button" data-act="filter-group" data-group="${g}" class="${state.filters.group === g ? 'active' : ''}">${g === 'all' ? 'All activity' : g}</button>`).join('');
  const models = [...new Set(run.spans.map((s) => s.model).filter(Boolean))];
  const liveTick = state.tick;

  return `${head}
  <div class="insp-body" data-tick="${liveTick}">
    <div class="totals">${totals(run)}</div>
    ${counterLine(run)}
    <div class="tools">
      <div class="chips" role="group" aria-label="Activity filter">${chips}</div>
      <select data-act="filter-model" aria-label="Model filter">
        <option value="all">All models</option>
        ${models.map((m) => `<option value="${esc(m)}"${state.filters.model === m ? ' selected' : ''}>${esc(m)}</option>`).join('')}
      </select>
      <button type="button" class="btn small" data-act="filter-failures" aria-pressed="${state.filters.failures}">${icon('alert')}Failures only</button>
      ${state.highlight ? '<button type="button" class="btn small" data-act="clear-highlight">Clear highlight</button>' : ''}
      <span class="scope-note">${scopeNote}</span>
    </div>
    <div class="insp-main">
      ${timeline(run, state)}
      ${detail(run, state)}
    </div>
    <div class="charts">
      ${cumulativeChart(run)}
      ${breakdownChart(run, state)}
      ${tokenChart(run)}
    </div>
    <div class="legend">
      <span><button type="button" class="btn small" data-act="chart-by">${icon('layers')}Breakdown by ${state.chartBy === 'activity' ? 'activity' : 'model'}</button></span>
      <span>${icon('check')}done</span><span>${icon('half')}running</span><span>${icon('pause')}waiting</span>
      <span>${icon('x')}failed</span><span>${icon('question')}unknown</span><span>${icon('compress')}compaction</span><span>${icon('refresh')}retry</span>
      <span style="margin-left:auto">${esc(run.note)}</span>
    </div>
  </div>`;
}

/** Keep the selected activity inside the rendered window after a deliberate move. */
export function ensureSelectedVisible(state) {
  const run = activeRun(state);
  if (!run) return;
  const { rows } = buildRows(run, state);
  const index = rows.findIndex((r) => r.span.id === state.selectedId);
  if (index < 0) return;
  const top = index * ROW;
  if (top < state.scrollTop) state.scrollTop = Math.max(0, top - ROW);
  else if (top + ROW > state.scrollTop + VIEWPORT) state.scrollTop = top + ROW - VIEWPORT;
}

/** Keyboard tree navigation. Keeps selection and expansion across live updates. */
export function timelineKey(state, event) {
  const run = activeRun(state);
  if (!run) return false;
  const { rows } = buildRows(run, state);
  const index = rows.findIndex((r) => r.span.id === state.selectedId);
  const current = rows[index];
  const key = event.key;
  const moveTo = (next) => {
    const target = rows[Math.max(0, Math.min(rows.length - 1, next))];
    if (!target) return;
    state.selectedId = target.span.id;
    const top = (next - 2) * ROW;
    if (top < state.scrollTop) state.scrollTop = Math.max(0, top);
    if ((next + 1) * ROW > state.scrollTop + VIEWPORT) state.scrollTop = (next + 1) * ROW - VIEWPORT;
  };
  if (key === 'ArrowDown') { moveTo(index + 1); return true; }
  if (key === 'ArrowUp') { moveTo(index - 1); return true; }
  if (key === 'Home') { moveTo(0); return true; }
  if (key === 'End') { moveTo(rows.length - 1); return true; }
  if (!current) return false;
  const hasChildren = run.spans.some((s) => s.parent === current.span.id);
  if (key === 'ArrowRight') {
    if (hasChildren && !state.expanded.has(current.span.id)) state.expanded.add(current.span.id);
    else if (hasChildren) moveTo(index + 1);
    return true;
  }
  if (key === 'ArrowLeft') {
    if (state.expanded.has(current.span.id)) state.expanded.delete(current.span.id);
    else if (current.span.parent) state.selectedId = current.span.parent;
    return true;
  }
  if (key === 'Enter' || key === ' ') {
    if (hasChildren) {
      if (state.expanded.has(current.span.id)) state.expanded.delete(current.span.id);
      else state.expanded.add(current.span.id);
    }
    return true;
  }
  return false;
}

export { ROW, VIEWPORT };
