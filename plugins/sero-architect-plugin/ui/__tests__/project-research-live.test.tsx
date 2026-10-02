// @vitest-environment jsdom

/**
 * Research the Architect runs directly as one agent.
 *
 * It has no Room or Workflow behind it, so nothing used to show it on the
 * project page while it ran. Its card now carries the question, the wait and
 * the eye, and keeps its findings once it ends.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const subagentBridge = {
  snapshot: vi.fn(async () => []),
  watch: vi.fn(async () => {}),
  unwatch: vi.fn(async () => {}),
  onEvent: vi.fn(() => () => {}),
};

vi.mock('@sero-ai/app-runtime', () => ({
  openSeroApp: vi.fn(async () => true),
  openSeroFile: vi.fn(async () => true),
  useAppPreferences: () => ({ values: {}, set: vi.fn() }),
  useAppTools: () => ({ run: vi.fn() }),
}));

import { FIXTURES } from '../__preview__/fixture';
import { ProjectResearch } from '../components/ProjectResearch';
import { projectActivity } from '../lib/view-model';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Reflect.set(globalThis, 'sero', { subagent: subagentBridge });

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const base = FIXTURES.build!;

describe('direct research on the project page', () => {
  it('shows the question, the wait and the eye while it runs', () => {
    const record = {
      ...base,
      pendingResearch: [{
        id: 'res-1',
        question: 'Does the cache survive a restart?',
        stoppingCondition: 'Stop once the restart path is traced.',
        startedAt: new Date(Date.now() - 4_000).toISOString(),
        runId: 'run-research-1',
      }],
    };

    act(() => root.render(<ProjectResearch record={record} />));

    expect(container.textContent).toContain('Does the cache survive a restart?');
    expect(container.textContent).toContain('Stop once the restart path is traced.');
    expect(container.textContent).toContain('Researching 0:04');
    expect(container.querySelector('button[aria-label^="Watch the agent for"]')).not.toBeNull();
    // The activity line names the work rather than the plumbing.
    expect(projectActivity(record)).toBe('Researching a project question');
  });

  it('opens the live block on request', async () => {
    const record = {
      ...base,
      pendingResearch: [{
        id: 'res-1',
        question: 'Does the cache survive a restart?',
        stoppingCondition: 'Stop once the restart path is traced.',
        startedAt: new Date().toISOString(),
        runId: 'run-research-1',
      }],
    };

    act(() => root.render(<ProjectResearch record={record} />));
    const eye = container.querySelector<HTMLButtonElement>('button[aria-label^="Watch the agent for"]');
    await act(async () => eye?.click());

    expect(container.querySelector('[data-slot="live-block"]')).not.toBeNull();
  });

  it('keeps its findings once it ends', () => {
    const record = {
      ...base,
      pendingResearch: [],
      research: [{
        id: 'res-1',
        question: 'Does the cache survive a restart?',
        stoppingCondition: 'Stop once the restart path is traced.',
        result: 'The cache is rebuilt from the index on start.',
        costUsd: 0.4,
        completedAt: new Date().toISOString(),
      }],
    };

    act(() => root.render(<ProjectResearch record={record} />));

    expect(container.textContent).toContain('Findings used for the plan');
    expect(container.textContent).toContain('The cache is rebuilt from the index on start.');
    expect(container.querySelector('button[aria-label^="Watch the agent for"]')).toBeNull();
    // Nothing is running, so the activity line is free to say something else.
    expect(projectActivity(record)).not.toBe('Researching a project question');
  });
});
