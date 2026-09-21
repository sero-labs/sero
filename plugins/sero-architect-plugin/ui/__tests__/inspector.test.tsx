// @vitest-environment jsdom

/**
 * The run inspector (spec architect-run-observability).
 *
 * What matters here is that a summary does not pull a trace, that the reader can
 * drive the timeline from the keyboard, and that the view does not reset itself
 * underneath the reader when data arrives.
 */

import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { FIXTURES } from '../__preview__/fixture';
import { Inspector } from '../components/Inspector';
import type { ArchitectActions, TraceOutcome, TraceRequest } from '../lib/actions';
import type { TracePage, TraceRecord } from '../lib/trace';

const preferences: Record<string, unknown> = {};
vi.mock('@sero-ai/app-runtime', () => ({
  useAppPreferences: () => ({
    values: preferences,
    set: (key: string, value: unknown) => { preferences[key] = value; },
  }),
}));

vi.mock('@sero-ai/ui', async () => ({
  Button: ({ children, ...props }: { children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>{children}</button>
  ),
  ...(await import('./select-stand-in')),
}));

const at = (offsetMs: number): string => new Date(Date.parse('2026-09-14T09:00:00.000Z') + offsetMs).toISOString();
const record = (seq: number, overrides: Partial<TraceRecord> = {}): TraceRecord => ({
  seq, at: at(seq * 1000), kind: 'observation', operationId: `op_${seq}`, operationKind: 'workflow', ...overrides,
});

const page = (records: TraceRecord[], overrides: Partial<TracePage> = {}): TracePage => ({
  recorded: true,
  summary: {
    attributableUsd: 0.4, aggregateUsd: 0.1, hasAggregate: true, incomplete: false,
    requests: 3, toolCalls: 2, retries: 0, compactions: 0, errors: 0,
  },
  timing: { activeMs: 26_917, workerMs: 1841, waitMs: 0, openWaits: [] },
  tokens: { input: 100, output: 20, cacheRead: 0, cacheWrite: 0, unavailable: ['cacheRead'] },
  records,
  nextAfterSeq: null,
  incomplete: false,
  ...overrides,
});

function actionsOver(overrides: Partial<ArchitectActions> = {}): ArchitectActions {
  const ok = () => vi.fn(async () => ({ ok: true, text: 'done' }));
  return {
    create: ok(), history: vi.fn(async () => ({ ok: true, text: 'done', entries: [] })),
    trace: vi.fn(async (_id: string, _query: TraceRequest) => ({ ok: true, text: 'done', page: page([]) } as TraceOutcome)),
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

const flush = () => act(async () => { await Promise.resolve(); });

function click(label: string): void {
  const found = [...container.querySelectorAll('button')].find((el) => el.textContent?.includes(label));
  if (!found) throw new Error(`no button labelled ${label}`);
  act(() => found.click());
}

/** The filter controls are checkboxes inside their label, not buttons. */
function toggleFilter(label: string): void {
  const field = [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
    .find((el) => el.parentElement?.textContent?.includes(label));
  if (!field) throw new Error(`no filter labelled ${label}`);
  act(() => field.click());
}

describe('opening the inspector', () => {
  it('loads the current summary after Strict Mode reattaches its effects', async () => {
    act(() => root.render(<StrictMode><Inspector record={FIXTURES.build!} actions={actionsOver()} onBack={vi.fn()} /></StrictMode>));
    await flush();
    expect(container.textContent).toContain('$0.4000');
  });

  it('asks for a summary without trace detail', async () => {
    const trace = vi.fn(async (_id: string, _query: TraceRequest) => ({ ok: true, text: 'done', page: page([]) } as TraceOutcome));
    act(() => root.render(<Inspector record={FIXTURES.build!} actions={actionsOver({ trace })} onBack={vi.fn()} />));
    await flush();
    expect(trace).toHaveBeenCalledTimes(1);
    expect(trace.mock.calls[0]?.[1]).toMatchObject({ detail: false });
    // The totals are shown; the records are not read until asked for.
    expect(container.textContent).toContain('$0.4000');
    expect(container.textContent).toContain('Load activity');
  });

  it('reads the records only when the reader asks', async () => {
    const trace = vi.fn(async (_id: string, query: TraceRequest) => ({
      ok: true, text: 'done', page: page(query.detail ? [record(0), record(1)] : []),
    } as TraceOutcome));
    act(() => root.render(<Inspector record={FIXTURES.build!} actions={actionsOver({ trace })} onBack={vi.fn()} />));
    await flush();
    click('Load activity');
    await flush();
    expect(trace).toHaveBeenCalledTimes(2);
    expect(trace.mock.calls[1]?.[1]).toMatchObject({ detail: true });
    expect(container.textContent).toContain('op_0');
  });

  it('returns to the project from the header', async () => {
    const onBack = vi.fn();
    act(() => root.render(<Inspector record={FIXTURES.build!} actions={actionsOver()} onBack={onBack} />));
    await flush();
    click('Back to project');
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('labels the shared journal as shared activity, not the whole project', async () => {
    act(() => root.render(<Inspector record={FIXTURES.build!} actions={actionsOver()} onBack={vi.fn()} />));
    await flush();
    expect(container.textContent).toContain('Shared activity');
    expect(container.textContent).not.toContain('Whole project');
  });

  it('says a total is a lower bound when the view is incomplete', async () => {
    const trace = vi.fn(async (_id: string, _query: TraceRequest) => ({
      ok: true, text: 'done',
      page: { ...page([]), summary: { ...page([]).summary, incomplete: true } },
    } as TraceOutcome));
    act(() => root.render(<Inspector record={FIXTURES.build!} actions={actionsOver({ trace })} onBack={vi.fn()} />));
    await flush();
    expect(container.textContent).toContain('lower bound');
  });

  it('says nothing was recorded, instead of zeros, when the view has no journal', async () => {
    const trace = vi.fn(async (_id: string, _query: TraceRequest) => ({
      ok: true, text: 'done',
      page: { ...page([]), recorded: false },
    } as TraceOutcome));
    act(() => root.render(<Inspector record={FIXTURES.build!} actions={actionsOver({ trace })} onBack={vi.fn()} />));
    await flush();
    expect(container.textContent).toContain('No trace was recorded for this view');
    expect(container.textContent).not.toContain('$0.0000');
    expect(container.textContent).not.toContain('differs from project spend');
    expect(container.textContent).not.toContain('The totals above');
  });
});

describe('reading around a slow or stale response', () => {
  it('ignores a stale read that resolves after a newer selection already replaced it', async () => {
    const pending = new Map<string, (value: TraceOutcome) => void>();
    const trace = vi.fn((_id: string, query: TraceRequest) => {
      if (!query.detail) return Promise.resolve({ ok: true, text: 'done', page: page([]) } as TraceOutcome);
      return new Promise<TraceOutcome>((resolve) => { pending.set(query.runId ?? '', resolve); });
    });
    const withRuns = {
      ...FIXTURES.build!,
      runs: [{ id: 'run-a', kind: 'initial' as const, objectiveId: null, startedAt: at(0), endedAt: at(1000), outcome: 'delivered' as const }],
    };
    act(() => root.render(<Inspector record={withRuns} actions={actionsOver({ trace })} onBack={vi.fn()} />));
    await flush();
    click('Load activity');
    await flush();
    expect(pending.has('run-a')).toBe(true);

    const select = container.querySelector<HTMLSelectElement>('.ar-inspector-run select');
    if (!select) throw new Error('no view select');
    act(() => {
      select.value = 'shared';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();
    expect(pending.has('shared')).toBe(true);

    // The newer (shared) read resolves first...
    act(() => { pending.get('shared')!({ ok: true, text: 'done', page: page([record(2)]) } as TraceOutcome); });
    await flush();
    // ...then the now-obsolete run-a read resolves late. It must not overwrite the page shown.
    act(() => { pending.get('run-a')!({ ok: true, text: 'done', page: page([record(1)]) } as TraceOutcome); });
    await flush();

    expect(container.textContent).toContain('op_2');
    expect(container.textContent).not.toContain('op_1');
  });
});

describe('keeping the page keyed by the selected view', () => {
  it('keeps a selection that lived on page two through a re-read the budget triggers', async () => {
    const trace = vi.fn(async (_id: string, query: TraceRequest) => {
      if (!query.detail) return { ok: true, text: 'done', page: page([]) } as TraceOutcome;
      if (query.afterSeq !== undefined) return { ok: true, text: 'done', page: page([record(3)], { nextAfterSeq: null }) } as TraceOutcome;
      // A plain re-read of page one always returns the same first page.
      return { ok: true, text: 'done', page: page([record(0), record(1), record(2)], { nextAfterSeq: 2 }) } as TraceOutcome;
    });
    act(() => root.render(<Inspector record={FIXTURES.build!} actions={actionsOver({ trace })} onBack={vi.fn()} />));
    await flush();
    click('Load activity');
    await flush();
    click('Load more activity');
    await flush();
    // Select the row that only exists on the second page.
    act(() => { (container.querySelectorAll('.ar-span')[3] as HTMLElement | undefined)?.click(); });
    expect(container.querySelector('[data-selected="true"]')?.textContent).toContain('op_3');

    // A budget change alone recreates `load` and re-fires its effect, asking
    // for page one again with no afterSeq.
    const spent = { ...FIXTURES.build!, budget: { ...FIXTURES.build!.budget, spentUsd: FIXTURES.build!.budget.spentUsd + 0.01 } };
    act(() => root.render(<Inspector record={spent} actions={actionsOver({ trace })} onBack={vi.fn()} />));
    await flush();

    // The second page's row is still there and still selected: the re-read
    // merged onto what was already loaded rather than replacing it.
    expect(container.textContent).toContain('op_3');
    expect(container.querySelector('[data-selected="true"]')?.textContent).toContain('op_3');
  });

  it('never sends the new selection a Load more with the old one\'s cursor, or shows its records', async () => {
    const pending = new Map<string, (value: TraceOutcome) => void>();
    const trace = vi.fn((_id: string, query: TraceRequest) => {
      if (!query.detail) return Promise.resolve({ ok: true, text: 'done', page: page([]) } as TraceOutcome);
      const key = `${query.runId}:${query.afterSeq ?? 'first'}`;
      return new Promise<TraceOutcome>((resolve) => { pending.set(key, resolve); });
    });
    const withRuns = {
      ...FIXTURES.build!,
      runs: [{ id: 'run-a', kind: 'initial' as const, objectiveId: null, startedAt: at(0), endedAt: at(1000), outcome: 'delivered' as const }],
    };
    act(() => root.render(<Inspector record={withRuns} actions={actionsOver({ trace })} onBack={vi.fn()} />));
    await flush();
    click('Load activity');
    await flush();
    pending.get('run-a:first')!({ ok: true, text: 'done', page: page([record(0), record(1)], { nextAfterSeq: 1 }) } as TraceOutcome);
    await flush();
    expect(container.textContent).toContain('op_0');
    const loadMore = () => [...container.querySelectorAll('button')].find((el) => el.textContent?.includes('Load more activity'));
    expect(loadMore()).toBeDefined();

    // Switch to the shared view while run-a's page is still on screen: its
    // own first read for the new selection is now pending.
    const select = container.querySelector<HTMLSelectElement>('.ar-inspector-run select');
    if (!select) throw new Error('no view select');
    act(() => {
      select.value = 'shared';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();
    expect(pending.has('shared:first')).toBe(true);

    // Nothing to load more from during the gap: run-a's page and cursor are gone.
    expect(loadMore()).toBeUndefined();
    expect(container.textContent).not.toContain('op_0');

    pending.get('shared:first')!({ ok: true, text: 'done', page: page([record(9)], { nextAfterSeq: 9 }) } as TraceOutcome);
    await flush();
    expect(container.textContent).toContain('op_9');
    expect(container.textContent).not.toContain('op_0');

    click('Load more activity');
    await flush();
    expect(pending.has('shared:9')).toBe(true);
    expect(pending.has('run-a:1')).toBe(false);
  });
});

describe('keeping the request cheap', () => {
  it('does not re-read on a filter change, and uses the latest actions once it does read', async () => {
    const traceA = vi.fn(async (_id: string, query: TraceRequest) => ({
      ok: true, text: 'done', page: query.detail ? page([record(0), record(1)], { nextAfterSeq: 1 }) : page([]),
    } as TraceOutcome));
    act(() => root.render(<Inspector record={FIXTURES.build!} actions={actionsOver({ trace: traceA })} onBack={vi.fn()} />));
    await flush();
    click('Load activity');
    await flush();
    expect(traceA).toHaveBeenCalledTimes(2);

    const traceB = vi.fn(async (_id: string, _query: TraceRequest) => ({
      ok: true, text: 'done', page: page([record(2)], { nextAfterSeq: null }),
    } as TraceOutcome));
    // A preference write elsewhere recreates `actions` with a new identity,
    // the same shape a real preference set causes through useAppTools.
    act(() => root.render(<Inspector record={FIXTURES.build!} actions={actionsOver({ trace: traceB })} onBack={vi.fn()} />));
    await flush();

    toggleFilter('workflow');
    await flush();
    // A pure, local re-render must not trigger another read with either actions.
    expect(traceA).toHaveBeenCalledTimes(2);
    expect(traceB).toHaveBeenCalledTimes(0);

    click('Load more activity');
    await flush();
    // An explicit read after the swap uses the current actions, not the stale ones.
    expect(traceB).toHaveBeenCalledTimes(1);
  });
});

describe('driving the timeline', () => {
  const withRows = async () => {
    const trace = vi.fn(async (_id: string, query: TraceRequest) => ({
      ok: true, text: 'done', page: query.detail ? page([record(0), record(1), record(2)]) : page([]),
    } as TraceOutcome));
    act(() => root.render(<Inspector record={FIXTURES.build!} actions={actionsOver({ trace })} onBack={vi.fn()} />));
    await flush();
    click('Load activity');
    await flush();
    const timeline = container.querySelector<HTMLDivElement>('[aria-label="Activity timeline"]');
    if (!timeline) throw new Error('no timeline');
    return timeline;
  };

  it.each(['Enter', ' '])('expands the selected operation from the focused timeline with %s', async (key) => {
    const timeline = await withRows();
    const selectedId = timeline.getAttribute('aria-activedescendant');
    expect(document.getElementById(selectedId!)).not.toBeNull();
    act(() => { timeline.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); });
    expect(preferences.inspectorExpanded).toBe('op_0');
  });

  it('moves the selection with the arrow keys rather than requiring a pointer', async () => {
    const timeline = await withRows();
    // The first row is selected, so the panel is never empty on arrival.
    expect(container.textContent).toContain('op_0');

    act(() => { timeline.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
    expect(container.querySelector('[data-selected="true"]')).not.toBeNull();
    expect(container.textContent).toContain('op_1');

    act(() => { timeline.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })); });
    expect(container.textContent).toContain('op_0');
  });

  it('keeps the selected seq through a Load more that returns a shorter page', async () => {
    const firstPage = [record(0), record(1), record(2)];
    const secondPage = [record(3)];
    const trace = vi.fn(async (_id: string, query: TraceRequest) => {
      if (!query.detail) return { ok: true, text: 'done', page: page([]) } as TraceOutcome;
      return query.afterSeq === undefined
        ? ({ ok: true, text: 'done', page: page(firstPage, { nextAfterSeq: 2 }) } as TraceOutcome)
        : ({ ok: true, text: 'done', page: page(secondPage, { nextAfterSeq: null }) } as TraceOutcome);
    });
    act(() => root.render(<Inspector record={FIXTURES.build!} actions={actionsOver({ trace })} onBack={vi.fn()} />));
    await flush();
    click('Load activity');
    await flush();

    // Select the middle row (seq 1), not the default first one.
    act(() => { (container.querySelectorAll('.ar-span')[1] as HTMLElement | undefined)?.click(); });
    expect(container.querySelector('[data-selected="true"]')?.textContent).toContain('op_1');

    click('Load more activity');
    await flush();

    // The continuation's shorter page is appended, and the same record stays selected.
    expect(container.textContent).toContain('op_3');
    expect(container.querySelector('[data-selected="true"]')?.textContent).toContain('op_1');
  });

  it('leaves the view with Escape, the same as the back control', async () => {
    const onBack = vi.fn();
    const trace = vi.fn(async (_id: string, query: TraceRequest) => ({
      ok: true, text: 'done', page: query.detail ? page([record(0)]) : page([]),
    } as TraceOutcome));
    act(() => root.render(<Inspector record={FIXTURES.build!} actions={actionsOver({ trace })} onBack={onBack} />));
    await flush();
    click('Load activity');
    await flush();
    const timeline = container.querySelector<HTMLDivElement>('[aria-label="Activity timeline"]');
    act(() => { timeline?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('keeps the selected row when a later read arrives', async () => {
    const timeline = await withRows();
    act(() => { timeline.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
    const first = container.querySelector('[data-selected="true"]')?.textContent;
    // A filter change re-renders the same selection; the reader's place survives it.
    toggleFilter('workflow');
    await flush();
    expect(container.querySelector('[data-selected="true"]')?.textContent).toBe(first);
  });

  it('remembers the filters in the host layout service, so returning shows them again', async () => {
    await withRows();
    toggleFilter('workflow');
    expect(preferences.inspectorActivities).toBe('workflow');

    // Leaving the inspector and coming back re-reads the stored value. The mock
    // is not reactive, so a remount is how that return is reproduced here.
    act(() => root.unmount());
    root = createRoot(container);
    await withRows();
    const field = [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
      .find((el) => el.parentElement?.textContent?.includes('workflow'));
    expect(field?.checked).toBe(true);
    expect(container.textContent).toContain('Clear filters');
  });

  it('distinguishes a failure by its words and not only by colour', async () => {
    const trace = vi.fn(async (_id: string, query: TraceRequest) => ({
      ok: true, text: 'done', page: query.detail ? page([record(0, { outcome: 'failed' })]) : page([]),
    } as TraceOutcome));
    act(() => root.render(<Inspector record={FIXTURES.build!} actions={actionsOver({ trace })} onBack={vi.fn()} />));
    await flush();
    click('Load activity');
    await flush();
    expect(container.textContent).toContain('failed');
  });

  it('says a timing was not observed rather than showing a zero', async () => {    const trace = vi.fn(async (_id: string, query: TraceRequest) => ({
      ok: true, text: 'done',
      page: query.detail
        ? { ...page([record(0)]), timing: { activeMs: 0, workerMs: 0, waitMs: 0, openWaits: [] } }
        : { ...page([]), timing: { activeMs: 0, workerMs: 0, waitMs: 0, openWaits: [] } },
    } as TraceOutcome));
    act(() => root.render(<Inspector record={FIXTURES.build!} actions={actionsOver({ trace })} onBack={vi.fn()} />));
    await flush();
    expect(container.textContent).toContain('none observed');
    // Counters nothing reported are named, not silently shown as zero coverage.
    expect(container.textContent).toContain('cacheRead unavailable');
  });
});

describe('the charts and the timeline agree', () => {
  const rows = [
    record(0, { operationKind: 'workflow', costUsd: 0.30, model: 'openai-codex/gpt-5.6-terra', thinking: 'high' }),
    record(1, { operationKind: 'evidence', costUsd: 0.05, model: 'openai-codex/gpt-5.6-luna', thinking: 'low' }),
  ];

  const render = async () => {
    const trace = vi.fn(async (_id: string, query: TraceRequest) => ({
      ok: true, text: 'done', page: query.detail ? page(rows) : page([]),
    } as TraceOutcome));
    act(() => root.render(<Inspector record={FIXTURES.build!} actions={actionsOver({ trace })} onBack={vi.fn()} />));
    await flush();
    click('Load activity');
    await flush();
  };

  it('draws a breakdown and a model row per model and effort level', async () => {
    await render();
    expect(container.textContent).toContain('Cumulative spend');
    // Exact values, not rounded into the same number.
    expect(container.textContent).toContain('$0.3000');
    expect(container.textContent).toContain('$0.0500');
    expect(container.textContent).toContain('openai-codex/gpt-5.6-terra');
    expect(container.textContent).toContain('openai-codex/gpt-5.6-luna');
    expect(container.textContent).toContain('high');
    expect(container.textContent).toContain('low');
  });

  it('filters the timeline when an activity bar is chosen', async () => {
    await render();
    const bar = [...container.querySelectorAll('button')].find((el) => el.className === 'ar-bar-row' && el.textContent?.includes('workflow'));
    if (!bar) throw new Error('no activity bar');
    act(() => bar.click());
    // The chart drives the timeline's filter rather than sitting beside it.
    expect(preferences.inspectorActivities).toBe('workflow');

    // The mock is not reactive, so returning to the view is how the stored
    // filter is read back: the timeline is narrowed and the total says so.
    act(() => root.unmount());
    root = createRoot(container);
    await render();
    expect(container.textContent).toContain('filtered view:');
    expect(container.textContent).toContain('1 of 2 rows');
  });

  it('shows an operation its own cost and its inclusive cost separately', async () => {
    await render();
    expect(container.textContent).toContain('own cost');
    expect(container.textContent).toContain('inclusive');
    // The selected row is exclusive; the whole tree's exclusive sum is the same
    // figure, so the panel's inclusive value is never added into a total.
    expect(container.textContent).toContain('$0.3000');
    expect(container.textContent).toContain('$0.3500');
  });

  it('charts nothing and says so when no usage was priced', async () => {
    const trace = vi.fn(async (_id: string, query: TraceRequest) => ({
      ok: true, text: 'done', page: query.detail ? page([record(0), record(1)]) : page([]),
    } as TraceOutcome));
    act(() => root.render(<Inspector record={FIXTURES.build!} actions={actionsOver({ trace })} onBack={vi.fn()} />));
    await flush();
    click('Load activity');
    await flush();
    expect(container.textContent).toContain('nothing to chart');
    // Not a line at zero dressed up as a measurement.
    expect(container.textContent).not.toContain('Cumulative spend');
  });

  it('still shows late worker activity and its usage after a Stop', async () => {
    const trace = vi.fn(async (_id: string, query: TraceRequest) => ({
      ok: true, text: 'done',
      page: query.detail
        ? page([record(0, { operationKind: 'workflow', costUsd: 0.22 })])
        : page([], { summary: { ...page([]).summary, attributableUsd: 0.22 } }),
    } as TraceOutcome));
    const stopped = {
      ...FIXTURES.build!,
      paused: true,
      runs: [{ id: 'run-stop', kind: 'initial' as const, objectiveId: null, startedAt: at(0), endedAt: null, outcome: 'stopped' as const }],
    };
    act(() => root.render(<Inspector record={stopped} actions={actionsOver({ trace })} onBack={vi.fn()} />));
    await flush();
    click('Load activity');
    await flush();

    // The run never ended and the project is stopped, so the view says so rather
    // than presenting a tidy, finished-looking total.
    expect(container.textContent).toContain('Interrupted');
    // The late worker's cost is still counted, not dropped because work stopped.
    expect(container.textContent).toContain('$0.2200');
    expect(container.textContent).toContain('op_0');
  });
});
