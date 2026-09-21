/**
 * What a step card says, and what it keeps folded.
 *
 * The card used to print the whole instruction and the expected result before
 * the reader got to what the step had actually done. A run whose steps carry a
 * page of instructions each buried every Result on the page. The state word,
 * the title and the Result stay on the card; everything that explains how the
 * step was written opens from the chevron.
 *
 * Pure, so the wording and the folding rule are tested without rendering.
 */

import type { Loop, LoopStepDefinition, StepStatus } from '../../shared/types';
import { guardLabel } from './guard-label';
import { mapRouteState } from './plan-map-state';
import { STEP_STATUS_STYLE } from './status-style';

/** A labelled fact about a step: the Result, an override, or a mark. */
export interface StepFact {
  label: string;
  value: string;
}

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const routeText = (value: unknown): string => (typeof value === 'string' ? value : JSON.stringify(value));

/**
 * The step's state in one word.
 *
 * A step on a route the Workflow did not take reads `Not taken`, from the same
 * rule that dims it on the Map, so the two views never disagree about the same
 * step. A branch nobody has decided yet stays pending: its steps have not been
 * ruled out, they are waiting.
 */
export function stepStateLabel(loop: Loop, step: LoopStepDefinition, status?: StepStatus): string {
  if (mapRouteState(loop, step) === 'not-taken') return 'Not taken';
  return capitalised(STEP_STATUS_STYLE[status ?? 'pending'].label);
}

/**
 * Everything that explains how the step was written: what it is told to do,
 * what it is meant to produce, and the marks that place it in the plan.
 *
 * The loop-back reads as a sentence here rather than as a banner above the
 * plan naming two step ids. The rail draws the same loop.
 */
export function stepMarks(loop: Loop, step: LoopStepDefinition, numberOf: Map<string, number>): StepFact[] {
  const facts: StepFact[] = [
    { label: 'Instruction', value: step.instructions },
  ];
  if (step.expectedOutcome) facts.push({ label: 'Expected result', value: step.expectedOutcome });
  if (step.produces?.length) facts.push({ label: 'Decides', value: step.produces.join(', ') });
  // The label already says "only when", so the guard drops its own "only if".
  if (step.when) facts.push({ label: 'Runs only when', value: guardLabel(step.when).replace(/^only if /, '') });
  if (step.fanOut) {
    facts.push({ label: 'One per', value: `${step.fanOut.itemsFrom} · up to ${step.fanOut.maxItems}` });
  }
  if (step.gate === 'approval') facts.push({ label: 'Waits for you', value: 'You approve the exact content before it is sent' });
  const feedback = step.feedback;
  if (feedback) {
    const target = numberOf.get(feedback.toStepId);
    const used = loop.runtime.feedbackStates?.[feedback.id]?.traversals ?? 0;
    facts.push({
      label: 'Goes back',
      value: `to step ${target ?? feedback.toStepId} when ${feedback.when.var} = ${feedback.when.in.map(routeText).join(' or ')}`
        + ` · ${used} of ${feedback.maxTraversalsPerRun} used this run`,
    });
  }
  return facts;
}

/** The one-line summary the rail's loop-back shows on hover. */
export function loopBackTitle(loop: Loop, step: LoopStepDefinition, numberOf: Map<string, number>): string | undefined {
  const feedback = step.feedback;
  if (!feedback) return undefined;
  const from = numberOf.get(step.id) ?? step.id;
  const to = numberOf.get(feedback.toStepId) ?? feedback.toStepId;
  const used = loop.runtime.feedbackStates?.[feedback.id]?.traversals ?? 0;
  return `Step ${from} goes back to step ${to} when ${feedback.when.var} = ${feedback.when.in.map(routeText).join(' or ')}.`
    + ` ${used} of ${feedback.maxTraversalsPerRun} used this run.`;
}
