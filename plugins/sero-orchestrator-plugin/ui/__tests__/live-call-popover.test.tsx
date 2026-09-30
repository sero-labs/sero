// @vitest-environment jsdom

/**
 * The eye on a one-answer call in a button row: Reflect and Skill in the
 * Workflow top bar, and the rewriting line in Refine plan.
 *
 * The block opens above the row, so Escape must close it — the reader cannot be
 * left with a pop-up they can only dismiss by finding the control again.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveCallPopover } from '../components/LiveCallPopover';
import { RefinePlan } from '../components/RefinePlan';

const notices = vi.hoisted(() => ({
  current: null as { kind: string; runId: string; loopId?: string; requestId?: string; roomId?: string } | null,
}));

vi.mock('../lib/use-live-call', () => ({
  // Mirrors the real hook: a match that names a Workflow takes only its own call.
  useLiveCall: (match: { kind: string; loopId?: string; requestId?: string; roomId?: string }) => {
    const notice = notices.current;
    if (!notice || notice.kind !== match.kind) return undefined;
    if (match.loopId !== undefined && notice.loopId !== match.loopId) return undefined;
    if (match.requestId !== undefined && notice.requestId !== match.requestId) return undefined;
    if (match.roomId !== undefined && notice.roomId !== match.roomId) return undefined;
    return notice;
  },
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

function eye(): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>('button[aria-label^="Watch the agent for"]');
}

function block(): Element | null {
  return container.querySelector('[data-slot="live-block"]');
}

async function pressEscape() {
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
}

describe('LiveCallPopover', () => {
  it('keeps the reply closed until the eye is pressed, and Escape closes it', async () => {
    await act(async () => root.render(<LiveCallPopover runId="run-reflect-1" label="Reflecting…" busy />));

    expect(eye()).not.toBeNull();
    expect(eye()?.getAttribute('aria-expanded')).toBe('false');
    expect(block()).toBeNull();

    await act(async () => eye()?.click());
    expect(eye()?.getAttribute('aria-expanded')).toBe('true');
    expect(block()).not.toBeNull();

    await pressEscape();
    expect(eye()?.getAttribute('aria-expanded')).toBe('false');
    expect(block()).toBeNull();
  });

  it('closes with the eye as well as with Escape', async () => {
    await act(async () => root.render(<LiveCallPopover runId="run-skill-1" label="Preparing skill…" />));

    await act(async () => eye()?.click());
    expect(block()).not.toBeNull();

    await act(async () => eye()?.click());
    expect(block()).toBeNull();
  });
});

describe('Refine plan', () => {
  const type = async (value: string) => {
    const field = container.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(field, value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  const updateButton = () => [...container.querySelectorAll<HTMLButtonElement>('button')]
    .find((button) => button.textContent?.includes('Update plan'));

  it('puts the eye beside the rewriting line while the plan is rewritten', async () => {
    notices.current = { kind: 'refine', runId: 'run-refine-1', loopId: 'loop-1' };
    await act(async () => {
      root.render(<RefinePlan busy={false} planRevision={3} onRefine={() => {}} loopId="loop-1" />);
    });

    await type('stop when the queue is empty');
    await act(async () => updateButton()?.click());
    // The parent turns busy on a moment later, which is what shows the wait.
    await act(async () => {
      root.render(<RefinePlan busy planRevision={3} onRefine={() => {}} loopId="loop-1" />);
    });

    expect(container.textContent).toContain('The AI is rewriting the plan…');
    expect(eye()).not.toBeNull();

    await act(async () => eye()?.click());
    expect(block()).not.toBeNull();

    await pressEscape();
    expect(block()).toBeNull();
  });

  it('offers no eye when another Workflow is the one being refined', async () => {
    notices.current = { kind: 'refine', runId: 'run-refine-2', loopId: 'loop-2' };
    await act(async () => {
      root.render(<RefinePlan busy={false} planRevision={3} onRefine={() => {}} loopId="loop-1" />);
    });

    await type('stop when the queue is empty');
    await act(async () => updateButton()?.click());
    await act(async () => {
      root.render(<RefinePlan busy planRevision={3} onRefine={() => {}} loopId="loop-1" />);
    });

    expect(container.textContent).toContain('The AI is rewriting the plan…');
    expect(eye()).toBeNull();
  });
});
