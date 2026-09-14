/* Charts. Totals conserve reported usage: parent inclusive costs are never
   added again to their children, and an unavailable measurement stays a word. */

import { dur, icon, esc, num, tokens, usd } from './format.js';
import { LIFETIME, RUNS, SHARED } from './data.js';
import * as agg from './aggregate.js';

export const COLORS = { input: '#3b82f6', output: '#34d399', cacheRead: '#c4b5fd', cacheWrite: '#f59e0b' };

export function chartShell(title, note, body) {
  return `<section class="panel chart"><div class="chart-title">${title}${note ? `<span class="n">${note}</span>` : ''}</div>${body}</section>`;
}

const shorten = (text) => (text.length > 18 ? text.slice(0, 17) + '…' : text);

export function cumulativeChart(run) {
  const points = agg.cumulative(run, 4);
  if (!points) return chartShell('Cumulative spend', 'unavailable', '<p class="note">This run has no retained timing, so spend cannot be placed on a time axis.</p>');
  const maxX = points[points.length - 1][0] || 1;
  const total = agg.costTotals(run).attributable;
  const shared = SHARED.filter((s) => s.runs.includes(run.id)).reduce((t, s) => t + s.cost, 0);
  const maxY = (total + shared) || 1;
  const x = (v) => (v / maxX) * 300 + 8;
  const y = (v) => 96 - (v / maxY) * 82;
  const line = points.map(([t, v], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const ticks = [0, maxY / 2, maxY].map((v) => `<line class="gl" x1="8" y1="${y(v).toFixed(1)}" x2="308" y2="${y(v).toFixed(1)}"/><text x="2" y="${(y(v) + 3).toFixed(1)}">$${v.toFixed(2)}</text>`).join('');
  const hit = points.slice(0, -1).map(([t], i) => {
    const width = 300 / (points.length - 1);
    return `<rect class="hit" data-time="${t}" data-time-end="${points[i + 1][0]}" x="${x(t).toFixed(1)}" y="10" width="${width.toFixed(1)}" height="86" fill="transparent"/>`;
  }).join('');
  return chartShell('Cumulative spend', usd(total), `<svg viewBox="0 0 316 118" role="img" aria-label="Cumulative spend over run time">
      ${ticks}<line class="axis" x1="8" y1="96" x2="308" y2="96"/>
      <path class="area" d="${line} L${x(maxX).toFixed(1)} 96 L8 96 Z"/><path class="line" d="${line}"/>
      ${shared ? `<path class="shared" d="M8 ${y(shared).toFixed(1)} L308 ${y(shared).toFixed(1)}"/>` : ''}
      <text x="8" y="112">${dur(0)}</text><text x="280" y="112">${dur(maxX)}</text>
      ${hit}
    </svg>
    <div class="chart-foot"><span>${icon('clock')}Click a time band to highlight activities</span>${shared ? `<span><span class="sq" style="background:var(--violet)"></span>linked shared ${usd(shared)} not time-positioned</span>` : ''}</div>`);
}

export function breakdownChart(run, state) {
  const rows = agg.breakdown(run, state.chartBy);
  if (!rows.length) return chartShell(`Cost by ${state.chartBy}`, '', '<p class="note">No priced activity was retained.</p>');
  const shown = rows.slice(0, 7);
  const max = Math.max(...shown.map((r) => r.cost)) || 1;
  const type = state.chartBy === 'model' ? 'model' : 'group';
  const body = shown.map((row, i) => {
    const on = state.highlight && state.highlight.type === type && state.highlight.value === row.key;
    return `<g class="hit" transform="translate(0 ${i * 16})" data-grp="${esc(row.key)}" data-grp-type="${type}">
      <rect x="0" y="0" width="316" height="15" fill="transparent"/>
      <text x="0" y="10">${esc(shorten(row.key))}</text>
      <rect class="gbar" data-on="${on ? 1 : 0}" x="118" y="2" width="${((row.cost / max) * 148).toFixed(1)}" height="9" rx="2"/>
      <text x="272" y="10">${usd(row.cost)}</text>
    </g>`;
  }).join('');
  return chartShell(`Cost by ${state.chartBy}`, '', `<svg viewBox="0 0 316 ${shown.length * 16}" role="img" aria-label="Cost by ${state.chartBy}">${body}</svg>
    <div class="chart-foot"><span>${icon('layers')}Click a bar to highlight matching activities. Parent cost is inclusive; children are not added again.</span></div>`);
}

export function tokenChart(run) {
  const byId = agg.indexOf(run);
  const groups = new Map();
  for (const s of run.spans) {
    if (!s.tokens) continue;
    const key = agg.groupOf(s, byId);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  if (!groups.size) return chartShell('Token composition', '', '<p class="note">No token measurements were retained for this run.</p>');
  const rows = [...groups.entries()].slice(0, 5).map(([key, spans]) => {
    const t = agg.tokenTotals(spans);
    const sum = t.total.input + t.total.output + t.total.cacheRead + t.total.cacheWrite || 1;
    return { key, t, sum };
  });
  const max = Math.max(...rows.map((r) => r.sum));
  const svg = rows.map((r, i) => {
    let x = 74;
    const segs = [['input', r.t.total.input], ['output', r.t.total.output], ['cacheRead', r.t.total.cacheRead], ['cacheWrite', r.t.total.cacheWrite]]
      .filter(([, value]) => value)
      .map(([key, value]) => {
        const width = (value / max) * 170;
        const el = `<rect class="seg" x="${x.toFixed(1)}" y="0" width="${width.toFixed(1)}" height="9" fill="${COLORS[key]}"><title>${key} ${num(value)}</title></rect>`;
        x += width;
        return el;
      }).join('');
    return `<g transform="translate(0 ${i * 16})">
      <text x="0" y="9">${esc(shorten(r.key))}</text>${segs}
      <text x="252" y="9">${tokens(r.sum)}</text>
      ${r.t.cacheSplitAvailable ? '' : '<text x="286" y="9" fill="#a1a1aa">split ?</text>'}
    </g>`;
  }).join('');
  const missing = rows.filter((r) => !r.t.cacheSplitAvailable).length;
  return chartShell('Token composition', '', `<svg viewBox="0 0 316 ${rows.length * 16}" role="img" aria-label="Token composition by activity">${svg}</svg>
    <div class="chart-foot">
      <span><i class="sq" style="background:${COLORS.input}"></i> input <i class="sq" style="background:${COLORS.output}"></i> output <i class="sq" style="background:${COLORS.cacheRead}"></i> cache read <i class="sq" style="background:${COLORS.cacheWrite}"></i> cache write</span>
      ${missing ? `<span>${missing} group(s) have no cache split · unavailable, not zero</span>` : ''}
    </div>`);
}

export function lifetimeChart() {
  const { points, bounds } = agg.cumulativeLifetime(RUNS);
  const totalsAll = RUNS.reduce((t, r) => t + agg.costTotals(r).attributable, 0) + LIFETIME.unassigned.cost;
  const maxX = points[points.length - 1][0] || 1;
  const maxY = totalsAll || 1;
  const x = (v) => (v / maxX) * 300 + 8;
  const y = (v) => 96 - (v / maxY) * 82;
  const line = points.map(([t, v], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  return chartShell('Cumulative spend across runs', usd(totalsAll), `<svg viewBox="0 0 316 118" role="img" aria-label="Cumulative spend across runs">
      <line class="axis" x1="8" y1="96" x2="308" y2="96"/>
      <path class="area" d="${line} L${x(maxX).toFixed(1)} 96 L8 96 Z"/><path class="line" d="${line}"/>
      ${bounds.slice(1).map((b) => `<line class="gl" x1="${x(b.from).toFixed(1)}" y1="12" x2="${x(b.from).toFixed(1)}" y2="96"/>`).join('')}
      <text x="8" y="112">0h</text><text x="276" y="112">${dur(maxX)}</text>
    </svg>
    <div class="chart-foot"><span>Runs have separate time origins. The axis is run order, not one wall clock.</span><span>Unassigned overhead ${usd(LIFETIME.unassigned.cost)} is not placed on this line.</span></div>`);
}
