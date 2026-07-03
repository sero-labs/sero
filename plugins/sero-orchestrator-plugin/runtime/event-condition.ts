/**
 * Model-judged event conditions (Living Loops, spec 12).
 *
 * A trigger's `eventCondition` is plain English ("the failing PR was opened by
 * this loop"). Whether an event satisfies it is the model's judgment, never a
 * code heuristic. This runs LAST in the match order — only for triggers whose
 * source/filter/debounce already passed in code — so debounce and structured
 * filters bound the model-call volume. The LOW tier is enough for a yes/no
 * verdict and keeps fire-time evaluation cheap.
 */

import type { Loop, LoopTrigger, OrchestratorEvent } from '../shared/types';
import type { OrchestratorHost } from './host';
import { describeValue, isRecord, runStructuredJson, type ParseResult } from './structured-call';

const CONDITION_SYSTEM = `You judge whether ONE event satisfies a loop trigger's condition.

Return ONLY one JSON object, in a \`\`\`json fence and nothing else:

\`\`\`json
{
  "matches": true,
  "reason": "one sentence on why"
}
\`\`\`

- "matches" MUST be a JSON boolean (true or false), never a string.
- Judge ONLY the stated condition against the event — not whether acting on the event is a good idea.
- When the event genuinely does not contain enough information to satisfy the condition, answer false.`;

interface ConditionVerdict {
  matches: boolean;
}

function parseVerdict(value: unknown): ParseResult<ConditionVerdict> {
  if (!isRecord(value)) {
    return { ok: false, errors: ['Reply must be exactly one JSON object with a boolean "matches" field.'] };
  }
  if (typeof value.matches !== 'boolean') {
    return { ok: false, errors: [`"matches" must be true or false (a JSON boolean) — got ${describeValue(value.matches)}.`] };
  }
  return { ok: true, value: { matches: value.matches } };
}

function buildTask(loop: Loop, trigger: LoopTrigger, event: OrchestratorEvent): string {
  return [
    `Loop: ${loop.title}`,
    `Loop goal:\n${loop.prompt}`,
    `\nTrigger condition:\n${trigger.eventCondition}`,
    `\nEvent source: ${event.source}`,
    `Event occurred at: ${event.occurredAt}`,
    `Event payload:\n${JSON.stringify(event.payload, null, 2)}`,
    '\nDoes this event satisfy the condition? Return the verdict JSON.',
  ].join('\n');
}

function buildRepair(previous: string, errors: string[]): string {
  return [
    'Your previous verdict was invalid.',
    `\nYour previous reply:\n${previous}`,
    `\nProblems:\n${errors.map((e) => `- ${e}`).join('\n')}`,
    '\nReturn a corrected verdict JSON that fixes every problem. Output ONLY the JSON object.',
  ].join('\n');
}

/**
 * True when the model judges the event to satisfy the trigger's condition.
 * Throws on an unusable model reply — the caller logs and skips the fire (an
 * evaluation failure must never crash the broadcast or count as a match).
 */
export async function evaluateEventCondition(
  host: OrchestratorHost,
  loop: Loop,
  trigger: LoopTrigger,
  event: OrchestratorEvent,
): Promise<boolean> {
  const result = await runStructuredJson<ConditionVerdict>(host, {
    systemPrompt: CONDITION_SYSTEM,
    task: buildTask(loop, trigger, event),
    parse: parseVerdict,
    buildRepair,
    parentSessionId: loop.runtime.parentSessionId,
    model: 'LOW',
  });
  if (!result.ok) throw new Error(result.errors[0] ?? 'could not evaluate the event condition');
  return result.value!.matches;
}
