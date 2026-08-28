// @vitest-environment jsdom

/**
 * The plan map card carries the information the old map hid behind a click.
 * Each line has to hold one kind of thing: what the step is (number, title and
 * state), how it runs (agent and marks), and what it produced (outcome and
 * elapsed time). These tests hold that contract, and the fallback to the
 * expected outcome before a step has run.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Loop, LoopStepDefinition, StepStatus } from '../../shared/types';
import { DEFAULT_LIMITS, DEFAULT_LOG_POLICY, DEFAULT_WORKSPACE_SETTINGS } from '../../shared/defaults';
import { PlanMapCard } from '../components/PlanMapCard';

const NOW = '2026-07-27T00:00:00.000Z';

const step = (extra: Partial<LoopStepDefinition> = {}): LoopStepDefinition => ({
  id: 'check',
  title: 'Check each level independently',
  instructions: 'Run the checks',
  execution: { type: 'background-agent' },
  ...extra,
});

function loopWith(target: LoopStepDefinition, status: StepStatus, summary?: string): Loop {
  return {
    id: 'map',
    workspaceId: 'workspace',
    title: 'Map',
    prompt: 'Map',
    summary: 'Map',
    status: 'active',
    workspace: { ...DEFAULT_WORKSPACE_SETTINGS },
    plan: { schemaVersion: 1, revision: 1, objective: 'Map', steps: [target] },
    runtime: {
      parentSessionId: 'parent',
      variables: {},
      stepStates: {
        [target.id]: {
          status,
          attempts: 1,
          updatedAt: NOW,
          outcome: summary ? { status: 'succeeded', summary } : undefined,
        },
      },
      workspace: {},
    },
    triggers: [],
    limits: { ...DEFAULT_LIMITS },
    logPolicy: { ...DEFAULT_LOG_POLICY },
    warnings: [],
    runs: [{
      id: 'run-1',
      runNumber: 1,
      status: 'running',
      startedStepIds: [],
      stepAttempts: [{
        id: 'attempt-1',
        stepId: target.id,
        attemptNumber: 1,
        parentSessionId: 'parent',
        executionType: 'background-agent',
        status: 'completed',
        observations: [],
        startedAt: NOW,
        endedAt: '2026-07-27T00:06:00.000Z',
      }],
      recoveryDecisions: [],
      observations: [],
      startedAt: NOW,
    }],
    revisions: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe('PlanMapCard', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const render = async (
    loop: Loop,
    target: LoopStepDefinition,
    options: { grouped?: boolean; selected?: boolean } = {},
  ) => {
    await act(async () => root.render(
      <PlanMapCard
        loop={loop}
        step={target}
        number={2}
        grouped={options.grouped}
        titleLines={2}
        selected={options.selected ?? false}
        onSelect={() => {}}
      />,
    ));
    return container.textContent ?? '';
  };

  it('shows the title, the state, the agent, the outcome and the elapsed time', async () => {
    const target = step();
    const text = await render(loopWith(target, 'succeeded', '3 of 10 levels are outside their band.'), target);
    expect(text).toContain('Check each level independently');
    expect(text).toContain('done');
    expect(text).toContain('background-agent');
    expect(text).toContain('3 of 10 levels are outside their band.');
    expect(text).toContain('6m');
  });

  it('names the agent role instead of the execution type when the planner set one', async () => {
    const target = step({ execution: { type: 'background-agent', agent: 'explorer' } });
    expect(await render(loopWith(target, 'pending'), target)).toContain('agent · explorer');
  });

  it('falls back to the expected outcome before the step has an outcome', async () => {
    const target = step({ expectedOutcome: 'Every level inside its band.' });
    expect(await render(loopWith(target, 'pending'), target))
      .toContain('Expects · Every level inside its band.');
  });

  it('labels the structure marks for a fan out and an approval gate', async () => {
    const target = step({
      gate: 'approval',
      fanOut: { itemsFrom: 'levels', itemVariable: 'level', maxItems: 10 },
    });
    await render(loopWith(target, 'pending'), target);
    const labels = [...container.querySelectorAll('[aria-label]')].map((node) => node.getAttribute('aria-label'));
    expect(labels).toContain('One run for each item, up to 10');
    expect(labels).toContain('Approval gate');
  });

  it('keeps the elapsed time in a grouped stage card', async () => {
    const target = step();
    const text = await render(
      loopWith(target, 'succeeded', 'All levels checked.'),
      target,
      { grouped: true },
    );
    expect(text).toContain('Check each level independently');
    expect(text).toContain('done');
    expect(text).toContain('All levels checked.');
    expect(text).toContain('6m');
  });

  it('puts the outcome before the execution marks', async () => {
    const target = step();
    await render(loopWith(target, 'succeeded', 'All levels checked.'), target);
    const rows = [...container.querySelector('button')!.children].map((node) => node.textContent ?? '');
    expect(rows[1]).toContain('All levels checked.');
    expect(rows[2]).toContain('background-agent');
  });

  it('allows a long outcome to wrap onto a second line', async () => {
    const target = step();
    await render(loopWith(target, 'succeeded', 'A long outcome that can use the available card height.'), target);
    const outcome = container.querySelector('button')?.children[1].firstElementChild;
    expect(outcome?.className).toContain('line-clamp-2');
    expect(outcome?.className).not.toContain('truncate');
  });

  it('uses an inset selection border', async () => {
    const target = step();
    await render(loopWith(target, 'pending'), target, { selected: true });
    expect(container.querySelector('button')?.className).toContain('ring-inset');
    expect(container.querySelector('button')?.className).not.toContain('ring-2 ring-sky');
  });
});
