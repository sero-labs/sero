/* MCP app view: server protocol details, Tasks panel, Remote skills panel. */
(() => {
  const D = window.MCP_DATA;
  const { S, icon, esc, note } = window.MCP_PROTO;
  const NEW = '<span class="new-tag">New</span>';

  function serverRow(server) {
    const open = S.openServer === server.name;
    const pills = [
      server.status === 'connected' ? '<span class="pill ok">connected</span>' : '<span class="pill err">error</span>',
      server.era === 'modern' ? `<span class="pill info">${server.revision}</span>` : '',
      server.era === 'legacy' ? `<span class="pill">${server.revision} · legacy</span>` : '',
      server.sse ? '<span class="pill warn">SSE · deprecated</span>' : '',
      server.failure ? '<span class="pill err">Failed at authorization</span>' : '',
    ].join('');
    return `<div class="server ${open ? 'open' : ''}">
      <div class="row-head"><div>
        <div class="row-title">${server.name} <span class="pill">User config</span></div>
        <div class="row-meta">${server.transport} · ${server.lifecycle} lifecycle · auth ${server.auth}</div>
        <div class="pills">${pills}</div></div>
        <button class="btn small" data-act="server" data-id="${server.name}" aria-expanded="${open}">
          ${icon('chevron')}${open ? 'Hide details' : 'Show details'}</button>
      </div>${open ? serverDetail(server) : ''}</div>`;
  }

  function serverDetail(server) {
    const revision = server.era === 'modern' ? '2026-07-28 (modern)'
      : server.era === 'legacy' ? `${server.revision} (legacy handshake)` : 'Not connected';
    const extensions = server.extensions.length
      ? server.extensions.map((name) => `<span class="pill info">${name}</span>`).join(' ') : 'None';
    return `<div class="server-detail">
      ${server.failure ? `<div class="alert err" role="alert">${icon('alert')}<div><strong>Sign-in failed</strong>
        <p>The sign-in reply came from a different authorization server than expected. Sero stopped before it sent the sign-in code. Sign in again.</p></div></div>` : ''}
      ${server.sse ? `<div class="alert warn">${icon('triangle')}<div><strong>Deprecated transport</strong>
        <p>This saved server uses SSE. Sero still connects to it, but you cannot add new SSE servers. Ask the server owner for a Streamable HTTP URL.</p></div></div>` : ''}
      <div class="card"><h3>${icon('plug')}Protocol ${NEW}</h3>
        <dl class="kv">
          <dt>Revision</dt><dd>${revision}</dd>
          <dt>Extensions</dt><dd>${extensions}</dd>
          <dt>Transport</dt><dd>${server.transportLabel}${server.sse ? ' (deprecated)' : ''}</dd>
          <dt>Metadata cache</dt><dd>${server.cache}</dd>
          ${server.failure ? '<dt>Failed step</dt><dd>Authorization</dd>' : ''}
        </dl></div>
      ${note('The current cards for sign-in, tool runner, resources and UI tools stay below this card.')}
    </div>`;
  }

  const TASK_PILL = {
    working: `<span class="pill info">${icon('loader', 'spin')}Working</span>`,
    cancelling: '<span class="pill info">Cancel sent</span>',
    cancelled: '<span class="pill">Cancelled</span>',
    completed: '<span class="pill ok">Completed</span>',
    disconnected: '<span class="pill warn">Disconnected</span>',
    blocked: '<span class="pill err">Cannot continue</span>',
    expired: '<span class="pill">Expired</span>',
  };

  function taskRow(task) {
    const label = `${task.server} · ${task.tool}`;
    const actions = [];
    if (task.status === 'working' || task.status === 'disconnected') {
      actions.push(`<button class="btn small" data-act="task-row-cancel" data-id="${task.id}" aria-label="Cancel ${esc(label)}">Cancel</button>`);
    }
    if (task.status === 'completed') {
      const open = Boolean(S.resultOpen[task.id]);
      actions.push(`<button class="btn small" data-act="task-result" data-id="${task.id}" aria-expanded="${open}">${open ? 'Hide result' : 'Show result'}</button>`);
    }
    if (!['working', 'cancelling', 'disconnected'].includes(task.status)) {
      actions.push(`<button class="btn small ghost" data-act="task-dismiss" data-id="${task.id}" aria-label="Dismiss ${esc(label)}">Dismiss</button>`);
    }
    return `<div class="row"><div class="row-head"><div>
        <div class="row-title">${esc(label)}</div>
        <div class="row-meta">${task.id} · started ${task.age} ago · chat: ${esc(task.chat)}</div></div>
        <div class="row-actions">${actions.join('')}</div></div>
      <div class="pills">${TASK_PILL[task.status]}</div>
      ${task.note ? `<p class="row-meta">${esc(task.note)}</p>` : ''}
      ${S.resultOpen[task.id] ? `<div class="result-box">${esc(task.result)}</div>` : ''}</div>`;
  }

  function tasksCard() {
    const rows = S.tasks.length ? S.tasks.map(taskRow).join('') : '<p class="muted">No tasks.</p>';
    return `<section class="card" aria-labelledby="tasks-title"><div class="card-head"><div>
      <h3 id="tasks-title">${icon('tasks')}Tasks ${NEW}</h3>
      <p class="card-desc">Tool calls that a server runs as a task. Sero keeps them when it restarts. Results of tasks from closed chats stay here.</p>
      </div></div><div class="rows">${rows}</div></section>`;
  }

  function skillRow(skill) {
    const on = Boolean(S.skillsOn[skill.id]);
    const changed = S.scenario === 'skills-changed' && skill.id === 'release-notes';
    const name = `${skill.server} / ${skill.id}`;
    return `<div class="row"><div class="row-head"><div>
        <div class="row-title">${name}</div><div class="row-meta">${skill.uri}</div>
        <p class="row-meta">${esc(skill.description)}</p></div>
        <button class="switch" role="switch" aria-checked="${on}" aria-label="Use ${name}" data-act="skill-toggle" data-id="${skill.id}"></button></div>
      <div class="pills">${changed ? '<span class="pill warn">Changed on server</span>' : '<span class="pill ok">Verified</span>'}
        <span class="pill">${on ? 'On' : 'Off'}</span><span class="pill">Refreshed ${S.refreshed ?? skill.refreshed}</span></div>
      ${changed ? '<p class="row-meta">The server changed the files of this skill. Sero removed your approval to run code and asks again at the next load.</p>' : ''}
      ${skill.note ? `<p class="row-meta">${esc(skill.note)}</p>` : ''}</div>`;
  }

  function skillsCard() {
    return `<section class="card" aria-labelledby="skills-title"><div class="card-head"><div>
      <h3 id="skills-title">${icon('book')}Remote skills ${NEW}</h3>
      <p class="card-desc">Skills that MCP servers offer. The agent sees a remote skill only after you turn it on.</p></div>
      <button class="btn small" data-act="skills-refresh" ${S.refreshing ? 'disabled' : ''}>
        ${icon('refresh', S.refreshing ? 'spin' : '')}${S.refreshing ? 'Refreshing' : 'Refresh'}</button></div>
      <div class="rows">${D.skills.map(skillRow).join('')}</div>
      ${S.scenario === 'skills-off' ? note('<b>Default to confirm.</b> Every remote skill starts off.') : ''}</section>`;
  }

  function mcpApp() {
    const connected = D.servers.filter((server) => server.status === 'connected').length;
    const metric = (label, value) => `<span>${label}: <strong>${value}</strong></span>`;
    return `<div class="app-header"><div>
        <div class="app-title">${icon('plug')}<span>MCP</span><span class="pill">has errors</span></div>
        <div class="metrics">${metric('Servers', D.servers.length)}${metric('Connected', connected)}
          ${metric('Needs auth', 0)}${metric('Errors', D.servers.length - connected)}</div></div>
      <div class="toolbar">
        <button class="btn" data-act="panel" data-id="tasks" aria-pressed="${S.panel === 'tasks'}">${icon('tasks')}Tasks</button>
        <button class="btn" data-act="panel" data-id="skills" aria-pressed="${S.panel === 'skills'}">${icon('book')}Remote skills</button>
      </div></div>
      <div class="app-body">
        ${note('Search, Diagnostics, Raw config and Refresh stay in the header. The prototype leaves them out.')}
        ${S.panel === 'tasks' ? tasksCard() : ''}${S.panel === 'skills' ? skillsCard() : ''}
        <section class="card" aria-labelledby="servers-title"><h3 id="servers-title">${icon('server')}Servers</h3>
          <div class="rows">${D.servers.map(serverRow).join('')}</div></section>
      </div>`;
  }

  window.MCP_PROTO.mcpApp = mcpApp;
})();
