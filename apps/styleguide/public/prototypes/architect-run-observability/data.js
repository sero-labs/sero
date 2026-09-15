/* Sanitized deterministic fixtures. Times are minutes from run start.
   A value that no source measured stays null: the view says unavailable, never zero. */

export const M = {
  low: 'anthropic/claude-haiku-4',
  med: 'anthropic/claude-sonnet-4',
  high: 'anthropic/claude-opus-4',
  codex: 'openai/gpt-5-codex',
  local: 'local/qwen3-30b',
};

const TH = { low: 'low', med: 'medium', high: 'high' };
export const T = (tier, origin) => ({
  model: M[tier],
  thinking: TH[tier],
  source: `tier ${tier.toUpperCase()} · ${origin}`,
});
const tk = (input, output, cacheRead, cacheWrite, reasoning = null) => ({ input, output, cacheRead, cacheWrite, reasoning });

const sp = (o) => Object.assign({
  start: 0, end: null, parent: null, state: 'ok', span: 'active', charge: false,
  cost: null, coverage: 'unknown', tokens: null, links: [], refs: [], note: null,
}, o);

const REQ = (id, start, end, extra = {}) => sp(Object.assign({ id, label: 'Model request', kind: 'request', start, end, charge: true, coverage: 'call', cost: 0 }, extra));
const TOOL = (id, label, start, end, extra = {}) => sp(Object.assign({ id, label, kind: 'tool', start, end, cost: 0, charge: true, coverage: 'call' }, extra));

const REV7_MED = T('med', 'project override · snapshot rev 7');
const REV7_LOW = T('low', 'inherited global · snapshot rev 7');

// ── Run 1 · initial delivery ───────────────────────────────────────────────
const INITIAL = [
  sp({ id: 'a-root', label: 'Initial delivery', kind: 'run', start: 0, span: 'structural' }),

  sp({ id: 'a-owner-1', label: 'Owner wake · intake', kind: 'owner', start: 0, end: 5.2, parent: 'a-root' }),
  REQ('a-owner-1-r1', 0.1, 2.9, Object.assign({ parent: 'a-owner-1', cost: 0.041, tokens: tk(1840, 320, 12100, 0, 210) }, REV7_MED)),
  TOOL('a-owner-1-t1', 'read ~/Projects/hollow-depths', 3.0, 3.3, { parent: 'a-owner-1' }),
  REQ('a-owner-1-r2', 3.4, 5.2, Object.assign({ parent: 'a-owner-1', cost: 0.018 }, REV7_MED)),

  sp({ id: 'a-res', label: 'Research · 3 questions in parallel', kind: 'research', start: 0.6, end: 27.5, parent: 'a-root', span: 'structural' }),
  sp({ id: 'a-res-1', label: 'R1 · what the first minute should teach', kind: 'research', start: 1.0, end: 19.0, parent: 'a-res' }),
  REQ('a-res-1-r1', 1.2, 9.0, Object.assign({ parent: 'a-res-1', cost: 0.086, tokens: tk(4210, 900, 0, 2100) }, REV7_MED)),
  TOOL('a-res-1-t1', 'bash pnpm view', 9.1, 11.0, { parent: 'a-res-1' }),
  TOOL('a-res-1-t2', 'bash pnpm view', 9.1, 12.4, { parent: 'a-res-1', note: 'The same tool ran twice at once. Distinct call identities kept the two intervals apart.' }),
  REQ('a-res-1-r2', 12.5, 19.0, Object.assign({ parent: 'a-res-1', cost: 0.071 }, REV7_LOW)),
  sp({ id: 'a-res-2', label: 'R2 · permadeath rules for a 20 minute run', kind: 'research', start: 1.2, end: 27.5, parent: 'a-res' }),
  REQ('a-res-2-r1', 1.4, 14.0, Object.assign({ parent: 'a-res-2', cost: 0.102, tokens: tk(5120, 1180, 3200, 0) }, REV7_MED)),
  TOOL('a-res-2-t1', 'read docs/roguelike-notes.md', 14.2, 18.0, { parent: 'a-res-2' }),
  REQ('a-res-2-r2', 18.2, 27.5, Object.assign({ parent: 'a-res-2', cost: 0.088 }, REV7_MED)),
  sp({ id: 'a-res-3', label: 'R3 · smallest item set with strong interactions', kind: 'research', start: 1.5, end: 24.0, parent: 'a-res' }),
  REQ('a-res-3-r1', 1.7, 16.0, Object.assign({ parent: 'a-res-3', cost: 0.095 }, REV7_LOW)),
  REQ('a-res-3-r2', 16.4, 24.0, Object.assign({ parent: 'a-res-3', cost: 0.061 }, REV7_LOW)),

  sp({ id: 'a-plan', label: 'Charter planning', kind: 'planning', start: 30.0, end: 41.0, parent: 'a-root' }),
  REQ('a-plan-r1', 30.2, 38.0, Object.assign({ parent: 'a-plan', cost: 0.118, tokens: tk(9800, 1620, 4100, 0, 640) }, T('high', 'inherited global · snapshot rev 7'))),
  REQ('a-plan-r2', 38.3, 41.0, Object.assign({ parent: 'a-plan', cost: 0.052 }, REV7_MED)),

  sp({ id: 'a-wait-approval', label: 'Waiting for your approval of the charter', kind: 'wait', start: 41.0, end: 48.0, parent: 'a-root', state: 'waiting', span: 'wait', waitFor: 'approval', note: 'Observed wait. The owner was idle and no other work ran in this interval.' }),
  sp({ id: 'a-queue-1', label: 'Dispatch queue · waiting for a workspace slot', kind: 'wait', start: 48.0, end: 49.0, parent: 'a-root', state: 'waiting', span: 'wait', waitFor: 'queue' }),

  sp({ id: 'a-wf1', label: 'Workflow · Grid, movement and field of view', kind: 'workflow', start: 49.0, end: 108.4, parent: 'a-root' }),
  sp({ id: 'a-wf1-s1', label: 'Inspect the scene code', kind: 'step', start: 49.0, end: 54.5, parent: 'a-wf1' }),
  REQ('a-wf1-s1-r1', 49.2, 53.4, Object.assign({ parent: 'a-wf1-s1', cost: 0.034, tokens: tk(3120, 410, 8800, 0) }, REV7_MED)),
  TOOL('a-wf1-s1-t1', 'bash rg "scene" src/', 53.5, 54.2, { parent: 'a-wf1-s1' }),
  sp({ id: 'a-wf1-s2', label: 'Implement grid, movement and field of view', kind: 'step', start: 54.5, end: 92.0, parent: 'a-wf1' }),
  REQ('a-wf1-s2-r1', 55.0, 70.0, Object.assign({ parent: 'a-wf1-s2', cost: 0.213, tokens: tk(14200, 3100, 22100, 2600, 1120), refs: [
    { label: 'session · hollow-depths/wf-3f1c2ab', stale: false },
    { label: 'capture /play?seed=12', stale: true, note: 'retention removed this capture' },
  ] }, REV7_MED)),
  TOOL('a-wf1-s2-t1', 'edit src/scene/grid.ts', 70.4, 74.0, { parent: 'a-wf1-s2' }),
  REQ('a-wf1-s2-r2', 74.4, 78.0, Object.assign({ parent: 'a-wf1-s2', cost: 0.031, state: 'failed', note: 'Provider answered 529 after 3.6m. The attempt was priced and the step retried once. A failed request is charged.' }, REV7_MED)),
  REQ('a-wf1-s2-r3', 78.2, 84.0, Object.assign({ parent: 'a-wf1-s2', cost: 0.044, retryOf: 'a-wf1-s2-r2' }, REV7_MED)),
  sp({ id: 'a-wf1-s2-c1', label: 'Session compacted · 41k tokens summarised', kind: 'compaction', start: 88.0, end: 88.4, parent: 'a-wf1-s2', cost: 0.012, charge: true, coverage: 'call' }),
  REQ('a-wf1-s2-r4', 88.6, 92.0, Object.assign({ parent: 'a-wf1-s2', cost: 0.058, tokens: tk(5100, 880, 18400, 0) }, REV7_MED)),
  sp({ id: 'a-wf1-s3', label: 'Independent review', kind: 'review', start: 92.0, end: 101.0, parent: 'a-wf1' }),
  REQ('a-wf1-s3-r1', 92.4, 101.0, Object.assign({ parent: 'a-wf1-s3', cost: 0.097, tokens: tk(16400, 1240, 3100, 0, 880), refs: [
    { label: 'diff · 3f1c2ab..9d2e401', stale: false },
    { label: 'requirements · milestone 1 brief', stale: false },
  ], model: M.high, thinking: 'high', source: 'manual step pin · independent review', note: 'The reviewer read the approved requirements and the diff. It did not inherit the implementer transcript.' })),
  sp({ id: 'a-wf1-repair', label: 'Repair · finding RV-1, light leaks through walls', kind: 'repair', start: 101.0, end: 105.5, parent: 'a-wf1' }),
  REQ('a-wf1-repair-r1', 101.3, 105.5, Object.assign({ parent: 'a-wf1-repair', cost: 0.061 }, REV7_MED)),
  sp({ id: 'a-wf1-s4', label: 'Re-review the finding and its direct effects', kind: 'review', start: 105.5, end: 108.4, parent: 'a-wf1' }),
  REQ('a-wf1-s4-r1', 105.7, 108.4, Object.assign({ parent: 'a-wf1-s4', cost: 0.049, note: 'The re-review checked RV-1 and its blast radius. It did not repeat the whole audit.' }, REV7_MED)),

  sp({ id: 'a-wf2', label: 'Workflow · Procedural level generator with a seed', kind: 'workflow', start: 109.0, state: 'running', parent: 'a-root' }),
  sp({ id: 'a-wf2-s1', label: 'Inspect the generator stub', kind: 'step', start: 109.0, end: 114.0, parent: 'a-wf2' }),
  REQ('a-wf2-s1-r1', 109.2, 113.8, Object.assign({ parent: 'a-wf2-s1', cost: 0.039 }, REV7_MED)),
  sp({ id: 'a-wf2-s2', label: 'Implement the seeded generator', kind: 'step', start: 114.0, state: 'running', parent: 'a-wf2' }),
  REQ('a-wf2-s2-r1', 115.0, 140.0, Object.assign({ parent: 'a-wf2-s2', cost: 0.186, tokens: tk(12800, 2740, 19600, 3100, 960) }, REV7_MED)),
  TOOL('a-wf2-s2-t1', 'bash pnpm test src/level', 141.0, null, { parent: 'a-wf2-s2', state: 'running' }),
  TOOL('a-wf2-s2-t2', 'capture /play?seed=12', 142.0, null, { parent: 'a-wf2-s2', state: 'unknown', charge: false, coverage: 'unknown', note: 'No completion observed yet. Time and cost stay unknown.' }),
];

// ── Run 2 · maintenance objective ──────────────────────────────────────────
const MAINT = [
  sp({ id: 'b-root', label: 'Maintenance · torch light leaks through walls (#12)', kind: 'run', start: 0, span: 'structural', state: 'running' }),
  sp({ id: 'b-triage', label: 'Owner wake · maintenance triage', kind: 'owner', start: 0, end: 6.2, parent: 'b-root' }),
  REQ('b-triage-r1', 0.2, 4.0, Object.assign({ parent: 'b-triage', cost: 0.049, tokens: tk(3600, 520, 9200, 0) }, REV7_MED)),
  TOOL('b-triage-t1', 'gh issue view 12', 4.2, 4.8, { parent: 'b-triage' }),
  REQ('b-triage-r2', 5.0, 6.2, Object.assign({ parent: 'b-triage', cost: 0.021 }, REV7_MED)),
  sp({ id: 'b-res', label: 'Research · reproduce the light leak', kind: 'research', start: 6.5, end: 14.0, parent: 'b-root', cost: 0.341, charge: true, coverage: 'aggregate', note: 'Research returned one total. Per-call detail was not retained, so this amount is aggregate coverage.' }),
  sp({ id: 'b-queue-1', label: 'Dispatch queue · waiting for a workspace slot', kind: 'wait', start: 14.0, end: 15.0, parent: 'b-root', state: 'waiting', span: 'wait', waitFor: 'queue' }),
  sp({ id: 'b-room', label: 'Room · light leak investigation', kind: 'room', start: 15.0, end: 34.0, parent: 'b-root' }),
  sp({ id: 'b-room-m1', label: 'Member · renderer specialist', kind: 'member', start: 15.2, end: 31.0, parent: 'b-room' }),
  REQ('b-room-m1-r1', 15.5, 28.4, Object.assign({ parent: 'b-room-m1', cost: 0.112, tokens: tk(8600, 1740, 11200, 0, 480) }, REV7_MED)),
  TOOL('b-room-m1-t1', 'bash rg "drawLight" src/', 28.6, 30.6, { parent: 'b-room-m1' }),
  sp({ id: 'b-room-m2', label: 'Member · lighting test specialist', kind: 'member', start: 15.4, end: 33.5, parent: 'b-room' }),
  REQ('b-room-m2-r1', 15.7, 30.0, Object.assign({ parent: 'b-room-m2', cost: 0.104, tokens: tk(7400, 1520, 9800, 0) }, REV7_MED)),
  TOOL('b-room-m2-t1', 'edit tests/light.spec.ts', 30.2, 33.2, { parent: 'b-room-m2' }),
  sp({ id: 'b-room-synth', label: 'Synthesis · two members, one conclusion', kind: 'review', start: 33.2, end: 34.0, parent: 'b-room' }),
  REQ('b-room-synth-r1', 33.3, 34.0, Object.assign({ parent: 'b-room-synth', cost: 0.038 }, REV7_MED)),
  sp({ id: 'b-queue-2', label: 'Dispatch queue · waiting for a workspace slot', kind: 'wait', start: 34.0, end: 35.0, parent: 'b-root', state: 'waiting', span: 'wait', waitFor: 'queue' }),
  sp({ id: 'b-wf', label: 'Workflow · Fix: torch light leaks (#12)', kind: 'workflow', start: 35.0, parent: 'b-root', state: 'running' }),
  sp({ id: 'b-wf-s1', label: 'Reproduce with a test', kind: 'step', start: 35.0, end: 46.0, parent: 'b-wf' }),
  REQ('b-wf-s1-r1', 35.3, 45.6, Object.assign({ parent: 'b-wf-s1', cost: 0.079, tokens: tk(6100, 1420, 4800, 0) }, REV7_MED)),
  sp({ id: 'b-wf-s2', label: 'Implement the fix', kind: 'step', start: 46.0, end: 68.0, parent: 'b-wf' }),
  REQ('b-wf-s2-r1', 46.4, 66.8, Object.assign({ parent: 'b-wf-s2', cost: 0.164, tokens: tk(11200, 2210, 16400, 1900, 540) }, REV7_MED)),
  sp({ id: 'b-wf-s3', label: 'Independent review', kind: 'review', start: 68.0, end: 76.0, parent: 'b-wf' }),
  REQ('b-wf-s3-r1', 68.3, 76.0, Object.assign({ parent: 'b-wf-s3', cost: 0.083, tokens: tk(9400, 1100, 2600, 0) }, REV7_MED)),
  sp({ id: 'b-wf-s4', label: 'Repair · finding RV-2', kind: 'repair', start: 76.0, end: 82.0, parent: 'b-wf' }),
  REQ('b-wf-s4-r1', 76.2, 82.0, Object.assign({ parent: 'b-wf-s4', cost: 0.057 }, REV7_MED)),
  sp({ id: 'b-wf-s5', label: 'Re-review finding RV-2', kind: 'review', start: 82.0, parent: 'b-wf', state: 'running' }),
  REQ('b-wf-s5-r1', 82.2, null, Object.assign({ parent: 'b-wf-s5', state: 'running', cost: null, coverage: 'unknown' }, REV7_MED)),
];

// ── Run 3 · a dismissed event ──────────────────────────────────────────────
const DISMISSED = [
  sp({ id: 'c-root', label: 'Maintenance · stale CI event', kind: 'run', start: 0, span: 'structural' }),
  sp({ id: 'c-wake', label: 'Owner wake · event triage', kind: 'owner', start: 0, end: 3.4, parent: 'c-root' }),
  REQ('c-wake-r1', 0.2, 3.2, Object.assign({ parent: 'c-wake', cost: 0.028, tokens: tk(2100, 260, 4400, 0) }, REV7_MED)),
];

export const RUNS = [
  { id: 'r-initial', label: 'Initial delivery', clockStart: '09:12', now: 187, live: true, outcome: 'In progress', note: 'Setup, discovery, charter and the first two milestones. Milestone 2 still runs.', spans: INITIAL },
  { id: 'r-maint-12', label: 'Maintenance · torch light leaks through walls (#12)', clockStart: '08:02', now: 84, live: true, outcome: 'In progress', note: 'One maintenance objective: triage, a Room with two concurrent members, then the fix Workflow.', spans: MAINT },
  { id: 'r-maint-ci', label: 'Maintenance · stale CI event', clockStart: '08:14', now: 3.4, live: false, outcome: 'No work needed', note: 'Triage dismissed the event. The record keeps the outcome and its small cost. No delivery is claimed.', spans: DISMISSED },
  { id: 'r-legacy-5', label: 'Milestone 5 · release to GitHub Pages (archived)', clockStart: null, now: null, live: false, outcome: 'Delivered · summary only', note: 'Retained summary only. Call traces, tool calls and timing were not kept.', spans: [], summary: { cost: 7.2, coverage: 'aggregate', requests: null, elapsed: null, note: 'Known aggregate spend. No request timing, cache split or call detail exists for this run.' } },
];

/** Activity charged once in lifetime totals and linked, not attributed, from each run. */
export const SHARED = [
  Object.assign({
    id: 'shared-1',
    label: 'Coalesced owner wake · issue #12 and a stale CI event',
    kind: 'owner', clock: '08:14', start: 0.5, end: 2.6, state: 'ok',
    cost: 0.058, charge: true, coverage: 'call', tokens: tk(3400, 480, 9100, 0),
    runs: ['r-maint-12', 'r-maint-ci'],
    note: 'One wake carried both objectives. Charged once in lifetime totals and linked from both runs. Neither run claims a guessed share.',
  }, REV7_MED),
];

export const LIFETIME = {
  unassigned: { cost: 3.16, coverage: 'aggregate', note: 'Owner wakes, reads and early research before run identity existed. Aggregate usage only, no call detail.' },
};

/** A long run for the bounded-rendering check. Deterministic. */
export function longRun(count = 1240) {
  const spans = [sp({ id: 'x-root', label: `Long run · ${count} activities (synthetic)`, kind: 'run', start: 0, span: 'structural' })];
  let seed = 42;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  let t = 0;
  let group = 0;
  while (spans.length < count) {
    const wf = `x-wf-${group}`;
    const wfStart = t;
    const wfEnd = t + 3 + rand() * 7;
    spans.push(sp({ id: wf, label: `Workflow · delegation ${group + 1}`, kind: 'workflow', start: wfStart, end: wfEnd, parent: 'x-root' }));
    let s = wfStart;
    for (let step = 0; step < 4 && spans.length < count; step += 1) {
      const id = `${wf}-s${step}`;
      const end = Math.min(wfEnd, s + 0.8 + rand() * 2.4);
      const failed = rand() > 0.92;
      spans.push(sp({ id, label: `Step ${step + 1} · ${['inspect', 'implement', 'review', 'repair'][step]}`, kind: step === 2 ? 'review' : 'step', start: s, end, parent: wf, state: failed ? 'failed' : 'ok' }));
      if (spans.length < count) {
        spans.push(REQ(`${id}-r1`, s + 0.05, end - 0.1, Object.assign({ parent: id, cost: Math.round(rand() * 900) / 10000, tokens: tk(Math.round(rand() * 9000), Math.round(rand() * 2000), Math.round(rand() * 12000), 0) }, REV7_MED)));
      }
      s = end + rand() * 0.6;
      if (s >= wfEnd) break;
    }
    t = wfEnd + 0.4;
    group += 1;
  }
  return { id: 'r-long', label: `Long run · ${count} activities (synthetic)`, clockStart: '00:00', now: t, live: false, outcome: 'Bounded rendering check', note: 'This fixture checks paging and rendering only. It is not evidence about model efficiency.', spans };
}

// ── project model tiers ────────────────────────────────────────────────────
export const MODEL_CATALOG = [
  { id: M.high, label: 'Opus 4', thinking: ['low', 'medium', 'high'] },
  { id: M.med, label: 'Sonnet 4', thinking: ['low', 'medium', 'high'] },
  { id: M.low, label: 'Haiku 4', thinking: ['none', 'low', 'medium'] },
  { id: M.codex, label: 'GPT-5 Codex', thinking: ['low', 'medium', 'high'] },
  { id: M.local, label: 'Qwen3 30B (local)', thinking: ['none', 'low'], available: false, reason: 'Not installed on this machine. Install the model or choose another.' },
];

export const TIER_DEFAULTS = {
  LOW: { model: M.low, thinking: 'low' },
  MED: { model: M.med, thinking: 'medium' },
  HIGH: { model: M.high, thinking: 'high' },
};

export const PROJECT_TIERS = {
  revision: 7,
  saved: { LOW: null, MED: { model: M.codex, thinking: 'medium' }, HIGH: null },
  dispatches: [
    { id: 'Workflow · Grid, movement and field of view', revision: 7, note: 'Keeps rev 7 (MED Sonnet 4 · medium) for later steps, retries and its recurring run.' },
    { id: 'Room · Items, combat and permadeath', revision: 7, note: 'Keeps rev 7 for member planning and assignment.' },
  ],
  ownerEnvPin: M.codex,
};
