// @vitest-environment jsdom

/**
 * The dashboard widget prints the same derived state as the projects list, so a
 * project that reads Last known on one cannot read Working on the other.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ArchitectIndex, ArchitectIndexEntry } from '../../shared/types';

const lastKnown: ArchitectIndexEntry = {
  id: 'frogger',
  name: 'FroggerNeon',
  workspaceId: 'ws-1',
  phase: 'build',
  overlay: null,
  activity: {
    state: 'last-known',
    headline: 'Last known: working on M2 · Adversarial review',
    owner: 'No report since',
    ownerAt: '2026-09-16T08:12:00.000Z',
    ownerSuffix: 'Architect is not running',
    lastReportAt: '2026-09-16T08:12:00.000Z',
  },
  milestones: { accepted: 1, total: 2 },
  spentUsd: 2.7,
  capUsd: 10,
  needsYou: 0,
  updatedAt: '2026-09-16T08:12:00.000Z',
};

const index: ArchitectIndex = { version: 1, projects: [lastKnown], runtime: { running: false, startedAt: '2026-09-19T10:00:00.000Z' } };

vi.mock('@sero-ai/app-runtime', () => ({
  useAppState: () => [index, () => {}, true],
  openSeroApp: () => {},
}));

vi.mock('@sero-ai/ui', () => {
  const pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Button: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
    EmptyState: pass,
    ItemList: pass,
    ItemListItem: ({ primary, secondary, trailing }: { primary: ReactNode; secondary: ReactNode; trailing: ReactNode }) => (
      <div><span>{primary}</span><span data-testid="secondary">{secondary}</span><span>{trailing}</span></div>
    ),
    Stack: pass,
    WidgetContent: pass,
  };
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('the Architect widget', () => {
  it('shows the derived state, the same words the list shows', async () => {
    const { ArchitectWidget } = await import('../widgets/ArchitectWidget');

    act(() => root.render(<ArchitectWidget />));

    expect(container.querySelector('[data-testid="secondary"]')?.textContent).toBe(lastKnown.activity.headline);
    expect(container.textContent).not.toContain('Working on M2');
  });
});
