(() => {
  const S = window.SKILLS;
  const WS = [...window.WORKSPACES, { id: 'all', name: 'All projects' }];
  const state = { option: 'A', scope: 'all', ws: 'all', q: '', selected: 'user:Yours:pi-docs', open: { user: true, plugin: false }, drafts: {} };
  const $ = (id) => document.getElementById(id);
  const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ICON = {
    chevron: '<svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>',
    info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
    save: '<svg viewBox="0 0 24 24"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  };

  const projectName = (id) => window.PROJECTS[id];
  // Names can repeat across sources, so a skill is picked by source and name.
  const key = (s) => `${s.scope}:${s.origin}:${s.name}`;
  const inWorkspace = (s) => s.scope !== 'project' || state.ws === 'all' || s.origin === state.ws;
  const scoped = () => S.filter(inWorkspace);
  const matches = (s) => {
    const q = state.q.trim().toLowerCase();
    return !q || `${s.name} ${s.description} ${tagOf(s)}`.toLowerCase().includes(q);
  };
  const tagOf = (s) => (s.scope === 'project' ? projectName(s.origin) : s.scope === 'plugin' ? s.origin : '');
  const byName = (a, b) => a.name.localeCompare(b.name);
  const order = { user: 0, plugin: 1, project: 2 };
  // Pi keeps the first skill it loads for a name: project, then yours, then plugins.
  const precedence = { project: 0, user: 1, plugin: 2 };
  const label = (s) => (s.scope === 'project' ? `the ${projectName(s.origin)} project` : s.scope === 'plugin' ? `the ${s.origin} plugin` : 'your profile');
  // In one workspace the winner is clear. Across all projects there is no single winner.
  function status(s) {
    const same = scoped().filter((x) => x.name === s.name);
    if (same.length < 2) return null;
    if (state.ws === 'all') return { kind: 'shared', others: same.filter((x) => x !== s) };
    const winner = [...same].sort((a, b) => precedence[a.scope] - precedence[b.scope])[0];
    return winner === s ? { kind: 'wins', others: same.filter((x) => x !== s) } : { kind: 'loses', by: winner };
  }

  function row(s) {
    // A project group already names the project, so its rows carry no tag.
    const st = status(s);
    const unused = st?.kind === 'loses';
    const tag = unused ? 'Not used' : state.option === 'B' && s.scope === 'project' ? '' : tagOf(s);
    return `<button type="button" class="row${unused ? ' unused' : ''}" data-key="${s.scope}:${s.origin}:${s.name}" ${state.selected === key(s) ? 'aria-current="true"' : ''}>
      <span class="top"><span class="name">${esc(s.name)}</span>${tag ? `<span class="tag${unused ? ' warn' : ''}">${esc(tag)}</span>` : ''}</span>
      <p class="desc">${esc(s.description)}</p></button>`;
  }

  function groupsFor() {
    const all = scoped();
    const groups = [{ key: 'user', label: 'Yours', items: all.filter((s) => s.scope === 'user') },
      { key: 'plugin', label: 'Plugins', items: all.filter((s) => s.scope === 'plugin') }];
    for (const w of window.WORKSPACES) {
      if (state.ws === 'all' || state.ws === w.id) groups.push({ key: `project:${w.id}`, label: `Project: ${w.name}`, items: all.filter((s) => s.scope === 'project' && s.origin === w.id) });
    }
    return groups;
  }

  function renderList() {
    const all = scoped();
    const shown = all.filter(matches);
    const unusedN = all.filter((x) => status(x)?.kind === 'loses').length;
    $('count').textContent = (state.q.trim() ? `${shown.length} of ${all.length} skills` : `${all.length} skills`) + (unusedN ? `, ${unusedN} not used` : '');
    const rows = $('rows');
    if (state.option === 'A') {
      const list = shown.filter((s) => state.scope === 'all' || s.scope === state.scope).sort((a, b) => order[a.scope] - order[b.scope] || byName(a, b));
      rows.innerHTML = list.length ? list.map(row).join('') : emptyList();
    } else {
      const searching = state.q.trim().length > 0;
      const html = groupsFor().map((g) => {
        const items = g.items.filter(matches).sort(byName);
        if (searching && items.length === 0) return '';
        const open = searching || state.open[g.key];
        return `<button type="button" class="group" data-group="${g.key}" aria-expanded="${open}">${ICON.chevron}${esc(g.label)}<span class="n">${items.length}</span></button>${open ? items.map(row).join('') : ''}`;
      }).join('');
      rows.innerHTML = html || emptyList();
    }
  }

  function emptyList() {
    return state.q.trim()
      ? `<div class="empty"><b>No skills match "${esc(state.q.trim())}"</b>Try a different word, or choose All projects.</div>`
      : '<div class="empty"><b>No skills here</b>Nothing in this filter.</div>';
  }

  function renderChips() {
    const all = scoped().filter(matches);
    const n = (k) => (k === 'all' ? all.length : all.filter((s) => s.scope === k).length);
    const defs = [['all', 'All'], ['user', 'Yours'], ['plugin', 'Plugins'], ['project', 'Projects']];
    $('chips').hidden = state.option === 'B';
    $('chips').innerHTML = defs.map(([k, l]) => `<button type="button" data-scope="${k}" aria-pressed="${state.scope === k}">${l}<b>${n(k)}</b></button>`).join('');
  }

  function dupNote(s) {
    const st = status(s);
    if (!st) return '';
    if (st.kind === 'loses') return `<b>Not used in ${esc(projectName(state.ws))}.</b> ${cap(label(st.by))} has a skill with the same name, and it wins. Pi loads project skills first, then yours, then plugin skills, and keeps the first one for each name.`;
    if (st.kind === 'wins') return `<b>Replaces another skill.</b> ${st.others.map((o) => cap(label(o))).join(' and ')} also ${st.others.length > 1 ? 'have' : 'has'} a skill with this name. In ${esc(projectName(state.ws))} this one is used.`;
    return `<b>Same name in more than one place.</b> ${st.others.map((o) => cap(label(o))).join(' and ')} also ${st.others.length > 1 ? 'have' : 'has'} a skill with this name. Which one a chat uses depends on its project.`;
  }
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

  function noteFor(s) {
    if (s.scope === 'plugin') return `<b>Read only.</b> This skill comes from the <b>${esc(s.origin)}</b> plugin. To change it, change the plugin. Every chat can use it.`;
    if (s.scope === 'project') return `<b>Read only here.</b> This skill lives in the <b>${esc(projectName(s.origin))}</b> repo, in <code>.agents/skills</code>. Only chats in that project can use it.`;
    return '';
  }

  function renderDetail() {
    const s = S.find((x) => key(x) === state.selected && inWorkspace(x));
    const d = $('detail');
    if (!s) { d.innerHTML = '<div class="placeholder">Select a skill to view it, or create a new one</div>'; return; }
    const own = s.scope === 'user';
    const loses = status(s)?.kind === 'loses';
    const vis = loses ? 'Set this on the skill that is used, because the setting follows the name' : s.locked
      ? 'This skill needs an explicit call'
      : s.visible ? 'The model can use this skill by itself' : 'Hidden. Use /skill:name to call it';
    d.innerHTML = `
      <div class="dhead"><span class="t">${esc(s.name)}</span>${own ? `<button type="button" class="btn ghost" id="del">${ICON.trash}Delete</button><button type="button" class="btn primary" id="save">${ICON.save}Save</button>` : `<span class="tag">${esc(tagOf(s))}</span>`}</div>
      ${own ? '' : `<div class="note">${ICON.info}<span>${noteFor(s)}</span></div>`}
      ${dupNote(s) ? `<div class="note dup">${ICON.info}<span>${dupNote(s)}</span></div>` : ''}
      <div class="fields">
        <div class="field"><label for="f-name">Name</label>${own ? `<input id="f-name" value="${esc(s.name)}" disabled>` : `<div class="ro" id="f-name">${esc(s.name)}</div>`}</div>
        <div class="field"><label for="f-desc">Description</label>${own ? `<input id="f-desc" value="${esc(s.description)}">` : `<div class="ro" id="f-desc" title="${esc(s.description)}">${esc(s.description)}</div>`}</div>
      </div>
      <div class="vis"><div><p>Model visibility</p><p>${vis}</p></div>
        <button type="button" role="switch" class="sw" id="vis" aria-checked="${s.visible}" aria-label="Toggle model visibility for ${esc(s.name)}" ${s.locked || loses ? 'disabled' : ''}></button></div>
      <div class="bodywrap"><label for="f-body">Skill body</label><textarea id="f-body" ${own ? '' : 'readonly'}>${esc(s.body)}</textarea></div>`;
    const sw = $('vis');
    sw.addEventListener('click', () => { s.visible = !s.visible; renderDetail(); $('vis').focus(); });
  }

  function renderWorkspace() {
    const w = WS.find((x) => x.id === state.ws);
    $('wsval').textContent = w.name + (w.current ? ' (this workspace)' : '');
    $('wsmenu').innerHTML = WS.map((x) => `<li role="none"><button type="button" role="option" data-ws="${x.id}" aria-selected="${x.id === state.ws}">${esc(x.name)}${x.current ? '<small>this workspace</small>' : ''}</button></li>`).join('');
  }

  function renderOptions() {
    document.querySelectorAll('[data-option]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.option === state.option)));
  }

  function renderAll() { renderOptions(); renderWorkspace(); renderChips(); renderList(); renderDetail(); }

  function closeMenu(focus) {
    $('wsmenu').hidden = true;
    $('wsbtn').setAttribute('aria-expanded', 'false');
    if (focus) $('wsbtn').focus();
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) { if (!e.target.closest('.ws')) closeMenu(); return; }
    if (t.dataset.option) { state.option = t.dataset.option; renderAll(); return; }
    if (t.dataset.scope) { state.scope = t.dataset.scope; renderChips(); renderList(); return; }
    if (t.dataset.group) { state.open[t.dataset.group] = !state.open[t.dataset.group]; renderList(); $('rows').querySelector(`[data-group="${t.dataset.group}"]`)?.focus(); return; }
    if (t.dataset.key) { state.selected = t.dataset.key; renderList(); renderDetail(); $('rows').querySelector(`[data-key="${t.dataset.key}"]`)?.focus(); return; }
    if (t.id === 'wsbtn') {
      const open = $('wsmenu').hidden;
      $('wsmenu').hidden = !open;
      t.setAttribute('aria-expanded', String(open));
      if (open) $('wsmenu').querySelector('[aria-selected="true"]')?.focus();
      return;
    }
    if (t.dataset.ws) { state.ws = t.dataset.ws; closeMenu(true); renderAll(); return; }
    if (!e.target.closest('.ws')) closeMenu();
  });

  $('wsmenu').addEventListener('keydown', (e) => {
    const items = [...$('wsmenu').querySelectorAll('button')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('wsmenu').hidden) closeMenu(true); });
  $('q').addEventListener('input', (e) => { state.q = e.target.value; renderChips(); renderList(); });

  renderAll();
})();
