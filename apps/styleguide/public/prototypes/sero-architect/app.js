/* Sero Architect prototype. One project rendered in each lifecycle state from data. */
(function () {
  'use strict';

  const PHASES = ['intake', 'discovery', 'charter', 'build', 'release', 'maintain'];
  const IDEA = 'A turn-based roguelike dungeon crawler. Procedural levels, permadeath, a small set of items with strong interactions. Playable in the browser, no accounts.';

  // ── data ────────────────────────────────────────────────────────────────
  const milestonesPlan = [
    { id: 'm1', title: 'Grid, movement and field of view', kind: 'workflow' },
    { id: 'm2', title: 'Procedural level generator with a seed', kind: 'workflow' },
    { id: 'm3', title: 'Items, combat and permadeath', kind: 'room', preview: true },
    { id: 'm4', title: 'Browser build and a playable demo page', kind: 'workflow', preview: true },
    { id: 'm5', title: 'Release to GitHub Pages', kind: 'workflow' },
  ];

  const decisionTiles = {
    id: 'd7',
    question: 'How should the dungeon be drawn?',
    reason: 'The choice changes milestone 4 and the browser build. The charter does not name a renderer.',
    parks: ['m4'],
    recommendation: 'canvas',
    options: [
      { id: 'canvas', label: 'Canvas 2D with a sprite atlas', consequence: 'Simplest path. Works in every browser. Caps effects at plain tiles and light.' },
      { id: 'webgl', label: 'WebGL through a small tile shader', consequence: 'Real lighting and fog. Adds one dependency and one week to milestone 4.' },
      { id: 'text', label: 'Text glyphs, classic roguelike', consequence: 'Fastest to build. Limits the demo page to a niche look.' },
    ],
  };

  const history = [
    ['09:12', 'Intake', 'you gave the idea and the folder. Workspace registered, owner session granted.'],
    ['09:14', 'Discovery', 'the Architect ran 3 research questions in parallel.'],
    ['09:41', 'Charter', 'proposed 5 milestones with a $40 cap. You approved at 09:48.'],
    ['09:49', 'Build', 'milestone 1 dispatched as a Workflow.'],
    ['11:05', 'Verifying', 'milestone 1 reported complete. Evidence ran at 3f1c2ab.'],
    ['11:09', 'Accepted', 'milestone 1 closed. Milestone 2 dispatched.'],
  ];

  const olderDirectives = [
    ['09:52', 'Keep the art direction monochrome until the demo works.', 'Noted. Milestone plans will not include colour work.'],
    ['10:30', 'Use a seed in the URL so a run can be shared.', 'Added to milestone 2 as an acceptance criterion.'],
  ];

  function project(overrides) {
    return Object.assign({
      id: 'hollow-depths',
      name: 'Hollow Depths',
      folder: '~/Projects/hollow-depths',
      phase: 'build',
      overlay: null,
      sentence: 'Milestone 2 is running. Nothing needs you.',
      spent: 11.4,
      cap: 40,
      needs: [],
      milestones: [],
      lastReply: null,
      research: null,
      autonomy: 'milestones',
      awake: true,
    }, overrides);
  }

  const buildMilestones = (running, extra) => milestonesPlan.map((m, i) => {
    const base = Object.assign({}, m);
    if (i < running - 1) return Object.assign(base, { status: 'done', link: true, evidence: true });
    if (i === running - 1) return Object.assign(base, { status: 'running', link: true, sub: m.kind === 'room' ? 'Room · conductor and 3 members' : 'Workflow · step 4 of 7' });
    return Object.assign(base, { status: 'todo' });
  }).map((m) => Object.assign(m, (extra && extra[m.id]) || {}));

  const STATES = {
    list: {
      label: 'Projects list',
      note: 'One row per project: the Architect\'s one-line state, the phase, spend against the cap and the needs-you count. No events, no transcripts, no step detail. The row with a count is the one to open.',
      view: 'list',
    },
    intake: {
      label: 'Intake',
      note: 'Creating a project asks for the idea and a folder, nothing else. Confirm the dialog: the Architect creates the folder, runs git init, registers the workspace, and the persistent-session grant prompt follows.',
      view: 'intake',
      project: project({ phase: 'intake', sentence: 'Setting up the workspace.', spent: 0, cap: null, awake: false }),
    },
    discovery: {
      label: 'Discovery',
      note: 'The Architect is researching. Needs You says nothing is needed and does not grow. The rail is empty until the charter names milestones. The directive composer already works.',
      view: 'project',
      project: project({
        phase: 'discovery', spent: 0.9, cap: null,
        sentence: 'Reading three research results before I write the brief.',
        research: [
          ['What do the best browser roguelikes get right in the first minute?', 'done'],
          ['Which permadeath rules keep a run under 20 minutes?', 'done'],
          ['Smallest item set with strong interactions', 'running'],
        ],
        lastReply: { at: '09:31', text: 'I will keep the brief to one page and name the cap in the charter. Expect it in a few minutes.' },
        you: { at: '09:30', text: 'Keep the brief short.' },
      }),
    },
    charter: {
      label: 'Charter',
      note: 'The charter is the first gate. The card holds the brief, the milestones, the cost cap and the autonomy setting. Approve is one action. Any later change to the charter raises a decision.',
      view: 'project',
      project: project({
        phase: 'charter', spent: 2.3, cap: 40,
        sentence: 'The charter is ready for your approval.',
        needs: [{ kind: 'charter' }],
        milestones: milestonesPlan.map((m) => Object.assign({ status: 'proposed', sub: m.preview ? 'Closes with a capture' : '' }, m)),
        lastReply: { at: '09:41', text: 'Charter proposed: 5 milestones, $40 cap, you approve each milestone plan. Rendering is left open and will be a decision in milestone 3.' },
      }),
    },
    build: {
      label: 'Building quietly',
      note: 'The quiet state most days will look like. Milestone 2 runs in a Workflow with one link to its Orchestrator record. Milestone 1 keeps its evidence behind a disclosure. Nothing streams.',
      view: 'project',
      project: project({ milestones: buildMilestones(2), lastReply: { at: '11:09', text: 'Milestone 1 accepted on the evidence: tests green at 3f1c2ab, 14 files changed. Milestone 2 dispatched with the seed-in-URL criterion you asked for.' } }),
    },
    decision: {
      label: 'Decision required',
      note: 'The decision card: question, options with consequences, the recommendation preselected, the reason for escalation, an optional note. Answer takes one action. Milestone 4 is parked; milestone 3 keeps running.',
      view: 'project',
      project: project({
        overlay: 'decision', spent: 19.7,
        sentence: 'One decision is waiting on you. Milestone 3 keeps running.',
        needs: [{ kind: 'decision', decision: decisionTiles }],
        milestones: buildMilestones(3, { m4: { status: 'parked', sub: 'Parked on the decision' } }),
        lastReply: { at: '13:02', text: 'Raised a decision on rendering. I recommend Canvas 2D so milestone 4 stays inside the cap.' },
      }),
    },
    limited: {
      label: 'Limited',
      note: 'The cap is reached. The overlay is a stop, never a later phase. The running Workflow finishes on its own; the Architect will not be woken and nothing new is dispatched until you raise the cap.',
      view: 'project',
      project: project({
        overlay: 'limited', spent: 40, awake: false,
        sentence: 'Stopped at the $40 cap. Milestone 3 is still running; nothing new starts.',
        milestones: buildMilestones(3),
        lastReply: { at: '15:40', text: 'Spend reached the cap during milestone 3. I have stopped. Raise the cap and I will continue from the record.' },
      }),
    },
    maintain: {
      label: 'Maintain',
      note: 'After release. A maintenance Workflow listens to issues, CI and a weekly review. Each wake triages, then dispatches or escalates. A fix moves through the same four evidence states as a milestone.',
      view: 'project',
      project: project({
        phase: 'maintain', spent: 47.2, cap: 60,
        sentence: 'Released. One issue triaged today and a fix is being verified.',
        milestones: [
          { id: 'mw', title: 'Maintenance Workflow', kind: 'workflow', status: 'listening', link: true, sub: 'Listens to GitHub issues, CI failures, weekly review' },
          { id: 'f12', title: 'Fix: torch light leaks through walls (#12)', kind: 'workflow', status: 'verifying', link: true, ladder: 1, evidence: 'partial' },
          { id: 'm5', title: 'Release to GitHub Pages', kind: 'workflow', status: 'done', link: true, ladder: 3, evidence: true },
        ],
        lastReply: { at: '08:14', text: 'Issue #12 is real. Dispatched a fix Workflow; PR opens on the existing path once the evidence passes.' },
      }),
    },
  };

  const LIST_ROWS = [
    { name: 'Hollow Depths', folder: '~/Projects/hollow-depths', phase: 'build', overlay: 'decision', state: 'One decision is waiting on you. Milestone 3 keeps running.', spent: 19.7, cap: 40, needs: 1 },
    { name: 'Ledger', folder: '~/Projects/ledger', phase: 'build', overlay: null, state: 'Milestone 2 is running. Nothing needs you.', spent: 6.1, cap: 25, needs: 0 },
    { name: 'Field Notes', folder: '~/Projects/field-notes', phase: 'maintain', overlay: null, state: 'Released. Quiet since Tuesday.', spent: 31.8, cap: 35, needs: 0 },
    { name: 'Relay', folder: '~/Projects/relay', phase: 'charter', overlay: 'paused', state: 'Paused by you before the charter.', spent: 1.2, cap: null, needs: 0 },
  ];

  // ── helpers ─────────────────────────────────────────────────────────────
  const icon = (id, cls) => `<svg class="i${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const usd = (n) => '$' + n.toFixed(1).replace(/\.0$/, '');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const overlayPill = (o) => ({
    decision: '<span class="pill warn">Decision</span>',
    limited: '<span class="pill err">Limited</span>',
    blocked: '<span class="pill err">Blocked</span>',
    paused: '<span class="pill">Paused</span>',
  })[o] || '';

  function spendRing(spent, cap) {
    if (cap == null) {
      return `<div class="ring" data-tone="none"><svg viewBox="0 0 64 64"><circle class="bg" cx="32" cy="32" r="28"/></svg><div class="num"><b>${usd(spent)}</b><span>no cap yet</span></div></div>`;
    }
    const ratio = Math.min(1, spent / cap);
    const tone = ratio >= 1 ? 'err' : ratio >= 0.8 ? 'warn' : 'ok';
    const c = 2 * Math.PI * 28;
    return `<div class="ring" data-tone="${tone}" role="img" aria-label="Spent ${usd(spent)} of ${usd(cap)}">
      <svg viewBox="0 0 64 64"><circle class="bg" cx="32" cy="32" r="28"/><circle class="fg" cx="32" cy="32" r="28" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - ratio)).toFixed(1)}"/></svg>
      <div class="num"><b>${usd(spent)}</b><span>of ${usd(cap)} cap</span></div></div>`;
  }

  // ── renderers ───────────────────────────────────────────────────────────
  function topBar(p, withMenu) {
    const crumb = p
      ? `<div class="crumb"><button type="button" class="back" data-action="go-list" aria-label="Back to projects">${icon('arrow-left')}Projects</button>${icon('chevron-right')}<span class="leaf">${esc(p.name)}</span></div>`
      : '';
    const actions = p && withMenu
      ? `<button type="button" class="btn" data-action="open-session">${icon('terminal')}Open session</button>
         <button type="button" class="btn icon" data-action="toggle-menu" aria-haspopup="menu" aria-expanded="${model.menuOpen}" aria-label="Project controls">${icon('more')}</button>
         ${model.menuOpen ? controlsMenu(p) : ''}`
      : p ? '' : `<button type="button" class="btn primary" data-action="open-intake">${icon('plus')}New project</button>`;
    return `<div class="top"><div class="brand"><span class="brand-mark">${icon('compass')}</span>Architect</div>${crumb}<div class="top-actions">${actions}</div></div>`;
  }

  function controlsMenu(p) {
    const paused = p.overlay === 'paused' || !p.awake;
    return `<div class="menu" role="menu">
      ${paused ? `<button type="button" role="menuitem" data-action="resume">${icon('play')}Resume</button>` : `<button type="button" role="menuitem" data-action="pause">${icon('pause')}Pause</button>`}
      <button type="button" role="menuitem" data-action="stop">${icon('square')}Stop</button>
      <div class="sep"></div>
      <button type="button" role="menuitem" data-action="raise-cap" ${p.cap == null ? 'disabled' : ''}>${icon('coins')}Raise cap</button>
      <button type="button" role="menuitem" data-action="autonomy">${icon('sliders')}Autonomy: ${esc(p.autonomy)}</button>
      <div class="sep"></div>
      <button type="button" role="menuitem" class="danger" data-action="delete">${icon('trash')}Delete project</button>
    </div>`;
  }

  function stateLine(p) {
    const cur = PHASES.indexOf(p.phase);
    const spine = PHASES.map((ph, i) => `<div class="phase" data-state="${i < cur ? 'done' : i === cur ? 'current' : 'todo'}"><div class="bar"><i></i></div><span class="lbl">${ph}</span></div>`).join('');
    const meta = [
      `<span class="pill ${p.overlay ? '' : 'ok'}">${p.phase}</span>`,
      overlayPill(p.overlay),
      `<span class="sep"></span><span>${p.awake ? 'Architect awake, waiting for events' : 'Architect not woken'}</span>`,
      `<span class="sep"></span><span>autonomy: ${p.autonomy}</span>`,
      `<span class="sep"></span><span class="mono">${esc(p.folder)}</span>`,
    ].filter(Boolean).join('');
    return `<section class="stateline" data-overlay="${p.overlay || ''}" aria-label="Project state">
      <div><p class="sentence"><span class="who">The Architect: </span>${esc(p.sentence)}</p><div class="spine" aria-hidden="true">${spine}</div><div class="meta">${meta}</div></div>
      ${spendRing(p.spent, p.cap)}
    </section>`;
  }

  function needsYou(p) {
    const items = p.needs.map((n) => (n.kind === 'charter' ? charterCard(p) : decisionCard(n.decision))).join('');
    const body = items || `<div class="quiet"><span class="dot ok"></span>Nothing is needed from you.${p.overlay === 'paused' ? ' The project is paused.' : ''}</div>`;
    return `<section aria-labelledby="needs-h"><div class="sec-head" id="needs-h">${p.needs.length ? '<span class="warn">Needs you</span>' : 'Needs you'}<span class="n">${p.needs.length || 'none'}</span></div>${body}</section>`;
  }

  function decisionCard(d) {
    const sel = model.selected[d.id] || d.recommendation;
    const opts = d.options.map((o) => `<li><label class="opt" data-on="${o.id === sel ? 1 : 0}"><input type="radio" name="${d.id}" value="${o.id}" ${o.id === sel ? 'checked' : ''} data-decision="${d.id}"><span class="radio"></span><span class="t"><b>${esc(o.label)}</b><span>${esc(o.consequence)}</span></span>${o.id === d.recommendation ? `<span class="rec">${icon('check')}Recommended</span>` : '<span></span>'}</label></li>`).join('');
    return `<article class="card decision" aria-label="Decision">
      <h3 class="q">${esc(d.question)}</h3>
      <p class="why"><b>Escalated because</b> ${esc(d.reason)}</p>
      <ul class="opts" role="radiogroup" aria-label="Options">${opts}</ul>
      <div class="dfoot"><input class="note-in" type="text" placeholder="Add a note for the Architect (optional)" aria-label="Note"><button type="button" class="btn solid" data-action="answer" data-decision="${d.id}">${icon('check')}Answer</button></div>
      <p class="parks">Parks <code>milestone 4</code> until answered. No timeout, no default.</p>
    </article>`;
  }

  function charterCard(p) {
    return `<article class="card charter" aria-label="Charter approval">
      <h3 class="q">Approve the charter</h3>
      <p class="brief">A browser roguelike with procedural levels, permadeath and a small item set built for interactions. Runs are under 20 minutes and shareable by seed. No accounts, no server.</p>
      <div class="terms">
        <div class="term"><span class="k">Cost cap</span><span class="v mono">$40</span></div>
        <div class="term"><span class="k">Milestones</span><span class="v">5, in the rail below</span></div>
        <div class="term"><span class="k">Autonomy</span><span class="v">You approve each milestone plan</span></div>
        <div class="term"><span class="k">Always escalates</span><span class="v">Charter changes, external delivery, spend over cap</span></div>
      </div>
      <div class="dfoot"><input class="note-in" type="text" placeholder="Ask for a change instead (optional)" aria-label="Note"><button type="button" class="btn solid" data-action="approve-charter">${icon('check')}Approve charter</button></div>
    </article>`;
  }

  function ladder(level) {
    const names = ['reported', 'verified', 'accepted', 'delivered'];
    return `<div class="ladder" aria-label="Evidence state">${names.map((n, i) => `${i ? '<i></i>' : ''}<span data-on="${i < level ? 2 : i === level ? 1 : 0}">${n}</span>`).join('')}</div>`;
  }

  function evidence(kind) {
    const rows = kind === 'partial'
      ? [['ok', 'pnpm test', 'exit 0 · 41 passed'], ['ok', 'git diff', '3 files · +62 −18'], ['dim', 'dev-server smoke', 'running'], ['dim', 'capture /play?seed=12', 'waiting']]
      : [['ok', 'pnpm test', 'exit 0 · 38 passed'], ['ok', 'pnpm typecheck', 'exit 0'], ['ok', 'git diff', '14 files · +812 −40'], ['ok', 'capture /play', '1 screenshot']];
    return `<details class="evidence"><summary>${icon('chevron-right')}Evidence at 3f1c2ab</summary><div class="ev">${rows.map(([t, c, r]) => `<div><span class="${t}">${t === 'ok' ? '✓' : '·'}</span><span>${esc(c)}</span><span class="${t === 'dim' ? 'dim' : ''}">${esc(r)}</span></div>`).join('')}</div></details>`;
  }

  function milestoneRail(p) {
    if (!p.milestones.length) {
      const research = p.research
        ? `<div class="card"><div class="sec-head" style="margin-bottom:8px">Research runs<span class="n">${p.research.length}</span></div>${p.research.map(([q, s]) => `<div class="fact"><span>${esc(q)}</span><b class="${s === 'done' ? 'ok' : ''}">${s}</b></div>`).join('')}</div>`
        : '';
      return `<section><div class="sec-head">Milestones<span class="n">none yet</span></div>${research || '<div class="quiet"><span class="dot"></span>The charter will name the milestones.</div>'}</section>`;
    }
    const dotFor = { done: 'check', running: 'ring', verifying: 'verify', parked: 'parked', todo: 'hollow', proposed: 'hollow', listening: 'ring' };
    const labelFor = { todo: 'planned', done: 'accepted' };
    const pillFor = { done: 'ok', running: 'ok', verifying: 'info', parked: 'warn', todo: '', proposed: '', listening: 'violet' };
    const rows = p.milestones.map((m) => {
      const link = m.link ? `<button type="button" class="btn link small" data-action="open-orchestrator" data-ms="${m.id}">Open in Orchestrator ${icon('external')}</button>` : '';
      const sub = m.sub ? `<span>${esc(m.sub)}</span>` : '';
      const lad = m.ladder != null ? ladder(m.ladder) : '';
      const ev = m.evidence ? evidence(m.evidence) : '';
      return `<div class="ms" data-status="${m.status}"><div class="node"><span class="dot ${dotFor[m.status]}"></span></div><div class="t"><b>${esc(m.title)}</b>${sub}${lad}${ev}</div><div class="r"><span class="kind">${m.kind}</span><span class="pill ${pillFor[m.status]}">${labelFor[m.status] || m.status}</span>${link}</div></div>`;
    }).join('');
    return `<section><div class="sec-head">Milestones<span class="n">${p.milestones.filter((m) => m.status === 'done').length} of ${p.milestones.length} accepted</span></div><div class="card rail">${rows}</div></section>`;
  }

  function directives(p) {
    const you = model.pendingDirective ? `<div class="you"><small>you · just now</small><p>${esc(model.pendingDirective)}</p></div>` : (p.you ? `<div class="you"><small>you · ${p.you.at}</small><p>${esc(p.you.text)}</p></div>` : '');
    const reply = model.pendingDirective
      ? `<div class="reply"><span class="av">${icon('compass')}</span><div class="rt"><small>architect · woken at top priority</small><p>Reply arrives before this wake ends. The running Workflow is not interrupted.</p></div></div>`
      : p.lastReply
        ? `<div class="reply"><span class="av">${icon('compass')}</span><div class="rt"><small>architect · ${p.lastReply.at}</small><p>${esc(p.lastReply.text)}</p></div></div>`
        : '<div class="quiet"><span class="dot"></span>No directive sent yet.</div>';
    const disabled = p.phase === 'intake';
    return `<section aria-labelledby="dir-h"><div class="sec-head" id="dir-h">Directive<span class="n">latest reply</span></div>${you}${reply}
      <form class="composer" data-form="directive"><textarea rows="1" placeholder="Tell the Architect something. It replies in one short message." aria-label="Directive" ${disabled ? 'disabled' : ''}></textarea><button type="submit" class="btn primary" ${disabled ? 'disabled' : ''}>${icon('send')}Send</button></form>
      <p class="composer-note">A directive wakes the Architect ahead of every other event.</p></section>`;
  }

  function sideColumn(p) {
    const hist = `<details class="disc" ${model.historyOpen ? 'open' : ''} data-disc="history"><summary>${icon('chevron-right')}History<span class="n">${history.length} changes</span></summary><div class="inner"><ul class="tl">${history.map(([t, h, s]) => `<li><span class="t">${t}</span><span><b>${h}</b> · ${esc(s)}</span></li>`).join('')}</ul></div></details>`;
    const older = `<details class="disc" data-disc="older"><summary>${icon('chevron-right')}Older directives<span class="n">${olderDirectives.length}</span></summary><div class="inner"><ul class="older">${olderDirectives.map(([t, q, a]) => `<li><b>${t} · ${esc(q)}</b><span>${esc(a)}</span></li>`).join('')}</ul></div></details>`;
    return `<aside class="col">${hist}${older}</aside>`;
  }

  function limitBanner(p) {
    if (p.overlay !== 'limited') return '';
    return `<form class="limit" data-form="raise-cap"><span class="ic">${icon('coins')}</span><div><b>Cap reached: ${usd(p.spent)} of ${usd(p.cap)}</b><span>Reaching a limit is not completion. Raise the cap to wake the Architect and allow new dispatches.</span></div><div class="cap"><label class="mono" for="cap-in">$</label><input id="cap-in" type="number" min="${p.cap + 1}" value="${p.cap + 20}" aria-label="New cap"><button type="submit" class="btn solid">Raise and resume</button></div></form>`;
  }

  function projectPage(p) {
    return `${topBar(p, true)}<div class="body">${stateLine(p)}
      <div class="sections"><div class="col">${limitBanner(p)}${needsYou(p)}${milestoneRail(p)}${directives(p)}</div>${sideColumn(p)}</div></div>`;
  }

  function listPage() {
    const rows = LIST_ROWS.map((r, i) => {
      const ratio = r.cap ? r.spent / r.cap : 0;
      const tone = ratio >= 1 ? 'err' : ratio >= 0.8 ? 'warn' : '';
      return `<button type="button" class="prow" data-needs="${r.needs ? 1 : 0}" data-action="open-project" data-row="${i}">
        <span class="glyph">${r.name.slice(0, 2).toUpperCase()}</span>
        <span class="name">${esc(r.name)}<small>${esc(r.folder)}</small></span>
        <span class="state">${esc(r.state)}</span>
        <span>${r.overlay ? overlayPill(r.overlay) : `<span class="pill ok">${r.phase}</span>`}</span>
        <span class="spend"><b>${r.cap ? `${usd(r.spent)} / ${usd(r.cap)}` : `${usd(r.spent)} · no cap`}</b><span class="track ${tone}"><i style="width:${Math.min(100, ratio * 100)}%"></i></span></span>
        <span class="needs">${r.needs ? `<span class="count" aria-label="${r.needs} needs you">${r.needs}</span>` : ''}</span></button>`;
    }).join('');
    const dialog = model.intakeOpen ? intakeDialog() : '';
    return `${topBar(null)}<div class="body"><div class="list-head">Projects<span class="line"></span><span class="hint">state · phase · spend · needs you</span></div>${rows}</div>${dialog}`;
  }

  function intakeDialog() {
    return `<div class="scrim" data-scrim><form class="dialog" role="dialog" aria-modal="true" aria-labelledby="intake-h" data-form="intake">
      <h2 id="intake-h">New project</h2>
      <p>Give the Architect the idea and a folder. It creates the folder, runs git init, registers the workspace and then asks for the session grant.</p>
      <div class="field"><label for="idea">Idea</label><textarea id="idea" required>${esc(IDEA)}</textarea><small>Kept verbatim on the record.</small></div>
      <div class="field"><label for="folder">Folder</label><div class="folder"><input id="folder" value="~/Projects/hollow-depths" required><button type="button" class="btn">${icon('folder')}Choose</button></div><small>Must be inside your home directory. An empty or new folder.</small></div>
      <div class="foot"><button type="button" class="btn" data-action="close-intake">Cancel</button><button type="submit" class="btn solid">Create project</button></div>
    </form></div>`;
  }

  function intakePage(p) {
    const s = model.intakeStep;
    const steps = [['Create the folder', 'mkdir'], ['Initialise the repository', 'git init'], ['Register the workspace', 'workspace create'], ['Open the owner session', 'grant']];
    const list = steps.map(([t, m], i) => `<div class="step" data-s="${i < s ? 'done' : i === s ? 'run' : 'todo'}"><span class="i">${icon(i < s ? 'check' : 'chevron-right')}</span><span>${t}</span><span class="m">${m}</span></div>`).join('');
    const grant = s >= 3 ? `<div class="grant"><b>Sero asks: allow the Architect app to keep a session open for Hollow Depths?</b><span>Workspace <code>~/Projects/hollow-depths</code> · tools <code>read, bash, write, edit, sero-cli</code> · model as configured. The Architect starts discovery once you allow it.</span><div style="display:flex;gap:8px;margin-top:6px"><button type="button" class="btn solid" data-action="grant">Allow</button><button type="button" class="btn">Not now</button></div></div>` : '';
    return `${topBar(p, false)}<div class="body">${stateLine(p)}
      <div class="sections" style="grid-template-columns:minmax(0,1fr)"><div class="col">
        <section><div class="sec-head">Setting up<span class="n">step ${Math.min(s + 1, 4)} of 4</span></div><div class="card"><div class="steps">${list}</div></div></section>
        ${grant}
        <section><div class="sec-head">Idea<span class="n">verbatim</span></div><div class="card"><p style="color:var(--text-2);line-height:1.55">${esc(IDEA)}</p></div></section>
      </div></div></div>`;
  }

  function widgets() {
    const total = LIST_ROWS.reduce((n, r) => n + r.needs, 0);
    const rows = LIST_ROWS.map((r) => `<div class="wrow"><span class="nm"><b>${esc(r.name)}</b><span>${esc(r.state)}</span></span><span class="m">${r.overlay || r.phase} · ${r.cap ? `${usd(r.spent)}/${usd(r.cap)}` : usd(r.spent)}</span>${r.needs ? `<span class="count">${r.needs}</span>` : '<span></span>'}</div>`).join('');
    const full = `<div class="widget"><div class="wtop">${icon('compass')}Architect<span class="n">${total ? `<span class="count">${total}</span>` : ''}</span></div><div class="wbody">${rows}</div></div>`;
    const empty = `<div class="widget"><div class="wtop">${icon('compass')}Architect</div><div class="wbody"><div class="wempty"><span>No projects yet. Give the Architect an idea and a folder.</span><button type="button" class="btn primary small">${icon('plus')}New project</button></div></div></div>`;
    return full + empty;
  }

  // ── model and render ────────────────────────────────────────────────────
  const model = { state: 'list', menuOpen: false, intakeOpen: false, intakeStep: 0, selected: {}, historyOpen: false, pendingDirective: '', answered: {}, projectOverride: null };
  const app = document.getElementById('app');
  const note = document.getElementById('review-note');
  const stateControls = document.getElementById('state-controls');

  Object.keys(STATES).forEach((key) => {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.state = key; b.textContent = STATES[key].label;
    b.addEventListener('click', () => setState(key));
    stateControls.appendChild(b);
  });

  function currentProject() {
    return model.projectOverride || STATES[model.state].project;
  }

  function setState(key) {
    model.state = key; model.menuOpen = false; model.intakeOpen = key === 'intake'; model.intakeStep = 0;
    model.pendingDirective = ''; model.projectOverride = null; model.selected = {};
    render();
  }

  function render() {
    const st = STATES[model.state];
    stateControls.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.state === model.state));
    note.innerHTML = st.note;
    const p = currentProject();
    if (st.view === 'list' || (st.view === 'intake' && model.intakeOpen)) app.innerHTML = listPage();
    else if (st.view === 'intake') app.innerHTML = intakePage(p);
    else app.innerHTML = projectPage(p);
    document.getElementById('widget-grid').innerHTML = widgets();
    const first = app.querySelector('[role="dialog"] textarea, .menu button');
    if (first) first.focus();
  }

  // ── interactions ────────────────────────────────────────────────────────
  app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) { if (e.target.closest('[data-scrim]') && !e.target.closest('.dialog')) { model.intakeOpen = false; render(); } return; }
    const a = el.dataset.action;
    const p = currentProject();
    if (a === 'toggle-menu') { model.menuOpen = !model.menuOpen; render(); }
    else if (a === 'go-list') setState('list');
    else if (a === 'open-project') setState(LIST_ROWS[el.dataset.row].needs ? 'decision' : 'build');
    else if (a === 'open-intake') { model.state = 'intake'; model.intakeOpen = true; model.intakeStep = 0; render(); }
    else if (a === 'close-intake') { model.intakeOpen = false; if (model.state === 'intake') model.state = 'list'; render(); }
    else if (a === 'grant') { model.projectOverride = STATES.discovery.project; model.state = 'discovery'; render(); }
    else if (a === 'answer') { model.projectOverride = Object.assign({}, p, { overlay: null, needs: [], sentence: 'Decision recorded. Milestone 4 unparked; milestone 3 keeps running.', milestones: buildMilestones(3), lastReply: { at: 'now', text: 'Canvas 2D it is. Milestone 4 plan updated; you will see it for approval when milestone 3 closes.' } }); model.menuOpen = false; render(); }
    else if (a === 'approve-charter') { model.projectOverride = STATES.build.project; model.state = 'build'; render(); }
    else if (a === 'pause') { model.projectOverride = Object.assign({}, p, { overlay: 'paused', awake: false, sentence: p.sentence.replace(/Nothing needs you\.?/, '') + ' Paused: I will not be woken until you resume.' }); model.menuOpen = false; render(); }
    else if (a === 'resume') { model.projectOverride = Object.assign({}, p, { overlay: p.overlay === 'paused' ? null : p.overlay, awake: p.overlay !== 'limited' }); model.menuOpen = false; render(); }
    else if (a === 'raise-cap') { model.projectOverride = Object.assign({}, p, { cap: p.cap + 20 }); model.menuOpen = false; render(); }
    else if (a === 'autonomy') { const next = { milestones: 'charter-only', 'charter-only': 'model-judged', 'model-judged': 'milestones' }; model.projectOverride = Object.assign({}, p, { autonomy: next[p.autonomy] }); render(); }
    else if (a === 'stop' || a === 'delete' || a === 'open-session' || a === 'open-orchestrator') { model.menuOpen = false; render(); el.blur(); }
  });

  app.addEventListener('change', (e) => {
    const r = e.target.closest('input[type="radio"][data-decision]');
    if (r) { model.selected[r.dataset.decision] = r.value; app.querySelectorAll(`input[name="${r.name}"]`).forEach((i) => { i.closest('.opt').dataset.on = i.checked ? 1 : 0; }); }
  });

  app.addEventListener('toggle', (e) => {
    const d = e.target.closest('details[data-disc="history"]');
    if (d) model.historyOpen = d.open; // persisted through the host layout service in the product
  }, true);

  app.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target.dataset.form;
    const p = currentProject();
    if (f === 'directive') { const t = e.target.querySelector('textarea'); if (!t.value.trim()) return; model.pendingDirective = t.value.trim(); render(); }
    else if (f === 'raise-cap') { const v = Number(e.target.querySelector('input').value); model.projectOverride = Object.assign({}, p, { cap: v, overlay: null, awake: true, sentence: `Cap raised to ${usd(v)}. Continuing milestone 3.` }); render(); }
    else if (f === 'intake') { model.intakeOpen = false; model.intakeStep = 0; render(); runIntake(); }
  });

  function runIntake() {
    const tick = () => { if (model.state !== 'intake' || model.intakeOpen) return; model.intakeStep += 1; render(); if (model.intakeStep < 3) setTimeout(tick, 700); };
    setTimeout(tick, 700);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (model.menuOpen) { model.menuOpen = false; render(); app.querySelector('[data-action="toggle-menu"]').focus(); }
    else if (model.intakeOpen) { model.intakeOpen = false; if (model.state === 'intake') model.state = 'list'; render(); }
  });

  document.getElementById('width-controls').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    document.querySelectorAll('#width-controls button').forEach((x) => x.classList.toggle('active', x === b));
    document.getElementById('frame').classList.toggle('w960', b.dataset.width === '960');
  });

  render();
})();
