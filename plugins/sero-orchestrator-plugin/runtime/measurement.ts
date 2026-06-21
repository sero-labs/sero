// Measurement extraction + threshold comparison (spec 05 §4.2, §6.2). The
// planner shapes a measurement command to emit just the number(s); this module
// extracts them mechanically and compares against the LLM-authored threshold —
// "mechanical when the evidence is conclusive" (D-20). Both the threshold and the
// command are LLM-derived, never user-typed. When extraction is ambiguous, the
// criterion falls back to a judge (criteria.ts), so a fuzzy number never silently
// passes or fails on a heuristic guess.
//
// Pure functions over strings/numbers — no host, fully unit-testable.

import type { Decision, ThresholdOp } from '../shared/types';

type ThresholdDecision = Extract<Decision, { kind: 'threshold' }>;

/**
 * Extract the measured number(s) from a command's stdout. Accepts (in order):
 * a bare JSON number, a JSON array of numbers, a JSON array of objects each
 * carrying the `metric` field (or a single numeric field), a JSON object with
 * the `metric` field, or plain text where every non-empty line is a bare number.
 * Returns `[]` when nothing is cleanly extractable → judge-fallback.
 */
export function extractNumbers(output: string, metric: string): number[] {
  const trimmed = output.trim();
  if (!trimmed) return [];

  const fromJson = tryJsonNumbers(trimmed, metric);
  if (fromJson.length) return fromJson;

  // Plain text: accept only when EVERY non-empty line is a bare number, so prose
  // with incidental digits stays ambiguous (→ judge) rather than mis-parsed.
  const lines = trimmed.split('\n').map((line) => line.trim()).filter(Boolean);
  const numbers = lines.map(Number).filter((n) => Number.isFinite(n));
  return numbers.length === lines.length && numbers.length > 0 ? numbers : [];
}

function tryJsonNumbers(text: string, metric: string): number[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  return numbersFromJson(parsed, metric);
}

function numbersFromJson(value: unknown, metric: string): number[] {
  if (typeof value === 'number' && Number.isFinite(value)) return [value];
  if (Array.isArray(value)) return value.flatMap((item) => numbersFromJson(item, metric));
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const named = record[metric];
    if (typeof named === 'number' && Number.isFinite(named)) return [named];
    const numeric = Object.values(record).filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v),
    );
    if (numeric.length === 1) return numeric;
  }
  return [];
}

export function compareOne(n: number, op: ThresholdOp, value: number): boolean {
  switch (op) {
    case '<':
      return n < value;
    case '<=':
      return n <= value;
    case '>':
      return n > value;
    case '>=':
      return n >= value;
    case '==':
      return n === value;
  }
}

export interface ThresholdOutcome {
  passed: boolean;
  summary: string;
}

/**
 * Compare extracted numbers against a threshold and aggregate. `all` (default):
 * every number must pass. `fraction-at-least`: at least that fraction must pass.
 */
export function compareThreshold(numbers: number[], decision: ThresholdDecision): ThresholdOutcome {
  const total = numbers.length;
  const passing = numbers.filter((n) => compareOne(n, decision.op, decision.value)).length;
  const aggregate = decision.aggregate ?? { kind: 'all' };
  const passed =
    aggregate.kind === 'all'
      ? total > 0 && passing === total
      : total > 0 && passing / total >= aggregate.fraction;
  const sample = numbers.slice(0, 6).join(', ') + (numbers.length > 6 ? ', …' : '');
  const summary = `${passing}/${total} ${decision.metric} ${decision.op} ${decision.value} (${sample})`;
  return { passed, summary };
}
