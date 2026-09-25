/* MCP app view: server protocol details, Tasks and Remote skills. One card per panel, rows inside are not boxed. */
(() => {
  const D = window.MCP_DATA;
  const { S, icon, esc } = window.MCP_PROTO;

  function panel({ id, iconId, title, count, actions = '', body }) {
    return `<section class="panel-card" aria-labelledby="${id}">
      <div class="panel-head">${icon(iconId)}<h2 id="${id}">${title}</h2>
        ${count === undefined ? '' : `<span class="count">${count}</span>`}<span class="panel-actions">${actions}</span></div>
      <ul class="list">${body}</ul></section>`;
  }

  function serverItem(server) {
    const open = S.openServer === server.name;
    const tone = server.failure ? 'err' : server.sse ? 'warn' : 'ok';
    const chips = [
      server.era === 'modern' ? `<span class="pill info">${server.revision}</span>` : '',
      server.era === 'legacy' ? `<span class="pill">${server.revision} · legacy</span>` : '',
      server.sse ? '<span class="pill warn">SSE, deprecated</span>' : '',
      server.failure ? '<span class="pill err">Sign-in failed</span>' : '',
    ].join('');
    const meta = [server.transport.toLowerCase(), server.auth === 'none' ? '' : server.auth].filter(Boolean).join(' · ');
    return `<li class="item">
      <button class="item-head" data-act="server" data-id="${server.name}" aria-expanded="${open}">
        ${icon('chevron', 'chev')}<span class="status-dot ${tone}"></span><span class="item-title">${server.name}</span>${chips}
        <span class="item-meta">${meta}</span></button>
      ${open ? serverDetail(server) : ''}</li>`;
  }

  function serverDetail(server) {
    const alert = server.failure
      ? `<p class="inline-alert err" role="alert">${icon('alert')}The reply came from an unexpected authorization server. Sign in again.</p>`
      : server.sse ? `<p class="inline-alert warn">${icon('triangle')}Ask the server owner for a Streamable HTTP URL.</p>` : '';
    const extensions = server.extensions.length
      ? server.extensions.map((name) => `<span class="pill info">${name}</span>`).join(' ') : 'None';
    return `<div class="item-body">${alert}
      <dl class="kv">
        <dt>Protocol</dt><dd>${server.revision ?? 'Not connected'}${server.era === 'legacy' ? ', legacy handshake' : ''}</dd>
        <dt>Extensions</dt><dd>${extensions}</dd>
        <dt>Transport</dt><dd>${server.transportLabel}</dd>
        <dt>Metadata cache</dt><dd>${server.cache}</dd>
      </dl></div>`;
  }

  const TASK_STATUS = {
    working: ['info', 'loader', 'Working'], cancelling: ['info', 'loader', 'Cancelling'], cancelled: ['', 'ban', 'Cancelled'],
    completed: ['ok', 'check', 'Completed'], disconnected: ['warn', 'triangle', 'Disconnected'],
    blocked: ['err', 'alert', 'Cannot continue'], expired: ['', 'clock', 'Expired'],
  };

  function taskItem(task) {
    const label = `${task.server} · ${task.tool}`;
    const [tone, iconId, status] = TASK_STATUS[task.status];
    const actions = [];
    if (task.status === 'working' || task.status === 'disconnected') {
      actions.push(`<button class="btn small" data-act="task-row-cancel" data-id="${task.id}" aria-label="Cancel ${esc(label)}">Cancel</button>`);
    }
    if (task.status === 'completed') {
      const open = Boolean(S.resultOpen[task.id]);
      actions.push(`<button class="btn small" data-act="task-result" data-id="${task.id}" aria-expanded="${open}">${open ? 'Hide result' : 'Result'}</button>`);
    }
    if (!['working', 'cancelling', 'disconnected'].includes(task.status)) {
      actions.push(`<button class="btn small ghost" data-act="task-dismiss" data-id="${task.id}" aria-label="Dismiss ${esc(label)}">Dismiss</button>`);
    }
    return `<li class="item"><div class="item-row">
        <span class="icon-tile ${tone}">${icon(iconId, iconId === 'loader' ? 'spin' : '')}</span>
        <div class="item-main"><span class="item-title"><span class="muted">${task.server} ·</span> ${esc(task.tool)}</span>
          <span class="item-meta"><span class="status ${tone}">${status}</span> · ${task.age} ago · ${esc(task.chat)}</span>
          ${task.note ? `<span class="item-note">${esc(task.note)}</span>` : ''}
          ${S.resultOpen[task.id] ? `<span class="item-result">${esc(task.result)}</span>` : ''}</div>
        <div class="item-actions">${actions.join('')}</div></div></li>`;
  }

  function skillItem(skill) {
    const on = Boolean(S.skillsOn[skill.id]);
    const changed = S.scenario === 'skills-changed' && skill.id === 'release-notes';
    const name = `${skill.server} / ${skill.id}`;
    return `<li class="item"><div class="item-row">
        <span class="icon-tile ${on ? 'brand' : ''}">${icon('book')}</span>
        <div class="item-main"><span class="item-title">${name}${changed ? ' <span class="pill warn">Changed</span>' : ''}</span>
          <span class="item-meta">${esc(skill.description)}</span>
          <span class="item-meta mono">${skill.uri}</span>
          ${changed ? '<span class="item-note warn">Sero asks again before this skill runs code.</span>' : ''}</div>
        <button class="switch" role="switch" aria-checked="${on}" aria-label="Use ${name}" data-act="skill-toggle" data-id="${skill.id}"></button>
      </div></li>`;
  }

  function mcpApp() {
    const connected = D.servers.filter((server) => server.status === 'connected').length;
    const activeTasks = S.tasks.filter((task) => ['working', 'cancelling', 'disconnected'].includes(task.status)).length;
    const skillsOn = Object.values(S.skillsOn).filter(Boolean).length;
    const refresh = `<span class="item-meta">Refreshed ${S.refreshed ?? '5 min ago'}</span>
      <button class="btn small ghost" data-act="skills-refresh" ${S.refreshing ? 'disabled' : ''} aria-label="Refresh remote skills">
        ${icon('refresh', S.refreshing ? 'spin' : '')}</button>`;
    return `<div class="app-header"><div>
        <div class="app-title">${icon('plug')}<span>MCP</span></div>
        <div class="metrics"><span>Servers: <strong>${D.servers.length}</strong></span><span>Connected: <strong>${connected}</strong></span>
          <span>Errors: <strong>${D.servers.length - connected}</strong></span></div></div>
      <div class="toolbar">
        <button class="btn" data-act="panel" data-id="tasks" aria-pressed="${S.panel === 'tasks'}">${icon('tasks')}Tasks${activeTasks ? ` <span class="count">${activeTasks}</span>` : ''}</button>
        <button class="btn" data-act="panel" data-id="skills" aria-pressed="${S.panel === 'skills'}">${icon('book')}Remote skills</button>
      </div></div>
      <div class="app-body">
        ${S.panel === 'tasks' ? panel({ id: 'tasks-title', iconId: 'tasks', title: 'Tasks', count: S.tasks.length,
          body: S.tasks.length ? S.tasks.map(taskItem).join('') : '<li class="item empty">No tasks.</li>' }) : ''}
        ${S.panel === 'skills' ? panel({ id: 'skills-title', iconId: 'book', title: 'Remote skills', count: `${skillsOn} of ${D.skills.length} on`,
          actions: refresh, body: D.skills.map(skillItem).join('') }) : ''}
        ${panel({ id: 'servers-title', iconId: 'server', title: 'Servers', count: D.servers.length, body: D.servers.map(serverItem).join('') })}
      </div>`;
  }

  window.MCP_PROTO.mcpApp = mcpApp;
})();
