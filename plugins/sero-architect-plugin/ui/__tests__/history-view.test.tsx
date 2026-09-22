// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FIXTURES } from '../__preview__/fixture';
import { HistoryView } from '../components/HistoryView';
import type { HistoryEntry } from '../../shared/record';

vi.mock('@sero-ai/app-runtime', () => ({
  openSeroApp: vi.fn(async () => true),
  openSeroFile: vi.fn(async () => true),
  useAppPreferences: () => ({ values: {}, set: vi.fn() }),
}));

const T = (day: number, time: string): string => `2026-09-${String(day).padStart(2, '0')}T${time}:00.000Z`;

const ENTRIES: HistoryEntry[] = [
  { at: T(8, '09:12'), phase: 'intake', overlay: null, cause: 'created from the idea and folder' },
  { at: T(9, '19:40'), phase: 'build', overlay: 'decision', cause: 'Architect asked a question', subject: { kind: 'decision', id: 'dec_1', label: 'Hex or square?' }, detail: 'The full question the drawing shortens.' },
  { at: T(9, '19:45'), phase: 'build', overlay: null, cause: 'accepted on passed evidence', subject: { kind: 'milestone', id: 'm1', label: 'Grid, movement and field of view' } },
  { at: T(9, '20:11'), phase: 'build', overlay: null, cause: 'sent to its Workflow', subject: { kind: 'workflow', id: 'workflow-m1', label: 'Grid, movement and field of view' } },
  { at: T(10, '20:14'), phase: 'build', overlay: 'blocked', cause: 'blocked: Grid, movement and field of view stopped before it finished' },
  { at: T(10, '20:16'), phase: 'build', overlay: null, cause: 'Room resumed', subject: { kind: 'room', id: 'room-m3', label: 'Items, combat and permadeath' } },
];

let container: HTMLDivElement;
let root: Root;
const folds = (opened: string[] = []) => ({ opened: new Set(opened), toggle: vi.fn() });

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(recordHistory: HistoryEntry[], onOpenEvidence = vi.fn(), onOpenDispatch = vi.fn(), state = folds()) {
  const record = { ...FIXTURES.decision!, history: recordHistory };
  act(() => root.render(
    <HistoryView record={record} onBack={() => undefined} onOpenDispatch={onOpenDispatch} onOpenEvidence={onOpenEvidence} folds={state} />,
  ));
  return { onOpenEvidence, onOpenDispatch, state };
}

function button(label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((el) => el.textContent?.includes(label));
}

describe('the History view', () => {
  it('keeps the timeline inside its own scroll region', () => {
    render(ENTRIES);
    // The app root owns the height and hides overflow, so the timeline must
    // scroll on its own or a long history is clipped.
    const scroll = container.querySelector('.ar-scroll');
    expect(scroll).not.toBeNull();
    expect(scroll?.querySelector('.ar-history')).not.toBeNull();
  });

  it('states the count and date range and heads each day', () => {
    render(ENTRIES);
    expect(container.textContent).toContain('6 changes');
    expect(container.textContent).toContain('8 Sep – 10 Sep');
    expect([...container.querySelectorAll('.ar-hist-day')].map((el) => el.textContent)).toEqual(['10 Sep', '9 Sep', '8 Sep']);
  });

  it('draws a dot for a block, a question and an accepted milestone, and none for the rest', () => {
    render(ENTRIES);
    expect(container.querySelector('[data-dot="block"]')).not.toBeNull();
    expect(container.querySelector('[data-dot="question"]')).not.toBeNull();
    expect(container.querySelector('[data-dot="accepted"]')).not.toBeNull();
    // The two entries that record neither show the plain dot state.
    expect(container.querySelectorAll('[data-dot="none"]').length).toBeGreaterThan(0);
    // A block separates its status word from the reason it names.
    expect(container.textContent).toContain('Blocked');
    expect(container.textContent).not.toContain('blocked:');
    expect(container.textContent).toContain('Question');
  });

  it('links an accepted milestone to its evidence and a Workflow or a Room to its record', () => {
    const evidence = vi.fn();
    const dispatch = vi.fn();
    render(ENTRIES, evidence, dispatch);

    act(() => button('Evidence')!.click());
    expect(evidence).toHaveBeenCalledWith('m1');

    act(() => button('Workflow')!.click());
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ kind: 'workflow', id: 'workflow-m1' }));

    act(() => button('Room')!.click());
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ kind: 'room', id: 'room-m3' }));
  });

  it('folds a note under its entry and opens it from its own control', () => {
    const state = folds();
    render(ENTRIES, vi.fn(), vi.fn(), state);
    expect(container.textContent).not.toContain('The full question the drawing shortens.');

    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Show the note"]')!.click());
    expect(state.toggle).toHaveBeenCalledOnce();
  });

  it('shows an opened note when the preference says it is open', () => {
    render(ENTRIES, vi.fn(), vi.fn(), folds(['1:2026-09-09T19:40:00.000Z']));
    expect(container.textContent).toContain('The full question the drawing shortens.');
  });

  it('opens the older entries from Show earlier and drops none', () => {
    const many: HistoryEntry[] = Array.from({ length: 16 }, (_, index) => ({
      at: T(9, '10:00'),
      phase: 'build' as const,
      overlay: null,
      cause: `entry number ${index}`,
    }));
    render(many);

    const earlier = button('Show 2 earlier')!;
    expect(earlier).toBeDefined();
    expect(container.textContent).not.toContain('entry number 0');

    act(() => earlier.click());
    expect(container.textContent).toContain('entry number 0');
    expect(button('Show 2 earlier')).toBeUndefined();
  });
});
