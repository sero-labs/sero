// @vitest-environment jsdom

/**
 * One run row: the number, the ending, the start, and the steps the run visited
 * by the titles the plan held. A stopped run prints its own saved reason.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LoopRunStatus, LoopRunStepSummary, LoopRunSummary } from '../../shared/types';
import { AttemptHistory } from '../components/AttemptHistory';

const STARTED = '2026-09-10T12:00:00.000Z';

function step(overrides: Partial<LoopRunStepSummary> & { stepId: string }): LoopRunStepSummary {
  return {
    visitNumber: 1,
    attemptNumber: 1,
    executionType: 'background-agent',
    status: 'completed',
    ...overrides,
  };
}

function run(overrides: Partial<LoopRunSummary> = {}): LoopRunSummary {
  return {
    id: 'run_1',
    runNumber: 2,
    status: 'completed' as LoopRunStatus,
    startedAt: STARTED,
    endedAt: '2026-09-10T12:01:05.000Z',
    steps: [],
    recoveries: [],
    ...overrides,
  };
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render(runs: LoopRunSummary[]) {
  act(() => root.render(<AttemptHistory runs={runs} />));
  return host.textContent ?? '';
}

function chip(text: string): Element | undefined {
  return [...host.querySelectorAll('*')].find((el) => el.textContent === text && el.className.includes('border-'));
}

describe('the attempt-history row', () => {
  it('prints the run number without a hash and the start as the day, short month and time', () => {
    const text = render([run()]);
    expect(text).toContain('Run 2');
    expect(text).not.toContain('Run #2');
    expect(text).toMatch(/10 Sep, \d{2}:\d{2}/);
  });

  it('prints the run\'s own saved reason in the chip, in the fault colour', () => {
    render([run({
      status: 'blocked',
      block: { kind: 'management-limit', reason: 'Stopped at the $3 spend limit', createdAt: STARTED, limit: 'maxCostUsd' },
      steps: [step({ stepId: 's1', title: 'Implement accessible composable title search' })],
    })]);

    const stop = chip('Stopped at the $3 spend limit');
    expect(stop).toBeDefined();
    expect(stop?.className).toContain('rose');
    // The reason already states the ending, so no status word is printed beside it.
    expect(host.textContent).not.toContain('Blocked');
  });

  it('names the visited steps by their titles in visit order', () => {
    const text = render([run({
      steps: [
        step({ stepId: 's1', title: 'Implement accessible composable title search', visitNumber: 1 }),
        step({ stepId: 's2', title: 'Run release checks and rendered verification', visitNumber: 2 }),
      ],
    })]);
    expect(text).toContain('Implement accessible composable title search → Run release checks and rendered verification');
    // The step line replaces the outcome count, so no count is printed beside it.
    expect(text).not.toContain('2 done');
  });

  it('names a step by its id when the summary predates the title field', () => {
    const text = render([run({ steps: [step({ stepId: 's1' }), step({ stepId: 's2', visitNumber: 2 })] })]);
    expect(text).toContain('s1 → s2');
  });

  it('states why in place of the steps when the run visited no step', () => {
    const text = render([run({ steps: [] })]);
    expect(text).toContain('no steps run');
  });

  it('states a run-level reason instead of listing the steps', () => {
    const text = render([run({
      statusReason: 'Waited for the release window.',
      steps: [step({ stepId: 's1', title: 'Implement accessible composable title search' })],
    })]);
    expect(text).toContain('Waited for the release window.');
    expect(text).not.toContain('Implement accessible composable title search');
  });
});
