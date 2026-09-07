// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FIXTURES } from '../__preview__/fixture';
import { MilestoneRail } from '../components/MilestoneRail';

const openSeroApp = vi.fn(async () => true);
vi.mock('@sero-ai/app-runtime', () => ({
  openSeroApp: (...args: unknown[]) => openSeroApp(...(args as [])),
  openSeroFile: vi.fn(async () => true),
  useAppPreferences: () => ({ values: {}, set: vi.fn() }),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  openSeroApp.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('the milestone rail', () => {
  it('shows one Orchestrator link per dispatched milestone and none for the rest', () => {
    const onOpenDispatch = vi.fn();
    act(() => root.render(<MilestoneRail record={FIXTURES.decision!} onOpenDispatch={onOpenDispatch} />));
    const links = Array.from(container.querySelectorAll('.ar-btn-link')).map((link) => link.getAttribute('data-testid'));
    expect(links).toEqual(['open-m1', 'open-m2', 'open-m3']);
    expect(container.querySelectorAll('.ar-ms').length).toBe(5);
  });

  it('opens the Workflow or the Room record through the Orchestrator app', async () => {
    const { openDispatch } = await import('../lib/page-helpers');
    act(() => root.render(<MilestoneRail record={FIXTURES.decision!} onOpenDispatch={openDispatch} />));
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="open-m2"]')!.click());
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="open-m3"]')!.click());
    expect(openSeroApp.mock.calls).toEqual([
      ['orchestrator', { loopId: 'workflow-m2' }],
      ['orchestrator', { roomId: 'room-m3' }],
    ]);
  });

  it('keeps evidence behind a disclosure and shows no step detail', () => {
    act(() => root.render(<MilestoneRail record={FIXTURES.build!} onOpenDispatch={vi.fn()} />));
    const evidence = container.querySelector<HTMLDetailsElement>('details.ar-evidence');
    expect(evidence?.open).toBe(false);
    expect(evidence?.querySelector('summary')?.textContent).toContain('Evidence at 3f1c2ab');
    expect(container.textContent).not.toContain('step 4 of 7');
  });
});
