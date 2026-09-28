/**
 * Scoring for memory search (design D6): one absolute score in [0, 1] per
 * entry, so a threshold can decide what reaches context.
 *
 * - Keyword: the entry's `terms` (the words a future task would use, written
 *   when the memory was saved) found in the query as whole words. QMD's BM25
 *   scores are not used: in a collection of a few dozen entries they sit near
 *   zero and cannot carry a threshold.
 * - Vector: QMD's cosine similarity between the query and the entry, once the
 *   embedding model is ready.
 *
 * The signals combine as a probabilistic OR: each extra match raises the
 * score, and no single weak signal dominates.
 */

/** Weight of one matched term. Two matched terms alone give 0.75. */
export const TERM_WEIGHT = 0.5;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Terms that appear in `text` as whole words (a trailing plural `s` is allowed). */
export function matchedTerms(terms: string[], text: string): string[] {
  const haystack = normalize(text);
  return terms.filter((term) => {
    const needle = normalize(term);
    if (needle.length < 2) return false;
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(needle)}s?($|[^\\p{L}\\p{N}])`, 'u').test(haystack);
  });
}

/** Probabilistic OR of independent scores in [0, 1]. */
export function combineScores(scores: number[]): number {
  let miss = 1;
  for (const score of scores) miss *= 1 - Math.min(1, Math.max(0, score));
  return 1 - miss;
}

export function keywordScore(terms: string[], text: string): number {
  return combineScores(matchedTerms(terms, text).map(() => TERM_WEIGHT));
}

/** One entry's score from its keyword score and its vector similarity (0 when unknown). */
export function entryScore(terms: string[], text: string, vectorSimilarity: number): number {
  return combineScores([keywordScore(terms, text), vectorSimilarity]);
}
