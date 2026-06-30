/**
 * Schedule extractor — a dedicated, single-purpose model call that decides
 * whether a loop's GOAL asks it to recur, and if so derives the cron schedule.
 *
 * Why this exists separately from the planner: the planner juggles many concerns
 * (step shape, dependencies, delivery, finalization) and reliably "forgot" to
 * emit a schedule trigger, expressing recurrence as wait/repeat steps instead.
 * A focused call with ONE responsibility — "does this recur, and what is the
 * cron?" — does not forget, and is far more reliable than a declarative field on
 * the planner or a tool the model might not invoke. The NL→cron conversion is
 * the model's job (no heuristic); we only validate the cron FORMAT it returns
 * and repair on a malformed value via the shared strict-validate loop.
 *
 * `schedule` is an ALWAYS-required key (a cron string when recurring, else null)
 * so the model cannot quietly drop it the way an optional field invites — the
 * observed failure was a `{ "recurring": true }` reply with no schedule at all.
 */

import type { LoopTriggerSuggestion } from '../shared/types';
import type { OrchestratorHost } from './host';
import { loopArtifactDir } from './artifacts';
import { isValidCron } from './cron';
import { isRecord, runStructuredJson, type ParseResult } from './structured-call';

export type ScheduleExtraction =
  | { recurring: false }
  | { recurring: true; schedule: string; maxFires?: number };

const SCHEDULE_SYSTEM_PROMPT = `You decide ONLY whether a task should run on a repeating schedule, and if so, how often. You do not plan the work.

Read the goal. If it asks to run repeatedly on a cadence — "every 10 minutes", "hourly", "each morning", "twice a day", "check periodically", "on a schedule" — it RECURS. A one-off task ("fix this bug", "add a feature", "refactor X") does NOT recur.

Return ONLY a single JSON object with BOTH keys always present (no prose):
{ "recurring": <true|false>, "schedule": <a 5-field UTC cron string when recurring, otherwise null>, "maxFires": <number, optional> }

CRITICAL: whenever "recurring" is true you MUST provide a non-empty "schedule" cron string. A reply of { "recurring": true } with no schedule (or a null/empty schedule) is INVALID — derive the cron from the cadence in the goal.

The "schedule" cron has 5 space-separated fields: minute hour day-of-month month day-of-week.
Examples: every 10 minutes → "*/10 * * * *"; hourly → "0 * * * *"; every 6 hours → "0 */6 * * *"; 9am daily → "0 9 * * *"; every weekday at 8am → "0 8 * * 1-5".
Only include "maxFires" if the goal caps the number of runs (e.g. "run 5 times"). A stop CONDITION (e.g. "until there are no open issues") is NOT a fire cap — omit maxFires for those.`;

function buildScheduleTask(prompt: string): string {
  return `Goal:\n${prompt}\n\nReturn the schedule JSON now (one object with "recurring" and "schedule", no prose).`;
}

/**
 * The repair prompt MUST restate the goal: model calls do not reliably retain
 * prior turns, so without the goal the model cannot recover the cadence it needs
 * to produce the cron (the observed failure mode).
 */
function buildScheduleRepair(prompt: string) {
  return (previous: string, errors: string[]): string =>
    `Your previous schedule reply was invalid.

Goal:
${prompt}

Your previous response:
${previous}

Problems:
${errors.map((e) => `- ${e}`).join('\n')}

Return a corrected JSON object with BOTH "recurring" and "schedule". If recurring is true, "schedule" must be the 5-field UTC cron derived from the goal's cadence. Output ONLY the JSON.`;
}

function parseScheduleExtraction(value: unknown): ParseResult<ScheduleExtraction> {
  if (!isRecord(value)) return { ok: false, errors: ['response must be a JSON object'] };
  if (typeof value.recurring !== 'boolean') {
    return { ok: false, errors: ['"recurring" must be a boolean (true or false)'] };
  }
  if (!value.recurring) return { ok: true, value: { recurring: false } };

  if (typeof value.schedule !== 'string' || !isValidCron(value.schedule)) {
    return {
      ok: false,
      errors: [
        `"recurring" is true, so "schedule" must be a valid 5-field UTC cron (minute hour day-of-month month day-of-week), got ${JSON.stringify(value.schedule)}. Derive it from the cadence in the goal.`,
      ],
    };
  }
  const maxFires =
    typeof value.maxFires === 'number' && Number.isFinite(value.maxFires) && value.maxFires > 0
      ? value.maxFires
      : undefined;
  return { ok: true, value: { recurring: true, schedule: value.schedule, maxFires } };
}

/**
 * Runs the focused schedule call. On any model/transport error or unrepairable
 * reply it returns `{ recurring: false }` — a missing schedule must never block
 * loop creation; the loop is simply manual until revised. When a `loopId` is
 * given, the raw replies are persisted on failure so the miss is diagnosable.
 */
export async function extractSchedule(
  host: OrchestratorHost,
  args: { prompt: string; parentSessionId: string; loopId?: string; model?: string; signal?: AbortSignal },
): Promise<ScheduleExtraction> {
  const result = await runStructuredJson<ScheduleExtraction>(host, {
    systemPrompt: SCHEDULE_SYSTEM_PROMPT,
    task: buildScheduleTask(args.prompt),
    parse: parseScheduleExtraction,
    buildRepair: buildScheduleRepair(args.prompt),
    parentSessionId: args.parentSessionId,
    model: args.model,
    signal: args.signal,
    maxRepairs: 2,
  });
  if (!result.ok || !result.value) {
    host.log(`schedule extraction returned no schedule: ${result.errors.join('; ')}`);
    if (args.loopId && result.responses.length) {
      await host.writeArtifact(
        `${loopArtifactDir(args.loopId)}/schedule.txt`,
        result.responses.join('\n\n--- next attempt ---\n\n'),
      );
    }
    return { recurring: false };
  }
  return result.value;
}

/**
 * Merges a derived schedule into the planner's suggested triggers without
 * clobbering non-cron (e.g. event) triggers: if a cron/hybrid trigger already
 * exists its schedule is overwritten with the authoritative derived one,
 * otherwise a cron trigger is appended.
 */
export function mergeScheduleIntoTriggers(
  suggested: LoopTriggerSuggestion[] | undefined,
  extraction: ScheduleExtraction,
): LoopTriggerSuggestion[] {
  const base = [...(suggested ?? [])];
  if (!extraction.recurring) return base;

  const cron: LoopTriggerSuggestion = { type: 'cron', schedule: extraction.schedule };
  if (extraction.maxFires !== undefined) cron.maxFires = extraction.maxFires;

  const existing = base.findIndex((t) => t.type === 'cron' || t.type === 'hybrid');
  if (existing >= 0) {
    base[existing] = { ...base[existing], schedule: extraction.schedule };
    if (extraction.maxFires !== undefined && base[existing].maxFires === undefined) {
      base[existing].maxFires = extraction.maxFires;
    }
  } else {
    base.push(cron);
  }
  return base;
}
