// @vitest-environment jsdom

/**
 * The Workflow page says what it is set to, under labels.
 *
 * The line it replaces was seven icon chips. A reader had to know that the
 * folder meant placement, the paper plane meant delivery and the gauge meant
 * limits before the line said anything, and the two settings they could change
 * were buttons in a separate row below it.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GithubSourceHealth, Loop, LoopSummary, LoopTrigger } from '../../shared/types';
import { LoopSettingsLine } from '../components/LoopSettingsLine';
import { LoopStateLine } from '../components/LoopStateLine';

const { openSeroApp } = vi.hoisted(() => ({ openSeroApp: vi.fn(async () => true) }));
vi.mock('@sero-ai/app-runtime', () => ({ openSeroApp }));

const NOW = '2026-09-20T10:00:00.000Z';

function trigger(over: Partial<LoopTrigger>): LoopTrigger {
  return { id: 'trigger-1', loopId: 'loop-1', workspaceId: 'ws-1', type: 'event', fireCount: 0, ...over };
}

/** A Workflow that runs in the workspace root, on a schedule, with every limit set. */
function workflow(over: Partial<Loop> = {}): Loop {
  return {
    id: 'loop-1',
    title: 'Reading tracker resilience',
    summary: 'Keep the reading tracker green.',
    prompt: '',
    status: 'active',
    workspace: { useManagedWorktree: false, allowDirtyWorkspaceRoot: false },
    runtime: { workspace: { resolved: null }, pendingEvents: [] },
    triggers: [trigger({ type: 'cron', schedule: '0 8 * * 1', nextFireAt: NOW })],
    limits: { maxAttemptsTotal: 50, maxWallClockMs: 30 * 60_000, maxConcurrentSteps: 2, maxCostUsd: 4.5 },
    plan: { steps: [], revision: 1 },
    warnings: [],
    ...over,
  } as unknown as Loop;
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  openSeroApp.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function renderSettings(loop: Loop) {
  act(() => {
    root.render(<LoopSettingsLine loop={loop} runs={[]} busy={false} onAction={() => {}} />);
  });
}

describe('the Workflow settings line', () => {
  it('names every value it shows', () => {
    renderSettings(workflow());
    const labels = [...host.querySelectorAll('dt')].map((node) => node.textContent);
    expect(labels).toEqual(['Runs in', 'Results to', 'Starts', 'Context', 'Spend', 'Attempts', 'Time']);
    const values = [...host.querySelectorAll('dd')].map((node) => node.textContent);
    expect(values[0]).toBe('Workspace root');
    expect(values[2]).toBe('Mondays 08:00');
    expect(values[3]).toBe('Default preset');
    expect(values[4]).toBe('$0.00 of $4.50');
    expect(values[5]).toBe('50');
    expect(values[6]).toBe('30 min');
  });

  it('leaves the steps-at-a-time limit off the page while it still applies', () => {
    const loop = workflow();
    renderSettings(loop);
    expect(host.textContent).not.toContain('concurrent');
    expect(host.textContent).not.toContain('2 steps');
    // The limit itself is untouched: runtime/limits.ts still reads it.
    expect(loop.limits.maxConcurrentSteps).toBe(2);
  });

  it('opens the context editor from the context value, not from a button beside it', () => {
    renderSettings(workflow({ contextOverrides: { systemPrompt: 'Be terse', disabledSkills: ['web'] } }));
    const cells = [...host.querySelectorAll('dd')];
    const context = cells[3].querySelector('button');
    expect(context?.textContent).toBe('Custom prompt · 1 skill off');
    expect(host.textContent).not.toContain('Context ');
  });

  it('opens each trigger\'s conditions from what starts the Workflow', () => {
    const loop = workflow({
      triggers: [
        trigger({
          id: 't-issue',
          eventSource: 'github:issue-opened',
          eventFilter: { repo: 'sero-labs/sero' },
          eventCondition: 'the issue is labelled bug',
        }),
      ],
    });
    renderSettings(loop);
    const starts = [...host.querySelectorAll('dd')][2].querySelector('button');
    expect(starts?.textContent).toBe('A GitHub issue');
    act(() => { starts?.click(); });
    const dialog = document.body.textContent ?? '';
    expect(dialog).toContain('Only when repo is sero-labs/sero');
    expect(dialog).toContain('Only when: the issue is labelled bug');
  });

  it('names the Architect project it came from, first, and opens it', () => {
    renderSettings(workflow({
      project: { projectId: 'proj_dungeon', runId: 'run-1', projectName: 'DungeonExplorer' },
    }));

    // FROM leads the line, and every value the line showed before is still here.
    const labels = [...host.querySelectorAll('dt')].map((node) => node.textContent);
    expect(labels).toEqual(['From', 'Runs in', 'Results to', 'Starts', 'Context', 'Spend', 'Attempts', 'Time']);

    const from = [...host.querySelectorAll('dd')][0].querySelector('button');
    expect(from?.textContent).toBe('DungeonExplorer');
    act(() => { from?.click(); });
    expect(openSeroApp).toHaveBeenCalledWith('architect', { projectId: 'proj_dungeon' });
  });

  it('shows no From value when the record has an id but no name', () => {
    renderSettings(workflow({ project: { projectId: 'proj_dungeon', runId: 'run-1' } }));

    const labels = [...host.querySelectorAll('dt')].map((node) => node.textContent);
    expect(labels).toEqual(['Runs in', 'Results to', 'Starts', 'Context', 'Spend', 'Attempts', 'Time']);
  });

  it('shows no From value when the record names no project', () => {
    renderSettings(workflow());

    expect([...host.querySelectorAll('dt')].map((node) => node.textContent)).not.toContain('From');
    expect(openSeroApp).not.toHaveBeenCalled();
  });
});

describe('the Workflow state line', () => {
  /** Two armed GitHub events, three events already queued, and GitHub backing off. */
  const armed = workflow({
    triggers: [
      trigger({ id: 't-1', eventSource: 'github:issue-opened' }),
      trigger({ id: 't-2', eventSource: 'github:ci-failed' }),
    ],
    runtime: {
      workspace: { resolved: null },
      pendingEvents: [
        { source: 'github:issue-opened', summary: 'Issue 540 opened' },
        { source: 'github:ci-failed', summary: 'CI failed on main' },
        { source: 'github:issue-opened', summary: 'Issue 541 opened' },
      ],
    },
  } as unknown as Partial<Loop>);

  const summary: LoopSummary = {
    id: 'loop-1',
    title: 'Reading tracker resilience',
    status: 'active',
    armedEventSources: ['github:issue-opened', 'github:ci-failed'],
  } as unknown as LoopSummary;

  const github: GithubSourceHealth = {
    lastPolledAt: NOW,
    throttledUntil: '2026-09-20T10:05:00.000Z',
  } as unknown as GithubSourceHealth;

  it('says what is armed, what is queued and whether the source answers, without opening anything', () => {
    renderSettings(armed);
    const starts = [...host.querySelectorAll('dd')][2].textContent;
    expect(starts).toBe('A GitHub issue or a CI failure');

    act(() => {
      root.render(<LoopStateLine loop={armed} summary={summary} githubHealth={github} webhookHealth={null} />);
    });
    expect(host.textContent).toContain('3 events queued · next: Issue 540 opened');
    expect(host.textContent).toContain('GitHub · backing off until');
  });

  it('colours none of those three facts as needing the user', () => {
    act(() => {
      root.render(<LoopStateLine loop={armed} summary={summary} githubHealth={github} webhookHealth={null} />);
    });
    const line = host.querySelector('p');
    expect(line?.className).toContain('text-room-text3');
    // The activity glyph carries the only tone on the line, and an armed
    // Workflow is waiting for a trigger, not waiting for the user.
    const word = host.querySelector('[data-activity-state]');
    expect(word?.getAttribute('data-activity-state')).toBe('waiting-for-trigger');
    for (const span of host.querySelectorAll('p > span:not([data-activity-state])')) {
      expect(span.className).not.toContain('status-warning');
      expect(span.className).not.toContain('status-error');
    }
  });
});
