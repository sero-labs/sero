/* Renders the current state and handles every interaction. */
(() => {
  const D = window.MCP_DATA;
  const P = window.MCP_PROTO;
  const { S, enter } = P;

  const CHAT_TITLES = { app: 'EMEA dashboard', input: 'New contact', task: 'Q3 report', skill: 'Release notes 2.4' };

  function chatFor(scenario) {
    if (scenario.startsWith('app-')) return P.appsChat();
    if (scenario.startsWith('input-')) return P.inputChat();
    if (scenario.startsWith('task-')) return P.taskChat();
    if (scenario.startsWith('skill-')) return P.skillChat();
    return { chat: '<p class="muted" style="margin:auto;text-align:center">This state has no chat messages.</p>', question: '' };
  }

  function render(focus) {
    S.escAct = null;
    const { chat, question } = chatFor(S.scenario);
    const feedback = S.scenario === 'input-1' || S.scenario === 'input-2';
    document.getElementById('app-area').innerHTML = feedback ? P.feedbackApp() : P.mcpApp();
    document.getElementById('app-area').setAttribute('aria-label', feedback ? 'User Feedback app' : 'MCP app');
    document.getElementById('chat-scroll').innerHTML = chat;
    document.getElementById('question-slot').innerHTML = question;
    document.getElementById('chat-title').textContent = CHAT_TITLES[S.scenario.split('-')[0]] ?? 'New chat';
    for (const button of document.querySelectorAll('.state')) {
      button.setAttribute('aria-current', String(button.dataset.state === S.scenario));
    }
    if (focus) restoreFocus(focus);
  }

  // After a re-render, focus the same control, or the first marked control.
  function restoreFocus({ act, id }) {
    const same = document.querySelector(`[data-act="${act}"]${id ? `[data-id="${id}"]` : ''}:not(:disabled)`);
    const inChat = /^(app|input|task|skill)-/.test(S.scenario) && !S.scenario.match(/^input-[12]$/);
    const target = same ?? document.querySelector('.question-slot [data-focus], .app-area [data-focus]')
      ?? document.getElementById(inChat ? 'chat-scroll' : 'app-area');
    target.focus();
  }

  function go(scenario, focus) {
    enter(scenario);
    render(focus);
    const area = document.getElementById('app-area');
    const open = area.querySelector('.server.open');
    if (open) open.scrollIntoView({ block: 'start' });
    else area.scrollTop = 0;
  }

  const questions = () => D.rounds[S.scenario === 'input-1' ? 0 : 1];

  const ACTIONS = {
    'toggle-tool': (id) => { S.toolOpen[id] = !(S.toolOpen[id] ?? true); },
    'app-refresh': () => { S.scenario = 'app-tool-call'; },
    'app-copy': () => { S.scenario = 'app-permission'; S.perm = null; },
    'app-issue': () => { S.scenario = 'app-refused'; },
    'perm-allow': () => { S.perm = 'allowed'; },
    'perm-deny': () => { S.perm = 'denied'; },
    'skill-allow': () => enter('skill-allowed'),
    'skill-deny': () => enter('skill-denied'),
    'q-pick': (_id, el) => {
      const current = questions()[S.q.step];
      if (el.dataset.value === 'decline') {
        S.q.answers = { [current.id]: 'decline' };
        S.q.step = questions().length;
        return;
      }
      S.q.answers[current.id] = el.dataset.value;
      S.q.step += 1;
    },
    'q-step': (_id, el) => { S.q.step = Number(el.dataset.step); },
    'q-next': () => { S.q.step += 1; },
    'q-skip': () => { S.q.step += 1; },
    'q-back': () => { S.q.step -= 1; },
    'q-cancel': () => enter('input-cancelled'),
    'q-submit': () => {
      const answers = S.q.answers;
      if (answers[questions()[0].id] === 'decline') return enter('input-declined');
      if (S.scenario === 'input-1') {
        S.a1 = answers;
        return enter('input-2');
      }
      S.a2 = answers;
      return enter('input-done');
    },
    'task-cancel': () => {
      S.taskCancel = 'requested';
      setTimeout(() => { if (S.taskCancel === 'requested') { S.taskCancel = 'cancelled'; render(); } }, 1200);
    },
    'task-row-cancel': (id) => {
      const task = S.tasks.find((item) => item.id === id);
      task.status = 'cancelling';
      task.note = 'Sero sent a cancel request. It waits for the server to confirm.';
      setTimeout(() => { task.status = 'cancelled'; task.note = 'The server confirmed the cancel.'; render(); }, 1200);
    },
    'task-result': (id) => { S.resultOpen[id] = !S.resultOpen[id]; },
    'task-dismiss': (id) => { S.tasks = S.tasks.filter((item) => item.id !== id); },
    'skill-toggle': (id) => { S.skillsOn[id] = !S.skillsOn[id]; },
    'skills-refresh': () => {
      S.refreshing = true;
      setTimeout(() => { S.refreshing = false; S.refreshed = 'just now'; render({ act: 'skills-refresh' }); }, 900);
    },
    panel: (id) => { S.panel = S.panel === id ? null : id; },
    server: (id) => { S.openServer = S.openServer === id ? null : id; },
  };

  document.addEventListener('click', (event) => {
    const state = event.target.closest('.state');
    if (state) {
      go(state.dataset.state);
      return;
    }
    const el = event.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const { act, id } = el.dataset;
    const before = S.scenario;
    ACTIONS[act]?.(id, el);
    // A state change moves focus to the new content; otherwise keep it on the control.
    render(S.scenario === before ? { act, id } : { act: '__none' });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && S.escAct) {
      event.preventDefault();
      const act = S.escAct;
      ACTIONS[act]();
      render({ act: '__none' });
      return;
    }
    const state = event.target.closest?.('.state');
    if (state && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      const all = [...document.querySelectorAll('.state')];
      const next = all[all.indexOf(state) + (event.key === 'ArrowDown' ? 1 : -1)];
      next?.focus();
    }
  });

  go(new URLSearchParams(location.search).get('state') ?? 'app-rendered');
})();
