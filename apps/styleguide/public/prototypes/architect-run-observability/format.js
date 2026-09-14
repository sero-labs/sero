/* Display helpers. Values that a source does not measure stay words, never zero. */

export function esc(value) {
  return String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export function usd(amount, digits = 2) {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return 'unavailable';
  return '$' + amount.toFixed(digits);
}

/** Minutes to a short duration. Sub-minute values keep seconds. */
export function dur(minutes) {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return 'unavailable';
  if (minutes < 1) return Math.round(minutes * 60) + 's';
  if (minutes < 60) return (Math.round(minutes * 10) / 10) + 'm';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  return h + 'h ' + m + 'm';
}

export function clockAt(run, minutes) {
  const [h, m] = run.clockStart.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const hh = String(Math.floor(total / 60) % 24).padStart(2, '0');
  const mm = String(Math.floor(total % 60)).padStart(2, '0');
  return hh + ':' + mm;
}

export function num(value) {
  if (value === null || value === undefined) return 'unavailable';
  return value.toLocaleString('en-US');
}

export function tokens(value) {
  if (value === null || value === undefined) return 'unavailable';
  if (value >= 1000) return (Math.round(value / 100) / 10) + 'k';
  return String(value);
}

export function icon(id, cls = '') {
  return `<svg class="i${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
}

export const STATE_LABEL = {
  ok: 'done',
  running: 'running',
  waiting: 'waiting',
  failed: 'failed',
  interrupted: 'interrupted',
  stopped: 'stopped',
  unknown: 'unknown',
};

/** Status cues carry an icon and a word. Color is never the only signal. */
export const STATE_ICON = {
  ok: 'check',
  running: 'half',
  waiting: 'pause',
  failed: 'x',
  interrupted: 'square',
  stopped: 'square',
  unknown: 'question',
};

export function stateChip(state) {
  return `<span class="pill plain" data-state="${state}">${icon(STATE_ICON[state] || 'question')}${STATE_LABEL[state] || state}</span>`;
}

export function niceStep(span, target = 7) {
  const steps = [1, 2, 5, 10, 15, 20, 30, 60, 120, 240];
  return steps.find((s) => span / s <= target) || 240;
}
