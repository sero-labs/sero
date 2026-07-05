/**
 * Planning flow shared by loop creation and planner re-plans.
 *
 * Runs the planner against a draft loop and folds the result back onto it:
 *  - a valid plan  → applied (schedule extracted), draft ready to activate;
 *  - clarifying questions → the draft parks on a planner `pendingInput`;
 *  - invalid after one repair → a blocked draft carrying the validation errors.
 *
 * Keeping this here lets `create` and the `answer_input` re-plan share one code
 * path (so the coordinator stays small and both behave identically).
 */

import type { AnsweredInput, CreateLoopOptions, Loop, SharedLoopDefinition } from '../shared/types';
import { effectiveDelivery } from '../shared/delivery-types';
import type { OrchestratorHost } from './host';
import { planLoop } from './planner';
import { extractTriggers } from './trigger-extractor';
import { applyPlanningResponse } from './plan-mapping';
import { loopArtifactDir } from './artifacts';
import { parkPlannerQuestions } from './human-input';

export interface PlanningFlowArgs {
  prompt: string;
  options?: CreateLoopOptions;
  title?: string;
  /** Answered planner clarifications folded into a re-plan. */
  clarifications?: { prompt: string; answer: string }[];
  /** Catalog installs: the curated definition the planner adapts (spec 14). */
  baseline?: SharedLoopDefinition;
}

/** Flattens the loop's answered PLANNER inputs into prompt/answer pairs for a re-plan. */
export function plannerClarifications(loop: Loop): { prompt: string; answer: string }[] {
  const pairs: { prompt: string; answer: string }[] = [];
  for (const answered of loop.answeredInputs ?? []) {
    if (answered.source !== 'planner') continue;
    for (const q of answered.questions) {
      const a = answered.answers.find((x) => x.questionId === q.id);
      const picked = a?.choiceId ? q.choices?.find((c) => c.id === a.choiceId)?.label : undefined;
      const answer = [picked, a?.text?.trim()].filter(Boolean).join(' — ');
      if (answer) pairs.push({ prompt: q.prompt, answer });
    }
  }
  return pairs;
}

export async function runPlanningFlow(host: OrchestratorHost, draft: Loop, args: PlanningFlowArgs): Promise<Loop> {
  // Planner picks each step's tools and (optionally) agent role from the real
  // catalogs (fail-soft to [] so planning never blocks on enumeration).
  const [toolCatalog, agentCatalog] = await Promise.all([
    host.listToolCatalog().catch(() => []),
    host.listAgentCatalog().catch(() => []),
  ]);

  const outcome = await planLoop(host, {
    prompt: args.prompt,
    parentSessionId: draft.runtime.parentSessionId,
    useManagedWorktree: draft.workspace.useManagedWorktree,
    worktreeBranchSource: draft.workspace.worktreeBranchSource,
    delivery: effectiveDelivery(draft),
    toolCatalog,
    agentCatalog,
    clarifications: args.clarifications,
    baseline: args.baseline,
  });

  if (!outcome.ok && outcome.needsInput) {
    host.log(`Planner asked ${outcome.questions.length} clarifying question(s) for ${draft.id}`);
    return parkPlannerQuestions(host, draft, outcome.questions);
  }

  if (outcome.ok) {
    // A focused, single-purpose trigger call is far more reliable than asking
    // the planner to remember a trigger. Run it after planning so it never blocks
    // plan authoring.
    const extraction = await extractTriggers(host, {
      prompt: args.prompt,
      parentSessionId: draft.runtime.parentSessionId,
      loopId: draft.id,
    });
    const loop = applyPlanningResponse(host, draft, outcome.response, args.options, args.title, extraction);
    host.log(`Loop ${loop.id} planned with ${loop.plan.steps.length} step(s)`);
    return loop;
  }

  // Invalid plan after one repair: store a blocked draft with clear errors and the
  // raw model reply so the failure is diagnosable, not a black box.
  const rawRef = outcome.modelResponses.length
    ? await host.writeArtifact(
        `${loopArtifactDir(draft.id)}/planner.txt`,
        outcome.modelResponses.join('\n\n--- next attempt ---\n\n'),
      )
    : undefined;
  const reason = rawRef ? `${outcome.errors.join('; ')} — raw model reply saved to ${rawRef}` : outcome.errors.join('; ');
  host.log(`Blocked draft ${draft.id}: ${reason}`);
  return {
    ...draft,
    summary: 'Plan generation failed validation.',
    runtime: { ...draft.runtime, pendingInput: undefined, block: { kind: 'validation-error', reason, createdAt: host.now() } },
  };
}
