/**
 * One Workflow, one spend. Home and the Workflows list read the index summary;
 * the Workflow page derives its own figure from loop.json plus runs/index.json.
 * These check the two agree with each other and with the limit that blocks.
 *
 * The defect they close: the page summed the runs only, so a Workflow that had
 * also spent money planning and reflecting read lower on its own page than on
 * Home, while maxCostUsd blocked at the higher figure.
 */

import { describe, expect, it } from 'vitest';
import type { Loop, LoopRun, StepAttempt } from '../../shared/types';
import { checkManagementLimits } from '../limits';
import { stripLoopForPersist, toRunSummary, toSummary } from '../store';
import { summarizeLoopUsage } from '../../ui/lib/usage-summary';
import { createFakeHost } from './fake-host';
import { oneStepPlan, seedActiveLoop } from './fixtures';

/** A finished Workflow that spent money inside its run and outside it. */
function spentLoop(maxCostUsd?: number): Loop {
  const loop = seedActiveLoop(createFakeHost(), oneStepPlan().plan);
  const stepId = loop.plan.steps[0].id;
  const attempt: StepAttempt = {
    id: 'attempt-1',
    stepId,
    attemptNumber: 1,
    parentSessionId: loop.runtime.parentSessionId,
    executionType: 'background-agent',
    status: 'completed',
    startedAt: loop.createdAt,
    endedAt: loop.createdAt,
    usage: { costUsd: 2.08, totalTokens: 2000 },
  } as StepAttempt;
  const run: LoopRun = {
    id: 'run-1',
    runNumber: 1,
    status: 'completed',
    startedStepIds: [stepId],
    stepAttempts: [attempt],
    recoveryDecisions: [],
    observations: [],
    auxiliaryUsage: { costUsd: 0.05, totalTokens: 100 },
    startedAt: loop.createdAt,
    endedAt: loop.createdAt,
  };
  loop.limits = { ...loop.limits, maxCostUsd };
  loop.planningUsage = { costUsd: 0.3, totalTokens: 900 };
  loop.auxiliaryUsage = { costUsd: 0.12, totalTokens: 400 };
  loop.runs = [run];
  return loop;
}

/** What the Workflow page has to work with: loop.json has no runs in it. */
function pageFigure(loop: Loop): number | undefined {
  const watched = stripLoopForPersist(structuredClone(loop));
  return summarizeLoopUsage(watched, loop.runs.map((run) => toRunSummary(run)))?.totalCost;
}

describe('one Workflow shows one spend', () => {
  it('the page and the index agree for the same record', () => {
    const loop = spentLoop();
    expect(pageFigure(loop)).toBe(toSummary(loop).usage?.costUsd);
  });

  it('that figure counts what the Workflow spent outside its runs', () => {
    const loop = spentLoop();
    // 0.3 planning + 0.12 Workflow auxiliary + 0.05 run auxiliary + 2.08 attempt.
    expect(pageFigure(loop)).toBeCloseTo(2.55, 10);
    // Summing the runs alone, which is what the page used to do.
    const runsOnly = loop.runs.reduce(
      (sum, run) => sum + (run.auxiliaryUsage?.costUsd ?? 0)
        + run.stepAttempts.reduce((n, a) => n + (a.usage?.costUsd ?? 0), 0),
      0,
    );
    expect(runsOnly).toBeCloseTo(2.13, 10);
    expect(pageFigure(loop)).not.toBeCloseTo(runsOnly, 10);
  });

  it('the shown remaining budget runs out where the limit blocks', () => {
    // Just after the run began, so the default wall-clock limit is not what
    // answers here and the cost limit is tested on its own.
    const justStarted = (loop: Loop) => Date.parse(loop.runs[0].startedAt) + 1_000;

    const under = spentLoop(2.56);
    const watchedUnder = stripLoopForPersist(structuredClone(under));
    expect(summarizeLoopUsage(watchedUnder, under.runs.map((run) => toRunSummary(run)))?.costRemaining).toBeGreaterThan(0);
    expect(checkManagementLimits(under, under.runs[0], justStarted(under)).ok).toBe(true);

    const at = spentLoop(2.55);
    const watchedAt = stripLoopForPersist(structuredClone(at));
    expect(summarizeLoopUsage(watchedAt, at.runs.map((run) => toRunSummary(run)))?.costRemaining).toBe(0);
    const blocked = checkManagementLimits(at, at.runs[0], justStarted(at));
    expect(blocked.ok).toBe(false);
    expect(blocked.limit).toBe('maxCostUsd');
  });
});
