const models = [
  { provider: 'OpenAI Codex', mark: 'O', markClass: 'openai', id: 'openai-codex/gpt-5.6-sol', name: 'GPT-5.6 Sol' },
  { provider: 'OpenAI Codex', mark: 'O', markClass: 'openai', id: 'openai-codex/gpt-5.6-luna', name: 'GPT-5.6 Luna' },
  { provider: 'OpenAI Codex', mark: 'O', markClass: 'openai', id: 'openai-codex/gpt-5.4', name: 'GPT-5.4' },
  { provider: 'Anthropic', mark: 'A', markClass: 'anthropic', id: 'anthropic/claude-opus-4-6', name: 'Claude Opus 4.6' },
  { provider: 'Anthropic', mark: 'A', markClass: 'anthropic', id: 'anthropic/claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
  { provider: 'Local · GX10', mark: 'G', markClass: 'local', id: 'local/deepseek-r1-70b', name: 'DeepSeek R1 70B' },
  { provider: 'Local · GX10', mark: 'G', markClass: 'local', id: 'local/qwen3-coder-30b', name: 'Qwen3 Coder 30B' },
  { provider: 'Local · GX10', mark: 'G', markClass: 'local', id: 'local/llama-3.3-70b', name: 'Llama 3.3 70B' },
];

const state = {
  connection: 'connected',
  selectedModel: models[0].id,
  focusedModel: 0,
  approval: 'ask',
  sessionCount: 0,
};

const byId = (id) => document.getElementById(id);
const icon = (name, className = '') => `<svg class="${className}" aria-hidden="true"><use href="#${name}"/></svg>`;
const modelPicker = byId('model-picker');
const modelSearch = byId('model-search');
const modelTrigger = byId('model-trigger');
const approvalMenu = byId('approval-menu');
const approvalTrigger = byId('approval-trigger');
const messageInput = byId('message-input');
const sendButton = byId('send');

function setExpanded(button, target, open) {
  button.setAttribute('aria-expanded', String(open));
  target.classList.toggle('hidden', !open);
  const use = button.querySelector('use');
  if (use) use.setAttribute('href', open ? '#chevron-down' : '#chevron-right');
}

function closePopovers(except) {
  if (except !== modelPicker) {
    modelPicker.classList.add('hidden');
    modelTrigger.setAttribute('aria-expanded', 'false');
  }
  if (except !== approvalMenu) {
    approvalMenu.classList.add('hidden');
    approvalTrigger.setAttribute('aria-expanded', 'false');
  }
}

function currentModel() {
  return models.find((model) => model.id === state.selectedModel) ?? models[0];
}

function renderModels() {
  const query = modelSearch.value.trim().toLowerCase();
  const filtered = models.filter((model) => `${model.name} ${model.provider}`.toLowerCase().includes(query));
  const groups = filtered.reduce((result, model) => {
    const group = result.get(model.provider) ?? [];
    group.push(model);
    result.set(model.provider, group);
    return result;
  }, new Map());
  byId('model-list').innerHTML = [...groups].map(([provider, providerModels]) => {
    const mark = providerModels[0];
    return `<section class="provider-group"><div class="provider-heading"><span class="provider-mark ${mark.markClass}">${mark.mark}</span>${provider}</div>${providerModels.map((model) => {
      const selected = model.id === state.selectedModel;
      return `<button type="button" class="model-option${selected ? ' selected' : ''}" role="option" aria-selected="${selected}" data-model="${model.id}">${icon('check')}<span>${model.name}</span><small>${model.id.split('/')[1]}</small></button>`;
    }).join('')}</section>`;
  }).join('');
  byId('no-models').classList.toggle('hidden', filtered.length > 0);
  state.focusedModel = 0;
  byId('model-list').querySelectorAll('[data-model]').forEach((button) => {
    button.addEventListener('click', () => selectModel(button.dataset.model));
  });
}

function selectModel(modelId) {
  state.selectedModel = modelId;
  const model = currentModel();
  byId('model-label').textContent = model.name;
  const mark = modelTrigger.querySelector('.provider-mark');
  mark.textContent = model.mark;
  mark.className = `provider-mark ${model.markClass}`;
  renderModels();
  closePopovers();
  showToast(`${model.name} will be used for the next turn`);
  messageInput.focus();
}

function showToast(message) {
  const toast = byId('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.add('hidden'), 2400);
}

function updateConnection(connection) {
  state.connection = connection;
  document.querySelectorAll('.scenario').forEach((button) => button.classList.toggle('active', button.dataset.state === connection));
  document.querySelectorAll('.status-dot').forEach((dot) => {
    dot.classList.remove('connected', 'reconnecting', 'unreachable');
    dot.classList.add(connection);
  });
  byId('node-dot').setAttribute('aria-label', connection === 'connected' ? 'Connected' : connection === 'reconnecting' ? 'Reconnecting' : 'Offline');
  const strip = byId('status-strip');
  strip.classList.toggle('hidden', connection === 'connected');
  byId('status-copy').textContent = connection === 'reconnecting'
    ? 'The task is still running on GX10. Nothing is lost.'
    : 'GX10 is offline. Last seen 2 minutes ago.';
  byId('status-icon').classList.toggle('spinner', connection === 'reconnecting');
  byId('status-icon').textContent = connection === 'unreachable' ? '!' : '';
  byId('retry').classList.toggle('hidden', connection !== 'unreachable');
  const unavailable = connection === 'unreachable';
  document.querySelectorAll('.workspace-add').forEach((button) => { button.disabled = unavailable; });
  messageInput.disabled = unavailable;
  modelTrigger.disabled = unavailable;
  approvalTrigger.disabled = unavailable;
  sendButton.disabled = unavailable || !messageInput.value.trim();
  messageInput.placeholder = unavailable ? 'GX10 is offline' : 'Message the agent…';
}

function activateSession(button) {
  document.querySelectorAll('.nodes-section .session-row').forEach((row) => {
    row.classList.remove('active');
    row.querySelector('.active-rail')?.classList.add('hidden');
  });
  button.classList.add('active');
  button.querySelector('.active-rail')?.classList.remove('hidden');
  const title = button.querySelector('strong').textContent;
  byId('session-label').textContent = title;
  if (button.dataset.session?.startsWith('new-')) {
    byId('conversation').innerHTML = '<div class="empty-chat"><svg><use href="#message"/></svg><p>Start a conversation</p></div>';
  }
  messageInput.focus();
}

function addSession(target = byId('remote-sessions'), toggle = byId('workspace-toggle')) {
  if (state.connection === 'unreachable') return;
  state.sessionCount += 1;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tree-row session-row active';
  button.dataset.session = `new-${state.sessionCount}`;
  button.innerHTML = '<span class="active-rail"></span>' + icon('message') + '<span class="session-copy"><strong>New chat</strong><small>Just now</small></span>';
  if (toggle.getAttribute('aria-expanded') !== 'true') setExpanded(toggle, target, true);
  target.prepend(button);
  button.addEventListener('click', () => activateSession(button));
  activateSession(button);
  showToast(`New session uses ${currentModel().name}`);
}

function sendMessage(event) {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text || state.connection === 'unreachable') return;
  const conversation = byId('conversation');
  conversation.querySelector('.empty-chat')?.remove();
  const message = document.createElement('div');
  message.className = 'message user-message';
  message.textContent = text;
  conversation.append(message);
  messageInput.value = '';
  sendButton.disabled = true;
  conversation.scrollTop = conversation.scrollHeight;
  window.setTimeout(() => {
    const reply = document.createElement('div');
    reply.className = 'assistant-message';
    reply.innerHTML = `<p>This reply uses ${currentModel().name} on GX10.</p>`;
    conversation.append(reply);
    conversation.scrollTop = conversation.scrollHeight;
  }, 500);
}

byId('node-toggle').addEventListener('click', () => setExpanded(byId('node-toggle'), byId('node-contents'), byId('node-toggle').getAttribute('aria-expanded') !== 'true'));
byId('workspace-toggle').addEventListener('click', () => {
  const sessions = byId('remote-sessions');
  setExpanded(byId('workspace-toggle'), sessions, byId('workspace-toggle').getAttribute('aria-expanded') !== 'true');
});
byId('benchmark-toggle').addEventListener('click', () => {
  const sessions = byId('benchmark-sessions');
  setExpanded(byId('benchmark-toggle'), sessions, byId('benchmark-toggle').getAttribute('aria-expanded') !== 'true');
});
byId('new-session').addEventListener('click', () => addSession());
byId('benchmark-new-session').addEventListener('click', () => addSession(byId('benchmark-sessions'), byId('benchmark-toggle')));
document.querySelectorAll('#remote-sessions .session-row').forEach((button) => button.addEventListener('click', () => activateSession(button)));
document.querySelectorAll('.scenario').forEach((button) => button.addEventListener('click', () => updateConnection(button.dataset.state)));
byId('retry').addEventListener('click', () => { updateConnection('reconnecting'); window.setTimeout(() => updateConnection('connected'), 900); });

modelTrigger.addEventListener('click', () => {
  const open = modelPicker.classList.contains('hidden');
  closePopovers(open ? modelPicker : undefined);
  modelPicker.classList.toggle('hidden', !open);
  modelTrigger.setAttribute('aria-expanded', String(open));
  if (open) { modelSearch.value = ''; renderModels(); modelSearch.focus(); }
});
approvalTrigger.addEventListener('click', () => {
  const open = approvalMenu.classList.contains('hidden');
  closePopovers(open ? approvalMenu : undefined);
  approvalMenu.classList.toggle('hidden', !open);
  approvalTrigger.setAttribute('aria-expanded', String(open));
});
document.querySelectorAll('[data-approval]').forEach((button) => button.addEventListener('click', () => {
  state.approval = button.dataset.approval;
  document.querySelectorAll('[data-approval]').forEach((item) => item.setAttribute('aria-checked', String(item === button)));
  approvalTrigger.title = state.approval === 'ask' ? 'Command approval: Ask first' : 'Command approval: Allowed';
  closePopovers();
  showToast(state.approval === 'ask' ? 'Sero will ask before commands' : 'Commands are allowed for this session');
}));

modelSearch.addEventListener('input', renderModels);
modelSearch.addEventListener('keydown', (event) => {
  const options = [...byId('model-list').querySelectorAll('[data-model]')];
  if (!options.length) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    state.focusedModel = (state.focusedModel + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    options.forEach((option, index) => option.classList.toggle('focused', index === state.focusedModel));
    options[state.focusedModel].scrollIntoView({ block: 'nearest' });
  } else if (event.key === 'Enter') {
    event.preventDefault();
    selectModel(options[state.focusedModel].dataset.model);
  }
});
byId('model-settings').addEventListener('click', () => { closePopovers(); showToast('Node model settings would open here'); });
document.querySelector('.node-settings').addEventListener('click', () => showToast('Node settings would open here'));
document.querySelector('.search-field input').addEventListener('input', (event) => {
  const query = event.target.value.trim().toLowerCase();
  document.querySelectorAll('.session-row').forEach((row) => {
    row.classList.toggle('hidden', !row.textContent.toLowerCase().includes(query));
  });
});
messageInput.addEventListener('input', () => { sendButton.disabled = state.connection === 'unreachable' || !messageInput.value.trim(); });
byId('composer').addEventListener('submit', sendMessage);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closePopovers(); });
document.addEventListener('click', (event) => {
  if (!event.target.closest('.popover-anchor')) closePopovers();
});

renderModels();
updateConnection('connected');
