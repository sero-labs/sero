/**
 * The plans and replies the stub model gives the Orchestrator's background
 * model runs. Each shape is the one the plugin's parser accepts
 * (`runtime/schema.ts`, `llm-decisions.ts`, `reflection.ts`, `skill-extract.ts`).
 */
import { ASK, ASK_ANSWER, CATALOG, MANUAL, MANUAL_PROMPT, RECOVERY, RECURRING, type LoopToken } from './orchestrator-support';

interface PlanStep {
  id: string;
  title: string;
  instructions: string;
  dependsOn?: string[];
}

export const CATALOG_STEP_ID = 'catalog-step';
export const RECOVERY_STEP_ID = 'fix';

/** A step the Orchestrator hands to a background agent. */
function backgroundStep(step: PlanStep): Record<string, unknown> {
  return { ...step, expectedOutcome: 'The step reports its outcome.', execution: { type: 'background-agent', model: 'LOW' } };
}

export function planOf(objective: string, steps: PlanStep[]): Record<string, unknown> {
  return { schemaVersion: 1, revision: 0, objective, steps: steps.map(backgroundStep) };
}

/** The steps of the manual loop's plan, as the planner first writes them. */
export const MANUAL_WORK: PlanStep = { id: 'work', title: 'Write the manual note', instructions: `${MANUAL}: write the note, then report it.` };

/** The plan reflection suggests, and the one a manual revise returns. */
export const SUGGESTED_INSTRUCTIONS = `${MANUAL}: write the note, then verify it exists and report it.`;
export const SUGGEST_APPROVE = 'tc-orch: the note is never checked, so say to verify it exists';
export const SUGGEST_REJECT = 'tc-orch: add a separate check step after the note';
export const REVIEW_STEP: PlanStep = { id: 'review', title: 'Review the note', instructions: `${MANUAL}: read the note back and report any problem.`, dependsOn: ['work'] };

export function suggestionPlan(withCheck: boolean): Record<string, unknown> {
  const checked = { ...MANUAL_WORK, instructions: SUGGESTED_INSTRUCTIONS };
  return withCheck
    ? planOf('Write the manual note', [MANUAL_WORK, { id: 'check', title: 'Check the note', instructions: `${MANUAL}: check the note.`, dependsOn: ['work'] }])
    : planOf('Write the manual note', [checked]);
}

export function revisedPlan(): Record<string, unknown> {
  return planOf('Write the manual note and review it', [MANUAL_WORK, REVIEW_STEP]);
}

/** What the planner answers for a loop, and the limits it suggests. */
export function planningReply(token: LoopToken): string {
  switch (token) {
    case MANUAL:
      return JSON.stringify({
        schemaVersion: 1,
        title: 'tc-orch manual loop',
        summary: 'One step writes a note.',
        plan: planOf('Write the manual note', [MANUAL_WORK]),
        // `use_cost_budget` only works on a loop that already has a dollar cap.
        suggestedLimits: { maxCostUsd: 1, maxTotalTokens: 100_000 },
      });
    case RECURRING:
      return JSON.stringify({
        schemaVersion: 1,
        title: 'tc-orch recurring loop',
        summary: 'One step writes a note each time it runs.',
        plan: planOf('Write the recurring note', [{ id: 'tick', title: 'Write the recurring note', instructions: `${RECURRING}: write the note, then report it.` }]),
      });
    case RECOVERY:
      return JSON.stringify({
        schemaVersion: 1,
        title: 'tc-orch recovery loop',
        summary: 'One step that fails twice before it passes.',
        plan: planOf('Write the recovery note', [{ id: RECOVERY_STEP_ID, title: 'Recovery step', instructions: `${RECOVERY}: write the note.` }]),
      });
    case ASK:
      return JSON.stringify({
        schemaVersion: 1,
        title: 'tc-orch ask loop',
        summary: 'One step writes a note into the chosen folder.',
        plan: planOf('Write the note into the folder', [{ id: 'draft', title: 'Draft the note', instructions: `${ASK}: write the note into the chosen folder.` }]),
      });
    case CATALOG:
      return JSON.stringify({
        schemaVersion: 1,
        title: 'tc-orch catalog loop',
        summary: 'One step tidies the notes.',
        plan: planOf('Tidy the notes', [{ id: CATALOG_STEP_ID, title: 'Tidy the notes', instructions: `${CATALOG}: tidy the notes folder.` }]),
      });
  }
}

/** The planner's question, before the user has answered. */
export function clarifyingReply(): string {
  return JSON.stringify({
    clarifyingQuestions: [{
      id: 'folder',
      prompt: 'Which folder should the note go in?',
      choices: [{ id: 'staging', label: 'Staging' }, { id: 'production', label: 'Production' }],
    }],
  });
}

/** True when the planner request is the re-plan that carries the user's answer. */
export function carriesAnswer(task: string): boolean {
  return task.includes(ASK_ANSWER);
}

/** A cron cadence for a recurring loop, far from any day the probe runs. */
export const FIRST_SCHEDULE = '0 3 1 1 *';

export function triggerReply(token: LoopToken): string {
  return JSON.stringify(token === RECURRING
    ? { recurring: true, schedule: FIRST_SCHEDULE, events: [] }
    : { recurring: false, schedule: null, events: [] });
}

export function recoveryReply(): string {
  return JSON.stringify({ decision: 'block-loop', reason: 'tc-orch: stop here so the probe can recover by hand' });
}

export function stopReply(): string {
  return JSON.stringify({ stop: false, reason: 'tc-orch: this run found work' });
}

export function reflectionReply(token: LoopToken, n: number): string {
  const suggestions = token === MANUAL && n === 1
    ? [
      { rationale: SUGGEST_APPROVE, confidence: 'high', plan: suggestionPlan(false) },
      { rationale: SUGGEST_REJECT, confidence: 'low', plan: suggestionPlan(true) },
    ]
    : [];
  return JSON.stringify({ insights: [{ summary: `${token} insight ${n}` }], suggestions });
}

export function revisionReply(): string {
  return JSON.stringify({ goal: MANUAL_PROMPT, plan: revisedPlan() });
}

export const SKILL_NAME = 'tc-orch-skill';
export const SKILL_DESCRIPTION = 'Write the tc-orch note. Use it when asked for the tc-orch note.';
export const SKILL_BODY = '# tc-orch note\n\nWrite the note, then check that it exists.';

export function skillReply(): string {
  return JSON.stringify({ skill: { name: SKILL_NAME, description: SKILL_DESCRIPTION, body: SKILL_BODY, rationale: 'The run showed the order that works.' } });
}

/** A step session's last words: a short line, then the StepOutcome in a fence. */
export function outcomeReply(outcome: Record<string, unknown>): string {
  return `Done.\n\`\`\`json\n${JSON.stringify(outcome)}\n\`\`\``;
}
