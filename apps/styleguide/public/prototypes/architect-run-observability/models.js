/* Project model tiers: inheritance, overrides, pending changes and provenance.
   A tier without a project override inherits the global selection. */

import { esc, icon, usd } from './format.js';
import { MODEL_CATALOG, PROJECT_TIERS, TIER_DEFAULTS } from './data.js';

const TIERS = ['LOW', 'MED', 'HIGH'];

export function newModelState() {
  const saved = {
    LOW: PROJECT_TIERS.saved.LOW,
    MED: PROJECT_TIERS.saved.MED ? { ...PROJECT_TIERS.saved.MED } : null,
    HIGH: PROJECT_TIERS.saved.HIGH,
  };
  // The review starts with one unsaved thinking change, so inherited, overridden
  // and pending selections are all visible at once.
  const draft = {
    LOW: saved.LOW,
    MED: saved.MED ? { ...saved.MED, thinking: 'high' } : null,
    HIGH: saved.HIGH,
  };
  return {
    saved,
    draft,
    revision: PROJECT_TIERS.revision,
    error: null,
    notice: null,
  };
}

/** Return to the last saved defaults without restoring the initial demo change. */
export function discardModels(models) {
  models.draft = structuredClone(models.saved);
  models.error = null;
  models.notice = 'Unsaved changes discarded. Saved defaults are unchanged.';
}

const entryOf = (id) => MODEL_CATALOG.find((m) => m.id === id);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Takes the models state slice, not the whole app state. */
export function modelPending(models) {
  return TIERS.some((tier) => !same(models.saved[tier], models.draft[tier]));
}

function options(selected) {
  return MODEL_CATALOG.map((m) => `<option value="${esc(m.id)}"${m.id === selected ? ' selected' : ''}>${esc(m.label)}${m.available === false ? ' — unavailable' : ''}</option>`).join('');
}

function thinkingOptions(modelId, selected) {
  const entry = entryOf(modelId);
  const list = entry ? entry.thinking : ['low', 'medium', 'high'];
  return list.map((t) => `<option value="${t}"${t === selected ? ' selected' : ''}>${esc(t)}</option>`).join('');
}

function row(models, tier) {
  const draft = models.draft[tier];
  const saved = models.saved[tier];
  const effective = draft || TIER_DEFAULTS[tier];
  const entry = entryOf(effective.model);
  const pending = !same(saved, draft);
  const unavailable = entry && entry.available === false;
  return `<tr data-override="${draft ? 1 : 0}" data-pending="${pending ? 1 : 0}">
    <td class="tier">${tier}</td>
    <td>
      <div class="sel">
        <select data-tier="${tier}" data-field="model" aria-label="${tier} project model">${options(effective.model)}</select>
        <select data-tier="${tier}" data-field="thinking" aria-label="${tier} thinking level">${thinkingOptions(effective.model, effective.thinking)}</select>
        <button type="button" class="btn small row-actions" data-act="clear-tier" data-tier="${tier}"${draft ? '' : ' disabled'}>Use global</button>
      </div>
      ${unavailable ? `<p style="margin-top:6px;font-size:11px;color:var(--err)">${icon('refused')} ${esc(entry.reason)} No different provider is selected for you.</p>` : ''}
    </td>
    <td><div class="eff"><b>${esc(effective.model)}</b><span>${esc(effective.thinking)} thinking</span></div></td>
    <td><span class="src"><span class="tag">${draft ? 'project override' : 'inherited global'}</span>${pending ? '<span class="pill warn">pending</span>' : ''}</span></td>
  </tr>`;
}

export function renderModels(models) {
  const pending = modelPending(models);
  const dispatches = PROJECT_TIERS.dispatches.map((d) => `<div class="fact"><span>${esc(d.id)}</span><b>rev ${d.revision}</b></div>`).join('');
  return `<div class="insp-top">
    <button type="button" class="btn small" data-act="project">${icon('chevrons-left')}Project</button>
    <div class="crumb">${icon('chevron-right')}<span class="leaf">Project models · Hollow Depths</span></div>
    <div class="top-actions">
      ${pending ? '<span class="pill warn">1 unsaved change</span>' : `<span class="pill ok">saved · revision ${models.revision}</span>`}
    </div>
  </div>
  <div class="insp-body">
    ${models.error ? `<p class="notice err">${icon('alert')}<span><b>The selection is refused.</b> ${esc(models.error)}</span></p>` : ''}
    ${models.notice ? `<p class="notice ok">${icon('check')}<span>${esc(models.notice)}</span></p>` : ''}
    <section class="panel">
      <div class="panel-head">Tiers</div>
      <div style="padding:4px 12px 12px">
        <table class="tiers">
          <thead><tr><th>Tier</th><th>Project selection</th><th>Effective</th><th>Source</th></tr></thead>
          <tbody>${TIERS.map((t) => row(models, t)).join('')}</tbody>
        </table>
      </div>
      <div style="padding:0 12px 12px;display:flex;gap:8px;align-items:center">
        <button type="button" class="btn solid" data-act="save-models"${pending && !models.error ? '' : ' disabled'}>Save project defaults</button>
        <button type="button" class="btn" data-act="discard-models"${pending ? '' : ' disabled'}>Discard</button>
        <span style="margin-left:auto;font-size:11px;color:var(--text-2)">Saving affects new dispatches, new direct calls and the next idle owner turn. It does not change an active turn.</span>
      </div>
    </section>

    <div class="sections" style="margin-top:0;grid-template-columns:minmax(0,1fr) 340px">
      <div class="col">
        <section class="panel">
          <div class="panel-head">Explicit selections</div>
          <div style="padding:12px">
            <div class="facts">
              <div class="fact"><span>Owner session · environment pin</span><b class="warn">${esc(PROJECT_TIERS.ownerEnvPin)}</b></div>
              <div class="fact"><span>Owner thinking</span><b>medium</b></div>
              <div class="fact"><span>Manual step pin · Room step 3</span><b>Opus 4 · high</b></div>
            </div>
            <p style="margin-top:10px;font-size:12px;color:var(--text-2);line-height:1.55">The owner environment pin wins over the project MED default. A manual step pin also wins inside the existing permission checks.</p>
          </div>
        </section>
      </div>
      <div class="col">
        <section class="panel">
          <div class="panel-head">Existing dispatches</div>
          <div style="padding:12px">
            <div class="facts">${dispatches}</div>
            <p style="margin-top:10px;font-size:12px;color:var(--text-2);line-height:1.55">${esc(PROJECT_TIERS.dispatches[0].note)}</p>
          </div>
        </section>
     </div>
    </div>
    <div class="legend">
      <span>${icon('sliders')}Project override wins for new work</span>
      <span>${icon('check')}Inherited global selection</span>
      <span>${icon('clock')}Pending changes apply at the next safe boundary</span>
    </div>
  </div>`;
}

/** Apply a select change. An unavailable model produces a refusal, not a fallback. */
export function changeTier(models, tier, field, value) {
  const current = models.draft[tier] || { ...TIER_DEFAULTS[tier] };
  const next = { ...current };
  if (field === 'model') {
    next.model = value;
    const entry = entryOf(value);
    if (entry) next.thinking = entry.thinking.includes(current.thinking) ? current.thinking : entry.thinking[0]; else next.thinking = current.thinking;
  } else {
    next.thinking = value;
  }
  models.draft[tier] = next;
  const entry = entryOf(next.model);
  if (entry && entry.available === false) {
    models.error = `${entry.id} is unavailable. ${entry.reason}`;
    return;
  }
  const supported = !entry || entry.thinking.includes(next.thinking);
  models.error = supported ? null : `${next.model} does not support ${next.thinking} thinking. Choose a supported level.`;
}

export function clearTier(models, tier) {
  models.draft[tier] = null;
  models.error = null;
}

export function saveModels(models) {
  if (models.error) return;
  models.saved = structuredClone(models.draft);
  models.revision += 1;
  models.error = null;
  models.notice = `Saved as revision ${models.revision}. New dispatches use revision ${models.revision}. ${PROJECT_TIERS.dispatches.length} existing dispatches and their later steps keep revision ${PROJECT_TIERS.revision}. Owner and Room model catalogues resolve from the new revision on their next turn.`;
}

export const MODEL_COUNT = MODEL_CATALOG.length;
export const PROJECT_SPEND = usd(11.4);
