/**
 * Handler for the `answer_input` action — the user answering a loop's pending
 * question. See specs/07-human-input.md.
 *
 * It validates the answer against the loop's `pendingInput`, records it, and
 * computes the next loop state WITHOUT persisting (the coordinator persists once
 * and, for a step question, resumes the run). A planner question instead re-runs
 * the planner with the answers folded in.
 */

import type { InputAnswer, Loop, OrchestratorAction, SharedLoopDefinition } from '../shared/types';
import type { OrchestratorHost } from './host';
import { recordAnswer, validateAnswers } from './human-input';
import { plannerClarifications, runPlanningFlow } from './planning-flow';

/**
 * A draft installed from a catalog re-plans against its curated definition
 * (spec 14 adaptation), so answers specialize the curated plan instead of
 * replanning from the bare prompt. Absent for ordinary loops.
 */
async function catalogBaseline(host: OrchestratorHost, loop: Loop): Promise<SharedLoopDefinition | undefined> {
  if (!loop.libraryLink) return undefined;
  const version = await host.library.readVersion(loop.libraryLink.entryId, loop.libraryLink.version);
  return version?.catalog ? version.definition : undefined;
}

export interface AnswerInputResult {
  ok: boolean;
  loop?: Loop;
  error?: string;
  /** True when the caller should resume the loop run (step questions only). */
  resume?: boolean;
}

type AnswerInputAction = Extract<OrchestratorAction, { kind: 'answer_input' }>;

/**
 * Applies an `answer_input` action against current state and returns the next
 * loop. The coordinator persists it and, when `resume`, runs the loop on.
 */
export async function applyAnswerInput(host: OrchestratorHost, action: AnswerInputAction): Promise<AnswerInputResult> {
  const state = await host.readState();
  const loop = state?.loops.find((l) => l.id === action.loopId);
  if (!loop) return { ok: false, error: `Loop not found: ${action.loopId}` };

  const pending = loop.runtime.pendingInput;
  if (!pending || pending.id !== action.requestId) {
    return { ok: false, error: 'No matching question is waiting for an answer (it may already be answered).' };
  }
  const answers: InputAnswer[] = action.answers ?? [];
  const invalid = validateAnswers(pending, answers);
  if (invalid) return { ok: false, error: invalid };

  const { loop: recorded, source } = recordAnswer(loop, pending, answers, host.now());

  if (source === 'planner') {
    // Re-run the planner with the answers folded in. It may produce a plan, ask
    // again (re-parks), or fail to a blocked draft — all handled by the flow.
    const replanned = await runPlanningFlow(host, recorded, {
      prompt: recorded.prompt,
      title: recorded.title === 'Untitled loop' ? undefined : recorded.title,
      clarifications: plannerClarifications(recorded),
      baseline: await catalogBaseline(host, recorded),
    });
    return { ok: true, loop: replanned, resume: false };
  }

  // Step question: resume the run so the asking step runs again with the answer.
  return { ok: true, loop: recorded, resume: true };
}
