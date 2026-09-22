// @vitest-environment jsdom

/**
 * The projects list: two lines of activity per project, the action it needs,
 * and a filter for the rows that need you. When the runtime is off, the list
 * says so once and the affected rows read Last known.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import type { ArchitectIndexEntry } from '../../shared/types';
import { ProjectsList } from '../components/ProjectsList';

vi.mock('@sero-ai/ui', () => ({
  Button: ({ children, ...props }: { children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>{children}</button>
  ),
}));

function entry(overrides: Partial<ArchitectIndexEntry> = {}): ArchitectIndexEntry {
  return {
    id: 'proj_0hkazv71',
    name: 'FroggerNeon',
    workspaceId: 'ws-1',
    phase: 'build',
    overlay: null,
    activity: {
      state: 'stopped',
      headline: 'M2 · Adversarial review stopped',
      owner: 'Workflow',
      ownerAt: '2026-09-16T08:12:00.000Z',
      ownerSuffix: 'Architect idle',
      reason: 'Sero restarted during step 2 of its Workflow.',
      action: 'Retry the step',
    },
    milestones: { accepted: 1, total: 2 },
    spentUsd: 4.6,
    capUsd: 10,
    needsYou: 0,
    updatedAt: '2026-09-16T08:12:00.000Z',
    ...overrides,
  };
}

const quiet = entry({
  id: 'proj_quiet',
  name: 'DungeonExplorer Resilience 01',
  activity: {
    state: 'waiting-for-trigger',
    headline: 'Maintenance is waiting for a trigger',
    owner: 'Workflow last ran',
    ownerAt: '2026-09-14T08:00:00.000Z',
    ownerSuffix: 'Architect idle',
  },
  milestones: { accepted: 4, total: 5 },
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

function render(
  projects: ArchitectIndexEntry[],
  runtime: { running: boolean; startedAt: string } | undefined = { running: true, startedAt: '2026-09-19T10:00:00.000Z' },
  needsOnly = false,
) {
  act(() => root.render(<ProjectsList needsOnly={needsOnly} projects={projects} runtime={runtime} onOpen={() => {}} onNewProject={() => {}} />));
}

describe('the projects list', () => {
  it('shows the state, whose work it is, and the action it needs', () => {
    render([entry()]);

    const text = container.textContent ?? '';
    expect(text).toContain('M2 · Adversarial review stopped');
    expect(text).toContain('Workflow');
    expect(text).toContain('Architect idle');
    expect(text).toContain('Retry the step');
    expect(text).toContain('build · 1 of 2 milestones accepted');
  });

  it('keeps the record id off the row', () => {
    render([entry()]);

    expect(container.textContent).not.toContain('proj_0hkazv71');
  });

  it('says Nothing when a project needs nothing', () => {
    render([quiet]);

    expect(container.textContent).toContain('Nothing');
  });

  // The "Needs you · N" control lives in the top bar, beside New project, where
  // the approved proposal puts it; the list only honours the filter it sets.
  it('shows only the rows that need you when the top bar filter is on', () => {
    render([entry(), quiet], undefined, true);

    const rows = [...container.querySelectorAll('.ar-prow')];
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('FroggerNeon');
  });

  it('shows every row when the filter is off', () => {
    render([entry(), quiet]);

    expect(container.querySelectorAll('.ar-prow')).toHaveLength(2);
  });

  it('names each column once, above the rows', () => {
    render([entry()]);

    const head = container.querySelector('.ar-rowhead');
    expect(head?.textContent).toBe('ProjectActivityNeeds youSpend');
  });

  it('says once, at the top, that the Architect is not running', () => {
    render([entry()], { running: false, startedAt: '2026-09-19T10:00:00.000Z' });

    const notices = [...container.querySelectorAll('.ar-runtime-notice')];
    expect(notices).toHaveLength(1);
    expect(notices[0].textContent).toContain('Architect is not running in this session');
    // Nothing to dismiss: the condition clears itself when the runtime runs.
    expect(notices[0].querySelector('button')).toBeNull();
  });

  it('leaves saved facts alone while the runtime is off', () => {
    const paused = entry({
      id: 'proj_paused',
      name: 'import-dashboard-resilience-02',
      activity: { state: 'paused', headline: 'Paused by you', owner: 'Maintenance Workflow paused with the project' },
    });

    render([paused], { running: false, startedAt: '2026-09-19T10:00:00.000Z' });

    expect(container.textContent).toContain('Paused by you');
    expect(container.textContent).not.toContain('Last known');
  });
});
