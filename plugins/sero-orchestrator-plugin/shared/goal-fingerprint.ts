/**
 * Turn normalisation for the no-progress ledger.
 *
 * Only the VISIBLE assistant text is compared. Thinking blocks and tool blocks
 * are excluded by the caller, because an agent that reasons differently while
 * producing the same answer has still made no progress, and a tool call is
 * counted as progress on its own.
 *
 * Volatile detail — timestamps, durations, ids, counters — is collapsed so that
 * "still working on it (attempt 4)" and "still working on it (attempt 5)" are
 * recognised as the same outcome.
 */

const RULES: [RegExp, string][] = [
  [/\d{4}-\d{2}-\d{2}[t ]\d{2}:\d{2}(:\d{2})?(\.\d+)?z?/g, '<time>'],
  [/\b\d{1,2}:\d{2}(:\d{2})?\b/g, '<time>'],
  [/\b[0-9a-f]{7,64}\b/g, '<hex>'],
  [/\b\d+(\.\d+)?\s?(ms|s|m|h|kb|mb|gb)\b/g, '<qty>'],
  [/\d+/g, '<n>'],
  [/\s+/g, ' '],
];

/** Lowercased, whitespace-collapsed, volatile-detail-free assistant text. */
export function normalizeTurnText(text: string): string {
  return RULES.reduce((value, [pattern, token]) => value.replace(pattern, token), text.toLowerCase()).trim();
}
