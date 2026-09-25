/* MCP app view: server protocol details, Tasks and Remote skills. Flat lists, no nested cards. */
(() => {
  const D = window.MCP_DATA;
  const { S, icon, esc } = window.MCP_PROTO;

  function serverItem(server) {
    const open = S.openServer === server.name;
    const version = server.era === 'legacy' ? `${server.revision} (legacy)` : server.revision;
    const meta = [server.transport.toLowerCase(), server.auth === 'none' ? '' : server.auth, version].filter(Boolean).join(' · ');
    const flag = server.failure ? '<span class="pill err">Sign-in failed</span>'
      : server.sse ? '<span class="pill warn">SSE, deprecated</span>' : '';
    return `<li class="item">
      <button class="item-head" data-act="server" data-id="${server.name}" aria-expanded="${open}">
        ${icon('chevron', 'chev')}<span class="item-title">${server.name}</span>${flag}
        <span class="item-meta">${meta}</span></button>
      ${open ? serverDetail(server) : ''}</li>`;
  }

  function serverDetail(server) {
    const alert = server.failure
      ? `<p class="inline-alert err" role="alert">${icon('alert')}The reply came from an unexpected authorization server. Sign in again.</p>`
      : server.sse
        ? `<p class="inline-alert warn">${icon('triangle')}Ask the server owner for a Streamable HTTP URL.</p>`
        : '';
    return `<div class="item-body">${alert}
      <dl class="kv">
        <dt>Protocol</dt><dd>${server.revision ?? 'Not connected'}${server.era === 'legacy' ? ', legacy handshake' : ''}</dd>
        <dt>Extensions</dt><dd>${server.extensions.join(', ') || 'None'}</dd>
        <dt>Transport</dt><dd>${server.transportLabel}</dd>
        <dt>Metadata cache</dt><dd>${server.cache}</dd>
      </dl></div>`;
  }

  const TASK_STATUS = {
    working: ['info', 'Working'], cancelling: ['info', 'Cancelling'], cancelled: ['', 'Cancelled'],
    completed: ['ok', 'Completed'], disconnected: ['warn', 'Disconnected'], blocked: ['err', 'Cannot continue'],
    expired: ['', 'Expired'],
  };

  function taskItem(task) {
    const label = `${task.server} · ${task.tool}`;
    const [tone, status] = TASK_STATUS[task.status];
    const actions = [];
    if (task.status === 'working' || task.status === 'disconnected') {
      actions.push(`<button class="btn small ghost" data-act="task-row-cancel" data-id="${task.id}" aria-label="Cancel ${esc(label)}">Cancel</button>`);
    }
    if (task.status === 'completed') {
      const open = Boolean(S.resultOpen[task.id]);
      actions.push(`<button class="btn small ghost" data-act="task-result" data-id="${task.id}" aria-expanded="${open}">${open ? 'Hide result' : 'Result'}</button>`);
    }
    if (!['working', 'cancelling', 'disconnected'].includes(task.status)) {
      actions.push(`<button class="btn small ghost" data-act="task-dismiss" data-id="${task.id}" aria-label="Dismiss ${esc(label)}">Dismiss</button>`);
    }
    return `<li class="item"><div class="item-row">
        <div class="item-main"><span class="item-title">${esc(label)}</span>
          <span class="item-meta"><span class="status ${tone}">${status}</span> · ${task.age} ago · ${esc(task.chat)}</span>
          ${task.note ? `<span class="item-note">${esc(task.note)}</span>` : ''}
          ${S.resultOpen[task.id] ? `<span class="item-note">${esc(task.result)}</span>` : ''}</div>
        <div class="item-actions">${actions.join('')}</div></div></li>`;
  }

  function skillItem(skill) {
    const on = Boolean(S.skillsOn[skill.id]);
    const changed = S.scenario === 'skills-changed' && skill.id === 'release-notes';
    const name = `${skill.server} / ${skill.id}`;
    return `<li class="item"><div class="item-row">
        <div class="item-main"><span class="item-title">${name}${changed ? ' <span class="pill warn">Changed</span>' : ''}</span>
          <span class="item-meta">${esc(skill.description)}</span>
          <span class="item-meta mono">${skill.uri}</span>
          ${changed ? '<span class="item-note">Sero asks again before this skill runs code.</span>' : ''}</div>
        <button class="switch" role="switch" aria-checked="${on}" aria-label="Use ${name}" data-act="skill-toggle" data-id="${skill.id}"></button>
      </div></li>`;
  }

  function mcpApp() {
    const connected = D.servers.filter((server) => server.status === 'connected').length;
    const tasks = S.tasks.length ? S.tasks.map(taskItem).join('') : '<li class="item muted">No tasks.</li>';
    return `<div class="app-header"><div>
        <div class="app-title">${icon('plug')}<span>MCP</span></div>
        <div class="metrics"><span>Servers: <strong>${D.servers.length}</strong></span><span>Connected: <strong>${connected}</strong></span>
          <span>Errors: <strong>${D.servers.length - connected}</strong></span></div></div>
      <div class="toolbar">
        <button class="btn" data-act="panel" data-id="tasks" aria-pressed="${S.panel === 'tasks'}">${icon('tasks')}Tasks</button>
        <button class="btn" data-act="panel" data-id="skills" aria-pressed="${S.panel === 'skills'}">${icon('book')}Remote skills</button>
      </div></div>
      <div class="app-body">
        ${S.panel === 'tasks' ? `<section aria-labelledby="tasks-title"><h2 class="section-title" id="tasks-title">Tasks</h2><ul class="list">${tasks}</ul></section>` : ''}
        ${S.panel === 'skills' ? `<section aria-labelledby="skills-title"><div class="section-head">
            <h2 class="section-title" id="skills-title">Remote skills</h2>
            <span class="item-meta">Refreshed ${S.refreshed ?? '5 min ago'}</span>
            <button class="btn small ghost" data-act="skills-refresh" ${S.refreshing ? 'disabled' : ''} aria-label="Refresh remote skills">
              ${icon('refresh', S.refreshing ? 'spin' : '')}</button></div>
          <ul class="list">${D.skills.map(skillItem).join('')}</ul></section>` : ''}
        <section aria-labelledby="servers-title"><h2 class="section-title" id="servers-title">Servers</h2>
          <ul class="list">${D.servers.map(serverItem).join('')}</ul></section>
      </div>`;
  }

  window.MCP_PROTO.mcpApp = mcpApp;
})();
