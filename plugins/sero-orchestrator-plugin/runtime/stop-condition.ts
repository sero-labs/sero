/**
 * Stop-condition evaluator — a dedicated, single-purpose model call that decides
 * whether a RECURRING loop has met its overall stop condition and should stop
 * for good, given the goal and the result of the latest iteration.
 *
 * Why this is separate from the finalization step: asking the finalization *step
 * agent* to also reliably judge "is the whole loop's stop condition met?" is the
 * same juggling-many-concerns failure that made scheduling unreliable in the
 * planner (see trigger-extractor.ts). A focused call with ONE responsibility —
 * "has the stop condition been met?" — does not forget. The judgement is the
 * model's job (no heuristic); we only validate the FORMAT it returns and repair.
 *
 * Like the schedule extractor, this NEVER blocks: on any model/transport error
 * or unrepairable reply it returns `{ stop: false }` so a bad parse can never
 * wrongly kill a loop — the loop simply stays scheduled and the raw replies are
 * persisted for diagnosis.
 */

import type { Loop, LoopRun, StepAttempt } from '../shared/types';
import type { OrchestratorHost } from './host';
import type { StopChecker } from './engine-types';
import { loopArtifactDir } from './artifacts';
import { describeValue, isRecord, runStructuredJson, type ParseResult } from './structured-call';

export interface StopConditionDecision {
  stop: boolean;
  reason: string;
}

const STOP_SYSTEM_PROMPT = `You decide whether THIS run of a recurring loop has nothing left to do, so it can end early instead of running its remaining steps. You do not plan or run any work.

The loop runs on a schedule and WILL run again next interval — you are NOT deciding whether to stop the loop forever, only whether THIS run is finished with nothing to do. Read the GOAL — it may state a per-run condition ("resolve one issue; nothing to do when there are no unassigned issues left", "stop when X"). Then read what THIS run has done so far and decide:
- END THIS RUN ("stop": true) ONLY if this run clearly found NOTHING to do — e.g. the discovery step found no eligible items.
- KEEP GOING ("stop": false) if this run has found or started ANY work — e.g. it selected, claimed, assigned, or began processing an item, or made a change. Selecting/assigning an item COUNTS as work found: do NOT end the run just because there are now no "unassigned" items left, because the item this run just picked still needs to be finished. Also keep going if you cannot yet tell.

When unsure, KEEP GOING (false) — ending early abandons in-progress work.

Return ONLY a single JSON object with BOTH keys always present (no prose):
{ "stop": <true|false>, "reason": <one short sentence explaining the decision> }`;

/** A compact, model-readable summary of what this run has done so far. */
function summarizeIteration(loop: Loop, attempts: StepAttempt[]): string {
  const steps = attempts
    .map((a) => `- ${a.stepId}: ${a.outcome?.status ?? a.status} — ${a.outcome?.summary ?? '(no summary)'}`)
    .join('\n');
  const notes = typeof loop.runtime.variables.notes === 'string' ? loop.runtime.variables.notes.trim() : '';
  const facts = Object.entries(loop.runtime.variables)
    .filter(([key]) => key !== 'notes')
    .map(([key, value]) => `- ${key}: ${describeValue(value)}`)
    .join('\n');
  return [
    `Step outcomes so far this run:\n${steps || '(none yet)'}`,
    notes ? `\n\nNotes:\n${notes}` : '',
    facts ? `\n\nFacts:\n${facts}` : '',
  ].join('');
}

function buildStopTask(loop: Loop, summary: string): string {
  return `Goal:\n${loop.prompt}\n\nWhat this run has done so far:\n${summary}\n\nReturn the stop decision JSON now (one object with "stop" and "reason", no prose).`;
}

/**
 * The repair prompt MUST restate the goal AND the run summary: model calls do
 * not reliably retain prior turns, so without them the model cannot re-judge the
 * stop condition (the failure mode already seen on the schedule extractor).
 */
function buildStopRepair(loop: Loop, summary: string) {
  return (previous: string, errors: string[]): string =>
    `Your previous stop decision was invalid.

Goal:
${loop.prompt}

What this run has done so far:
${summary}

Your previous response:
${previous}

Problems:
${errors.map((e) => `- ${e}`).join('\n')}

Return a corrected JSON object with BOTH "stop" (boolean) and "reason". Output ONLY the JSON.`;
}

function parseStopDecision(value: unknown): ParseResult<StopConditionDecision> {
  if (!isRecord(value)) return { ok: false, errors: ['response must be a JSON object'] };
  if (typeof value.stop !== 'boolean') {
    return { ok: false, errors: [`"stop" must be a boolean (true or false), got ${describeValue(value.stop)}`] };
  }
  const reason = typeof value.reason === 'string' ? value.reason : '';
  return { ok: true, value: { stop: value.stop, reason } };
}

export async function evaluateStopCondition(
  host: OrchestratorHost,
  args: { loop: Loop; run?: LoopRun; signal?: AbortSignal },
): Promise<StopConditionDecision> {
  const { loop } = args;
  // Mid-pass the in-progress run carries the attempts (they are not folded into
  // loop.runs until the run finalizes), so prefer it; otherwise the latest run.
  const attempts = (args.run ?? loop.runs[loop.runs.length - 1])?.stepAttempts ?? [];
  const summary = summarizeIteration(loop, attempts);
  const result = await runStructuredJson<StopConditionDecision>(host, {
    systemPrompt: STOP_SYSTEM_PROMPT,
    task: buildStopTask(loop, summary),
    parse: parseStopDecision,
    buildRepair: buildStopRepair(loop, summary),
    parentSessionId: loop.runtime.parentSessionId,
    signal: args.signal,
    maxRepairs: 2,
  });
  if (!result.ok || !result.value) {
    host.log(`stop-condition evaluation failed for ${loop.id}: ${result.errors.join('; ')}`);
    if (result.responses.length) {
      await host.writeArtifact(
        `${loopArtifactDir(loop.id)}/stop-condition.txt`,
        result.responses.join('\n\n--- next attempt ---\n\n'),
      );
    }
    return { stop: false, reason: 'stop-condition evaluation failed; keeping the loop scheduled' };
  }
  return result.value;
}

/**
 * The engine seam: lets ANY step end a recurring loop the moment the stop
 * condition is met, instead of running the rest of the pass. Wired in production
 * (runtime/index.ts); left unset in unit tests so the engine makes no model call.
 */
export const llmStopChecker: StopChecker = {
  check: ({ host, loop, run }) => evaluateStopCondition(host, { loop, run }),
};
