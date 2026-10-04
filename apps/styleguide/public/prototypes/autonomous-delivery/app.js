(() => {
  const { scenarios, access, workspaces } = window.PROTO;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (id) => document.getElementById(id);
  const esc = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const icon = (name) => `<svg class="i" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const chip = (sc) => `<span class="ar-gchip" data-tone="${sc.tone ?? 'neutral'}" aria-hidden="true">${icon(sc.glyph)}</span>`;
  const usd = (n) => `$${n.toFixed(2)}`;
  const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const tick = (s) => `<span class="wk-t" data-tick="${s}">${clock(s + elapsed())}</span>`;

  const t0 = Date.now();
  const elapsed = () => Math.floor((Date.now() - t0) / 1000);

  const S = {
    view: 'list', projectId: 'synth', tab: 'live', open: new Set(), menu: false, dialog: null, ack: null, answer: null,
    projects: [
      { id: 'synth', name: 'Pocket Synth', scenario: 'working' },
      { id: 'reading', name: 'Reading Log', scenario: 'legacy' },
    ],
  };
  const project = () => S.projects.find((item) => item.id === S.projectId);
  const scenarioOf = (item) => scenarios[item.scenario];
  const setScenario = (key, ack = null) => { project().scenario = key; S.ack = ack; S.answer = null; S.open.clear(); };

  // ── Architect ──────────────────────────────────────────────────────────
  function topBar() {
    const item = S.view === 'list' ? null : project();
    const crumb = item ? `
      <div class="ar-crumb">
        <button type="button" class="ar-back" data-act="list">${icon('back')}Projects</button>${icon('chev')}
        ${S.view === 'work'
          ? `<button type="button" class="ar-back" data-act="overview">${esc(item.name)}</button>${icon('chev')}<span class="ar-leaf">Work</span>`
          : `<span class="ar-leaf">${esc(item.name)}</span>`}
      </div>` : '';
    const paused = item && item.scenario === 'pausing';
    const canPause = item && ['working', 'quiet', 'decision', 'pausing'].includes(item.scenario);
    const actions = !item
      ? `<button type="button" class="ar-btn ar-btn-solid" data-act="intake">${icon('plus')}New project</button>`
      : canPause ? `
        <button type="button" class="ar-btn ar-btn-icon" data-act="menu" aria-label="Project controls" aria-haspopup="menu" aria-expanded="${S.menu}">${icon('more')}</button>
        ${S.menu ? `<div class="ar-menu" role="menu"><button type="button" role="menuitem" data-act="${paused ? 'resume' : 'pause'}">${icon(paused ? 'play' : 'pause')}${paused ? 'Resume' : 'Pause'}</button></div>` : ''}` : '';
    return `<div class="ar-top"><div class="ar-brand"><span class="ar-brand-mark">${icon('compass')}</span>Architect</div>${crumb}<div class="ar-top-actions">${actions}</div></div>`;
  }

  function activity(sc) {
    const work = sc.tick ? `${esc(sc.work)} · <span data-tick="${sc.tick}">${clock(sc.tick + elapsed())}</span>` : esc(sc.work);
    return `<div class="ar-activity">${chip(sc)}<div><b>${esc(sc.word)}</b> · ${work}<small>${esc(sc.who)}</small></div></div>`;
  }

  function listView() {
    const rows = S.projects.map((item) => {
      const sc = scenarioOf(item);
      return `
        <button type="button" class="ar-prow" data-act="open" data-arg="${item.id}" data-needs="${sc.needs ? 1 : 0}" data-tone="${sc.tone}">
          <span class="ar-prow-name">${esc(item.name)}${sc.charter ? '<small>charter flow · deprecated</small>' : ''}</span>
          ${activity(sc)}
          <span class="ar-prow-needs">${esc(sc.needs ?? 'Nothing')}</span>
          <span class="ar-prow-spend"><b>${usd(sc.spent)} of ${usd(sc.cap)}</b><span class="ar-track"><i style="width:${(sc.spent / sc.cap) * 100}%"></i></span></span>
        </button>`;
    }).join('');
    return `<div class="ar-scroll"><div class="ar-body">
      <div class="ar-rowhead"><span>Project</span><span>Activity</span><span>Needs you</span><span class="ar-sp">Spend</span></div>${rows}
    </div></div>`;
  }

  function decisionCard(decision, key) {
    const selected = S.answer ?? decision.recommended;
    const options = decision.options.map((option) => `
      <label class="ar-opt">
        <input type="radio" name="decision" value="${option.id}" ${option.id === selected ? 'checked' : ''}>
        <span class="ar-radio"></span>
        <span class="ar-opt-text"><b>${esc(option.label)}</b><span>${esc(option.effect)}</span></span>
        ${option.id === decision.recommended ? `<span class="ar-rec">${icon('check')}Recommended</span>` : '<span></span>'}
      </label>`).join('');
    return `
      <article class="ar-card ar-decision" aria-label="Decision">
        <h3 class="ar-q">${esc(decision.question)}</h3>
        <p class="ar-why">${esc(decision.why)}</p>
        <div class="ar-opts" role="radiogroup" aria-label="Options">${options}</div>
        <div class="ar-dfoot">
          <input class="ar-note-in" type="text" placeholder="Add a note for the Architect (optional)" aria-label="Note">
          ${key === 'decision' ? `<button type="button" class="ar-btn-link" data-act="tab" data-arg="evidence">Evidence${icon('chev')}</button>` : '<span></span>'}
          <button type="button" class="ar-btn ar-btn-solid" data-act="answer">${icon('check')}Answer</button>
        </div>
      </article>`;
  }

  function overview() {
    const item = project();
    const sc = scenarioOf(item);
    const ratio = Math.min(1, sc.spent / sc.cap);
    const c = 2 * Math.PI * 28;
    const buttons = [
      sc.action ? `<button type="button" class="ar-btn ar-btn-solid" data-act="${sc.action.run}">${esc(sc.action.label)}</button>` : '',
      sc.preview ? `<button type="button" class="ar-btn" data-act="preview">${icon('open')}Open preview</button>` : '',
      item.scenario !== 'unapproved' ? `<button type="button" class="ar-btn" data-act="tab" data-arg="live">${icon('eye')}Watch work</button>` : '',
      sc.evidenceLink ? `<button type="button" class="ar-btn-link" data-act="tab" data-arg="evidence">Evidence${icon('chev')}</button>` : '',
    ].join('');
    const charter = sc.charter ? `
      <article class="ar-card" aria-label="Charter approval">
        <h3 class="ar-q">Approve the charter</h3>
        <p class="ar-why">Cost cap ${usd(sc.cap)} · 3 milestones · Architect asks before each milestone.</p>
        <div class="ar-dfoot"><span></span><span></span><button type="button" class="ar-btn ar-btn-solid" data-act="charter">${icon('check')}Approve charter</button></div>
      </article>` : '';
    return `
      <div class="ar-scroll"><div class="ar-body">
        <div class="ar-stateline">
          <div class="ar-stateline-main">
            <h2 class="ar-sentence">${esc(sc.goal)}</h2>
            <p class="ar-limits">${esc(sc.limits)}</p>
            ${activity(sc)}
            <div class="ar-act-row">${buttons}</div>
            ${sc.next ? `<p class="ar-next">${esc(sc.next)}</p>` : ''}
          </div>
          <div class="ar-ring" role="img" aria-label="Spent ${usd(sc.spent)} of ${usd(sc.cap)}">
            <svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28"/><circle cx="32" cy="32" r="28" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - ratio)).toFixed(1)}"/></svg>
            <div class="ar-ring-num"><b>${usd(sc.spent)}</b><span>spent of ${usd(sc.cap)} start cap</span></div>
          </div>
        </div>
        ${sc.decision ? decisionCard(sc.decision, item.scenario) : ''}${charter}
      </div></div>
      <div class="ar-dock">
        ${S.ack ? `<p class="ar-ack" role="status">${esc(S.ack)}</p>` : ''}
        <form class="ar-composer" data-form="note">
          <textarea aria-label="Note to Architect" placeholder="Send a note to Architect" rows="1" ${item.scenario === 'unapproved' ? 'disabled' : ''}></textarea>
          <button type="submit" class="ar-btn" ${item.scenario === 'unapproved' ? 'disabled' : ''}>Send</button>
        </form>
      </div>`;
  }

  function liveTab(sc) {
    if (sc.workers.length === 0) return '<p class="wk-line">No work is running.</p>';
    return sc.workers.map((group, g) => {
      const head = group.title
        ? `<div class="wk-ghead"><span>${esc(group.title)}</span><button type="button" class="ar-btn-link" data-act="orchestrator">${group.link}${icon('open')}</button></div>`
        : '';
      const lost = group.lost ? '<p class="wk-line" style="margin-bottom:10px">Live work cannot be confirmed in this session.</p>' : '';
      const rows = group.rows.map((row, r) => {
        const key = `${g}-${r}`;
        const watch = row.text !== undefined;
        const open = S.open.has(key);
        return `
          <div class="wk" ${row.child ? 'data-child' : ''}>
            <div class="wk-hd">
              <span class="wk-who">${esc(row.who)}</span>
              <span class="wk-what ${row.quiet ? 'quiet' : ''}">${esc(row.what)}</span>
              ${row.t !== undefined ? tick(row.t) : ''}
              ${watch ? `<button type="button" class="ib" data-act="watch" data-arg="${key}" aria-expanded="${open}" aria-controls="lb-${key}" aria-label="Watch ${esc(row.who)}" title="Watch ${esc(row.who)}">${icon('eye')}</button>` : ''}
            </div>
            ${watch && open ? `<div class="lb" id="lb-${key}"><div class="lb-text">${row.text ? `<span data-stream="${esc(row.text)}"></span>` : 'No output yet.'}</div></div>` : ''}
          </div>`;
      }).join('');
      return `<section class="wk-group">${head}${lost}${rows}</section>`;
    }).join('');
  }

  function workView() {
    const item = project();
    const sc = scenarioOf(item);
    const tabs = [['live', 'Live'], ['plan', 'Plan'], ['research', 'Research'], ['evidence', 'Evidence']];
    let body = '';
    if (S.tab === 'live') body = liveTab(sc);
    if (S.tab === 'plan') {
      body = sc.plan.length === 0 ? '<p class="wk-line">Planning is not recorded yet.</p>' : `<ul class="wk-list">${sc.plan.map((step) => `
        <li>${chip(step)}<span><b>${esc(step.title)}</b> <span class="s">· ${esc(step.state)}</span></span>
        ${step.link ? `<button type="button" class="ar-btn-link" data-act="orchestrator">${step.link}${icon('open')}</button>` : '<span></span>'}</li>`).join('')}</ul>`;
    }
    if (S.tab === 'research') {
      body = sc.plan.length === 0 ? '<p class="wk-line">No research is recorded.</p>' : `<ul class="wk-list">
        <li>${chip({ glyph: 'check', tone: 'live' })}<span><b>Which Web Audio nodes give attack and release without clicks?</b> <span class="s">· Answered</span></span>
        <button type="button" class="ar-btn-link" data-act="orchestrator">Open Room${icon('open')}</button></li></ul>`;
    }
    if (S.tab === 'evidence') {
      body = sc.checks.length === 0 ? '<p class="wk-line">No checks are recorded yet.</p>' : `<ul class="wk-list">${sc.checks.map((check) => `
        <li>${chip({ glyph: 'check', tone: 'live' })}<code>${esc(check.name)}</code><span class="s">passed</span></li>`).join('')}</ul>`;
    }
    return `
      <div class="ar-scroll"><div class="ar-body">
        <div class="wk-tabs" role="tablist" aria-label="Work">${tabs.map(([id, label]) =>
          `<button type="button" role="tab" aria-selected="${S.tab === id}" data-act="tab" data-arg="${id}">${label}</button>`).join('')}</div>
        <div role="tabpanel">${body}</div>
      </div></div>`;
  }

  // ── Dialogs ────────────────────────────────────────────────────────────
  function accessFacts(form) {
    const place = form.mode === 'existing'
      ? workspaces.find((item) => item.id === form.workspace)
      : { name: form.name, path: `${form.location}/${form.name}` };
    return `
      <dl class="ar-facts">
        <dt>Workspace</dt><dd>${esc(place.name)}<small class="mono">${esc(place.path)}</small></dd>
        <dt>Start cap</dt><dd>${usd(Number(form.cap))}<small>Research, building, checks and repairs use this one budget.</small></dd>
        ${access.map(([role, text]) => `<dt>${role}</dt><dd>${text}</dd>`).join('')}
      </dl>`;
  }

  function dialogView() {
    const d = S.dialog;
    if (!d) return '';
    let inner = '';
    if (d.kind === 'intake' && d.step === 1) {
      const f = d.form;
      const where = f.mode === 'new' ? `
          <div class="ar-field"><label for="in-name">Name</label><input id="in-name" data-field="name" value="${esc(f.name)}" placeholder="my-project"></div>
          <div class="ar-field"><label for="in-loc">Location</label><input id="in-loc" data-field="location" value="${esc(f.location)}"></div>` : `
          <div class="ar-field" style="grid-column:span 2"><label for="in-ws">Workspace</label>
            <select id="in-ws" data-field="workspace"><option value="">Choose a workspace</option>${workspaces.map((item) =>
              `<option value="${item.id}" ${item.taken ? 'disabled' : ''} ${f.workspace === item.id ? 'selected' : ''}>${esc(item.name)} · ${item.taken ? 'Architect project' : esc(item.path)}</option>`).join('')}</select></div>`;
      inner = `
        <h2 id="dlg-h">New project</h2>
        <div class="ar-choice" role="group" aria-label="Where will it work?">
          <button type="button" aria-pressed="${f.mode === 'new'}" data-act="mode" data-arg="new">New folder</button>
          <button type="button" aria-pressed="${f.mode === 'existing'}" data-act="mode" data-arg="existing">Existing workspace</button>
        </div>
        <div class="ar-field"><label for="in-idea">What do you want?</label><textarea id="in-idea" data-field="idea">${esc(f.idea)}</textarea></div>
        <div class="ar-row2">${where}
          <div class="ar-field"><label for="in-cap">Start cap ($)</label><input id="in-cap" data-field="cap" type="number" min="1" step="1" value="${esc(f.cap)}"></div>
        </div>
        ${d.error ? `<p class="ar-error" role="alert">${esc(d.error)}</p>` : ''}
        <div class="ar-foot"><button type="button" class="ar-btn" data-act="close">Cancel</button><button type="button" class="ar-btn ar-btn-solid" data-act="continue">Continue</button></div>`;
    } else if (d.kind === 'intake' || d.kind === 'access') {
      inner = `
        <h2 id="dlg-h">Approve the start</h2>
        <p>Paid work starts only after you approve. Architect chooses the agents and the steps in these limits.</p>
        ${accessFacts(d.form)}
        <div class="ar-foot">
          ${d.kind === 'intake' ? '<button type="button" class="ar-btn lead" data-act="back">Back</button>' : ''}
          <button type="button" class="ar-btn" data-act="decline">Not now</button>
          <button type="button" class="ar-btn ar-btn-solid" data-act="approve">Approve and start</button>
        </div>`;
    } else if (d.kind === 'time') {
      inner = `
        <h2 id="dlg-h">Add time to Build the synth</h2>
        <dl class="ar-facts">
          <dt>Active time used</dt><dd>30 min</dd>
          <dt>Time limit</dt><dd>30 min</dd>
          <dt><label for="in-total">New total (min)</label></dt><dd><input id="in-total" type="number" min="31" step="1" value="60" aria-describedby="time-err"></dd>
          <dt>Spend cap</dt><dd>$2.00<small>Not changed</small></dd>
        </dl>
        <p class="ar-error" id="time-err" role="alert" hidden>Enter a total of more than 30 minutes.</p>
        <div class="ar-foot"><button type="button" class="ar-btn" data-act="close">Cancel</button><button type="button" class="ar-btn ar-btn-solid" data-act="addtime">Approve and resume</button></div>`;
    } else if (d.kind === 'preview') {
      inner = `
        <h2 id="dlg-h">Pocket Synth preview</h2>
        <div class="keys" role="img" aria-label="Eight keys, A to K">${'<i></i>'.repeat(8)}</div>
        <div class="ar-foot"><button type="button" class="ar-btn" data-act="close">Close</button></div>`;
    }
    return `<div class="scrim" data-scrim><div class="ar-dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-h">${inner}</div></div>`;
  }

  // ── Orchestrator: the same facts on its own rows ───────────────────────
  function orchestrator() {
    const key = scenarios[S.projects[0].scenario].label ? S.projects[0].scenario : 'working';
    const live = { glyph: 'play', tone: 'live' };
    const wf = {
      lastKnown: [{ glyph: 'history', tone: 'stale' }, 'Last known', 'Step 2 of 4', 'Last activity 14:02 · cannot be confirmed'],
      pausing: [{ glyph: 'pause' }, 'Paused', 'before step 3', 'Paused with Pocket Synth'],
      delivered: [{ glyph: 'check', tone: 'live' }, 'Finished', '4 of 4 steps', 'Last run today'],
      unapproved: [{ glyph: 'dash' }, 'Not started', '', ''],
    }[key] ?? [live, 'Working', `Step 2 of 4 · waiting for the model · <span data-tick="47">${clock(47 + elapsed())}</span>`, 'Last activity 1 min ago'];
    const room = {
      lastKnown: [{ glyph: 'history', tone: 'stale' }, 'Last known', '2 members', '12 min of 30 min active · cannot be confirmed'],
      pausing: [{ glyph: 'pause' }, 'Pausing', '2 turns are still finishing', '12 min of 30 min active'],
      timeLimit: [{ glyph: 'alert', tone: 'danger' }, 'Stopped', 'reached its 30 min time limit', '30 min of 30 min active'],
      delivered: [{ glyph: 'check', tone: 'live' }, 'Finished', '2 members', '24 min of 30 min active'],
      unapproved: [{ glyph: 'dash' }, 'Not started', '', ''],
    }[key] ?? [live, 'Working', '2 members working', '12 min of 30 min active · Last activity 8s ago'];
    const row = (title, [glyph, word, work, mid], money, needs) => `
      <div class="or-row" data-needs="${needs ? 1 : 0}">
        <span><span class="or-title">${title}</span><span class="ar-activity">${chip(glyph)}<span><b>${word}</b>${work ? ` · ${work}` : ''}</span></span></span>
        <span class="or-mid">${mid}</span><span class="or-money">${money}</span>
      </div>`;
    const hold = key === 'timeLimit' ? `
      <div class="or-hold"><p><b>Build the synth reached its 30 min time limit.</b> Saved work is kept.</p>
      <button type="button" class="ar-btn ar-btn-solid" data-act="time">Add time…</button></div>` : '';
    $('orchestrator').innerHTML =
      row('Check sound and controls', wf, '$0.21 of $1.00') + row('Build the synth', room, '$0.83 of $2.00', key === 'timeLimit') + hold;
  }

  // ── Render and events ──────────────────────────────────────────────────
  let dialogRoot;
  function render(focus) {
    const shown = S.projects[1].scenario === 'saved3' ? 'saved3' : S.projects[0].scenario;
    $('scenario').innerHTML = Object.entries(scenarios).filter(([, sc]) => sc.label).map(([key, sc]) =>
      `<button type="button" aria-pressed="${shown === key}" data-act="scenario" data-arg="${key}">${sc.label}</button>`).join('');
    const view = S.view === 'list' ? listView() : S.view === 'work' ? workView() : overview();
    $('app').innerHTML = topBar() + view;
    orchestrator();
    dialogRoot.innerHTML = dialogView();
    draw();
    const target = S.dialog
      ? dialogRoot.querySelector('textarea, input:not([type=radio]), select') ?? dialogRoot.querySelector('.ar-btn-solid')
      : focus && document.querySelector(focus);
    target?.focus();
  }

  const selectorOf = (el) => `[data-act="${el.dataset.act}"]${el.dataset.arg ? `[data-arg="${el.dataset.arg}"]` : ''}`;
  let opener = null;
  const openDialog = (dialog, el) => { opener = el ? selectorOf(el) : null; S.dialog = dialog; S.menu = false; };
  const blankForm = () => ({ mode: 'new', idea: '', name: '', location: '~/Projects', workspace: '', cap: '5' });

  const acts = {
    // The saved three-choice question belongs to a project on the charter flow.
    scenario: (arg) => {
      S.projects[1].scenario = arg === 'saved3' ? 'saved3' : 'legacy';
      S.projectId = arg === 'saved3' ? 'reading' : 'synth';
      if (arg === 'saved3') { S.ack = null; S.answer = null; } else setScenario(arg);
      if (S.view === 'list') S.view = 'project';
    },
    list: () => { S.view = 'list'; S.menu = false; },
    open: (arg) => { S.projectId = arg; S.view = 'project'; S.ack = null; },
    overview: () => { S.view = 'project'; },
    tab: (arg) => { S.view = 'work'; S.tab = arg; },
    watch: (arg) => { if (!S.open.delete(arg)) S.open.add(arg); },
    menu: () => { S.menu = !S.menu; },
    pause: () => { S.menu = false; setScenario('pausing'); },
    resume: () => { S.menu = false; setScenario('working'); },
    answer: () => {
      const sc = scenarioOf(project());
      const id = document.querySelector('input[name="decision"]:checked').value;
      setScenario(project().id === 'reading' ? 'legacy' : 'working', `Answer saved: ${sc.decision.options.find((option) => option.id === id)?.label ?? id}.`);
    },
    charter: () => setScenario('working'),
    orchestrator: () => { document.querySelector('[aria-labelledby="orchestrator-h"]').focus(); return 'keep'; },
    intake: (arg, el) => openDialog({ kind: 'intake', step: 1, form: blankForm() }, el),
    access: (arg, el) => openDialog({ kind: 'access', form: project().form }, el),
    time: (arg, el) => openDialog({ kind: 'time' }, el),
    preview: (arg, el) => openDialog({ kind: 'preview' }, el),
    mode: (arg) => { S.dialog.form.mode = arg; S.dialog.error = null; },
    back: () => { S.dialog.step = 1; },
    close: () => { S.dialog = null; return opener; },
    continue: () => {
      const d = S.dialog;
      const f = d.form;
      const name = f.name.trim();
      d.error = null;
      if (!f.idea.trim()) d.error = 'Tell Architect what you want.';
      else if (f.mode === 'new' && (!name || /[\\/]/.test(name))) d.error = 'Enter a folder name.';
      else if (f.mode === 'new' && workspaces.some((item) => item.name === name)) d.error = 'This folder is there already. Nothing was changed.';
      else if (f.mode === 'existing' && !f.workspace) d.error = 'Choose a workspace.';
      else if (!(Number(f.cap) > 0)) d.error = 'Enter a start cap.';
      else d.step = 2;
    },
    approve: () => finishIntake('quiet'),
    decline: () => finishIntake('unapproved'),
    addtime: () => {
      S.dialog = null;
      S.projectId = 'synth';
      setScenario('working', `Build the synth resumed with a ${document.getElementById('in-total').value} min limit.`);
    },
  };

  function finishIntake(key) {
    const d = S.dialog;
    if (d.kind === 'intake') {
      const f = d.form;
      const name = f.mode === 'existing' ? workspaces.find((item) => item.id === f.workspace)?.name ?? '' : f.name.trim();
      const id = `p${S.projects.length}`;
      scenarios[id] = { ...scenarios[key], label: null, goal: f.idea.trim(), limits: '', cap: Number(f.cap) };
      S.projects.push({ id, name, scenario: id, form: f });
      S.projectId = id;
    } else {
      const item = project();
      scenarios[item.scenario] = { ...scenarios[key], label: null, goal: scenarioOf(item).goal, limits: '', cap: scenarioOf(item).cap };
    }
    S.dialog = null;
    S.view = 'project';
    S.ack = null;
  }

  document.addEventListener('click', (event) => {
    if (event.target.matches('[data-scrim]')) { S.dialog = null; render(opener); return; }
    const el = event.target.closest('[data-act]');
    if (!el) { if (S.menu) { S.menu = false; render(); } return; }
    const focus = selectorOf(el);
    const result = acts[el.dataset.act](el.dataset.arg, el);
    if (result === 'keep') return;
    render(result ?? focus);
  });
  document.addEventListener('input', (event) => {
    const el = event.target;
    if (el.dataset.field && S.dialog) S.dialog.form[el.dataset.field] = el.value;
    if (el.name === 'decision') S.answer = el.value;
    if (el.id === 'in-total') {
      const bad = !(Number.isInteger(Number(el.value)) && Number(el.value) > 30);
      document.getElementById('time-err').hidden = !bad;
      dialogRoot.querySelector('[data-act="addtime"]').disabled = bad;
    }
  });
  document.addEventListener('submit', (event) => {
    event.preventDefault();
    const box = event.target.querySelector('textarea');
    if (!box.value.trim()) return;
    S.ack = 'Sent. Architect reads your note at its next turn.';
    render('.ar-composer textarea');
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && (S.dialog || S.menu)) {
      const back = S.dialog ? opener : '[data-act="menu"]';
      S.dialog = null; S.menu = false;
      render(back);
    }
    if (event.key === 'Tab' && S.dialog) {
      const items = [...dialogRoot.querySelectorAll('button:not(:disabled), input, textarea, select')];
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });

  // Live text repeats its last part, the way the approved live block does.
  function draw() {
    const step = Math.floor((Date.now() - t0) / 260);
    for (const el of document.querySelectorAll('[data-stream]')) {
      const words = el.dataset.stream.split(' ');
      const start = Math.ceil(words.length * 0.4);
      const n = reduce ? words.length : start + (step % (words.length - start + 1));
      if (Number(el.dataset.shown) === n) continue;
      el.dataset.shown = n;
      el.textContent = words.slice(0, n).join(' ');
      if (!reduce) el.insertAdjacentHTML('beforeend', '<span class="caret"></span>');
    }
  }
  setInterval(draw, 260);
  setInterval(() => {
    for (const el of document.querySelectorAll('[data-tick]')) el.textContent = clock(Number(el.dataset.tick) + elapsed());
  }, 1000);

  dialogRoot = document.createElement('div');
  document.body.append(dialogRoot);
  render();
})();
