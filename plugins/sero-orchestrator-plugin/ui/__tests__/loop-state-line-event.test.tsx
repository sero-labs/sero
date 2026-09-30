// @vitest-environment jsdom

/**
 * The state line while a newly arrived event is checked: it names the event and
 * offers the eye, so the wait says what it is about.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoopStateLine } from '../components/LoopStateLine';
import type { Loop } from '../../shared/types';

const notices = vi.hoisted(() => ({ current: null as { kind: string; runId: string; loopId?: string; label?: string } | null }));

vi.mock('../lib/use-live-call', () => ({
  useLiveCallNotice: () => notices.current,
  useLiveCallRunId: (kind: string) => (notices.current?.kind === kind ? notices.current.runId : undefined),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  notices.current = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

const loop = { id: 'loop-1', runtime: {}, triggers: [] } as unknown as Loop;

describe('LoopStateLine while an event condition runs', () => {
  it('names the event and offers the eye', async () => {
    notices.current = {
      kind: 'event',
      runId: 'run-check-1',
      loopId: 'loop-1',
      label: 'pull request #612 opened',
    };

    await act(async () => root.render(<LoopStateLine loop={loop} summary={null} />));

    expect(container.textContent).toContain('checking a new event: pull request #612 opened');
    const eye = container.querySelector<HTMLButtonElement>('button[aria-label^="Watch the agent for"]');
    expect(eye).not.toBeNull();

    await act(async () => eye?.click());
    expect(container.querySelector('[data-slot="live-block"]')).not.toBeNull();
  });

  it('shows nothing while no event is being checked', async () => {
    await act(async () => root.render(<LoopStateLine loop={loop} summary={null} />));

    expect(container.textContent).not.toContain('checking a new event');
    expect(container.querySelector('button[aria-label^="Watch the agent for"]')).toBeNull();
  });

  it('ignores an event check belonging to another Workflow', async () => {
    notices.current = { kind: 'event', runId: 'run-check-2', loopId: 'loop-2', label: 'issue #81 closed' };

    await act(async () => root.render(<LoopStateLine loop={loop} summary={null} />));

    expect(container.textContent).not.toContain('checking a new event');
  });
});
