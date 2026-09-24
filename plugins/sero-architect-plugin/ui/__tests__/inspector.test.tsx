// @vitest-environment jsdom

/**
 * The run inspector (spec architect-run-observability, architect-ui).
 *
 * The first screen shows the run without a click; a figure nobody measured is
 * a word; the filtered subtotal appears only while a filter is on; an empty
 * filter says why; and the view never resets itself under the reader when a
 * read arrives.
 */

import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { FIXTURES } from '../__preview__/fixture';
import { Inspector } from '../components/Inspector';
import type { ArchitectActions, LifetimeOutcome, TraceOutcome, TraceRequest } from '../lib/actions';
import type { ProjectRecord, ProjectRun } from '../../shared/record';
import type { TracePage, TraceRecord } from '../lib/trace';
import { activity, node, T, tracePage } from './trace-fixture';

const preferences: Record<string, unknown> = {};
vi.mock('@sero-ai/app-runtime', () => ({
  useAppPreferences: () => ({
    values: preferences,
    set: (key: string, value: unknown) => { preferences[key] = value; },
  }),
  openSeroApp: vi.fn(),
}));

vi.mock('@sero-ai/ui', async () => ({
  Button: ({ children, ...props }: { children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>{children}</button>
  ),
  ...(await import('./select-stand-in')),
}));

const run = (id: string, overrides: Partial<ProjectRun> = {}): ProjectRun => ({
  id, kind: 'initial', objectiveId: null, startedAt: T(0), endedAt: null, outcome: 'in-progress', ...overrides,
});
const project = (runs: ProjectRun[] = [run('run-1')], overrides: Partial<ProjectRecord> = {}): ProjectRecord => ({ ...FIXTURES.build!, runs, ...overrides });

/** A run shaped like the audit's: owner charges, a delegated milestone, research, one failure. */
const froggerRun = activity([
  node('owner', { label: 'Owner', kind: 'owner', group: 'owner', costUsd: 0.04, charges: 2, model: 'anthropic/claude-fable-5-1', thinking: 'medium' }),
  node('m1', { label: 'M1 · Playable crossing', kind: 'milestone', costUsd: 4.2, startAt: T(5) }),
  node('m1:step', { parentId: 'm1', label: 'Implement the grid', kind: 'workflow-step', costUsd: 3, startAt: T(6) }),
  node('m1:evidence', { parentId: 'm1', label: 'Evidence', kind: 'evidence', group: 'evaluation', state: 'failed', costUsd: 0.05, startAt: T(30) }),
  node('res', { label: 'What should the first minute teach?', kind: 'research', group: 'research', costUsd: 0.36, startAt: T(2) }),
], {
  spend: [{ at: T(1), usd: 1 }, { at: T(40), usd: 4.6 }],
  byGroup: [{ group: 'workflows', usd: 4.2, tokens: null }, { group: 'research', usd: 0.36, tokens: null }, { group: 'owner', usd: 0.04, tokens: null }],
  byModel: [{ model: null, usd: 4.56 }, { model: 'anthropic/claude-fable-5-1', usd: 0.04 }],
});
const ownerCharge = (seq: number): TraceRecord => ({
  seq, at: T(seq), kind: 'usage', source: 'owner:sess', costUsd: 0.02, coverage: 'call', nodeId: 'owner', label: 'Owner',
  model: 'anthropic/claude-fable-5-1', thinking: 'medium', usage: { inputTokens: 100, outputTokens: 10 },
});
const froggerPage = (overrides: Partial<TracePage> = {}): TracePage => tracePage({
  summary: { ...tracePage().summary, attributableUsd: 4.6, aggregateUsd: 4.48, hasAggregate: true },
  activity: froggerRun,
  records: [ownerCharge(1), ownerCharge(2)],
  ...overrides,
});
const answer = (page: TracePage): TraceOutcome => ({ ok: true, text: 'done', page });

function actionsOver(overrides: Partial<ArchitectActions> = {}): ArchitectActions {
  const ok = () => vi.fn(async () => ({ ok: true, text: 'done' }));
  return {
    create: ok(), history: vi.fn(async () => ({ ok: true, text: 'done', entries: [] })),
    trace: vi.fn(async (_id: string, _query: TraceRequest) => answer(froggerPage())),
    lifetime: vi.fn(async (): Promise<LifetimeOutcome> => ({ ok: true, text: 'done', lifetime: null })),
    pause: ok(), resume: ok(), retry: ok(), stop: ok(), remove: ok(), raiseCap: ok(),
    setExecutionMode: ok(), setAutonomy: ok(), approveCharter: ok(), approveMilestone: ok(),
    answer: ok(), directive: ok(), setModelDefault: ok(), clearModelDefault: ok(), refreshModelTiers: ok(),
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  for (const key of Object.keys(preferences)) delete preferences[key];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const text = () => container.textContent ?? '';
const rows = () => [...container.querySelectorAll<HTMLElement>('[role="treeitem"]')];
const rowLabels = () => rows().map((row) => row.querySelector('b')?.textContent);

function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find((el) => el.textContent?.trim() === label || el.getAttribute('aria-label') === label);
  if (!found) throw new Error(`no button labelled ${label}`);
  return found;
}
const click = (label: string) => act(() => button(label).click());
const rerender = (record: ProjectRecord, actions: ArchitectActions, onBack = vi.fn()) =>
  act(() => root.render(<Inspector record={record} actions={actions} onBack={onBack} />));
async function open(record = project(), actions = actionsOver(), onBack = vi.fn()) {
  rerender(record, actions, onBack);
  await flush();
  return actions;
}
function key(name: string, shiftKey = false): void {
  const tree = container.querySelector('[role="tree"]');
  if (!tree) throw new Error('no tree');
  act(() => { tree.dispatchEvent(new KeyboardEvent('keydown', { key: name, shiftKey, bubbles: true })); });
}

describe('opening the inspector', () => {
  it('reads the newest run with its activity once, and shows named rows without a click', async () => {
    const actions = actionsOver();
    act(() => root.render(<StrictMode><Inspector record={project()} actions={actions} onBack={vi.fn()} /></StrictMode>));
    await flush();
    const reads = vi.mocked(actions.trace).mock.calls.map(([, query]) => query);
    expect(reads.every((query) => query.detail === true && query.runId === 'run-1')).toBe(true);
    expect(rowLabels()).toEqual(['Owner', 'What should the first minute teach?', 'M1 · Playable crossing']);
    expect(text()).not.toContain('Load activity');
    expect(text()).not.toContain('owner:sess');
  });

  it('says nothing was recorded once, with no tiles or charts', async () => {
    await open(project(), actionsOver({ trace: vi.fn(async () => answer(tracePage({ recorded: false }))) }));
    expect(text()).toContain('Nothing recorded for this run yet.');
    expect(container.querySelector('.ar-tile')).toBeNull();
    expect(container.querySelector('.ar-chart')).toBeNull();
  });

  it('ignores a read for a run the reader has already left', async () => {
    const pending = new Map<string, (value: TraceOutcome) => void>();
    const trace = vi.fn((_id: string, query: TraceRequest) => new Promise<TraceOutcome>((resolve) => { pending.set(query.runId ?? '', resolve); }));
    await open(project([run('run-a', { endedAt: T(9) }), run('run-b')]), actionsOver({ trace }));
    const scope = container.querySelector<HTMLSelectElement>('select[aria-label="Scope"]')!;
    act(() => { scope.value = 'run-a'; scope.dispatchEvent(new Event('change', { bubbles: true })); });
    await flush();
    act(() => pending.get('run-a')!(answer(froggerPage({ activity: activity([node('a', { label: 'Run A work' })]) }))));
    await flush();
    act(() => pending.get('run-b')!(answer(froggerPage({ activity: activity([node('b', { label: 'Run B work' })]) }))));
    await flush();
    expect(rowLabels()).toEqual(['Run A work']);
  });
});

describe('the figures', () => {
  it('states the aggregate part inside the one headline cost', async () => {
    await open();
    const tile = [...container.querySelectorAll('.ar-tile')].find((el) => el.textContent?.includes('Attributable cost'));
    expect(tile?.textContent).toContain('$4.60');
    expect(tile?.textContent).toContain('$4.48 without per-call detail');
  });

  it('says per call when every charge had call detail', async () => {
    await open(project(), actionsOver({ trace: vi.fn(async () => answer(froggerPage({ summary: { ...tracePage().summary, attributableUsd: 1 } }))) }));
    expect([...container.querySelectorAll('.ar-tile')].map((el) => el.textContent).join(' ')).toContain('per call');
  });

  it('shows unmeasured tokens and active time as unavailable, not zero', async () => {
    await open(project(), actionsOver({ trace: vi.fn(async () => answer(froggerPage({ activity: { ...froggerRun, nodes: froggerRun.nodes.map((entry) => ({ ...entry, endAt: null, synthetic: true })) } }))) }));
    const tiles = [...container.querySelectorAll('.ar-tile')].map((el) => el.textContent ?? '');
    expect(tiles.find((tile) => tile.startsWith('Active'))).toContain('unavailable');
    const tokens = [...container.querySelectorAll('.ar-chart')].find((el) => el.textContent?.includes('Token composition'));
    expect(tokens?.textContent).toContain('unavailable');
  });
});

describe('Live and Paused', () => {
  it('makes no read for a spend change while paused, and one when resumed', async () => {
    const actions = await open();
    const reads = () => vi.mocked(actions.trace).mock.calls.length;
    const before = reads();
    click('Live');
    const spent = (usd: number) => project([run('run-1')], { budget: { ...FIXTURES.build!.budget, spentUsd: usd } });
    rerender(spent(9), actions);
    await flush();
    expect(reads()).toBe(before);
    click('Paused');
    await flush();
    expect(reads()).toBe(before + 1);
  });

  it('offers no Live control for a closed run', async () => {
    await open(project([run('run-1', { endedAt: T(60), outcome: 'delivered' })]));
    expect(() => button('Live')).toThrow();
  });
});

describe('filters', () => {
  it('shows no subtotal unfiltered, and the matched cost of the full run with a filter on', async () => {
    const actions = await open();
    expect(container.querySelector('.ar-scope-note')).toBeNull();
    click('Owner');
    // The host's preferences re-render the surface; the stand-in store only records.
    rerender(project(), actions);
    expect(container.querySelector('.ar-scope-note')?.textContent).toContain('$0.04 of $4.60');
    const tile = [...container.querySelectorAll('.ar-tile')].find((el) => el.textContent?.includes('Attributable cost'));
    expect(tile?.textContent).toContain('$4.60');
  });

  it('clears the chip, the model and Failures only together', async () => {
    Object.assign(preferences, { inspectorActivities: 'research', inspectorModels: 'anthropic/claude-fable-5-1', inspectorFailuresOnly: true });
    await open();
    click('Clear filters');
    expect(preferences).toMatchObject({ inspectorActivities: '', inspectorModels: '', inspectorFailuresOnly: false });
  });

  it('says a run with no failures has none, and offers Clear filters', async () => {
    const clean = froggerPage({ activity: { ...froggerRun, nodes: froggerRun.nodes.map((entry) => ({ ...entry, state: 'done' as const })) }, nextAfterSeq: 4 });
    preferences.inspectorFailuresOnly = true;
    await open(project(), actionsOver({ trace: vi.fn(async () => answer(clean)) }));
    expect(text()).toContain('No failures in this run.');
    expect(() => button('Clear filters')).not.toThrow();
    expect(() => button('Load more activity')).toThrow();
  });

  it('says no activity matches when combined filters match nothing', async () => {
    Object.assign(preferences, { inspectorActivities: 'repair', inspectorFailuresOnly: true });
    await open();
    expect(text()).toContain('No activity matches these filters.');
  });

  it('opens the ancestors of a failure so the failure is visible', async () => {
    preferences.inspectorFailuresOnly = true;
    await open();
    expect(rowLabels()).toEqual(['M1 · Playable crossing', 'Evidence']);
    expect(rows()[0]?.dataset.dim).toBe('true');
  });
});

describe('the timeline', () => {
  it('expands and collapses from the keyboard, and Escape returns to the project', async () => {
    const onBack = vi.fn();
    await open(project(), actionsOver(), onBack);
    key('End');
    key('ArrowRight');
    expect(preferences.inspectorExpanded).toBe('m1');
    rerender(project(), actionsOver(), onBack);
    await flush();
    expect(rowLabels()).toContain('Implement the grid');
    key('ArrowLeft');
    expect(preferences.inspectorExpanded).toBe('');
    key('Escape');
    expect(onBack).toHaveBeenCalled();
  });

  it('keeps the selected row through a re-read', async () => {
    const actions = await open();
    act(() => rows().find((row) => row.textContent?.includes('What should'))!.click());
    rerender(project([run('run-1')], { budget: { ...FIXTURES.build!.budget, spentUsd: 5 } }), actions);
    await flush();
    expect(container.querySelector('[aria-selected="true"]')?.textContent).toContain('What should the first minute teach?');
  });

  it('renders a bounded number of rows for a 1,240-activity run', async () => {
    const many = activity(Array.from({ length: 1240 }, (_, index) => node(`n${index}`, { label: `Activity ${index}`, startAt: T(index) })));
    await open(project(), actionsOver({ trace: vi.fn(async () => answer(froggerPage({ activity: many, records: [] }))) }));
    expect(rows().length).toBeGreaterThan(0);
    expect(rows().length).toBeLessThanOrEqual(60);
  });

  it('shows Load more activity as the last row while older pages exist', async () => {
    const trace = vi.fn(async (_id: string, query: TraceRequest) => answer(froggerPage({ nextAfterSeq: query.afterSeq === undefined ? 2 : null })));
    const actions = await open(project(), actionsOver({ trace }));
    click('Load more activity');
    await flush();
    expect(vi.mocked(actions.trace).mock.calls.at(-1)?.[1]).toMatchObject({ afterSeq: 2, detail: true });
    expect(() => button('Load more activity')).toThrow();
  });
});

describe('the selected activity', () => {
  it('leaves out a delegated step\'s unrecorded model, and an owner charge names the owner model', async () => {
    preferences.inspectorExpanded = 'm1,owner';
    await open();
    act(() => rows().find((row) => row.textContent?.includes('Implement the grid'))!.click());
    const detail = () => container.querySelector('[aria-label="Selected activity"]')?.textContent ?? '';
    expect(detail()).not.toContain('Model');
    act(() => rows().find((row) => row.textContent?.includes('Usage'))!.click());
    expect(detail()).toContain('anthropic/claude-fable-5-1');
    expect(detail()).toContain('Input100');
  });

  it('says once that nothing was charged to a step, and leaves out what was not recorded', async () => {
    const plan = node('plan', { label: 'Workflow plan', kind: 'workflow', costUsd: null, coverage: null });
    await open(project(), actionsOver({ trace: vi.fn(async () => answer(froggerPage({ activity: activity([plan]) }))) }));
    const detail = container.querySelector('[aria-label="Selected activity"]')?.textContent ?? '';
    expect(detail).toContain('Costno charges recorded');
    for (const fact of ['Kind', 'Model', 'Attributable', 'Inclusive', 'Coverage', 'Thinking', 'Tokens', 'Not recorded', 'unavailable']) expect(detail).not.toContain(fact);
  });

  it('names a failure in words, not only by colour', async () => {
    preferences.inspectorExpanded = 'm1';
    await open();
    act(() => rows().find((row) => row.textContent?.includes('Evidence'))!.click());
    expect(container.querySelector('.ar-state-chip')?.textContent).toBe('failed');
  });
});

describe('the charts', () => {
  it('highlights the rows of the bar the reader picks', async () => {
    await open();
    act(() => [...container.querySelectorAll<HTMLButtonElement>('.ar-hbar')].find((bar) => bar.textContent?.includes('Research'))!.click());
    expect(rows().filter((row) => row.dataset.hit === 'true').map((row) => row.querySelector('b')?.textContent)).toEqual(['What should the first minute teach?']);
  });
});

describe('project lifetime', () => {
  it('opens a run from the runs table', async () => {
    const lifetime = vi.fn(async (): Promise<LifetimeOutcome> => ({ ok: true, text: 'done', lifetime: {
      runs: [{ id: 'run-1', label: 'Initial delivery', kind: 'initial', outcome: 'in-progress', open: true, recorded: true, attributableUsd: 4.6, linkedSharedUsd: 0, activeMs: 60_000, waitMs: 0, incomplete: false, spend: [] }],
      sharedUsd: 0,
      unassignedUsd: 0.4,
    } }));
    const actions = await open(project(), actionsOver({ lifetime }));
    const scope = container.querySelector<HTMLSelectElement>('select[aria-label="Scope"]')!;
    act(() => { scope.value = 'lifetime'; scope.dispatchEvent(new Event('change', { bubbles: true })); });
    await flush();
    expect(text()).toContain('Unassigned$0.40');
    const readsBefore = vi.mocked(actions.trace).mock.calls.length;
    click('Open');
    await flush();
    expect(vi.mocked(actions.trace).mock.calls.length).toBeGreaterThan(readsBefore);
    expect(rowLabels()).toContain('Owner');
  });
});
