/**
 * Shape validation for the Architect's working interpretation.
 *
 * The owner authors the content and may revise it whenever it learns
 * something. This file checks only what the runtime must hold to: the shape,
 * the storage bounds, and that a requirement the user stated is still there.
 * It reads no meaning from the text and sorts the work into no category.
 */

import type { AcceptanceCriterion, WorkingInterpretation } from './agreement';

/** Storage bounds. Text over a bound goes back to the owner; it is never cut. */
export const WORKING_LIMITS = { objective: 400, approach: 8000, item: 400, assumptions: 40, criteria: 40 } as const;

export interface WorkingInput {
  objective?: string;
  approach?: string;
  /** JSON `["..."]`. */
  assumptionsJson?: string;
  /** JSON `[{"id":"c1","text":"...","userStated":true,"gap":"why it is not met"}]`. */
  criteriaJson?: string;
  reason?: string;
}

export type WorkingParse = { ok: true; working: WorkingInterpretation } | { ok: false; error: string };

const fail = (error: string): WorkingParse => ({ ok: false, error });

function parseJsonArray(raw: string, name: string): unknown[] | string {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : `${name} must be a JSON array.`;
  } catch {
    return `${name} is not valid JSON.`;
  }
}

function parseAssumptions(raw: string): string[] | string {
  const parsed = parseJsonArray(raw, 'assumptionsJson');
  if (typeof parsed === 'string') return parsed;
  if (parsed.length > WORKING_LIMITS.assumptions) return `At most ${WORKING_LIMITS.assumptions} assumptions fit. Keep the ones the work depends on.`;
  const assumptions: string[] = [];
  for (const entry of parsed) {
    const text = typeof entry === 'string' ? entry.trim() : '';
    if (!text) return 'Every assumption must be a non-empty string.';
    if (text.length > WORKING_LIMITS.item) return `An assumption has ${text.length} characters and the limit is ${WORKING_LIMITS.item}. Shorten it.`;
    assumptions.push(text);
  }
  return assumptions;
}

function parseCriteria(raw: string): AcceptanceCriterion[] | string {
  const parsed = parseJsonArray(raw, 'criteriaJson');
  if (typeof parsed === 'string') return parsed;
  if (parsed.length > WORKING_LIMITS.criteria) return `At most ${WORKING_LIMITS.criteria} criteria fit.`;
  const criteria: AcceptanceCriterion[] = [];
  for (const [index, entry] of parsed.entries()) {
    const raw = entry as { id?: unknown; text?: unknown; userStated?: unknown; gap?: unknown } | null;
    const id = typeof raw?.id === 'string' ? raw.id.trim() : '';
    const text = typeof raw?.text === 'string' ? raw.text.trim() : '';
    if (!id) return `Criterion ${index + 1} has no id.`;
    if (!text) return `Criterion "${id}" has no text.`;
    if (text.length > WORKING_LIMITS.item) return `Criterion "${id}" has ${text.length} characters and the limit is ${WORKING_LIMITS.item}. Shorten it.`;
    if (criteria.some((existing) => existing.id === id)) return `Criterion id "${id}" is used twice.`;
    const gap = typeof raw?.gap === 'string' ? raw.gap.trim() : '';
    if (gap.length > WORKING_LIMITS.item) return `The gap of criterion "${id}" has ${gap.length} characters and the limit is ${WORKING_LIMITS.item}. Shorten it.`;
    criteria.push({ id, text, userStated: raw?.userStated === true, ...(gap ? { gap } : {}) });
  }
  return criteria;
}

const sameCriteria = (a: AcceptanceCriterion[], b: AcceptanceCriterion[]): boolean =>
  a.length === b.length && a.every((item, index) => item.id === b[index]?.id && item.text === b[index]?.text && item.userStated === b[index]?.userStated);

/**
 * Builds the next working interpretation. A field the call leaves out keeps
 * its current value, so the owner can change one thing without resending all.
 */
export function parseWorking(input: WorkingInput, current: WorkingInterpretation | undefined, now: string): WorkingParse {
  const objective = input.objective?.trim() || current?.objective || '';
  if (!objective) return fail('objective is required: what the work must achieve, in one or two sentences.');
  if (objective.length > WORKING_LIMITS.objective) return fail(`The objective has ${objective.length} characters and the limit is ${WORKING_LIMITS.objective}. Shorten it and put the detail in the approach.`);
  const approach = input.approach?.trim() || current?.approach || '';
  if (approach.length > WORKING_LIMITS.approach) return fail(`The approach has ${approach.length} characters and the limit is ${WORKING_LIMITS.approach}. Keep the long plan in a file in the project and name the file here.`);

  const assumptions = input.assumptionsJson === undefined ? current?.assumptions ?? [] : parseAssumptions(input.assumptionsJson);
  if (typeof assumptions === 'string') return fail(assumptions);
  const criteria = input.criteriaJson === undefined ? current?.criteria ?? [] : parseCriteria(input.criteriaJson);
  if (typeof criteria === 'string') return fail(criteria);

  // What the user stated stays. The owner may reword it or add checks for it;
  // dropping it, or relabelling it as its own idea, is the user's decision.
  for (const kept of current?.criteria.filter((criterion) => criterion.userStated) ?? []) {
    const next = criteria.find((criterion) => criterion.id === kept.id);
    if (!next || !next.userStated) {
      return fail(`Criterion ${kept.id} was stated by the user. You may reword it, but you may not remove it or mark it as your own. If it cannot be met, raise a decision with decide and say what the gap is.`);
    }
  }

  const reason = input.reason?.trim() || null;
  if (current && !reason) return fail('reason is required when you revise the working interpretation: what you learned that changed it.');
  const revision = !current ? 1 : sameCriteria(current.criteria, criteria) ? current.revision : current.revision + 1;
  return { ok: true, working: { revision, objective, approach, assumptions, criteria, reason, updatedAt: now } };
}
