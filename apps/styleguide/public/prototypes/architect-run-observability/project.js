/* The quiet project page. It gains two menu entries and nothing else.
   No event log and no metrics panel on this page. */

import { esc, icon, usd } from './format.js';
import { M, PROJECT_TIERS } from './data.js';

const MILESTONES = [
  { title: 'Grid, movement and field of view', kind: 'Workflow', status: 'accepted', note: 'Evidence at 3f1c2ab', pill: 'ok' },
  { title: 'Procedural level generator with a seed', kind: 'Workflow', status: 'running', note: 'step 2 of 4 · 1h 18m active', pill: 'ok' },
  { title: 'Items, combat and permadeath', kind: 'Room', status: 'planned', note: 'Room · conductor and 3 members', pill: '' },
  { title: 'Browser build and a playable demo page', kind: 'Workflow', status: 'planned', note: '', pill: '' },
];

function menuOpen() {
  return `<div class="menu" role="menu" aria-label="Project controls">
    <button type="button" role="menuitem" data-act="noop">${icon('pause')}Pause</button>
    <button type="button" role="menuitem" data-act="noop">${icon('square')}Stop</button>
    <div class="sep"></div>
    <button type="button" role="menuitem" data-act="noop">${icon('coins')}Raise cap</button>
    <button type="button" role="menuitem" data-act="noop">${icon('sliders')}Autonomy: milestones</button>
    <div class="sep"></div>
    <button type="button" role="menuitem" data-act="models">${icon('sliders')}Models…<span class="hint">1 pending</span></button>
    <button type="button" role="menuitem" data-act="metrics">${icon('chart')}Run metrics…<span class="hint">3 runs · 1 incomplete</span></button>
    <div class="sep"></div>
    <button type="button" role="menuitem" data-act="noop">${icon('terminal')}Workspace ✓</button>
    <button type="button" role="menuitem" data-act="noop">${icon('terminal')}Worktree</button>
    <button type="button" role="menuitem" class="danger" data-act="noop">${icon('trash')}Delete project</button>
  </div>`;
}

function stateLine() {
  return `<section class="stateline" aria-label="Project state">
    <div>
      <p class="sentence"><span class="who">The Architect: </span>Milestone 2 is running. Nothing needs you.</p>
      <div class="meta">
        <span class="pill ok">build</span>
        <span class="sep"></span><span>Architect awake, waiting for events</span>
        <span class="sep"></span><span>autonomy: milestones</span>
        <span class="sep"></span><span>models: MED override · owner env pin</span>
        <span class="sep"></span><span class="mono">~/Projects/hollow-depths</span>
      </div>
    </div>
    <div class="ring" role="img" aria-label="Spent $11.40 of $40 cap">
      <svg viewBox="0 0 64 64"><circle class="bg" cx="32" cy="32" r="28"/><circle class="fg" cx="32" cy="32" r="28" stroke-dasharray="175.9" stroke-dashoffset="125.7"/></svg>
      <div class="num"><b>$11.40</b><span>of $40 cap</span></div>
    </div>
  </section>`;
}

const DOT = { accepted: 'ok', running: 'ring', planned: '' };

function rail() {
  const rows = MILESTONES.map((m) => `<div class="ms">
    <div class="node"><span class="dot ${DOT[m.status]}"></span></div>
    <div class="t"><b>${esc(m.title)}</b>${m.note ? `<span>${esc(m.note)}</span>` : ''}</div>
    <div class="r"><span class="kind">${m.kind}</span><span class="pill ${m.pill}">${m.status}</span></div>
  </div>`).join('');
  return `<section><div class="sec-head">Milestones<span class="n">1 of 4 accepted</span></div><div class="card rail">${rows}</div></section>`;
}

export function renderProject(state) {
  const dispatches = PROJECT_TIERS.dispatches.length;
  return `<div class="top">
    <div class="brand"><span class="brand-mark">${icon('compass')}</span>Architect</div>
    <div class="crumb">
      <button type="button" class="back" data-act="noop" aria-label="Back to projects">${icon('arrow-left')}Projects</button>
      ${icon('chevron-right')}<span class="leaf">Hollow Depths</span>
    </div>
    <div class="top-actions">
      <span class="kind">Workspace</span>
      <button type="button" class="btn" data-act="noop">${icon('terminal')}Open session</button>
      <button type="button" class="btn icon" data-act="menu" aria-haspopup="menu" aria-expanded="${state.menuOpen}" aria-label="Project controls">${icon('more')}</button>
      ${state.menuOpen ? menuOpen() : ''}
    </div>
  </div>
  <div class="body">
    ${state.notice ? `<p class="notice ok" style="margin-bottom:16px">${icon('check')}<span>${esc(state.notice)}</span></p>` : ''}
    ${stateLine()}
    <div class="sections">
      <div class="col">
        <section><div class="sec-head">Needs you<span class="n">none</span></div>
          <div class="quiet"><span class="dot ok"></span>Nothing is needed from you.</div></section>
        ${rail()}
        <section><div class="sec-head">Directive<span class="n">latest reply</span></div>
          <div class="reply"><span class="av">${icon('compass')}</span><div class="rt">
            <small>architect · 11:09</small>
            <p>Milestone 1 accepted on the evidence. Milestone 2 dispatched with the seed-in-URL criterion you asked for.</p>
          </div></div>
          <form class="composer" data-form="directive"><textarea rows="1" aria-label="Directive" placeholder="Tell the Architect something."></textarea><button type="submit" class="btn primary">Send</button></form>
        </section>
      </div>
      <div class="col">
        <section><div class="sec-head">Models<span class="n">rev 7 · 1 unsaved</span></div>          <div class="card">
            <div class="facts">
              <div class="fact"><span>LOW</span><b>Haiku 4 · low (global)</b></div>
              <div class="fact"><span>MED</span><b>GPT-5 Codex · medium (project)</b></div>
              <div class="fact"><span>HIGH</span><b>Opus 4 · high (global)</b></div>
              <div class="fact"><span>Owner</span><b class="warn">env pin · GPT-5 Codex</b></div>
              <div class="fact"><span>Existing dispatches</span><b>${dispatches} keep rev 7</b></div>
            </div>
            <div style="margin-top:12px"><button type="button" class="btn small" data-act="models">${icon('sliders')}Project models</button></div>
          </div>
        </section>
        <section><div class="sec-head">Run metrics<span class="n">separate view</span></div>
          <div class="card">
            <p style="font-size:12px;color:var(--text-2);line-height:1.55">Runs and lifetime totals open in a dedicated inspector.</p>
            <div style="margin-top:12px"><button type="button" class="btn small" data-act="metrics">${icon('chart')}Open run metrics</button></div>
          </div>
        </section>
      </div>
    </div>
  </div>`;
}

export const PROJECT_COST = usd(11.4);
export const PROJECT_MODEL = M.codex;
