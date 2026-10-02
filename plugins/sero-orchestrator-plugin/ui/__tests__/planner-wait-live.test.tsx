// @vitest-environment jsdom

/**
 * The planner wait: the title, the real elapsed time and the eye beside it.
 *
 * The wait covers designing a Room, rethinking a Room and planning a Workflow —
 * and now also installing a Workflow from the Catalog, which is a planner call.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlannerWait } from '../components/PlannerWait';
import { PlanMapSkeleton } from '../components/PlanMap';
import { CatalogBrowser } from '../components/CatalogBrowser';

// The running call arrives from the app's own runtime; how it gets there is the
// hook's own test. Here it says one planner call is in flight.
vi.mock('../lib/use-live-call', () => ({
  useLiveCall: () => ({ kind: 'planner', runId: 'run-plan-1' }),
  useLiveCallRunId: (kind: string) => (kind === 'planner' ? 'run-plan-1' : undefined),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
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

function blocks(): NodeListOf<Element> {
  return container.querySelectorAll('[data-slot="live-block"]');
}

describe('PlannerWait', () => {
  it('shows the spinner and the elapsed time without a run to watch', () => {
    act(() => root.render(<PlannerWait title="Designing your team" />));

    expect(container.textContent).toContain('Designing your team');
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    expect(eye()).toBeNull();
    expect(blocks()).toHaveLength(0);
  });

  it('puts the eye beside the time and opens the reply under it', async () => {
    act(() => root.render(<PlannerWait title="Planning this Workflow" runId="run-plan-1" />));

    expect(eye()).not.toBeNull();
    expect(eye()?.getAttribute('aria-expanded')).toBe('false');
    expect(blocks()).toHaveLength(0);

    await act(async () => eye()?.click());

    expect(eye()?.getAttribute('aria-expanded')).toBe('true');
    expect(blocks()).toHaveLength(1);
  });

  it('carries no step list, bar, percentage or countdown', () => {
    act(() => root.render(<PlannerWait title="Rethinking your team" runId="run-plan-1" />));

    const text = container.textContent ?? '';
    expect(text).toContain('Rethinking your team');
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
    expect(text).not.toMatch(/%/);
  });
});

describe('the screens that wait on a planner', () => {
  it('shows the wait while a Workflow is planned', () => {
    act(() => root.render(<PlanMapSkeleton />));

    expect(container.textContent).toContain('Planning this Workflow');
    expect(eye()).not.toBeNull();
  });

  it('shows the wait while a Catalog Workflow is installed, not only a disabled button', async () => {
    const catalog = {
      catalogRepos: [{ key: 'official', url: 'https://example.test/catalog.git', official: true }],
      catalogContents: [{
        repo: { key: 'official', url: 'https://example.test/catalog.git', official: true },
        entries: [{
          repoKey: 'official',
          meta: { name: 'Nightly triage', slug: 'nightly-triage', description: 'Triage the night queue.', prompt: 'Triage it.' },
          definition: { plan: { steps: [] } },
        }],
        problems: [],
      }],
    };
    // The install call is the planner call: it stays in flight for this test.
    const dispatch = vi.fn((params: Record<string, unknown>) => (
      params.action === 'catalog_install'
        ? new Promise<Record<string, unknown> | null>(() => {})
        : Promise.resolve(catalog)
    ));

    await act(async () => {
      root.render(
        <CatalogBrowser
          busy={false}
          libraryIndex={{ version: 1, entries: [] }}
          dispatch={dispatch}
          onOpenLoop={() => {}}
          onShowInLibrary={() => {}}
        />,
      );
    });

    const install = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Install');
    expect(install).not.toBeUndefined();

    await act(async () => install?.click());

    expect(container.textContent).toContain('Planning this Workflow');
    expect(eye()).not.toBeNull();
  });
});
