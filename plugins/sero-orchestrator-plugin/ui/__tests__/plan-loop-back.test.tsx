// @vitest-environment jsdom

/**
 * A Workflow that goes back to an earlier step draws the loop on the plan rail.
 *
 * It used to be a banner above the plan: "↩ Feedback: verify-release →
 * harden-and-cover". Two step ids that appear nowhere else on the page told
 * the reader nothing about where the loop went.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { previewLoop } from '../__preview__/fixture';
import { PlanView } from '../components/PlanView';

vi.mock('@sero-ai/app-runtime', () => ({
  useAvailableModels: () => ({ groups: [] }),
  useSubagentContext: () => ({ context: { tools: [], agents: [] } }),
}));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

describe('a plan with a loop back', () => {
  beforeEach(() => {
    act(() => { root.render(<PlanView loop={previewLoop} onAction={() => {}} />); });
  });

  it('draws the loop on the rail, from the step that decides up to the step it returns to', () => {
    const ends = host.querySelectorAll('.orc-loop-to');
    const starts = host.querySelectorAll('.orc-loop-from');
    expect(ends).toHaveLength(1);
    expect(starts).toHaveLength(1);
    // Every row the loop passes over carries the line, so it reads as one loop.
    expect(host.querySelectorAll('.orc-loop-through').length).toBeGreaterThan(0);
    // The rail is drawn above the step it returns to and below the one that decides.
    const rows = [...host.querySelectorAll('.orc-loop-row')];
    expect(rows[0].className).toContain('orc-loop-to');
    expect(rows[rows.length - 1].className).toContain('orc-loop-from');
  });

  it('says the condition and the count on the rail, in words', () => {
    const title = host.querySelector('.orc-loop-to')?.getAttribute('title') ?? '';
    expect(title).toContain('goes back to step');
    expect(title).toContain('when levelsOk = false');
    expect(title).toContain('of 3 used this run');
    // Step numbers, never the step ids the banner printed.
    expect(title).not.toContain('recheck');
    expect(title).not.toContain('patch');
  });

  it('no longer prints the banner above the plan', () => {
    expect(host.textContent).not.toContain('Feedback:');
    expect(host.textContent).not.toContain('traversals');
  });
});
