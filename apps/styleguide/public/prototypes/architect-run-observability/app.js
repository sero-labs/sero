/* Prototype shell: view routing, the project menu, the model tiers, the inspector. */

import { esc } from './format.js';
import { RUNS } from './data.js';
import * as agg from './aggregate.js';
import { renderProject } from './project.js';
import { changeTier, clearTier, discardModels, modelPending, newModelState, renderModels, saveModels } from './models.js';
import { activeRun, ensureSelectedVisible, newInspectorState, renderInspector, timelineKey, VIEWPORT } from './inspector.js';

const VIEWS = [
  ['project', 'Project menu'],
  ['models', 'Model tiers'],
  ['inspector', 'Run inspector'],
];

const NOTES = {
  project: '<b>Check:</b> the project controls menu now carries <b>Models…</b> and <b>Run metrics…</b>. The page itself stays quiet: no event log and no metric charts were added. Open the menu with the ⋯ button any time.',
  models: '<b>Check:</b> LOW and HIGH inherit the global selection, MED is a project override, and one change is <b>pending</b>. The owner row shows the environment pin and its real model, so it never claims to use MED. Choose the unavailable local model to see an actionable refusal with no silent provider switch. Save and check which dispatches keep their earlier revision.',
  inspector: '<b>Check:</b> expand the tree with the mouse and the keyboard, drag the window on the strip above the ruler, filter by activity, model or failures, and click a chart band or bar. The selected activity stays open while new observations arrive. Costs are conserved: parent inclusive totals are never added again to their children.',
};

const state = {
  view: 'project',
  menuOpen: true,
  notice: null,
  models: newModelState(),
  insp: newInspectorState(),
};

const app = document.getElementById('app');
const note = document.getElementById('review-note');
const status = document.getElementById('status') || null;

// ── rendering ──────────────────────────────────────────────────────────────
function bodyFor() {
  if (state.view === 'models') return renderModels(state.models);
  if (state.view === 'inspector') return renderInspector(state.insp);
  return renderProject(state);
}

function focusKey() {
  const el = document.activeElement;
  return el && el.dataset ? el.dataset.focus || null : null;
}

/** Parse our own static template strings without an innerHTML assignment. */
function setHtml(el, html) {
  el.replaceChildren(document.createRange().createContextualFragment(html));
}

function render() {
  const keep = focusKey();
  setHtml(app, bodyFor());
  setHtml(note, NOTES[state.view]);
  if (status) status.textContent = '';
  const scroller = app.querySelector('[data-tl]');
  if (scroller) {
    scroller.scrollTop = state.insp.scrollTop;
    scroller.addEventListener('scroll', () => {
      state.insp.scrollTop = scroller.scrollTop;
      if (scrollFrame) return;
      scrollFrame = requestAnimationFrame(() => { scrollFrame = null; render(); });
    }, { passive: true });
  }
  if (keep) {
    const next = app.querySelector(`[data-focus="${keep}"]`);
    if (next) next.focus();
  }
  document.querySelectorAll('#view-controls button').forEach((b) => b.classList.toggle('active', b.dataset.view === state.view));
}

// ── inspector helpers ──────────────────────────────────────────────────────
function currentWindow(run) {
  const total = agg.elapsedMinutes(run) || 1;
  return state.insp.win || { from: 0, to: total };
}

function setWindow(run, from, to) {
  const total = agg.elapsedMinutes(run) || 1;
  const width = Math.max(0.5, Math.min(total, to - from));
  const start = Math.max(0, Math.min(from, total - width));
  state.insp.win = start <= 0 && start + width >= total - 1e-6 ? null : { from: start, to: start + width };
}

/** Scale the window around its centre. factor < 1 zooms in. */
function zoomBy(run, factor) {
  const total = agg.elapsedMinutes(run) || 1;
  const win = currentWindow(run);
  const centre = (win.from + win.to) / 2;
  const width = Math.max(total / 200, (win.to - win.from) * factor);
  setWindow(run, centre - width / 2, centre + width / 2);
}

// ── interactions ───────────────────────────────────────────────────────────
app.addEventListener('click', (event) => {
  const toggle = event.target.closest('[data-tw]');
  if (toggle) {
    const id = toggle.dataset.tw;
    if (state.insp.expanded.has(id)) state.insp.expanded.delete(id);
    else state.insp.expanded.add(id);
    ensureSelectedVisible(state.insp);
    render();
    return;
  }
  const row = event.target.closest('[data-row]');
  if (row && !event.target.closest('[data-act]')) {
    state.insp.selectedId = row.dataset.row;
    ensureSelectedVisible(state.insp);
    render();
    return;
  }
  const el = event.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const insp = state.insp;
  if (act === 'menu') { state.menuOpen = !state.menuOpen; render(); return; }
  if (act === 'models' || act === 'metrics' || act === 'project') {
    state.view = { models: 'models', metrics: 'inspector', project: 'project' }[act];
    state.menuOpen = false;
    state.notice = null;
    render();
    return;
  }
  if (act === 'noop') { state.menuOpen = false; render(); return; }
  if (act === 'clear-tier') { clearTier(state.models, el.dataset.tier); render(); return; }
  if (act === 'save-models') {
    saveModels(state.models);
    state.notice = state.models.notice;
    render();
    return;
  }
  if (act === 'discard-models') {
    discardModels(state.models);
    render();
    return;
  }
  if (act === 'live') { insp.live = !insp.live; render(); return; }
  if (act === 'filter-group') { insp.filters.group = el.dataset.group; insp.highlight = null; render(); return; }
  if (act === 'filter-failures') { insp.filters.failures = !insp.filters.failures; render(); return; }
  if (act === 'clear-highlight') { insp.highlight = null; render(); return; }
  if (act === 'chart-by') {
    insp.chartBy = insp.chartBy === 'activity' ? 'model' : 'activity';
    insp.highlight = null;
    render();
    return;
  }
  if (act === 'zoom-in') { zoomBy(activeRun(insp), 0.6); render(); return; }
  if (act === 'zoom-out') { zoomBy(activeRun(insp), 1 / 0.6); render(); return; }
  if (act === 'zoom-sel') {
    const run = activeRun(insp);
    const span = run && run.spans.find((s) => s.id === insp.selectedId);
    if (run && span) {
      const end = agg.endOf(span, run) ?? span.start + 1;
      const pad = Math.max(1, (end - span.start) * 0.4);
      setWindow(run, span.start - pad, end + pad);
      render();
    }
    return;
  }
  if (act === 'open-run') { insp.scope = el.dataset.run; insp.win = null; insp.scrollTop = 0; render(); return; }
  const group = el.closest('[data-grp]');
  if (group) {
    insp.highlight = { type: group.dataset.grpType, value: group.dataset.grp };
    render();
  }
});

app.addEventListener('click', (event) => {
  const band = event.target.closest('[data-time]');
  if (!band) return;
  state.insp.highlight = { type: 'time', from: Number(band.dataset.time), to: Number(band.dataset.timeEnd) };
  render();
});

app.addEventListener('change', (event) => {
  const el = event.target;
  if (el.dataset.tier && el.dataset.field) {
    changeTier(state.models, el.dataset.tier, el.dataset.field, el.value);
    render();
    return;
  }
  if (el.dataset.act === 'scope') {
    state.insp.scope = el.value;
    state.insp.win = null;
    state.insp.scrollTop = 0;
    state.insp.highlight = null;
    const run = activeRun(state.insp);
    const root = run && run.spans.find((s) => s.parent === null);
    if (root) state.insp.expanded.add(root.id);
    render();
    return;
  }
  if (el.dataset.act === 'filter-model') { state.insp.filters.model = el.value; render(); }
});

app.addEventListener('keydown', (event) => {
  const scroller = event.target.closest('[data-tl]');
  if (scroller && timelineKey(state.insp, event)) { event.preventDefault(); render(); return; }
  const strip = event.target.closest('[data-ov]');
  if (!strip) return;
  const run = activeRun(state.insp);
  if (!run) return;
  const win = currentWindow(run);
  const width = win.to - win.from;
  const stepSize = width / 10;
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    const delta = event.key === 'ArrowRight' ? stepSize : -stepSize;
    if (event.shiftKey) zoomBy(run, event.key === 'ArrowRight' ? 0.7 : 1 / 0.7);
    else setWindow(run, win.from + delta, win.to + delta);
    event.preventDefault();
    render();
  } else if (event.key === 'Home') {
    state.insp.win = null;
    event.preventDefault();
    render();
  }
});

// ── draggable time window ──────────────────────────────────────────────────
let drag = null;
let scrollFrame = null;
app.addEventListener('pointerdown', (event) => {
  const strip = event.target.closest('[data-ov]');
  if (!strip) return;
  const run = activeRun(state.insp);
  if (!run) return;
  const rect = strip.getBoundingClientRect();
  const total = agg.elapsedMinutes(run) || 1;
  const win = currentWindow(run);
  const px = (v) => ((v / total) * rect.width);
  const x = event.clientX - rect.left;
  const from = px(win.from);
  const to = px(win.to);
  let mode = 'move';
  if (event.target.dataset.ovh === 'l' || Math.abs(x - from) < 7) mode = 'l';
  else if (event.target.dataset.ovh === 'r' || Math.abs(x - to) < 7) mode = 'r';
  drag = { run, rect, total, win, mode, startX: x };
  strip.setPointerCapture(event.pointerId);
});

app.addEventListener('pointermove', (event) => {
  if (!drag) return;
  const dx = ((event.clientX - drag.rect.left) - drag.startX) / drag.rect.width * drag.total;
  if (drag.mode === 'move') setWindow(drag.run, drag.win.from + dx, drag.win.to + dx);
  else if (drag.mode === 'l') setWindow(drag.run, drag.win.from + dx, drag.win.to);
  else setWindow(drag.run, drag.win.from, drag.win.to + dx);
  if (!drag.frame) {
    drag.frame = requestAnimationFrame(() => { drag.frame = null; render(); });
  }
});

const endDrag = () => { drag = null; render(); };
app.addEventListener('pointerup', endDrag);
app.addEventListener('pointercancel', endDrag);

// ── live observations ──────────────────────────────────────────────────────
function addObservation(run) {
  const target = run.spans.find((s) => s.state === 'running' && ['step', 'review', 'owner'].includes(s.kind));
  if (!target) return;
  const count = run.spans.filter((s) => s.parent === target.id && s.kind === 'tool').length + 1;
  run.spans.push({
    id: `${target.id}-live-${count}`, label: `bash check ${count}`, kind: 'tool', parent: target.id,
    start: run.now - 1.3, end: run.now, state: 'ok', span: 'active', charge: true, cost: 0.004,
    coverage: 'call', tokens: null, refs: [], links: [], note: null,
  });
}

setInterval(() => {
  const insp = state.insp;
  if (!insp.live || state.view !== 'inspector') return;
  const run = activeRun(insp);
  if (!run || !run.live) return;
  if (run.base === undefined) run.base = run.now;
  if (run.now >= run.base + 45) return;
  run.now = Math.round((run.now + 1.4) * 10) / 10;
  insp.tick += 1;
  if (insp.tick % 4 === 0) addObservation(run);
  render();
}, 1600);

// ── review chrome ──────────────────────────────────────────────────────────
const viewControls = document.getElementById('view-controls');
VIEWS.forEach(([key, label]) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.view = key;
  button.textContent = label;
  button.addEventListener('click', () => {
    state.view = key;
    if (key !== 'project') state.menuOpen = false;
    state.notice = null;
    render();
  });
  viewControls.appendChild(button);
});

document.getElementById('width-controls').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  document.querySelectorAll('#width-controls button').forEach((b) => b.classList.toggle('active', b === button));
  document.getElementById('frame').classList.toggle('w960', button.dataset.width === '960');
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.menuOpen) { state.menuOpen = false; render(); }
});

// A pending change stays visible in the project summary.
document.addEventListener('visibilitychange', () => {
  if (modelPending(state.models)) state.notice = null;
});

render();
export { app, state, render, VIEWPORT, RUNS, esc };
