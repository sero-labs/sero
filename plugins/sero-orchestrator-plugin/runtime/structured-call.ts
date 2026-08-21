/**
 * Strict structured model calls with bounded repair.
 *
 * The model seam returns plain text — there is no schema enforcement — so the
 * only robust way to obtain a known JSON shape is to validate strictly and, on
 * any mismatch, send the model its own reply plus the exact validation errors
 * and ask for a correction. This mirrors the planner's repair loop (planner.ts)
 * and replaces value-guessing synonym maps: we never coerce an unexpected value,
 * we reject it with a clear reason and let the model fix it.
 */

import type { OrchestratorHost } from './host';
import { extractJson } from './schema';

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Renders a rejected value for model feedback, e.g. `"completed"` or `42`. */
export function describeValue(value: unknown): string {
  if (value === undefined) return '(missing)';
  try {
    const text = JSON.stringify(value);
    return text.length > 80 ? `${text.slice(0, 79)}…` : text;
  } catch {
    return String(value);
  }
}

export interface StructuredCallSpec<T> {
  systemPrompt: string;
  /** The initial task prompt. */
  task: string;
  /** Strict parser: the located JSON value (undefined when the reply held none) → value or precise errors. */
  parse: (value: unknown) => ParseResult<T>;
  /** Builds the repair prompt from the previous raw reply and the validation errors. */
  buildRepair: (previous: string, errors: string[]) => string;
  parentSessionId: string;
  model?: string;
  thinking?: string;
  signal?: AbortSignal;
  /** Repair passes allowed after the first attempt (default 1, as the planner). */
  maxRepairs?: number;
  /**
   * Tool surface for the call. Default 'none' — a pure model call, which is what
   * every decision pass wants. 'readOnly' is for a pass that must read the real
   * workspace or load a skill (skill extraction, spec 18); it still writes
   * nothing, because its only output is the validated JSON.
   */
  platformTools?: 'none' | 'readOnly';
  /** Working directory, required when `platformTools` is not 'none'. */
  cwd?: string;
}

export interface StructuredCallResult<T> {
  ok: boolean;
  value?: T;
  errors: string[];
  /** Raw model replies in order, for artifacts and diagnostics. */
  responses: string[];
}

/**
 * Calls the model, validates strictly, and — on any validation failure — re-asks
 * with the exact errors fed back, up to `maxRepairs` times. A model/transport
 * error stops immediately (there is nothing to repair).
 */
export async function runStructuredJson<T>(
  host: OrchestratorHost,
  spec: StructuredCallSpec<T>,
): Promise<StructuredCallResult<T>> {
  const responses: string[] = [];
  const maxRepairs = spec.maxRepairs ?? 1;
  let task = spec.task;
  let errors: string[] = ['no model response'];

  for (let attempt = 0; attempt <= maxRepairs; attempt += 1) {
    const result = await host.runStructured({
      task,
      systemPrompt: spec.systemPrompt,
      model: spec.model,
      thinking: spec.thinking,
      parentSessionId: spec.parentSessionId,
      platformTools: spec.platformTools ?? 'none',
      cwd: spec.cwd,
      signal: spec.signal,
    });
    if (result.error) return { ok: false, errors: [result.error], responses };
    responses.push(result.response);

    const parsed = spec.parse(extractJson(result.response));
    if (parsed.ok) return { ok: true, value: parsed.value, errors: [], responses };

    errors = parsed.errors;
    task = spec.buildRepair(result.response, parsed.errors);
  }
  return { ok: false, errors, responses };
}
