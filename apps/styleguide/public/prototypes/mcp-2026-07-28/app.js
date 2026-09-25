/* MCP 2026-07-28 prototype: chat states and the User Feedback questionnaire. */
(() => {
  const D = window.MCP_DATA;
  const icon = (id, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const esc = (value) => String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  const S = { scenario: 'app-rendered' };

  function enter(id) {
    Object.assign(S, {
      scenario: id, toolOpen: {}, perm: null, escAct: null,
      q: { step: 0, answers: {} }, taskCancel: null,
      tasks: D.tasks.map((task) => ({ ...task })), resultOpen: {},
      refreshing: false, refreshed: null,
      panel: id === 'tasks-panel' ? 'tasks' : id.startsWith('skills-') ? 'skills' : null,
      skillsOn: id === 'skills-on' || id === 'skills-changed' ? { 'release-notes': true } : {},
      openServer: { 'server-modern': 'sales', 'server-legacy': 'crm', 'server-sse': 'old-analytics', 'server-failed': 'github' }[id] ?? null,
    });
  }

  // ── Chat building blocks ────────────────────────────────────────
  const DOT = { done: '', run: 'run pulse', err: 'err', cancel: 'cancel', pend: 'pend' };

  function toolCard({ id, state, name = 'mcp', sum, body, live = false }) {
    const open = S.toolOpen[id] ?? true;
    const tone = state === 'run' || state === 'pend' ? 'live' : state === 'err' ? 'error' : '';
    return `<div class="tool ${tone}">
      <button class="tool-head" data-act="toggle-tool" data-id="${id}" aria-expanded="${open}">
        ${icon('chevron', 'chev')}<span class="dot ${DOT[state]}"></span>
        <span class="tool-name">${name}</span><span class="tool-sum">${esc(sum)}</span>
        ${live ? '<span class="live-pill">Live</span>' : ''}
        ${state === 'cancel' ? '<span class="tool-flag" style="color:var(--status-warning)">cancelled</span>' : ''}
      </button>
      ${open ? `<div class="tool-body">${body}</div>` : ''}
    </div>`;
  }

  const inputRows = (rows) => `<div>${Object.entries(rows)
    .map(([key, value]) => `<div class="input-row"><span>${key}</span><span>${esc(value)}</span></div>`).join('')}</div>`;
  const output = (text, isError = false) => `<div><span class="lbl">${isError ? 'error' : 'output'}</span>
    <div class="out ${isError ? 'err' : ''}">${esc(text)}</div></div>`;
  const user = (text) => `<div class="msg-user">${esc(text)}</div>`;
  const agent = (text) => `<div class="msg-agent">${esc(text)}</div>`;
  const waiting = (text) => `<div class="status-line" role="status">${icon('loader', 'spin')}${text}</div>`;

  function questionCard({ source, label, prompt, code, deny, allow }) {
    S.escAct = deny;
    return `<div class="qcard" role="region" aria-label="${esc(label)}">
      <div class="qcard-head">${icon('chevron')}<span class="dot run pulse"></span>
        <span class="src">${esc(source)}</span>
        <button class="icon-btn" data-act="${deny}" aria-label="Deny">${icon('x')}</button></div>
      <div class="qcard-body"><p class="label">${esc(label)}</p>${prompt ? `<p>${esc(prompt)}</p>` : ''}${code ? `<code>${esc(code)}</code>` : ''}</div>
      <div class="qcard-actions">
        <button class="btn primary small" data-act="${deny}" data-focus>Deny</button>
        <button class="btn small" data-act="${allow}">Allow</button>
      </div></div>`;
  }

  // ── Chat: MCP app in a tool result ──────────────────────────────
  const BARS = [['Germany', 82, '€0.92M'], ['France', 61, '€0.68M'], ['Spain', 38, '€0.43M'], ['Italy', 34, '€0.38M']];
  const BARS_NEW = [['Germany', 86, '€0.96M'], ['France', 63, '€0.70M'], ['Spain', 37, '€0.42M'], ['Italy', 35, '€0.39M']];

  function appFrame() {
    const sc = S.scenario;
    if (sc === 'app-loading') {
      return `<div class="app-frame"><div class="app-canvas loading" role="status">${icon('loader', 'spin')}Loading app…</div></div>`;
    }
    const bars = (sc === 'app-tool-call' ? BARS_NEW : BARS).map(([country, width, value]) =>
      `<div class="demo-bar"><span>${country}</span><i style="width:${width}%"></i><b>${value}</b></div>`).join('');
    const foot = {
      'app-tool-call': `${icon('check')}App called get_sales_summary`,
      'app-refused': `${icon('ban')}Blocked: the app tried to call a tool on github`,
      'app-permission': { null: '', allowed: `${icon('check')}Clipboard allowed`, denied: `${icon('ban')}Clipboard denied` }[S.perm],
    }[sc];
    return `<div class="app-frame">
      <div class="app-canvas" role="group" aria-label="App from sales">
        <div class="demo-head"><span>EMEA revenue, Q3</span>
          <span class="demo-actions">
            <button class="demo-btn" data-act="app-refresh">Refresh</button>
            <button class="demo-btn" data-act="app-copy">Copy table</button>
            <button class="demo-btn" data-act="app-issue">Attach to issue</button></span></div>
        <div class="demo-bars">${bars}</div></div>
      ${foot ? `<div class="app-frame-foot ${sc === 'app-refused' ? 'err' : ''}" role="status">${foot}</div>` : ''}</div>`;
  }

  function appsChat() {
    const sc = S.scenario;
    const frame = sc === 'app-fallback'
      ? `<p class="fallback">${icon('monitor')}App not shown: Sero does not support its format.</p>`
      : appFrame();
    const body = inputRows({ server: 'sales', tool: 'show_dashboard', arguments: '{"region":"EMEA"}' })
      + frame + output('EMEA revenue for Q3 by country: 4 rows, total €2.41M.');
    const question = sc === 'app-permission' && S.perm === null ? questionCard({
      source: 'sales · show_dashboard app', label: 'Allow the app to write to your clipboard?',
      deny: 'perm-deny', allow: 'perm-allow',
    }) : '';
    return {
      chat: user('Show me the EMEA sales dashboard.') + agent('Here is the dashboard from the sales server.')
        + toolCard({ id: 'dash', state: 'done', sum: 'call sales show_dashboard {"region":"EMEA"}', body }),
      question,
    };
  }

  // ── Chat: server input request ─────────────────────────────────
  const labelOf = (round, questionId, value) => D.rounds[round].find((q) => q.id === questionId)
    ?.options.find((option) => option.value === value)?.label ?? value;

  function inputChat() {
    const sc = S.scenario;
    const a1 = S.a1 ?? { company: 'acme-ltd', consent: 'yes' };
    const a2 = S.a2 ?? { owner: 'emea' };
    const state = { 'input-1': 'run', 'input-2': 'run', 'input-cancelled': 'cancel' }[sc] ?? 'done';
    const result = {
      'input-1': waiting('Waiting for your answers'),
      'input-2': waiting('Waiting for your answers'),
      'input-done': output(`Created contact Ana Ruiz at ${labelOf(0, 'company', a1.company)} (id 4812). Owner: ${labelOf(1, 'owner', a2.owner)}.`),
      'input-declined': output('crm got your decline. It did not create the contact.'),
      'input-cancelled': output('Cancelled.'),
    }[sc];
    return {
      chat: user('Add Ana Ruiz from Acme to the CRM.') + agent('I will create the contact in crm.')
        + toolCard({ id: 'crm', state, sum: 'call crm create_contact {"name":"Ana Ruiz"}', live: state === 'run',
          body: inputRows({ server: 'crm', tool: 'create_contact', arguments: '{"name":"Ana Ruiz"}' }) + result }),
      question: '',
    };
  }

  function feedbackApp() {
    const round = S.scenario === 'input-1' ? 0 : 1;
    const questions = D.rounds[round];
    const { step, answers } = S.q;
    const isReview = step === questions.length;
    const current = questions[step];
    const answered = current ? Boolean(answers[current.id]) : false;
    const declined = answers[questions[0].id] === 'decline';
    const steps = questions.map((q, i) => `<button class="step ${i === step ? 'current' : ''} ${answers[q.id] ? 'done' : ''}"
        data-act="q-step" data-step="${i}" ${i === step ? 'aria-current="step"' : ''}>
        ${answers[q.id] ? icon('check') : i + 1} ${esc(q.label)}</button>`).join('')
      + `<button class="step ${isReview ? 'current done' : ''}" data-act="q-step" data-step="${questions.length}" ${isReview ? 'aria-current="step"' : ''}>Review</button>`;
    let body;
    if (isReview) {
      const rows = declined
        ? '<div>Decline: crm gets no answers.</div>'
        : questions.map((q) => `<div><span class="muted">${esc(q.label)}:</span> ${answers[q.id] ? esc(labelOf(round, q.id, answers[q.id])) : '<span style="color:#fcd34d">Skipped</span>'}</div>`).join('');
      body = `<div class="review-list">${rows}</div>
        <div style="margin-top:14px"><button class="btn primary" data-act="q-submit" data-focus>Submit</button></div>`;
    } else {
      body = `<p class="q-prompt" id="q-prompt">${esc(current.prompt)}</p>
        <div class="q-options" role="group" aria-labelledby="q-prompt">${current.options.map((option, i) => `
          <button class="q-option" data-act="q-pick" data-value="${option.value}" aria-pressed="${answers[current.id] === option.value}" ${i === 0 ? 'data-focus' : ''}>
            <span class="q-num">${i + 1}</span><span>${esc(option.label)}${option.description ? `<small>${esc(option.description)}</small>` : ''}</span>
          </button>`).join('')}</div>`;
    }
    const hint = isReview ? 'Submit when ready.' : answered ? 'Next is ready when you want to continue.'
      : 'Pick an answer, or use Skip if you want to leave this question unanswered.';
    return `<div class="feedback">
      <h1>Questionnaire</h1>
      <p class="source-line">${icon('server')}crm · create_contact</p>
      <div class="steps">${steps}</div>
      <div class="q-card">${body}</div>
      <div class="q-footer"><p class="q-hint">${hint}</p><div class="q-actions">
        <button class="btn ghost" data-act="q-cancel">Cancel</button><div>
        ${step > 0 ? '<button class="btn" data-act="q-back">Back</button>' : ''}
        ${isReview ? '' : `<button class="btn ${answered ? 'ghost' : ''}" data-act="q-skip">Skip</button>
          <button class="btn ${answered ? 'primary' : ''}" data-act="q-next" ${answered ? '' : 'disabled'}>${step < questions.length - 1 ? 'Next' : 'Review'}</button>`}
      </div></div></div></div>`;
  }

  // ── Chat: task ──────────────────────────────────────────────────
  function taskChat() {
    const body = inputRows({ server: 'reports', tool: 'build_quarterly_report', arguments: '{"quarter":"Q3"}' })
      + output('Task tsk_7f3a started on reports.');
    let tail;
    if (S.scenario === 'task-result') {
      tail = `<div class="task-msg" role="note"><div class="task-msg-head">${icon('check')}build_quarterly_report finished</div>
        <p>The Q3 report is ready: reports/q3-2026.pdf (42 pages).</p></div>`;
    } else if (S.taskCancel === 'cancelled') {
      tail = `<div class="task-strip" role="status">${icon('ban')}<span class="grow">build_quarterly_report cancelled</span></div>`;
    } else {
      const busy = S.taskCancel === 'requested';
      tail = `<div class="task-strip" role="status">${icon('loader', 'spin')}<span class="grow">build_quarterly_report · ${busy ? 'cancelling' : 'running 2 min'}</span>
        <button class="btn small ghost" data-act="task-cancel" ${busy ? 'disabled' : ''}>Cancel</button></div>`;
    }
    return {
      chat: user('Build the Q3 report.') + agent('The reports server runs this as a task. The result appears here when it is ready.')
        + toolCard({ id: 'task', state: 'done', sum: 'call reports build_quarterly_report {"quarter":"Q3"}', body }) + tail,
      question: '',
    };
  }

  // ── Chat: remote skill ─────────────────────────────────────────
  function skillChat() {
    const sc = S.scenario;
    const command = 'npm run changelog -- --from v2.3.0';
    const load = toolCard({ id: 'load', state: 'done', sum: 'skill load docs release-notes',
      body: output('Loaded docs / release-notes.') });
    const state = { 'skill-approval': 'pend', 'skill-allowed': 'done', 'skill-denied': 'err' }[sc];
    const result = {
      'skill-approval': waiting('Waiting for your approval'),
      'skill-allowed': output('Wrote CHANGELOG.md with 18 entries.'),
      'skill-denied': output('Blocked: you denied code for docs / release-notes.', true),
    }[sc];
    const run = toolCard({ id: 'bash', state, name: 'bash', sum: command, body: inputRows({ command }) + result });
    const question = sc === 'skill-approval' ? questionCard({
      source: 'docs · remote skill release-notes', label: 'Let this remote skill run code?',
      prompt: 'Applies until the server changes the skill.', code: command, deny: 'skill-deny', allow: 'skill-allow',
    }) : '';
    return {
      chat: user('Write the release notes for 2.4.') + agent('I will use the release-notes skill from the docs server.') + load + run,
      question,
    };
  }

  window.MCP_PROTO = { S, enter, icon, esc, feedbackApp, appsChat, inputChat, taskChat, skillChat };
})();
