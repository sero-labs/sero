/**
 * Trigger extractor — a dedicated, single-purpose model call that decides how
 * a loop's GOAL should be triggered: on a cron cadence, when an event fires,
 * both (hybrid), or neither (manual).
 *
 * Why this exists separately from the planner: the planner juggles many
 * concerns (step shape, dependencies, delivery, finalization) and reliably
 * "forgot" to emit triggers, expressing recurrence as wait/repeat steps
 * instead. A focused call with ONE responsibility does not forget. The
 * NL→cron and NL→event-source mapping is the model's job (no heuristic); code
 * only validates the FORMAT (cron shape, known source namespace, flat filter)
 * and repairs a malformed reply via the shared strict-validate loop.
 *
 * All three keys (`recurring`, `schedule`, `events`) are ALWAYS required so
 * the model cannot quietly drop one the way an optional field invites — the
 * observed failure was a `{ "recurring": true }` reply with no schedule.
 */

import type { LoopTriggerSuggestion } from '../shared/types';
import type { OrchestratorHost } from './host';
import { loopArtifactDir } from './artifacts';
import { isValidCron } from './cron';
import { buildEventSourceCatalogBlock } from './events/source-catalog';
import { validateEventTriggerFields } from './schema';
import { isRecord, runStructuredJson, type ParseResult } from './structured-call';

/** One event trigger the extractor derived, already in suggestion field names. */
export type ExtractedEventTrigger = Pick<
  LoopTriggerSuggestion,
  'eventSource' | 'eventFilter' | 'eventCondition' | 'debounceMs'
> & { eventSource: string };

export interface TriggerExtraction {
  recurring: boolean;
  schedule?: string;
  maxFires?: number;
  events: ExtractedEventTrigger[];
}

export const NO_TRIGGERS: TriggerExtraction = { recurring: false, events: [] };

const TRIGGER_SYSTEM_PROMPT = `You decide ONLY how a task should be TRIGGERED — on a repeating schedule, when an event happens, both, or neither. You do not plan the work.

Read the goal:
- A cadence — "every 10 minutes", "hourly", "each morning", "twice a day", "check periodically" — means it RECURS on a schedule.
- An event phrase — "when CI fails", "whenever a PR is opened", "when files in docs/ change", "when the release loop finishes", "when my deploy service pings a webhook" — means it fires on an EVENT. Pick the matching source from the catalog below; NEVER invent a source that is not listed.
- A one-off task ("fix this bug", "add a feature") has neither — recurring false and no events.

${buildEventSourceCatalogBlock()}

Return ONLY a single JSON object with ALL THREE keys always present (no prose):
{ "recurring": <true|false>, "schedule": <a 5-field UTC cron string when recurring, otherwise null>, "events": [ { "source": "<exact source id>", "filter": <object, optional>, "condition": <string, optional>, "debounceMs": <number, optional> } ], "maxFires": <number, optional> }

CRITICAL: whenever "recurring" is true you MUST provide a non-empty "schedule" cron string. A reply of { "recurring": true } with no schedule (or a null/empty schedule) is INVALID — derive the cron from the cadence in the goal.
"events" is ALWAYS an array — empty when nothing in the goal is event-driven.

For each event:
- "filter": exact-match tests on that source's listed payload fields — a flat object whose values are a primitive or an array of primitives meaning "one of", e.g. { "label": "bug" } or { "branch": ["main", "develop"] }. Use it only when the goal names an exact value.
- "condition": a short plain-English test judged against the full event at fire time, e.g. "the failing workflow is the deploy workflow" or "the changed paths include files under docs/". Use it for anything exact matching cannot express. Omit both when every occurrence should fire.
- "debounceMs": only when the goal rate-limits reactions (e.g. "at most once an hour" → 3600000).

The "schedule" cron has 5 space-separated fields: minute hour day-of-month month day-of-week.
Examples: every 10 minutes → "*/10 * * * *"; hourly → "0 * * * *"; every 6 hours → "0 */6 * * *"; 9am daily → "0 9 * * *"; every weekday at 8am → "0 8 * * 1-5".
Only include "maxFires" if the goal caps the number of runs (e.g. "run 5 times"). A stop CONDITION (e.g. "until there are no open issues") is NOT a fire cap — omit maxFires for those.`;

function buildTriggerTask(prompt: string): string {
  return `Goal:\n${prompt}\n\nReturn the trigger JSON now (one object with "recurring", "schedule", and "events", no prose).`;
}

/**
 * The repair prompt MUST restate the goal: model calls do not reliably retain
 * prior turns, so without the goal the model cannot recover the cadence or
 * event it needs (the observed failure mode).
 */
function buildTriggerRepair(prompt: string) {
  return (previous: string, errors: string[]): string =>
    `Your previous trigger reply was invalid.

Goal:
${prompt}

Your previous response:
${previous}

Problems:
${errors.map((e) => `- ${e}`).join('\n')}

Return a corrected JSON object with "recurring", "schedule", and "events" all present. If recurring is true, "schedule" must be the 5-field UTC cron derived from the goal's cadence. Each event's "source" must be an exact id from the catalog. Output ONLY the JSON.`;
}

function parseEvents(raw: unknown, errors: string[]): ExtractedEventTrigger[] {
  if (!Array.isArray(raw)) {
    errors.push('"events" must always be an array (empty when nothing in the goal is event-driven).');
    return [];
  }
  const events: ExtractedEventTrigger[] = [];
  raw.forEach((entry, i) => {
    if (!isRecord(entry)) {
      errors.push(`events[${i}] must be an object with a "source".`);
      return;
    }
    // Accept both the compact keys the prompt asks for and the suggestion-shaped
    // ones a repair reply sometimes echoes back.
    const event: ExtractedEventTrigger = { eventSource: String(entry.source ?? entry.eventSource ?? '') };
    const filter = entry.filter ?? entry.eventFilter;
    if (filter !== undefined) event.eventFilter = filter as Record<string, unknown>;
    const condition = entry.condition ?? entry.eventCondition;
    if (condition !== undefined) event.eventCondition = condition as string;
    if (entry.debounceMs !== undefined) event.debounceMs = entry.debounceMs as number;
    validateEventTriggerFields(event, `events[${i}]`, errors);
    events.push(event);
  });
  return events;
}

function parseTriggerExtraction(value: unknown): ParseResult<TriggerExtraction> {
  if (!isRecord(value)) return { ok: false, errors: ['response must be a JSON object'] };
  if (typeof value.recurring !== 'boolean') {
    return { ok: false, errors: ['"recurring" must be a boolean (true or false)'] };
  }
  const errors: string[] = [];
  if (value.recurring && (typeof value.schedule !== 'string' || !isValidCron(value.schedule))) {
    errors.push(
      `"recurring" is true, so "schedule" must be a valid 5-field UTC cron (minute hour day-of-month month day-of-week), got ${JSON.stringify(value.schedule)}. Derive it from the cadence in the goal.`,
    );
  }
  const events = parseEvents(value.events, errors);
  if (errors.length > 0) return { ok: false, errors };

  const extraction: TriggerExtraction = { recurring: value.recurring, events };
  if (value.recurring) extraction.schedule = value.schedule as string;
  if (typeof value.maxFires === 'number' && Number.isFinite(value.maxFires) && value.maxFires > 0) {
    extraction.maxFires = value.maxFires;
  }
  return { ok: true, value: extraction };
}

/**
 * Runs the focused trigger call. On any model/transport error or unrepairable
 * reply it returns NO_TRIGGERS — a missing trigger must never block loop
 * creation; the loop is simply manual until revised. When a `loopId` is given,
 * the raw replies are persisted on failure so the miss is diagnosable.
 */
export async function extractTriggers(
  host: OrchestratorHost,
  args: { prompt: string; parentSessionId: string; loopId?: string; model?: string; signal?: AbortSignal },
): Promise<TriggerExtraction> {
  const result = await runStructuredJson<TriggerExtraction>(host, {
    systemPrompt: TRIGGER_SYSTEM_PROMPT,
    task: buildTriggerTask(args.prompt),
    parse: parseTriggerExtraction,
    buildRepair: buildTriggerRepair(args.prompt),
    parentSessionId: args.parentSessionId,
    model: args.model,
    signal: args.signal,
    maxRepairs: 2,
  });
  if (!result.ok || !result.value) {
    host.log(`trigger extraction returned nothing usable: ${result.errors.join('; ')}`);
    if (args.loopId && result.responses.length) {
      await host.writeArtifact(
        `${loopArtifactDir(args.loopId)}/triggers.txt`,
        result.responses.join('\n\n--- next attempt ---\n\n'),
      );
    }
    return NO_TRIGGERS;
  }
  return result.value;
}

/**
 * Merges the extraction into the planner's suggested triggers without
 * clobbering what the planner got right:
 * - the derived schedule overwrites an existing cron/hybrid suggestion's cron
 *   (the extractor is authoritative for cadence), else a trigger is appended;
 * - extracted events whose source the planner already suggested are skipped;
 * - a cadence plus exactly one new event collapses into ONE hybrid trigger
 *   ("every morning AND when docs/ changes"), matching the trigger model.
 */
export function mergeExtractedTriggers(
  suggested: LoopTriggerSuggestion[] | undefined,
  extraction: TriggerExtraction,
): LoopTriggerSuggestion[] {
  const base = [...(suggested ?? [])];
  const newEvents = extraction.events.filter(
    (event) => !base.some((trigger) => trigger.eventSource === event.eventSource),
  );

  if (extraction.recurring && extraction.schedule) {
    const existing = base.findIndex((t) => t.type === 'cron' || t.type === 'hybrid');
    if (existing >= 0) {
      base[existing] = { ...base[existing], schedule: extraction.schedule };
      if (extraction.maxFires !== undefined && base[existing].maxFires === undefined) {
        base[existing].maxFires = extraction.maxFires;
      }
    } else if (newEvents.length === 1) {
      const hybrid: LoopTriggerSuggestion = { type: 'hybrid', schedule: extraction.schedule, ...newEvents[0] };
      if (extraction.maxFires !== undefined) hybrid.maxFires = extraction.maxFires;
      return [...base, hybrid];
    } else {
      const cron: LoopTriggerSuggestion = { type: 'cron', schedule: extraction.schedule };
      if (extraction.maxFires !== undefined) cron.maxFires = extraction.maxFires;
      base.push(cron);
    }
  }

  return [...base, ...newEvents.map((event): LoopTriggerSuggestion => ({ type: 'event', ...event }))];
}
