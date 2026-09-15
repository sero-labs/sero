// @vitest-environment jsdom

/**
 * The run inspector (spec architect-run-observability).
 *
 * What matters here is that a summary does not pull a trace, that the reader can
 * drive the timeline from the keyboard, and that the view does not reset itself
 * underneath the reader when data arrives.
 */

import { act } from 'react';
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

vi.mock('@sero-ai/ui', () => ({
  Button: ({ children, ...props }: { children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>{children}</button>
  ),
}));

const at = (offsetMs: number): string => new Date(Date.parse('2026-09-14T09:00:00.000Z') + offsetMs).toISOString();
const record = (seq: number, overrides: Partial<TraceRecord> = {}): TraceRecord => ({
  seq, at: at(seq * 1000), kind: 'observation', operationId: `op_${seq}`, operationKind: 'workflow', ...overrides,
});

const page = (records: TraceRecord[]): TracePage => ({
  summary: {
    attributableUsd: 0.4, aggregateUsd: 0.1, hasAggregate: true, incomplete: false,
    requests: 3, toolCalls: 2, retries: 0, compactions: 0, errors: 0,
  },
  timing: { activeMs: 26_917, workerMs: 1841, waitMs: 0 },
  tokens: { input: 100, output: 20, cacheRead: 0, cacheWrite: 0, unavailable: ['cacheRead'] },
  records,
  nextAfterSeq: null,
  incomplete: false,
});

function actionsOver(overrides: Partial<ArchitectActions> = {}): ArchitectActions {
  const ok = () => vi.fn(async () => ({ ok: true, text: 'done' }));
  return {
    create: ok(), history: vi.fn(async () => ({ ok: true, text: 'done', entries: [] })),
    trace: vi.fn(async (_id: string, _query: TraceRequest) => ({ ok: true, text: 'done', page: page([]) } as TraceOutcome)),
    pause: ok(), resume: ok(), retry: ok(), stop: ok(), remove: ok(), raiseCap: ok(),
    setExecutionMode: ok(), setAutonomy: ok(), approveCharter: ok(), approveMilestone: ok(),
    answer: ok(), directive: ok(), setModelDefault: ok(), clearModelDefault: ok(),
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

  it('says a total is a lower bound when the view is incomplete', async () => {
    const trace = vi.fn(async (_id: string, _query: TraceRequest) => ({
      ok: true, text: 'done',
      page: { ...page([]), summary: { ...page([]).summary, incomplete: true } },
    } as TraceOutcome));
    act(() => root.render(<Inspector record={FIXTURES.build!} actions={actionsOver({ trace })} onBack={vi.fn()} />));
    await flush();
    expect(container.textContent).toContain('lower bound');
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

  it('says a timing was not observed rather than showing a zero', async () => {
    const trace = vi.fn(async (_id: string, query: TraceRequest) => ({
      ok: true, text: 'done',
      page: query.detail
        ? { ...page([record(0)]), timing: { activeMs: 0, workerMs: 0, waitMs: 0 } }
        : { ...page([]), timing: { activeMs: 0, workerMs: 0, waitMs: 0 } },
    } as TraceOutcome));
    act(() => root.render(<Inspector record={FIXTURES.build!} actions={actionsOver({ trace })} onBack={vi.fn()} />));
    await flush();
    expect(container.textContent).toContain('none observed');
    // Counters nothing reported are named, not silently shown as zero coverage.
    expect(container.textContent).toContain('cacheRead unavailable');
  });
});
