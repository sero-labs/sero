// @vitest-environment jsdom

/**
 * A step card says what happened. How the step was written opens from the
 * chevron.
 *
 * The captured Workflow had steps whose instruction ran to a full screen, and
 * the card printed all of it above the Result. The reader scrolled past the
 * instruction of every step to find out what any of them had done.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Loop, LoopStepDefinition } from '../../shared/types';
import { previewLoop } from '../__preview__/fixture';
import { mapRouteState } from '../lib/plan-map-state';
import { stepMarks, stepOverrides, stepStateLabel } from '../lib/step-detail';
import { PlanMapCard } from '../components/PlanMapCard';
import { StepCard } from '../components/StepCard';

const NUMBER_OF = new Map(previewLoop.plan.steps.map((step, index) => [step.id, index + 1]));

function find(id: string): LoopStepDefinition {
  const step = previewLoop.plan.steps.find((candidate) => candidate.id === id);
  if (!step) throw new Error(`the preview fixture no longer has a step called ${id}`);
  return step;
}

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

function renderStep(step: LoopStepDefinition, loop: Loop = previewLoop) {
  act(() => {
    root.render(
      <StepCard
        step={step}
        number={NUMBER_OF.get(step.id) ?? 1}
        loop={loop}
        numberOf={NUMBER_OF}
        state={loop.runtime.stepStates[step.id]}
        groups={[]}
        toolCatalog={[]}
        agentCatalog={[]}
        onSetModel={() => {}}
        onSetTools={() => {}}
        onSetAgent={() => {}}
      />,
    );
  });
}

/** The chevron that opens the instruction and the expected result. */
function chevron(): HTMLButtonElement {
  const button = [...host.querySelectorAll('button')]
    .find((candidate) => candidate.getAttribute('aria-label')?.startsWith('Show instruction'));
  if (!button) throw new Error('the step card offers no chevron');
  return button as HTMLButtonElement;
}

describe('a finished step', () => {
  it('shows its result and keeps its instruction folded', () => {
    // The fixture's instruction repeats the title, so a step whose two differ
    // is needed to prove the instruction itself is absent.
    const step = { ...find('patch'), instructions: 'Edit each level that is outside its band.' };
    renderStep(step);
    expect(host.textContent).toContain('Done');
    expect(host.textContent).toContain('Result');
    expect(host.textContent).toContain('3 levels edited. Attempt 2 passed.');
    expect(host.textContent).not.toContain(step.instructions);
    expect(host.textContent).not.toContain('Expected result');
    expect(chevron().getAttribute('aria-expanded')).toBe('false');

    act(() => { chevron().click(); });
    expect(host.textContent).toContain(step.instructions);
  });

  it('opens the instruction, the expected result and the step marks from the chevron', () => {
    renderStep(find('recheck'));
    act(() => { chevron().click(); });
    expect(chevron().getAttribute('aria-expanded')).toBe('true');
    expect(host.textContent).toContain('Instruction');
    expect(host.textContent).toContain('Every level inside its band.');
    // The loop-back reads as a sentence here, not as a banner naming step ids.
    expect(host.textContent).toContain('Goes back');
    expect(host.textContent).toContain('when levelsOk = false');
  });
});

describe('model, agent and tools on a step', () => {
  it('shows only what is not the default and keeps the rest behind Tune', () => {
    const step = find('discover');
    expect(stepOverrides(step)).toEqual([{ label: 'Agent', value: 'explorer' }]);
    renderStep(step);
    expect(host.textContent).toContain('Agent: explorer');
    // Model and tools are on their defaults, so neither is stated on the card.
    expect(host.textContent).not.toContain('Model:');
    expect(host.textContent).not.toContain('Tools:');
    const tune = [...host.querySelectorAll('button')]
      .find((candidate) => candidate.getAttribute('aria-label')?.startsWith('Model, agent and tools'));
    expect(tune?.getAttribute('aria-expanded')).toBe('false');
    act(() => { (tune as HTMLButtonElement).click(); });
    expect(host.querySelector(`[aria-label="Model for ${step.title}"]`)).not.toBeNull();
    expect(host.querySelector(`[aria-label="Tools for ${step.title}"]`)).not.toBeNull();
  });

  it('states a pinned model on the card', () => {
    const step = { ...find('patch'), execution: { type: 'background-agent' as const, model: 'claude-opus-5' } };
    renderStep(step);
    expect(host.textContent).toContain('Model: claude-opus-5');
  });
});

describe('a step whose route was not chosen', () => {
  it('reads Not taken, and the Map dims the same step', () => {
    const skipped = find('regenerate');
    expect(mapRouteState(previewLoop, skipped)).toBe('not-taken');
    renderStep(skipped);
    expect(host.textContent).toContain('Not taken');
    expect(host.textContent.toLowerCase()).not.toContain('skipped');

    act(() => {
      root.render(
        <PlanMapCard
          loop={previewLoop}
          step={skipped}
          number={NUMBER_OF.get(skipped.id) ?? 1}
          titleLines={1}
          selected={false}
          onSelect={() => {}}
        />,
      );
    });
    expect(host.querySelector('button')?.className).toContain('opacity-80');
  });

  it('leaves an undecided branch pending rather than ruling it out', () => {
    // The same plan before the strategy step has recorded anything.
    const undecided: Loop = {
      ...previewLoop,
      runtime: { ...previewLoop.runtime, variables: {}, stepStates: {} },
    };
    const patch = find('patch');
    expect(mapRouteState(undecided, patch)).toBe('undecided');
    expect(stepStateLabel(undecided, patch, undefined)).toBe('Pending');
    expect(stepStateLabel(undecided, find('regenerate'), undefined)).toBe('Pending');
  });
});

describe('the step marks', () => {
  it('name what the step decides, when it runs, and what it fans out over', () => {
    const labels = (step: LoopStepDefinition) =>
      stepMarks(previewLoop, step, NUMBER_OF).map((fact) => fact.label);
    expect(labels(find('strategy'))).toContain('Decides');
    expect(labels(find('patch'))).toContain('Runs only when');
    expect(labels(find('check'))).toContain('One per');
    expect(labels(find('solutions'))).toContain('Waits for you');
    // The execution target moved off the card header into the opened panel.
    expect(labels(find('patch'))).toContain('Runs as');
  });
});
