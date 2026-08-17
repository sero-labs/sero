/**
 * Getting one plan to carry every badge the plan map can draw.
 *
 * The planner is not deterministic, and it does not reliably reach for the
 * structured fields: asked to stop for approval it will often write "ask the
 * user first" into a step's instructions rather than set that step's `gate`.
 * So each mechanic is requested through Refine — the same box a reader uses —
 * with a second, more literal wording held in reserve.
 */

export type PlanSteps = Record<string, any>[];

/** A decision an earlier step already records, for a route to hang off. */
function firstDecisionVar(steps: PlanSteps): string {
  return steps.find((s) => s.produces?.length)?.produces[0] ?? 'the check result';
}

export interface BadgeRequest {
  key: string;
  missing: (steps: PlanSteps) => boolean;
  asks: ((steps: PlanSteps) => string)[];
}

export const BADGE_REQUESTS: BadgeRequest[] = [
  {
    key: 'decision',
    missing: (steps) => !steps.some((s) => s.produces?.length),
    asks: [
      () => 'Have the checking step record its outcome as a decision the later steps can read.',
      () => 'The check step must declare what it produces, so later steps can route on that value.',
    ],
  },
  {
    key: 'conditional',
    missing: (steps) => !steps.some((s) => s.when),
    asks: [
      () => 'Put the repair step on a conditional route off the classify step\'s decision, so the plan '
        + 'skips it outright when nothing failed. It must be a route condition on the step, not just '
        + 'wording in its instructions.',
      (steps) => `Give the repair step a "when" condition on ${firstDecisionVar(steps)}: the step runs `
        + 'only on that route and is skipped on the other one. I want the plan to show two routes, '
        + 'with the repair step on one of them.',
    ],
  },
  {
    key: 'gate',
    missing: (steps) => !steps.some((s) => s.gate),
    asks: [
      () => 'Make the solver-approval step a real approval gate: the workflow must pause there and wait '
        + 'for my approval before any later step runs. Set it as a gate on the step, not as an '
        + 'instruction to ask me.',
      () => 'Set an approval gate on the step that touches src/solver.js. It must be the step\'s gate, '
        + 'so the workflow stops and shows me an approve or reject choice.',
    ],
  },
  {
    key: 'fanOut',
    missing: (steps) => !steps.some((s) => s.fanOut),
    asks: [
      () => 'Check the levels one at a time — a separate run per level file, at most ten.',
      () => 'Make the check step fan out over the list of level files, one activation per level, '
        + 'with a hard maximum of ten.',
    ],
  },
  {
    key: 'feedback',
    missing: (steps) => !steps.some((s) => s.feedback),
    asks: [
      () => 'If the re-check still fails, loop back to the repair step and try again, at most three times.',
      () => 'Add a feedback route from the verify step back to the repair step, taken when the re-check '
        + 'fails, with a limit of three times round.',
    ],
  },
];

export function readBadges(steps: PlanSteps): Record<string, boolean> {
  return {
    decision: steps.some((s) => s.produces?.length),
    conditional: steps.some((s) => s.when),
    gate: steps.some((s) => s.gate),
    fanOut: steps.some((s) => s.fanOut),
    feedback: steps.some((s) => s.feedback),
  };
}
